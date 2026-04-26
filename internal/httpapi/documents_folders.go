package httpapi

import (
	"encoding/json"
	"mime"
	"net/http"
	"path"
	"strings"

	"github.com/carnager/noterious/internal/documents"
)

type documentResponse struct {
	ID          string `json:"id"`
	Path        string `json:"path"`
	Name        string `json:"name"`
	ContentType string `json:"contentType"`
	Size        int64  `json:"size"`
	CreatedAt   string `json:"createdAt"`
	DownloadURL string `json:"downloadURL"`
}

type documentsResponse struct {
	Documents []documentResponse `json:"documents"`
	Count     int                `json:"count"`
	Query     string             `json:"query"`
}

type movedFolderResponse struct {
	Folder       string `json:"folder"`
	SourceFolder string `json:"sourceFolder"`
	TargetFolder string `json:"targetFolder"`
	Name         string `json:"name"`
}

type deletedFolderResponse struct {
	OK     bool   `json:"ok"`
	Folder string `json:"folder"`
}

func mountDocumentAndFolderEndpoints(mux *http.ServeMux, deps Dependencies) {
	mux.HandleFunc("GET /api/documents", func(w http.ResponseWriter, r *http.Request) {
		handleDocumentsRequest(w, r, deps)
	})
	mux.HandleFunc("POST /api/documents", func(w http.ResponseWriter, r *http.Request) {
		handleDocumentsRequest(w, r, deps)
	})
	mux.HandleFunc("POST /api/folders/", func(w http.ResponseWriter, r *http.Request) {
		handleFolderMoveRequest(w, r, deps)
	})
	mux.HandleFunc("DELETE /api/folders/{folderPath...}", func(w http.ResponseWriter, r *http.Request) {
		handleFolderRequest(w, r, deps)
	})
	mux.HandleFunc("GET /api/documents/download", func(w http.ResponseWriter, r *http.Request) {
		handleDocumentDownloadRequest(w, r, deps)
	})
}

func handleDocumentsRequest(w http.ResponseWriter, r *http.Request, deps Dependencies) {
	documentService, err := currentDocuments(r.Context(), deps)
	if err != nil {
		http.Error(w, "document service unavailable", http.StatusInternalServerError)
		return
	}

	if r.Method == http.MethodGet {
		items, err := documentService.List(r.Context(), r.URL.Query().Get("q"))
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, documentsResponse{
			Documents: mapDocuments(items, documentService),
			Count:     len(items),
			Query:     strings.TrimSpace(r.URL.Query().Get("q")),
		})
		return
	}
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
}

func handleFolderRequest(w http.ResponseWriter, r *http.Request, deps Dependencies) {
	handleFolderActionRequest(w, r, deps, false)
}

func handleFolderMoveRequest(w http.ResponseWriter, r *http.Request, deps Dependencies) {
	folderPath := strings.TrimPrefix(r.URL.Path, "/api/folders/")
	if !strings.HasSuffix(folderPath, "/move") {
		http.NotFound(w, r)
		return
	}
	r.SetPathValue("folderPath", strings.TrimSuffix(folderPath, "/move"))
	handleFolderActionRequest(w, r, deps, true)
}

func handleFolderActionRequest(w http.ResponseWriter, r *http.Request, deps Dependencies, move bool) {
	activeVault := configuredVaultRecord(deps)
	vaultService := currentVault(r.Context(), deps)
	folderPath := r.PathValue("folderPath")
	folderPath = strings.Trim(strings.TrimSpace(folderPath), "/")
	folderPath = path.Clean(folderPath)
	if folderPath == "." || folderPath == "" || strings.HasPrefix(folderPath, "../") {
		http.Error(w, "invalid folder path", http.StatusBadRequest)
		return
	}

	if move {
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
			if err := deps.History.MovePrefix(folderPath, movedFolderPath); err != nil {
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
		writeJSON(w, http.StatusOK, movedFolderResponse{
			Folder:       movedFolderPath,
			SourceFolder: folderPath,
			TargetFolder: targetFolder,
			Name:         targetName,
		})
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
			if _, err := deps.History.SaveRevision(pageFile.Path, rawMarkdown); err != nil {
				http.Error(w, "failed to save folder page history", http.StatusInternalServerError)
				return
			}
			if err := deps.History.MoveToTrash(pageFile.Path, rawMarkdown); err != nil {
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
	writeJSON(w, http.StatusOK, deletedFolderResponse{OK: true, Folder: folderPath})
}

func handleDocumentDownloadRequest(w http.ResponseWriter, r *http.Request, deps Dependencies) {
	documentService, err := currentDocuments(r.Context(), deps)
	if err != nil {
		http.Error(w, "document service unavailable", http.StatusInternalServerError)
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

func mapDocument(document documents.Document, service *documents.Service) documentResponse {
	return documentResponse{
		ID:          document.ID,
		Path:        document.Path,
		Name:        document.Name,
		ContentType: document.ContentType,
		Size:        document.Size,
		CreatedAt:   document.CreatedAt,
		DownloadURL: service.DownloadURL(document),
	}
}

func mapDocuments(items []documents.Document, service *documents.Service) []documentResponse {
	mapped := make([]documentResponse, 0, len(items))
	for _, document := range items {
		mapped = append(mapped, mapDocument(document, service))
	}
	return mapped
}
