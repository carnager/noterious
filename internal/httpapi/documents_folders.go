package httpapi

import (
	"encoding/json"
	"mime"
	"net/http"
	"path"
	"strings"

	"github.com/carnager/noterious/internal/documents"
	"github.com/carnager/noterious/internal/vaults"
)

func mountDocumentAndFolderEndpoints(mux *http.ServeMux, deps Dependencies) {
	mux.HandleFunc("/api/documents", func(w http.ResponseWriter, r *http.Request) {
		handleDocumentsRequest(w, r, deps)
	})

	mux.HandleFunc("/api/folders/", func(w http.ResponseWriter, r *http.Request) {
		handleFolderRequest(w, r, deps)
	})

	mux.HandleFunc("/api/documents/download", func(w http.ResponseWriter, r *http.Request) {
		handleDocumentDownloadRequest(w, r, deps)
	})
}

func handleDocumentsRequest(w http.ResponseWriter, r *http.Request, deps Dependencies) {
	documentService, err := currentDocuments(r.Context(), deps)
	if err != nil {
		http.Error(w, "document service unavailable", http.StatusInternalServerError)
		return
	}

	switch r.Method {
	case http.MethodGet:
		items, err := documentService.List(r.Context(), r.URL.Query().Get("q"))
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"documents": mapDocuments(items, documentService),
			"count":     len(items),
			"query":     strings.TrimSpace(r.URL.Query().Get("q")),
		})
	case http.MethodPost:
		if err := r.ParseMultipartForm(64 << 20); err != nil {
			http.Error(w, "invalid multipart upload", http.StatusBadRequest)
			return
		}
		file, header, err := r.FormFile("file")
		if err != nil {
			http.Error(w, "file is required", http.StatusBadRequest)
			return
		}
		defer file.Close()

		document, err := documentService.Create(r.Context(), r.FormValue("page"), header.Filename, header.Header.Get("Content-Type"), file)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		writeJSON(w, http.StatusCreated, mapDocument(document, documentService))
	default:
		writeMethodNotAllowed(w, http.MethodGet, http.MethodPost)
	}
}

func handleFolderRequest(w http.ResponseWriter, r *http.Request, deps Dependencies) {
	vaultID := vaults.VaultIDFromContext(r.Context())
	activeVault := currentVaultRecord(r.Context(), deps)
	vaultService := currentVault(r.Context(), deps)
	folderPath := strings.TrimPrefix(r.URL.Path, "/api/folders/")
	action := ""
	if strings.HasSuffix(folderPath, "/move") {
		action = "move"
		folderPath = strings.TrimSuffix(folderPath, "/move")
	}
	folderPath = strings.Trim(strings.TrimSpace(folderPath), "/")
	folderPath = path.Clean(folderPath)
	if folderPath == "." || folderPath == "" || strings.HasPrefix(folderPath, "../") {
		http.Error(w, "invalid folder path", http.StatusBadRequest)
		return
	}

	switch action {
	case "move":
		if r.Method != http.MethodPost {
			writeMethodNotAllowed(w, http.MethodPost)
			return
		}
		var request struct {
			TargetFolder string `json:"targetFolder"`
			Name         string `json:"name"`
		}
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}
		targetFolder := strings.Trim(strings.TrimSpace(request.TargetFolder), "/")
		if targetFolder != "" {
			targetFolder = path.Clean(targetFolder)
			if targetFolder == "." {
				targetFolder = ""
			}
			if strings.HasPrefix(targetFolder, "../") {
				http.Error(w, "invalid target folder", http.StatusBadRequest)
				return
			}
		}
		targetName := strings.Trim(strings.TrimSpace(request.Name), "/")
		if targetName != "" {
			targetName = path.Clean(targetName)
			if targetName == "." || strings.Contains(targetName, "/") || strings.HasPrefix(targetName, "../") {
				http.Error(w, "invalid target folder name", http.StatusBadRequest)
				return
			}
		}
		movedFolderPath, err := vaultService.MoveFolder(folderPath, targetFolder, targetName)
		if err != nil {
			http.Error(w, err.Error(), statusForFolderMoveError(err))
			return
		}
		if deps.History != nil {
			if err := deps.History.MovePrefixForVault(vaultID, folderPath, movedFolderPath); err != nil {
				http.Error(w, "failed to move folder history", http.StatusInternalServerError)
				return
			}
		}
		if err := rebuildVaultState(r.Context(), activeVault, vaultService, deps.Index, deps.Query, "folder_moved"); err != nil {
			http.Error(w, "failed to rebuild vault state", http.StatusInternalServerError)
			return
		}
		if deps.OnPageChanged != nil {
			deps.OnPageChanged(folderPath)
			deps.OnPageChanged(movedFolderPath)
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"folder":       movedFolderPath,
			"sourceFolder": folderPath,
			"targetFolder": targetFolder,
			"name":         targetName,
		})
	default:
		if r.Method != http.MethodDelete {
			writeMethodNotAllowed(w, http.MethodDelete)
			return
		}
		if deps.History != nil {
			pageFiles, err := vaultService.ScanMarkdownPages(r.Context())
			if err != nil {
				http.Error(w, "failed to scan folder pages", http.StatusInternalServerError)
				return
			}
			for _, pageFile := range pageFiles {
				if pageFile.Path != folderPath && !strings.HasPrefix(pageFile.Path, folderPath+"/") {
					continue
				}
				rawMarkdown, err := vaultService.ReadPage(pageFile.Path)
				if err != nil {
					http.Error(w, "failed to read folder page", http.StatusInternalServerError)
					return
				}
				if _, err := deps.History.SaveRevisionForVault(vaultID, pageFile.Path, rawMarkdown); err != nil {
					http.Error(w, "failed to save folder page history", http.StatusInternalServerError)
					return
				}
				if err := deps.History.MoveToTrashForVault(vaultID, pageFile.Path, rawMarkdown); err != nil {
					http.Error(w, "failed to move folder page to trash", http.StatusInternalServerError)
					return
				}
			}
		}
		if err := vaultService.DeleteFolder(folderPath); err != nil {
			http.Error(w, "failed to delete folder", http.StatusInternalServerError)
			return
		}
		if err := rebuildVaultState(r.Context(), activeVault, vaultService, deps.Index, deps.Query, "folder_deleted"); err != nil {
			http.Error(w, "failed to rebuild vault state", http.StatusInternalServerError)
			return
		}
		if deps.OnPageChanged != nil {
			deps.OnPageChanged(folderPath)
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"ok":     true,
			"folder": folderPath,
		})
	}
}

func handleDocumentDownloadRequest(w http.ResponseWriter, r *http.Request, deps Dependencies) {
	documentService, err := currentDocuments(r.Context(), deps)
	if err != nil {
		http.Error(w, "document service unavailable", http.StatusInternalServerError)
		return
	}
	if r.Method != http.MethodGet {
		writeMethodNotAllowed(w, http.MethodGet)
		return
	}

	documentPath := strings.TrimSpace(r.URL.Query().Get("path"))
	if documentPath == "" {
		http.Error(w, "document path is required", http.StatusBadRequest)
		return
	}
	document, filePath, err := documentService.Get(documentPath)
	if err != nil {
		http.NotFound(w, r)
		return
	}

	contentType := document.ContentType
	if strings.TrimSpace(contentType) == "" {
		contentType = mime.TypeByExtension(path.Ext(document.Name))
	}
	if strings.TrimSpace(contentType) == "" {
		contentType = "application/octet-stream"
	}
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Content-Disposition", documents.ContentDisposition(document.Name))
	http.ServeFile(w, r, filePath)
}

func mapDocument(document documents.Document, service *documents.Service) map[string]any {
	return map[string]any{
		"id":          document.ID,
		"path":        document.Path,
		"name":        document.Name,
		"contentType": document.ContentType,
		"size":        document.Size,
		"createdAt":   document.CreatedAt,
		"downloadURL": service.DownloadURL(document),
	}
}

func mapDocuments(items []documents.Document, service *documents.Service) []map[string]any {
	mapped := make([]map[string]any, 0, len(items))
	for _, document := range items {
		mapped = append(mapped, mapDocument(document, service))
	}
	return mapped
}
