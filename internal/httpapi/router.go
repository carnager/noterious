package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"path"
	"sort"
	"strings"
	"time"

	"github.com/carnager/noterious/internal/auth"
	"github.com/carnager/noterious/internal/config"
	"github.com/carnager/noterious/internal/documents"
	"github.com/carnager/noterious/internal/history"
	"github.com/carnager/noterious/internal/index"
	"github.com/carnager/noterious/internal/markdown"
	"github.com/carnager/noterious/internal/query"
	"github.com/carnager/noterious/internal/settings"
	"github.com/carnager/noterious/internal/vault"
)

type Dependencies struct {
	Config        config.Config
	Settings      *settings.Store
	Documents     *documents.Service
	History       *history.Service
	Vault         *vault.Service
	Index         *index.Service
	Query         *query.Service
	Events        *EventBroker
	Auth          *auth.Service
	OnPageChanged func(pagePath string)
}

func NewRouter(deps Dependencies) http.Handler {
	if deps.Events == nil {
		deps.Events = NewEventBroker()
	}

	mux := http.NewServeMux()
	mountUI(mux)
	mountAuthEndpoints(mux, deps.Auth)

	mux.HandleFunc("/api/healthz", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{
			"ok": true,
		})
	})

	mux.HandleFunc("/api/meta", func(w http.ResponseWriter, _ *http.Request) {
		workspace := settings.Workspace{
			VaultPath: deps.Config.VaultPath,
			HomePage:  deps.Config.HomePage,
		}
		restartRequired := false
		if deps.Settings != nil {
			snapshot := deps.Settings.Snapshot()
			workspace = snapshot.Settings.Workspace
			restartRequired = snapshot.RestartRequired
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"name":            "noterious",
			"listenAddr":      deps.Config.ListenAddr,
			"vaultPath":       workspace.VaultPath,
			"dataDir":         deps.Config.DataDir,
			"homePage":        workspace.HomePage,
			"database":        deps.Index.DatabasePath(),
			"serverTime":      time.Now().UTC().Format(time.RFC3339),
			"serverFirst":     true,
			"restartRequired": restartRequired,
		})
	})

	mux.HandleFunc("/api/settings", func(w http.ResponseWriter, r *http.Request) {
		if deps.Settings == nil {
			http.Error(w, "settings unavailable", http.StatusInternalServerError)
			return
		}
		switch r.Method {
		case http.MethodGet:
			writeJSON(w, http.StatusOK, deps.Settings.Snapshot())
		case http.MethodPut:
			var payload settings.AppSettings
			if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
				http.Error(w, "invalid request body", http.StatusBadRequest)
				return
			}
			snapshot, err := deps.Settings.Update(payload)
			if err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			writeJSON(w, http.StatusOK, snapshot)
		default:
			writeMethodNotAllowed(w, http.MethodGet, http.MethodPut)
		}
	})
	mux.HandleFunc("/api/documents", func(w http.ResponseWriter, r *http.Request) {
		if deps.Documents == nil {
			http.Error(w, "document service unavailable", http.StatusInternalServerError)
			return
		}
		switch r.Method {
		case http.MethodGet:
			items, err := deps.Documents.List(r.Context(), r.URL.Query().Get("q"))
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			writeJSON(w, http.StatusOK, map[string]any{
				"documents": mapDocuments(items, deps.Documents),
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

			document, err := deps.Documents.Create(r.Context(), r.FormValue("page"), header.Filename, header.Header.Get("Content-Type"), file)
			if err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			writeJSON(w, http.StatusCreated, mapDocument(document, deps.Documents))
		default:
			writeMethodNotAllowed(w, http.MethodGet, http.MethodPost)
		}
	})
	mux.HandleFunc("/api/folders/", func(w http.ResponseWriter, r *http.Request) {
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
			movedFolderPath, err := deps.Vault.MoveFolder(folderPath, targetFolder, targetName)
			if err != nil {
				http.Error(w, "failed to move folder", http.StatusInternalServerError)
				return
			}
			if deps.History != nil {
				if err := deps.History.MovePrefix(folderPath, movedFolderPath); err != nil {
					http.Error(w, "failed to move folder history", http.StatusInternalServerError)
					return
				}
			}
			if err := deps.Index.RebuildFromVault(r.Context(), deps.Vault); err != nil {
				http.Error(w, "failed to rebuild index", http.StatusInternalServerError)
				return
			}
			if deps.Query != nil {
				if err := deps.Query.RefreshAll(r.Context(), deps.Index); err != nil {
					http.Error(w, "failed to refresh query cache", http.StatusInternalServerError)
					return
				}
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
				pageFiles, err := deps.Vault.ScanMarkdownPages(r.Context())
				if err != nil {
					http.Error(w, "failed to scan folder pages", http.StatusInternalServerError)
					return
				}
				for _, pageFile := range pageFiles {
					if pageFile.Path != folderPath && !strings.HasPrefix(pageFile.Path, folderPath+"/") {
						continue
					}
					rawMarkdown, err := deps.Vault.ReadPage(pageFile.Path)
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
			if err := deps.Vault.DeleteFolder(folderPath); err != nil {
				http.Error(w, "failed to delete folder", http.StatusInternalServerError)
				return
			}
			if err := deps.Index.RebuildFromVault(r.Context(), deps.Vault); err != nil {
				http.Error(w, "failed to rebuild index", http.StatusInternalServerError)
				return
			}
			if deps.Query != nil {
				if err := deps.Query.RefreshAll(r.Context(), deps.Index); err != nil {
					http.Error(w, "failed to refresh query cache", http.StatusInternalServerError)
					return
				}
			}
			if deps.OnPageChanged != nil {
				deps.OnPageChanged(folderPath)
			}
			writeJSON(w, http.StatusOK, map[string]any{
				"ok":     true,
				"folder": folderPath,
			})
		}
	})
	mux.HandleFunc("/api/documents/download", func(w http.ResponseWriter, r *http.Request) {
		if deps.Documents == nil {
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
		document, filePath, err := deps.Documents.Get(documentPath)
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
	})

	mux.HandleFunc("/api/pages/", func(w http.ResponseWriter, r *http.Request) {
		handlePageRequest(w, r, deps)
	})
	mux.HandleFunc("/api/queries/", func(w http.ResponseWriter, r *http.Request) {
		rawPath := strings.TrimPrefix(r.URL.Path, "/api/queries/")
		suggest := strings.HasSuffix(rawPath, "/suggest")
		format := !suggest && strings.HasSuffix(rawPath, "/format")
		lint := !suggest && !format && strings.HasSuffix(rawPath, "/lint")
		plan := !suggest && !format && !lint && strings.HasSuffix(rawPath, "/plan")
		analyze := !suggest && !format && !lint && !plan && strings.HasSuffix(rawPath, "/analyze")
		count := !suggest && !format && !lint && !plan && !analyze && strings.HasSuffix(rawPath, "/count")
		preview := !suggest && !format && !lint && !plan && !analyze && !count && strings.HasSuffix(rawPath, "/preview")
		workbench := !suggest && !format && !lint && !plan && !analyze && !count && !preview && strings.HasSuffix(rawPath, "/workbench")
		execute := !suggest && !format && !lint && !plan && !analyze && !count && !preview && !workbench && strings.HasSuffix(rawPath, "/execute")
		name := rawPath
		if suggest {
			name = strings.TrimSuffix(name, "/suggest")
		}
		if format {
			name = strings.TrimSuffix(name, "/format")
		}
		if lint {
			name = strings.TrimSuffix(name, "/lint")
		}
		if plan {
			name = strings.TrimSuffix(name, "/plan")
		}
		if analyze {
			name = strings.TrimSuffix(name, "/analyze")
		}
		if count {
			name = strings.TrimSuffix(name, "/count")
		}
		if preview {
			name = strings.TrimSuffix(name, "/preview")
		}
		if workbench {
			name = strings.TrimSuffix(name, "/workbench")
		}
		if execute {
			name = strings.TrimSuffix(name, "/execute")
		}
		name = strings.Trim(name, "/")
		if strings.TrimSpace(name) == "" {
			http.Error(w, "invalid query name", http.StatusBadRequest)
			return
		}

		if suggest {
			if r.Method != http.MethodPost {
				writeMethodNotAllowed(w, http.MethodPost)
				return
			}

			savedQuery, err := deps.Index.GetSavedQuery(r.Context(), name)
			if err != nil {
				writeSavedQueryError(w, err)
				return
			}

			var request query.QuerySuggestionRequest
			if err := json.NewDecoder(r.Body).Decode(&request); err != nil && !errors.Is(err, io.EOF) {
				http.Error(w, "invalid request body", http.StatusBadRequest)
				return
			}
			request.Query = savedQuery.Query

			writeJSON(w, http.StatusOK, map[string]any{
				"name":        savedQuery.Name,
				"title":       savedQuery.Title,
				"description": savedQuery.Description,
				"folder":      savedQuery.Folder,
				"tags":        savedQuery.Tags,
				"query":       savedQuery.Query,
				"suggest":     query.Suggest(request),
			})
			return
		}
		if format {
			if r.Method != http.MethodPost {
				writeMethodNotAllowed(w, http.MethodPost)
				return
			}

			savedQuery, err := deps.Index.GetSavedQuery(r.Context(), name)
			if err != nil {
				writeSavedQueryError(w, err)
				return
			}

			writeJSON(w, http.StatusOK, map[string]any{
				"name":        savedQuery.Name,
				"title":       savedQuery.Title,
				"description": savedQuery.Description,
				"folder":      savedQuery.Folder,
				"tags":        savedQuery.Tags,
				"query":       savedQuery.Query,
				"format":      query.Format(savedQuery.Query),
			})
			return
		}
		if execute {
			if r.Method != http.MethodPost {
				writeMethodNotAllowed(w, http.MethodPost)
				return
			}
			if deps.Query == nil {
				http.Error(w, "query service unavailable", http.StatusInternalServerError)
				return
			}

			savedQuery, err := deps.Index.GetSavedQuery(r.Context(), name)
			if err != nil {
				writeSavedQueryError(w, err)
				return
			}
			result, err := deps.Query.Execute(r.Context(), deps.Index, savedQuery.Query)
			if err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}

			writeJSON(w, http.StatusOK, map[string]any{
				"name":        savedQuery.Name,
				"title":       savedQuery.Title,
				"description": savedQuery.Description,
				"folder":      savedQuery.Folder,
				"tags":        savedQuery.Tags,
				"query":       savedQuery.Query,
				"result":      result,
			})
			return
		}
		if analyze {
			if r.Method != http.MethodPost {
				writeMethodNotAllowed(w, http.MethodPost)
				return
			}

			savedQuery, err := deps.Index.GetSavedQuery(r.Context(), name)
			if err != nil {
				writeSavedQueryError(w, err)
				return
			}

			writeJSON(w, http.StatusOK, map[string]any{
				"name":        savedQuery.Name,
				"title":       savedQuery.Title,
				"description": savedQuery.Description,
				"folder":      savedQuery.Folder,
				"tags":        savedQuery.Tags,
				"query":       savedQuery.Query,
				"analyze":     query.Analyze(savedQuery.Query),
			})
			return
		}
		if plan {
			if r.Method != http.MethodPost {
				writeMethodNotAllowed(w, http.MethodPost)
				return
			}

			savedQuery, err := deps.Index.GetSavedQuery(r.Context(), name)
			if err != nil {
				writeSavedQueryError(w, err)
				return
			}

			writeJSON(w, http.StatusOK, map[string]any{
				"name":        savedQuery.Name,
				"title":       savedQuery.Title,
				"description": savedQuery.Description,
				"folder":      savedQuery.Folder,
				"tags":        savedQuery.Tags,
				"query":       savedQuery.Query,
				"plan":        query.Plan(savedQuery.Query),
			})
			return
		}
		if lint {
			if r.Method != http.MethodPost {
				writeMethodNotAllowed(w, http.MethodPost)
				return
			}

			savedQuery, err := deps.Index.GetSavedQuery(r.Context(), name)
			if err != nil {
				writeSavedQueryError(w, err)
				return
			}

			writeJSON(w, http.StatusOK, map[string]any{
				"name":        savedQuery.Name,
				"title":       savedQuery.Title,
				"description": savedQuery.Description,
				"folder":      savedQuery.Folder,
				"tags":        savedQuery.Tags,
				"query":       savedQuery.Query,
				"lint":        query.Lint(savedQuery.Query),
			})
			return
		}
		if preview {
			if r.Method != http.MethodPost {
				writeMethodNotAllowed(w, http.MethodPost)
				return
			}

			savedQuery, err := deps.Index.GetSavedQuery(r.Context(), name)
			if err != nil {
				writeSavedQueryError(w, err)
				return
			}

			var request struct {
				Limit int `json:"limit"`
			}
			if err := json.NewDecoder(r.Body).Decode(&request); err != nil && !errors.Is(err, io.EOF) {
				http.Error(w, "invalid request body", http.StatusBadRequest)
				return
			}

			writeJSON(w, http.StatusOK, map[string]any{
				"name":        savedQuery.Name,
				"title":       savedQuery.Title,
				"description": savedQuery.Description,
				"folder":      savedQuery.Folder,
				"tags":        savedQuery.Tags,
				"query":       savedQuery.Query,
				"preview":     query.Preview(r.Context(), deps.Index, savedQuery.Query, request.Limit),
			})
			return
		}
		if count {
			if r.Method != http.MethodPost {
				writeMethodNotAllowed(w, http.MethodPost)
				return
			}

			savedQuery, err := deps.Index.GetSavedQuery(r.Context(), name)
			if err != nil {
				writeSavedQueryError(w, err)
				return
			}

			writeJSON(w, http.StatusOK, map[string]any{
				"name":        savedQuery.Name,
				"title":       savedQuery.Title,
				"description": savedQuery.Description,
				"folder":      savedQuery.Folder,
				"tags":        savedQuery.Tags,
				"query":       savedQuery.Query,
				"count":       query.Count(r.Context(), deps.Index, savedQuery.Query),
			})
			return
		}
		if workbench {
			if r.Method != http.MethodPost {
				writeMethodNotAllowed(w, http.MethodPost)
				return
			}

			savedQuery, err := deps.Index.GetSavedQuery(r.Context(), name)
			if err != nil {
				writeSavedQueryError(w, err)
				return
			}

			var request struct {
				PreviewLimit int `json:"previewLimit"`
			}
			if err := json.NewDecoder(r.Body).Decode(&request); err != nil && !errors.Is(err, io.EOF) {
				http.Error(w, "invalid request body", http.StatusBadRequest)
				return
			}

			writeJSON(w, http.StatusOK, map[string]any{
				"name":        savedQuery.Name,
				"title":       savedQuery.Title,
				"description": savedQuery.Description,
				"folder":      savedQuery.Folder,
				"tags":        savedQuery.Tags,
				"query":       savedQuery.Query,
				"workbench":   query.Workbench(r.Context(), deps.Index, savedQuery.Query, request.PreviewLimit),
			})
			return
		}

		switch r.Method {
		case http.MethodGet:
			savedQuery, err := deps.Index.GetSavedQuery(r.Context(), name)
			if err != nil {
				writeSavedQueryError(w, err)
				return
			}
			writeJSON(w, http.StatusOK, savedQuery)
		case http.MethodPut:
			var request struct {
				Title       string   `json:"title"`
				Description string   `json:"description"`
				Folder      string   `json:"folder"`
				Tags        []string `json:"tags"`
				Query       string   `json:"query"`
			}
			if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
				http.Error(w, "invalid request body", http.StatusBadRequest)
				return
			}
			savedQuery, err := deps.Index.PutSavedQuery(r.Context(), index.SavedQuery{
				Name:        name,
				Title:       strings.TrimSpace(request.Title),
				Description: strings.TrimSpace(request.Description),
				Folder:      strings.TrimSpace(request.Folder),
				Tags:        append([]string(nil), request.Tags...),
				Query:       request.Query,
			})
			if err != nil {
				http.Error(w, "failed to save query", http.StatusInternalServerError)
				return
			}
			writeJSON(w, http.StatusOK, savedQuery)
		case http.MethodDelete:
			if err := deps.Index.DeleteSavedQuery(r.Context(), name); err != nil {
				writeSavedQueryError(w, err)
				return
			}
			w.WriteHeader(http.StatusNoContent)
		default:
			writeMethodNotAllowed(w, http.MethodGet, http.MethodPut, http.MethodDelete)
		}
	})
	mux.HandleFunc("/api/pages", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			writeMethodNotAllowed(w, http.MethodGet)
			return
		}

		pages, err := deps.Index.ListPages(r.Context())
		if err != nil {
			http.Error(w, "failed to list pages", http.StatusInternalServerError)
			return
		}

		queryText := strings.TrimSpace(r.URL.Query().Get("q"))
		if queryText != "" {
			pages = filterPageSummaries(pages, queryText)
		}

		summaries, err := buildPageListSummaries(pages)
		if err != nil {
			http.Error(w, "failed to build page summaries", http.StatusInternalServerError)
			return
		}

		tagFilter := strings.TrimSpace(r.URL.Query().Get("tag"))
		if tagFilter != "" {
			summaries = filterPageListByTag(summaries, tagFilter)
		}

		writeJSON(w, http.StatusOK, map[string]any{
			"query": queryText,
			"tag":   tagFilter,
			"pages": summaries,
			"count": len(summaries),
		})
	})
	mux.HandleFunc("/api/queries/facets", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			writeMethodNotAllowed(w, http.MethodGet)
			return
		}

		savedQueries, err := deps.Index.ListSavedQueries(r.Context())
		if err != nil {
			http.Error(w, "failed to list saved queries", http.StatusInternalServerError)
			return
		}

		queryText := strings.TrimSpace(r.URL.Query().Get("q"))
		if queryText != "" {
			savedQueries = filterSavedQueries(savedQueries, queryText)
		}
		folder := strings.TrimSpace(r.URL.Query().Get("folder"))
		if folder != "" {
			savedQueries = filterSavedQueriesByFolder(savedQueries, folder)
		}
		tag := strings.TrimSpace(r.URL.Query().Get("tag"))
		if tag != "" {
			savedQueries = filterSavedQueriesByTag(savedQueries, tag)
		}

		folders, tags := summarizeSavedQueryFacets(savedQueries)
		writeJSON(w, http.StatusOK, map[string]any{
			"query":   queryText,
			"folder":  folder,
			"tag":     tag,
			"folders": folders,
			"tags":    tags,
			"count":   len(savedQueries),
		})
	})
	mux.HandleFunc("/api/queries/tree", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			writeMethodNotAllowed(w, http.MethodGet)
			return
		}

		savedQueries, err := deps.Index.ListSavedQueries(r.Context())
		if err != nil {
			http.Error(w, "failed to list saved queries", http.StatusInternalServerError)
			return
		}

		queryText := strings.TrimSpace(r.URL.Query().Get("q"))
		if queryText != "" {
			savedQueries = filterSavedQueries(savedQueries, queryText)
		}
		folder := strings.TrimSpace(r.URL.Query().Get("folder"))
		if folder != "" {
			savedQueries = filterSavedQueriesByFolder(savedQueries, folder)
		}
		tag := strings.TrimSpace(r.URL.Query().Get("tag"))
		if tag != "" {
			savedQueries = filterSavedQueriesByTag(savedQueries, tag)
		}

		tree := buildSavedQueryTree(savedQueries)
		writeJSON(w, http.StatusOK, map[string]any{
			"query":   queryText,
			"folder":  folder,
			"tag":     tag,
			"folders": tree,
			"count":   len(savedQueries),
		})
	})
	mux.HandleFunc("/api/queries", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodPost && r.Method != http.MethodPatch {
			writeMethodNotAllowed(w, http.MethodGet, http.MethodPost, http.MethodPatch)
			return
		}

		switch r.Method {
		case http.MethodGet:
			savedQueries, err := deps.Index.ListSavedQueries(r.Context())
			if err != nil {
				http.Error(w, "failed to list saved queries", http.StatusInternalServerError)
				return
			}

			queryText := strings.TrimSpace(r.URL.Query().Get("q"))
			if queryText != "" {
				savedQueries = filterSavedQueries(savedQueries, queryText)
			}
			folder := strings.TrimSpace(r.URL.Query().Get("folder"))
			if folder != "" {
				savedQueries = filterSavedQueriesByFolder(savedQueries, folder)
			}
			tag := strings.TrimSpace(r.URL.Query().Get("tag"))
			if tag != "" {
				savedQueries = filterSavedQueriesByTag(savedQueries, tag)
			}
			writeJSON(w, http.StatusOK, map[string]any{
				"query":   queryText,
				"folder":  folder,
				"tag":     tag,
				"queries": savedQueries,
				"count":   len(savedQueries),
			})
		case http.MethodPost:
			var request struct {
				Name        string   `json:"name"`
				Title       string   `json:"title"`
				Description string   `json:"description"`
				Folder      string   `json:"folder"`
				Tags        []string `json:"tags"`
				Query       string   `json:"query"`
			}
			if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
				http.Error(w, "invalid request body", http.StatusBadRequest)
				return
			}
			name := strings.TrimSpace(request.Name)
			if name == "" {
				http.Error(w, "query name is required", http.StatusBadRequest)
				return
			}
			savedQuery, err := deps.Index.PutSavedQuery(r.Context(), index.SavedQuery{
				Name:        name,
				Title:       strings.TrimSpace(request.Title),
				Description: strings.TrimSpace(request.Description),
				Folder:      strings.TrimSpace(request.Folder),
				Tags:        append([]string(nil), request.Tags...),
				Query:       request.Query,
			})
			if err != nil {
				http.Error(w, "failed to save query", http.StatusInternalServerError)
				return
			}
			writeJSON(w, http.StatusCreated, savedQuery)
		case http.MethodPatch:
			var request struct {
				Names  []string  `json:"names"`
				Folder *string   `json:"folder"`
				Tags   *[]string `json:"tags"`
			}
			if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
				http.Error(w, "invalid request body", http.StatusBadRequest)
				return
			}

			names := make([]string, 0, len(request.Names))
			seen := make(map[string]struct{}, len(request.Names))
			for _, name := range request.Names {
				trimmed := strings.TrimSpace(name)
				if trimmed == "" {
					continue
				}
				if _, ok := seen[trimmed]; ok {
					continue
				}
				seen[trimmed] = struct{}{}
				names = append(names, trimmed)
			}
			if len(names) == 0 {
				http.Error(w, "query names are required", http.StatusBadRequest)
				return
			}
			if request.Folder == nil && request.Tags == nil {
				http.Error(w, "at least one bulk saved query change is required", http.StatusBadRequest)
				return
			}

			updatedQueries := make([]index.SavedQuery, 0, len(names))
			for _, name := range names {
				savedQuery, err := deps.Index.GetSavedQuery(r.Context(), name)
				if err != nil {
					writeSavedQueryError(w, err)
					return
				}
				if request.Folder != nil {
					savedQuery.Folder = strings.TrimSpace(*request.Folder)
				}
				if request.Tags != nil {
					savedQuery.Tags = append([]string(nil), (*request.Tags)...)
				}

				savedQuery, err = deps.Index.PutSavedQuery(r.Context(), savedQuery)
				if err != nil {
					http.Error(w, "failed to save query", http.StatusInternalServerError)
					return
				}
				updatedQueries = append(updatedQueries, savedQuery)
			}

			writeJSON(w, http.StatusOK, map[string]any{
				"queries": updatedQueries,
				"count":   len(updatedQueries),
			})
		}
	})

	mux.HandleFunc("/api/events", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			writeMethodNotAllowed(w, http.MethodGet)
			return
		}
		serveEvents(w, r, deps.Events)
	})

	mux.HandleFunc("/api/tasks", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			writeMethodNotAllowed(w, http.MethodGet)
			return
		}

		tasks, err := deps.Index.ListTasks(r.Context())
		if err != nil {
			http.Error(w, "failed to list tasks", http.StatusInternalServerError)
			return
		}

		queryText := strings.TrimSpace(r.URL.Query().Get("q"))
		if queryText != "" {
			tasks = filterTasks(tasks, queryText)
		}

		stateFilter := strings.TrimSpace(r.URL.Query().Get("state"))
		if stateFilter != "" {
			tasks = filterTasksByState(tasks, stateFilter)
		}
		whoFilter := strings.TrimSpace(r.URL.Query().Get("who"))
		if whoFilter != "" {
			tasks = filterTasksByWho(tasks, whoFilter)
		}

		writeJSON(w, http.StatusOK, map[string]any{
			"query":   queryText,
			"state":   stateFilter,
			"who":     whoFilter,
			"tasks":   tasks,
			"count":   len(tasks),
			"summary": summarizeTasks(tasks),
		})
	})

	mux.HandleFunc("/api/search", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			writeMethodNotAllowed(w, http.MethodGet)
			return
		}

		queryText := strings.TrimSpace(r.URL.Query().Get("q"))
		limit := 12
		if queryText == "" {
			writeJSON(w, http.StatusOK, map[string]any{
				"query":   "",
				"pages":   []any{},
				"tasks":   []any{},
				"queries": []any{},
				"counts": map[string]int{
					"pages":   0,
					"tasks":   0,
					"queries": 0,
					"total":   0,
				},
			})
			return
		}

		result, err := performGlobalSearch(r.Context(), deps.Index, queryText, limit)
		if err != nil {
			http.Error(w, "failed to search", http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, result)
	})

	mux.HandleFunc("/api/links", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			writeMethodNotAllowed(w, http.MethodGet)
			return
		}

		links, err := deps.Index.ListLinks(r.Context())
		if err != nil {
			http.Error(w, "failed to list links", http.StatusInternalServerError)
			return
		}

		queryText := strings.TrimSpace(r.URL.Query().Get("q"))
		if queryText != "" {
			links = filterLinks(links, queryText)
		}
		sourcePage := strings.TrimSpace(r.URL.Query().Get("sourcePage"))
		if sourcePage != "" {
			links = filterLinksBySourcePage(links, sourcePage)
		}
		targetPage := strings.TrimSpace(r.URL.Query().Get("targetPage"))
		if targetPage != "" {
			links = filterLinksByTargetPage(links, targetPage)
		}
		kind := strings.TrimSpace(r.URL.Query().Get("kind"))
		if kind != "" {
			links = filterLinksByKind(links, kind)
		}

		writeJSON(w, http.StatusOK, map[string]any{
			"query":      queryText,
			"sourcePage": sourcePage,
			"targetPage": targetPage,
			"kind":       kind,
			"links":      links,
			"count":      len(links),
			"summary":    summarizeLinks(links),
		})
	})

	mux.HandleFunc("/api/tasks/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPatch && r.Method != http.MethodDelete {
			writeMethodNotAllowed(w, http.MethodPatch, http.MethodDelete)
			return
		}

		ref := strings.TrimSpace(strings.TrimPrefix(r.URL.Path, "/api/tasks/"))
		if ref == "" {
			http.NotFound(w, r)
			return
		}

		task, err := deps.Index.GetTask(r.Context(), ref)
		if err != nil {
			writeTaskError(w, r, err)
			return
		}
		var previousPageSummary *index.PageSummary
		if previousPage, err := deps.Index.GetPage(r.Context(), task.Page); err == nil {
			summary, err := summarizePageRecord(r.Context(), deps.Index, previousPage)
			if err == nil {
				previousPageSummary = &summary
			}
		}

		rawMarkdown, err := deps.Vault.ReadPage(task.Page)
		if err != nil {
			http.Error(w, "failed to read task page", http.StatusInternalServerError)
			return
		}

		var updatedMarkdown string
		if r.Method == http.MethodDelete {
			updatedMarkdown, err = markdown.RemoveTaskLine(string(rawMarkdown), task.Line)
			if err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
		} else {
			var request struct {
				Text   *string  `json:"text"`
				State  *string  `json:"state"`
				Due    *string  `json:"due"`
				Remind *string  `json:"remind"`
				Who    []string `json:"who"`
			}
			if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
				http.Error(w, "invalid request body", http.StatusBadRequest)
				return
			}

			var who *[]string
			if request.Who != nil {
				copied := append([]string(nil), request.Who...)
				who = &copied
			}

			updatedMarkdown, _, err = markdown.ApplyTaskPatch(string(rawMarkdown), task.Line, markdown.TaskPatch{
				Text:   request.Text,
				State:  request.State,
				Due:    request.Due,
				Remind: request.Remind,
				Who:    who,
			})
			if err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
		}

		if err := deps.Vault.WritePage(task.Page, []byte(updatedMarkdown)); err != nil {
			http.Error(w, "failed to write task page", http.StatusInternalServerError)
			return
		}
		if deps.History != nil {
			if _, err := deps.History.SaveRevision(task.Page, []byte(updatedMarkdown)); err != nil {
				http.Error(w, "failed to save page history", http.StatusInternalServerError)
				return
			}
		}
		if err := deps.Index.ReindexPage(r.Context(), deps.Vault, task.Page); err != nil {
			http.Error(w, "failed to reindex page", http.StatusInternalServerError)
			return
		}
		if deps.Query != nil {
			if err := deps.Query.RefreshPageCache(r.Context(), deps.Index, task.Page); err != nil {
				http.Error(w, "failed to refresh query cache", http.StatusInternalServerError)
				return
			}
		}
		if deps.Events != nil {
			deps.Events.Publish(Event{
				Type: map[bool]string{true: "task.deleted", false: "task.changed"}[r.Method == http.MethodDelete],
				Data: map[string]any{
					"ref":  ref,
					"page": task.Page,
				},
			})
		}
		var updatedPageSummary *index.PageSummary
		if updatedPage, err := deps.Index.GetPage(r.Context(), task.Page); err == nil {
			summary, err := summarizePageRecord(r.Context(), deps.Index, updatedPage)
			if err == nil {
				updatedPageSummary = &summary
			}
		}
		if deps.Events != nil {
			oldTask := task
			var newTask *index.Task
			if r.Method != http.MethodDelete {
				updatedTask, err := deps.Index.GetTask(r.Context(), ref)
				if err != nil {
					writeTaskError(w, r, err)
					return
				}
				newTask = &updatedTask
			}
			PublishInvalidationEvents(r.Context(), deps.Events, deps.Index, deps.Query, task.Page, []query.PageChange{{
				Before: previousPageSummary,
				After:  updatedPageSummary,
			}}, []query.TaskChange{{
				Before: &oldTask,
				After:  newTask,
			}})
		}
		if deps.OnPageChanged != nil {
			deps.OnPageChanged(task.Page)
		}

		if r.Method == http.MethodDelete {
			writeJSON(w, http.StatusOK, map[string]any{
				"deleted": true,
				"ref":     ref,
				"page":    task.Page,
			})
			return
		}
		updatedTask, err := deps.Index.GetTask(r.Context(), ref)
		if err != nil {
			writeTaskError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, updatedTask)
	})

	mux.HandleFunc("/api/query/datasets", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			writeMethodNotAllowed(w, http.MethodGet)
			return
		}

		datasets := query.DescribeDatasets()
		writeJSON(w, http.StatusOK, map[string]any{
			"datasets": datasets,
			"count":    len(datasets),
		})
	})

	mux.HandleFunc("/api/query/capabilities", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			writeMethodNotAllowed(w, http.MethodGet)
			return
		}

		capabilities := query.DescribeCapabilities()
		writeJSON(w, http.StatusOK, capabilities)
	})

	mux.HandleFunc("/api/query/schema", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			writeMethodNotAllowed(w, http.MethodGet)
			return
		}

		schema := query.DescribeSchema()
		savedQueries, err := deps.Index.ListSavedQueries(r.Context())
		if err != nil {
			http.Error(w, "failed to list saved queries", http.StatusInternalServerError)
			return
		}
		savedQuerySummaries := buildSavedQuerySummaries(savedQueries)
		writeJSON(w, http.StatusOK, map[string]any{
			"datasets":     schema.Datasets,
			"capabilities": schema.Capabilities,
			"examples":     schema.Examples,
			"savedQueries": savedQuerySummaries,
			"counts": map[string]int{
				"datasets":     len(schema.Datasets),
				"examples":     len(schema.Examples),
				"savedQueries": len(savedQuerySummaries),
			},
		})
	})

	mux.HandleFunc("/api/query/examples", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			writeMethodNotAllowed(w, http.MethodGet)
			return
		}

		dataset := strings.TrimSpace(r.URL.Query().Get("dataset"))
		examples := query.DescribeExamples()
		if dataset != "" {
			filtered := make([]query.QueryExample, 0, len(examples))
			for _, example := range examples {
				if strings.EqualFold(example.Dataset, dataset) {
					filtered = append(filtered, example)
				}
			}
			examples = filtered
		}

		writeJSON(w, http.StatusOK, map[string]any{
			"dataset":  dataset,
			"examples": examples,
			"count":    len(examples),
		})
	})

	mux.HandleFunc("/api/query/editor", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			writeMethodNotAllowed(w, http.MethodGet)
			return
		}

		savedQueries, err := deps.Index.ListSavedQueries(r.Context())
		if err != nil {
			http.Error(w, "failed to list saved queries", http.StatusInternalServerError)
			return
		}
		editor := query.DescribeEditor()
		writeJSON(w, http.StatusOK, map[string]any{
			"schema": map[string]any{
				"datasets":     editor.Schema.Datasets,
				"capabilities": editor.Schema.Capabilities,
				"examples":     editor.Schema.Examples,
				"savedQueries": buildSavedQuerySummaries(savedQueries),
			},
			"rootSuggestions":    editor.RootSuggestions,
			"clauseSuggestions":  editor.ClauseSuggestions,
			"datasetSuggestions": editor.DatasetSuggestions,
		})
	})

	mux.HandleFunc("/api/query/analyze", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeMethodNotAllowed(w, http.MethodPost)
			return
		}

		var request struct {
			Query string `json:"query"`
		}
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}

		writeJSON(w, http.StatusOK, query.Analyze(request.Query))
	})

	mux.HandleFunc("/api/query/plan", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeMethodNotAllowed(w, http.MethodPost)
			return
		}

		var request struct {
			Query string `json:"query"`
		}
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}

		writeJSON(w, http.StatusOK, query.Plan(request.Query))
	})

	mux.HandleFunc("/api/query/lint", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeMethodNotAllowed(w, http.MethodPost)
			return
		}

		var request struct {
			Query string `json:"query"`
		}
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}

		writeJSON(w, http.StatusOK, query.Lint(request.Query))
	})

	mux.HandleFunc("/api/query/preview", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeMethodNotAllowed(w, http.MethodPost)
			return
		}

		var request struct {
			Query string `json:"query"`
			Limit int    `json:"limit"`
		}
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}

		writeJSON(w, http.StatusOK, query.Preview(r.Context(), deps.Index, request.Query, request.Limit))
	})

	mux.HandleFunc("/api/query/count", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeMethodNotAllowed(w, http.MethodPost)
			return
		}

		var request struct {
			Query string `json:"query"`
		}
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}

		writeJSON(w, http.StatusOK, query.Count(r.Context(), deps.Index, request.Query))
	})

	mux.HandleFunc("/api/query/workbench", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeMethodNotAllowed(w, http.MethodPost)
			return
		}

		var request struct {
			Query        string `json:"query"`
			PreviewLimit int    `json:"previewLimit"`
		}
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}

		writeJSON(w, http.StatusOK, query.Workbench(r.Context(), deps.Index, request.Query, request.PreviewLimit))
	})

	mux.HandleFunc("/api/query/suggest", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeMethodNotAllowed(w, http.MethodPost)
			return
		}

		var request query.QuerySuggestionRequest
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}

		writeJSON(w, http.StatusOK, query.Suggest(request))
	})

	mux.HandleFunc("/api/query/format", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeMethodNotAllowed(w, http.MethodPost)
			return
		}

		var request struct {
			Query string `json:"query"`
		}
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}

		writeJSON(w, http.StatusOK, query.Format(request.Query))
	})

	mux.HandleFunc("/api/query/execute", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeMethodNotAllowed(w, http.MethodPost)
			return
		}

		var request struct {
			Query string `json:"query"`
		}
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}

		result, err := deps.Query.Execute(r.Context(), deps.Index, request.Query)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		writeJSON(w, http.StatusOK, result)
	})

	mux.HandleFunc("/api/page-history/", func(w http.ResponseWriter, r *http.Request) {
		if deps.History == nil {
			http.Error(w, "history service unavailable", http.StatusInternalServerError)
			return
		}
		raw := strings.TrimPrefix(r.URL.Path, "/api/page-history/")
		restore := false
		if strings.HasSuffix(raw, "/restore") {
			restore = true
			raw = strings.TrimSuffix(raw, "/restore")
		}
		pagePath, ok := normalizeAPIPagePath(raw)
		if !ok {
			http.Error(w, "invalid page path", http.StatusBadRequest)
			return
		}
		if restore {
			if r.Method != http.MethodPost {
				writeMethodNotAllowed(w, http.MethodPost)
				return
			}
			var request struct {
				RevisionID string `json:"revisionId"`
			}
			if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
				http.Error(w, "invalid request body", http.StatusBadRequest)
				return
			}
			revision, err := deps.History.GetRevision(pagePath, request.RevisionID)
			if err != nil {
				http.Error(w, "failed to load revision", http.StatusNotFound)
				return
			}
			if deps.History != nil {
				if currentMarkdown, err := deps.Vault.ReadPage(pagePath); err == nil {
					if _, err := deps.History.SaveRevision(pagePath, currentMarkdown); err != nil {
						http.Error(w, "failed to snapshot current page", http.StatusInternalServerError)
						return
					}
				}
			}
			if err := deps.Vault.WritePage(pagePath, []byte(revision.RawMarkdown)); err != nil {
				http.Error(w, "failed to restore page", http.StatusInternalServerError)
				return
			}
			if _, err := deps.History.SaveRevision(pagePath, []byte(revision.RawMarkdown)); err != nil {
				http.Error(w, "failed to save restored revision", http.StatusInternalServerError)
				return
			}
			if err := deps.Index.ReindexPage(r.Context(), deps.Vault, pagePath); err != nil {
				http.Error(w, "failed to reindex page", http.StatusInternalServerError)
				return
			}
			if deps.Query != nil {
				if err := deps.Query.RefreshPageCache(r.Context(), deps.Index, pagePath); err != nil {
					http.Error(w, "failed to refresh query cache", http.StatusInternalServerError)
					return
				}
			}
			if deps.OnPageChanged != nil {
				deps.OnPageChanged(pagePath)
			}
			pageRecord, err := deps.Index.GetPage(r.Context(), pagePath)
			if err != nil {
				writePageError(w, r, err, "failed to load restored page")
				return
			}
			writeJSON(w, http.StatusOK, map[string]any{
				"page":        pageRecord.Path,
				"title":       pageRecord.Title,
				"rawMarkdown": pageRecord.RawMarkdown,
				"createdAt":   pageRecord.CreatedAt,
				"updatedAt":   pageRecord.UpdatedAt,
				"frontmatter": pageRecord.Frontmatter,
				"links":       pageRecord.Links,
				"tasks":       pageRecord.Tasks,
			})
			return
		}
		if r.Method == http.MethodDelete {
			if err := deps.History.DeletePageHistory(pagePath); err != nil {
				http.Error(w, "failed to purge page history", http.StatusInternalServerError)
				return
			}
			writeJSON(w, http.StatusOK, map[string]any{
				"ok":   true,
				"page": pagePath,
			})
			return
		}
		if r.Method != http.MethodGet {
			writeMethodNotAllowed(w, http.MethodGet, http.MethodDelete)
			return
		}
		revisions, err := deps.History.ListRevisions(pagePath)
		if err != nil {
			http.Error(w, "failed to load page history", http.StatusInternalServerError)
			return
		}
		items := make([]map[string]any, 0, len(revisions))
		for _, revision := range revisions {
			items = append(items, map[string]any{
				"id":          revision.ID,
				"page":        revision.Page,
				"savedAt":     revision.SavedAt.UTC().Format(time.RFC3339Nano),
				"rawMarkdown": revision.RawMarkdown,
			})
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"page":      pagePath,
			"revisions": items,
			"count":     len(items),
		})
	})

	mux.HandleFunc("/api/trash/pages", func(w http.ResponseWriter, r *http.Request) {
		if deps.History == nil {
			http.Error(w, "history service unavailable", http.StatusInternalServerError)
			return
		}
		if r.Method == http.MethodDelete {
			if err := deps.History.EmptyTrash(); err != nil {
				http.Error(w, "failed to empty trash", http.StatusInternalServerError)
				return
			}
			writeJSON(w, http.StatusOK, map[string]any{
				"ok": true,
			})
			return
		}
		if r.Method != http.MethodGet {
			writeMethodNotAllowed(w, http.MethodGet, http.MethodDelete)
			return
		}
		trashEntries, err := deps.History.ListTrash()
		if err != nil {
			http.Error(w, "failed to load trash", http.StatusInternalServerError)
			return
		}
		items := make([]map[string]any, 0, len(trashEntries))
		for _, entry := range trashEntries {
			items = append(items, map[string]any{
				"page":        entry.Page,
				"deletedAt":   entry.DeletedAt.UTC().Format(time.RFC3339Nano),
				"rawMarkdown": entry.RawMarkdown,
			})
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"pages": items,
			"count": len(items),
		})
	})

	mux.HandleFunc("/api/trash/pages/", func(w http.ResponseWriter, r *http.Request) {
		if deps.History == nil {
			http.Error(w, "history service unavailable", http.StatusInternalServerError)
			return
		}
		raw := strings.TrimPrefix(r.URL.Path, "/api/trash/pages/")
		restore := false
		if strings.HasSuffix(raw, "/restore") {
			restore = true
			raw = strings.TrimSuffix(raw, "/restore")
		}
		pagePath, ok := normalizeAPIPagePath(raw)
		if !ok {
			http.Error(w, "invalid page path", http.StatusBadRequest)
			return
		}
		if restore {
			if r.Method != http.MethodPost {
				writeMethodNotAllowed(w, http.MethodPost)
				return
			}
			entry, err := deps.History.RestoreFromTrash(pagePath)
			if err != nil {
				http.Error(w, "failed to restore trashed page", http.StatusNotFound)
				return
			}
			if err := deps.Vault.WritePage(pagePath, []byte(entry.RawMarkdown)); err != nil {
				http.Error(w, "failed to restore page", http.StatusInternalServerError)
				return
			}
			if _, err := deps.History.SaveRevision(pagePath, []byte(entry.RawMarkdown)); err != nil {
				http.Error(w, "failed to save restored page history", http.StatusInternalServerError)
				return
			}
			if err := deps.Index.ReindexPage(r.Context(), deps.Vault, pagePath); err != nil {
				http.Error(w, "failed to reindex restored page", http.StatusInternalServerError)
				return
			}
			if deps.Query != nil {
				if err := deps.Query.RefreshPageCache(r.Context(), deps.Index, pagePath); err != nil {
					http.Error(w, "failed to refresh query cache", http.StatusInternalServerError)
					return
				}
			}
			if deps.OnPageChanged != nil {
				deps.OnPageChanged(pagePath)
			}
			pageRecord, err := deps.Index.GetPage(r.Context(), pagePath)
			if err != nil {
				writePageError(w, r, err, "failed to load restored page")
				return
			}
			writeJSON(w, http.StatusOK, map[string]any{
				"page":        pageRecord.Path,
				"title":       pageRecord.Title,
				"rawMarkdown": pageRecord.RawMarkdown,
				"createdAt":   pageRecord.CreatedAt,
				"updatedAt":   pageRecord.UpdatedAt,
				"frontmatter": pageRecord.Frontmatter,
				"links":       pageRecord.Links,
				"tasks":       pageRecord.Tasks,
			})
			return
		}
		if r.Method != http.MethodDelete {
			writeMethodNotAllowed(w, http.MethodDelete)
			return
		}
		if err := deps.History.PermanentlyDelete(pagePath); err != nil {
			http.Error(w, "failed to permanently delete trashed page", http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"ok":   true,
			"page": pagePath,
		})
	})

	return wrapWithAPIAuth(mux, deps.Auth)
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

func handlePageRequest(w http.ResponseWriter, r *http.Request, deps Dependencies) {
	pagePath, subresource, ok := splitPageSubresource(strings.TrimPrefix(r.URL.Path, "/api/pages/"))
	if !ok {
		http.Error(w, "invalid page path", http.StatusBadRequest)
		return
	}

	switch subresource {
	case "":
		switch r.Method {
		case http.MethodGet:
			pageRecord, err := deps.Index.GetPage(r.Context(), pagePath)
			if err != nil {
				writePageError(w, r, err, "failed to load page")
				return
			}

			writeJSON(w, http.StatusOK, map[string]any{
				"page":        pageRecord.Path,
				"title":       pageRecord.Title,
				"rawMarkdown": pageRecord.RawMarkdown,
				"createdAt":   pageRecord.CreatedAt,
				"updatedAt":   pageRecord.UpdatedAt,
				"frontmatter": pageRecord.Frontmatter,
				"links":       pageRecord.Links,
				"tasks":       pageRecord.Tasks,
			})
		case http.MethodPut:
			var previousTasks []index.Task
			var previousPageSummary *index.PageSummary
			if existingPage, err := deps.Index.GetPage(r.Context(), pagePath); err == nil {
				previousTasks = append(previousTasks, existingPage.Tasks...)
				summary, err := summarizePageRecord(r.Context(), deps.Index, existingPage)
				if err == nil {
					previousPageSummary = &summary
				}
			}
			var request struct {
				RawMarkdown string `json:"rawMarkdown"`
			}
			if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
				http.Error(w, "invalid request body", http.StatusBadRequest)
				return
			}

			if err := deps.Vault.WritePage(pagePath, []byte(request.RawMarkdown)); err != nil {
				http.Error(w, "failed to write page", http.StatusInternalServerError)
				return
			}
			if deps.History != nil {
				if _, err := deps.History.SaveRevision(pagePath, []byte(request.RawMarkdown)); err != nil {
					http.Error(w, "failed to save page history", http.StatusInternalServerError)
					return
				}
			}
			if err := deps.Index.ReindexPage(r.Context(), deps.Vault, pagePath); err != nil {
				http.Error(w, "failed to reindex page", http.StatusInternalServerError)
				return
			}
			if deps.Query != nil {
				if err := deps.Query.RefreshPageCache(r.Context(), deps.Index, pagePath); err != nil {
					http.Error(w, "failed to refresh query cache", http.StatusInternalServerError)
					return
				}
			}

			pageRecord, err := deps.Index.GetPage(r.Context(), pagePath)
			if err != nil {
				writePageError(w, r, err, "failed to load page")
				return
			}
			currentPageSummary, err := summarizePageRecord(r.Context(), deps.Index, pageRecord)
			if err != nil {
				http.Error(w, "failed to summarize page", http.StatusInternalServerError)
				return
			}
			PublishInvalidationEvents(r.Context(), deps.Events, deps.Index, deps.Query, pagePath, []query.PageChange{{
				Before: previousPageSummary,
				After:  &currentPageSummary,
			}}, query.DiffTaskChanges(previousTasks, pageRecord.Tasks))
			if deps.OnPageChanged != nil {
				deps.OnPageChanged(pagePath)
			}

			writeJSON(w, http.StatusOK, map[string]any{
				"page":        pageRecord.Path,
				"title":       pageRecord.Title,
				"rawMarkdown": pageRecord.RawMarkdown,
				"createdAt":   pageRecord.CreatedAt,
				"updatedAt":   pageRecord.UpdatedAt,
				"frontmatter": pageRecord.Frontmatter,
				"links":       pageRecord.Links,
				"tasks":       pageRecord.Tasks,
			})
		case http.MethodDelete:
			pageRecord, err := deps.Index.GetPage(r.Context(), pagePath)
			if err != nil {
				writePageError(w, r, err, "failed to load page")
				return
			}
			previousTasks := append([]index.Task(nil), pageRecord.Tasks...)
			previousPageSummaryValue, err := summarizePageRecord(r.Context(), deps.Index, pageRecord)
			if err != nil {
				http.Error(w, "failed to summarize page", http.StatusInternalServerError)
				return
			}
			backlinks, err := deps.Index.GetBacklinks(r.Context(), pagePath)
			if err != nil {
				writePageError(w, r, err, "failed to load backlinks")
				return
			}
			dependentPages := collectBacklinkSourcePages(backlinks)
			if deps.History != nil {
				if _, err := deps.History.SaveRevision(pagePath, []byte(pageRecord.RawMarkdown)); err != nil {
					http.Error(w, "failed to save page history", http.StatusInternalServerError)
					return
				}
				if err := deps.History.MoveToTrash(pagePath, []byte(pageRecord.RawMarkdown)); err != nil {
					http.Error(w, "failed to move page to trash", http.StatusInternalServerError)
					return
				}
			}
			if err := deps.Vault.DeletePage(pagePath); err != nil {
				http.Error(w, "failed to delete page", http.StatusInternalServerError)
				return
			}
			if err := deps.Index.RemovePage(r.Context(), pagePath); err != nil {
				http.Error(w, "failed to remove page from index", http.StatusInternalServerError)
				return
			}
			PublishDeletionEvents(r.Context(), deps.Events, deps.Index, deps.Query, pagePath, dependentPages, []query.PageChange{{
				Before: &previousPageSummaryValue,
				After:  nil,
			}}, query.DiffTaskChanges(previousTasks, nil))
			if deps.OnPageChanged != nil {
				deps.OnPageChanged(pagePath)
			}
			writeJSON(w, http.StatusOK, map[string]any{
				"ok":   true,
				"page": pagePath,
			})
		case http.MethodPatch:
			var request struct {
				Title       *string  `json:"title"`
				Tags        []string `json:"tags"`
				Frontmatter *struct {
					Set    map[string]any `json:"set"`
					Remove []string       `json:"remove"`
				} `json:"frontmatter"`
			}
			if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
				http.Error(w, "invalid request body", http.StatusBadRequest)
				return
			}
			if request.Frontmatter == nil && request.Title == nil && request.Tags == nil {
				http.Error(w, "unsupported page patch", http.StatusBadRequest)
				return
			}

			patch := markdown.FrontmatterPatch{}
			if request.Frontmatter != nil {
				patch.Set = request.Frontmatter.Set
				patch.Remove = request.Frontmatter.Remove
			}
			if request.Title != nil {
				title := strings.TrimSpace(*request.Title)
				if title == "" {
					patch.Remove = append(patch.Remove, "title")
				} else {
					if patch.Set == nil {
						patch.Set = make(map[string]any)
					}
					patch.Set["title"] = title
				}
			}
			if request.Tags != nil {
				tags := make([]string, 0, len(request.Tags))
				for _, tag := range request.Tags {
					trimmed := strings.TrimSpace(tag)
					if trimmed != "" {
						tags = append(tags, trimmed)
					}
				}
				if len(tags) == 0 {
					patch.Remove = append(patch.Remove, "tags")
				} else {
					if patch.Set == nil {
						patch.Set = make(map[string]any)
					}
					patch.Set["tags"] = tags
				}
			}

			pageRecord, err := patchPageFrontmatter(r.Context(), deps, pagePath, patch)
			if err != nil {
				writePageError(w, r, err, "failed to patch page")
				return
			}

			writeJSON(w, http.StatusOK, map[string]any{
				"page":        pageRecord.Path,
				"title":       pageRecord.Title,
				"rawMarkdown": pageRecord.RawMarkdown,
				"createdAt":   pageRecord.CreatedAt,
				"updatedAt":   pageRecord.UpdatedAt,
				"frontmatter": pageRecord.Frontmatter,
				"links":       pageRecord.Links,
				"tasks":       pageRecord.Tasks,
			})
		default:
			writeMethodNotAllowed(w, http.MethodGet, http.MethodPut, http.MethodPatch, http.MethodDelete)
		}
	case "backlinks":
		if r.Method != http.MethodGet {
			writeMethodNotAllowed(w, http.MethodGet)
			return
		}
		backlinks, err := deps.Index.GetBacklinks(r.Context(), pagePath)
		if err != nil {
			writePageError(w, r, err, "failed to load backlinks")
			return
		}

		writeJSON(w, http.StatusOK, map[string]any{
			"page":      pagePath,
			"backlinks": backlinks,
		})
	case "frontmatter":
		if r.Method != http.MethodPatch {
			writeMethodNotAllowed(w, http.MethodPatch)
			return
		}

		var request struct {
			Set    map[string]any `json:"set"`
			Remove []string       `json:"remove"`
		}
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}

		pageRecord, err := patchPageFrontmatter(r.Context(), deps, pagePath, markdown.FrontmatterPatch{
			Set:    request.Set,
			Remove: request.Remove,
		})
		if err != nil {
			writePageError(w, r, err, "failed to patch page")
			return
		}

		writeJSON(w, http.StatusOK, map[string]any{
			"page":        pageRecord.Path,
			"title":       pageRecord.Title,
			"rawMarkdown": pageRecord.RawMarkdown,
			"createdAt":   pageRecord.CreatedAt,
			"updatedAt":   pageRecord.UpdatedAt,
			"frontmatter": pageRecord.Frontmatter,
			"links":       pageRecord.Links,
			"tasks":       pageRecord.Tasks,
		})
	case "move":
		if r.Method != http.MethodPost {
			writeMethodNotAllowed(w, http.MethodPost)
			return
		}

		var request struct {
			TargetPage string `json:"targetPage"`
		}
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}
		targetPage, ok := normalizeAPIPagePath(request.TargetPage)
		if !ok || targetPage == "" {
			http.Error(w, "invalid target page", http.StatusBadRequest)
			return
		}

		pageRecord, err := deps.Index.GetPage(r.Context(), pagePath)
		if err != nil {
			writePageError(w, r, err, "failed to load page")
			return
		}
		previousTasks := append([]index.Task(nil), pageRecord.Tasks...)
		previousPageSummaryValue, err := summarizePageRecord(r.Context(), deps.Index, pageRecord)
		if err != nil {
			http.Error(w, "failed to summarize page", http.StatusInternalServerError)
			return
		}
		backlinks, err := deps.Index.GetBacklinks(r.Context(), pagePath)
		if err != nil {
			writePageError(w, r, err, "failed to load backlinks")
			return
		}
		dependentPages := collectBacklinkSourcePages(backlinks)
		if err := deps.Vault.MovePage(pagePath, targetPage); err != nil {
			http.Error(w, "failed to move page", http.StatusInternalServerError)
			return
		}
		if deps.History != nil {
			if err := deps.History.MovePage(pagePath, targetPage); err != nil {
				http.Error(w, "failed to move page history", http.StatusInternalServerError)
				return
			}
		}
		if err := deps.Index.RemovePage(r.Context(), pagePath); err != nil {
			http.Error(w, "failed to remove old page from index", http.StatusInternalServerError)
			return
		}
		if err := deps.Index.ReindexPage(r.Context(), deps.Vault, targetPage); err != nil {
			http.Error(w, "failed to index moved page", http.StatusInternalServerError)
			return
		}
		if deps.Query != nil {
			if err := deps.Query.RefreshPageCache(r.Context(), deps.Index, targetPage); err != nil {
				http.Error(w, "failed to refresh query cache", http.StatusInternalServerError)
				return
			}
		}
		updatedPage, err := deps.Index.GetPage(r.Context(), targetPage)
		if err != nil {
			writePageError(w, r, err, "failed to load moved page")
			return
		}
		currentPageSummaryValue, err := summarizePageRecord(r.Context(), deps.Index, updatedPage)
		if err != nil {
			http.Error(w, "failed to summarize moved page", http.StatusInternalServerError)
			return
		}
		PublishDeletionEvents(r.Context(), deps.Events, deps.Index, deps.Query, pagePath, dependentPages, []query.PageChange{{
			Before: &previousPageSummaryValue,
			After:  nil,
		}}, query.DiffTaskChanges(previousTasks, nil))
		PublishInvalidationEvents(r.Context(), deps.Events, deps.Index, deps.Query, targetPage, []query.PageChange{{
			Before: nil,
			After:  &currentPageSummaryValue,
		}}, query.DiffTaskChanges(nil, updatedPage.Tasks))
		if deps.OnPageChanged != nil {
			deps.OnPageChanged(pagePath)
			deps.OnPageChanged(targetPage)
		}

		writeJSON(w, http.StatusOK, map[string]any{
			"page":        updatedPage.Path,
			"title":       updatedPage.Title,
			"rawMarkdown": updatedPage.RawMarkdown,
			"createdAt":   updatedPage.CreatedAt,
			"updatedAt":   updatedPage.UpdatedAt,
			"frontmatter": updatedPage.Frontmatter,
			"links":       updatedPage.Links,
			"tasks":       updatedPage.Tasks,
		})
	case "derived":
		if r.Method != http.MethodGet {
			writeMethodNotAllowed(w, http.MethodGet)
			return
		}
		if deps.Query != nil {
			if err := deps.Query.RefreshPageCache(r.Context(), deps.Index, pagePath); err != nil {
				writePageError(w, r, err, "failed to refresh derived query state")
				return
			}
		}
		pageRecord, err := deps.Index.GetPage(r.Context(), pagePath)
		if err != nil {
			writePageError(w, r, err, "failed to load derived state")
			return
		}

		backlinks, err := deps.Index.GetBacklinks(r.Context(), pagePath)
		if err != nil {
			writePageError(w, r, err, "failed to load derived state")
			return
		}

		queryBlocks, err := loadEnrichedQueryBlocks(r.Context(), deps.Index, pagePath)
		if err != nil {
			writePageError(w, r, err, "failed to load derived state")
			return
		}

		writeJSON(w, http.StatusOK, map[string]any{
			"page":        pageRecord.Path,
			"title":       pageRecord.Title,
			"toc":         index.ExtractHeadings(pageRecord.RawMarkdown),
			"links":       pageRecord.Links,
			"tasks":       pageRecord.Tasks,
			"backlinks":   backlinks,
			"queryBlocks": queryBlocks,
			"linkCounts":  map[string]int{"outgoing": len(pageRecord.Links), "backlinks": len(backlinks)},
			"taskCounts":  map[string]int{"total": len(pageRecord.Tasks), "open": countOpenTasks(pageRecord.Tasks), "done": countDoneTasks(pageRecord.Tasks)},
		})
	case "query-blocks":
		queryBlockValue, mode, action, isCollection := parseQueryBlockPath(r.URL.Path)

		switch {
		case isCollection && action == "refresh" && r.Method == http.MethodPost:
			if deps.Query == nil {
				http.Error(w, "query service unavailable", http.StatusInternalServerError)
				return
			}
			queryBlocks, err := deps.Query.ForceRefreshPageCache(r.Context(), deps.Index, pagePath)
			if err != nil {
				writePageError(w, r, err, "failed to refresh query blocks")
				return
			}
			if err := markStaleQueryBlocks(r.Context(), deps.Index, queryBlocks); err != nil {
				writePageError(w, r, err, "failed to load refreshed query blocks")
				return
			}
			if deps.Events != nil {
				for _, block := range queryBlocks {
					deps.Events.Publish(Event{
						Type: "query-block.changed",
						Data: queryBlockChangedData(pagePath, block),
					})
				}
				deps.Events.Publish(Event{
					Type: "derived.changed",
					Data: map[string]any{"page": pagePath},
				})
				deps.Events.Publish(Event{
					Type: "query.changed",
					Data: queryChangedData(pagePath, pagePath, queryBlocks),
				})
			}
			writeJSON(w, http.StatusOK, map[string]any{
				"page":        pagePath,
				"queryBlocks": queryBlocks,
				"count":       len(queryBlocks),
			})
		case isCollection && r.Method == http.MethodGet:
			if deps.Query != nil {
				if err := deps.Query.RefreshPageCache(r.Context(), deps.Index, pagePath); err != nil {
					writePageError(w, r, err, "failed to refresh query blocks")
					return
				}
			}
			queryBlocks, err := loadEnrichedQueryBlocks(r.Context(), deps.Index, pagePath)
			if err != nil {
				writePageError(w, r, err, "failed to load query blocks")
				return
			}
			writeJSON(w, http.StatusOK, map[string]any{
				"page":        pagePath,
				"queryBlocks": queryBlocks,
				"count":       len(queryBlocks),
			})
		case isCollection:
			writeMethodNotAllowed(w, http.MethodGet, http.MethodPost)
		case action == "" && r.Method == http.MethodGet:
			if deps.Query != nil {
				if err := deps.Query.RefreshPageCache(r.Context(), deps.Index, pagePath); err != nil {
					writeQueryBlockError(w, r, err, "failed to refresh query block")
					return
				}
			}
			block, err := loadEnrichedQueryBlockByMode(r.Context(), deps.Index, pagePath, mode, queryBlockValue)
			if err != nil {
				writeQueryBlockError(w, r, err, "failed to load query block")
				return
			}
			writeJSON(w, http.StatusOK, map[string]any{
				"page":       pagePath,
				"queryBlock": block,
			})
		case action == "refresh" && r.Method == http.MethodPost:
			if deps.Query == nil {
				http.Error(w, "query service unavailable", http.StatusInternalServerError)
				return
			}
			block, err := loadEnrichedQueryBlockByMode(r.Context(), deps.Index, pagePath, mode, queryBlockValue)
			if err != nil {
				writeQueryBlockError(w, r, err, "failed to refresh query block")
				return
			}
			if _, err := deps.Query.RefreshPageBlock(r.Context(), deps.Index, pagePath, block.BlockKey); err != nil {
				writeQueryBlockError(w, r, err, "failed to refresh query block")
				return
			}
			block, err = loadEnrichedQueryBlock(r.Context(), deps.Index, pagePath, block.BlockKey)
			if err != nil {
				writeQueryBlockError(w, r, err, "failed to load refreshed query block")
				return
			}
			if deps.Events != nil {
				deps.Events.Publish(Event{
					Type: "query-block.changed",
					Data: queryBlockChangedData(pagePath, block),
				})
				deps.Events.Publish(Event{
					Type: "derived.changed",
					Data: map[string]any{"page": pagePath},
				})
				deps.Events.Publish(Event{
					Type: "query.changed",
					Data: queryChangedData(pagePath, pagePath, []index.QueryBlock{block}),
				})
			}
			writeJSON(w, http.StatusOK, map[string]any{
				"page":       pagePath,
				"queryBlock": block,
			})
		case action == "":
			writeMethodNotAllowed(w, http.MethodGet)
		case action == "refresh":
			writeMethodNotAllowed(w, http.MethodPost)
		default:
			http.NotFound(w, r)
		}
	default:
		http.NotFound(w, r)
	}
}

func collectBacklinkSourcePages(backlinks []index.BacklinkRecord) []string {
	seen := make(map[string]struct{}, len(backlinks))
	dependentPages := make([]string, 0, len(backlinks))
	for _, backlink := range backlinks {
		if backlink.SourcePage == "" {
			continue
		}
		if _, ok := seen[backlink.SourcePage]; ok {
			continue
		}
		seen[backlink.SourcePage] = struct{}{}
		dependentPages = append(dependentPages, backlink.SourcePage)
	}
	return dependentPages
}

func patchPageFrontmatter(ctx context.Context, deps Dependencies, pagePath string, patch markdown.FrontmatterPatch) (index.PageRecord, error) {
	pageRecord, err := deps.Index.GetPage(ctx, pagePath)
	if err != nil {
		return index.PageRecord{}, err
	}
	previousTasks := append([]index.Task(nil), pageRecord.Tasks...)
	previousPageSummaryValue, err := summarizePageRecord(ctx, deps.Index, pageRecord)
	if err != nil {
		return index.PageRecord{}, err
	}
	previousPageSummary := &previousPageSummaryValue

	rawMarkdown, err := deps.Vault.ReadPage(pagePath)
	if err != nil {
		return index.PageRecord{}, err
	}

	updatedMarkdown, err := markdown.ApplyFrontmatterPatch(string(rawMarkdown), pageRecord.Frontmatter, patch)
	if err != nil {
		return index.PageRecord{}, err
	}

	if err := deps.Vault.WritePage(pagePath, []byte(updatedMarkdown)); err != nil {
		return index.PageRecord{}, err
	}
	if deps.History != nil {
		if _, err := deps.History.SaveRevision(pagePath, []byte(updatedMarkdown)); err != nil {
			return index.PageRecord{}, err
		}
	}
	if err := deps.Index.ReindexPage(ctx, deps.Vault, pagePath); err != nil {
		return index.PageRecord{}, err
	}
	if deps.Query != nil {
		if err := deps.Query.RefreshPageCache(ctx, deps.Index, pagePath); err != nil {
			return index.PageRecord{}, err
		}
	}

	updatedPage, err := deps.Index.GetPage(ctx, pagePath)
	if err != nil {
		return index.PageRecord{}, err
	}
	currentPageSummaryValue, err := summarizePageRecord(ctx, deps.Index, updatedPage)
	if err != nil {
		return index.PageRecord{}, err
	}
	currentPageSummary := &currentPageSummaryValue
	PublishInvalidationEvents(ctx, deps.Events, deps.Index, deps.Query, pagePath, []query.PageChange{{
		Before: previousPageSummary,
		After:  currentPageSummary,
	}}, query.DiffTaskChanges(previousTasks, updatedPage.Tasks))
	if deps.OnPageChanged != nil {
		deps.OnPageChanged(pagePath)
	}

	return updatedPage, nil
}

func loadEnrichedQueryBlocks(ctx context.Context, indexService *index.Service, pagePath string) ([]index.QueryBlock, error) {
	queryBlocks, err := indexService.GetQueryBlocks(ctx, pagePath)
	if err != nil {
		return nil, err
	}
	if err := markStaleQueryBlocks(ctx, indexService, queryBlocks); err != nil {
		return nil, err
	}
	return queryBlocks, nil
}

func loadEnrichedQueryBlock(ctx context.Context, indexService *index.Service, pagePath string, blockKey string) (index.QueryBlock, error) {
	queryBlocks, err := loadEnrichedQueryBlocks(ctx, indexService, pagePath)
	if err != nil {
		return index.QueryBlock{}, err
	}
	for _, block := range queryBlocks {
		if block.BlockKey == blockKey {
			return block, nil
		}
	}
	return index.QueryBlock{}, query.ErrQueryBlockNotFound
}

func loadEnrichedQueryBlockByMode(ctx context.Context, indexService *index.Service, pagePath string, mode string, value string) (index.QueryBlock, error) {
	queryBlocks, err := loadEnrichedQueryBlocks(ctx, indexService, pagePath)
	if err != nil {
		return index.QueryBlock{}, err
	}
	for _, block := range queryBlocks {
		switch mode {
		case "id":
			if block.ID == value {
				return block, nil
			}
		default:
			if block.BlockKey == value {
				return block, nil
			}
		}
	}
	return index.QueryBlock{}, query.ErrQueryBlockNotFound
}

func markStaleQueryBlocks(ctx context.Context, indexService *index.Service, queryBlocks []index.QueryBlock) error {
	if len(queryBlocks) == 0 {
		return nil
	}

	pages, err := indexService.ListPages(ctx)
	if err != nil {
		return err
	}

	pageUpdates := make(map[string]time.Time, len(pages))
	var latestAny time.Time
	for _, page := range pages {
		updatedAt, err := time.Parse(time.RFC3339Nano, page.UpdatedAt)
		if err != nil {
			continue
		}
		pageUpdates[page.Path] = updatedAt
		if updatedAt.After(latestAny) {
			latestAny = updatedAt
		}
	}

	for idx := range queryBlocks {
		parsed, err := query.Parse(queryBlocks[idx].Source)
		if err == nil && parsed.From != "" {
			queryBlocks[idx].Datasets = []string{parsed.From}
			queryBlocks[idx].MatchPage = queryMatchFieldForDataset(parsed)
		}
		queryBlocks[idx].RowCount, queryBlocks[idx].RenderHint = summarizeQueryBlockResult(queryBlocks[idx])

		metadata := queryBlockFreshness(queryBlocks[idx], pageUpdates, latestAny)
		queryBlocks[idx].Stale = metadata.Stale
		queryBlocks[idx].StalePage = metadata.Page
		queryBlocks[idx].StaleSince = metadata.Since
		queryBlocks[idx].StaleReason = metadata.Reason
	}
	return nil
}

type queryBlockFreshnessMetadata struct {
	Stale  bool
	Page   string
	Since  string
	Reason string
}

func queryBlockFreshness(block index.QueryBlock, pageUpdates map[string]time.Time, latestAny time.Time) queryBlockFreshnessMetadata {
	parsed, err := query.Parse(block.Source)
	if err != nil {
		return queryBlockFreshnessMetadata{}
	}

	cacheUpdatedAt, err := time.Parse(time.RFC3339Nano, block.UpdatedAt)
	if err != nil {
		return queryBlockFreshnessMetadata{
			Stale:  true,
			Reason: "cache-missing-timestamp",
		}
	}

	relevantUpdatedAt, relevantPage, missingScopedPage := relevantQueryUpdatedAt(parsed, pageUpdates, latestAny)
	if missingScopedPage {
		return queryBlockFreshnessMetadata{
			Stale:  true,
			Page:   relevantPage,
			Reason: "missing-scoped-page",
		}
	}
	if relevantUpdatedAt.IsZero() {
		return queryBlockFreshnessMetadata{}
	}
	if !relevantUpdatedAt.After(cacheUpdatedAt) {
		return queryBlockFreshnessMetadata{}
	}

	reason := "dataset-newer-than-cache"
	if relevantPage != "" {
		reason = "page-newer-than-cache"
	}
	return queryBlockFreshnessMetadata{
		Stale:  true,
		Page:   relevantPage,
		Since:  relevantUpdatedAt.UTC().Format(time.RFC3339Nano),
		Reason: reason,
	}
}

func relevantQueryUpdatedAt(parsed query.ParsedQuery, pageUpdates map[string]time.Time, latestAny time.Time) (time.Time, string, bool) {
	switch parsed.From {
	case "tasks":
		if pagePath, ok := queryMatchField(parsed, "page"); ok {
			updatedAt, found := pageUpdates[pagePath]
			return updatedAt, pagePath, !found
		}
		return latestAny, "", false
	case "pages":
		if pagePath, ok := queryMatchField(parsed, "path"); ok {
			updatedAt, found := pageUpdates[pagePath]
			return updatedAt, pagePath, !found
		}
		return latestAny, "", false
	default:
		return time.Time{}, "", false
	}
}

func queryMatchFieldForDataset(parsed query.ParsedQuery) string {
	switch parsed.From {
	case "tasks":
		pagePath, _ := queryMatchField(parsed, "page")
		return pagePath
	case "pages":
		pagePath, _ := queryMatchField(parsed, "path")
		return pagePath
	default:
		return ""
	}
}

func summarizeQueryBlockResult(block index.QueryBlock) (int, string) {
	if block.Error != "" {
		return 0, "error"
	}

	switch result := block.Result.(type) {
	case query.Result:
		rowCount := len(result.Rows)
		if rowCount == 0 {
			return 0, "empty"
		}
		if len(result.Columns) == 1 {
			return rowCount, "list"
		}
		return rowCount, "table"
	case map[string]any:
		rowsAny, ok := result["rows"].([]any)
		if !ok {
			return 0, ""
		}
		rowCount := len(rowsAny)
		if rowCount == 0 {
			return 0, "empty"
		}

		columnsAny, ok := result["columns"].([]any)
		if ok && len(columnsAny) == 1 {
			return rowCount, "list"
		}
		return rowCount, "table"
	default:
		return 0, ""
	}
}

func queryMatchField(parsed query.ParsedQuery, field string) (string, bool) {
	groups := queryWhereGroups(parsed)
	if len(groups) == 0 {
		return "", false
	}

	match := ""
	for _, group := range groups {
		groupMatch := ""
		for _, filter := range group {
			if filter.Op != "=" || filter.Field != field {
				continue
			}
			value, ok := filter.Value.(string)
			if !ok {
				continue
			}
			groupMatch = strings.TrimSpace(value)
			break
		}
		if groupMatch == "" {
			return "", false
		}
		if match == "" {
			match = groupMatch
			continue
		}
		if match != groupMatch {
			return "", false
		}
	}
	return match, match != ""
}

func queryWhereGroups(parsed query.ParsedQuery) [][]query.Filter {
	if len(parsed.WhereAny) > 0 {
		return parsed.WhereAny
	}
	if len(parsed.Where) > 0 {
		return [][]query.Filter{parsed.Where}
	}
	return nil
}

func writePageError(w http.ResponseWriter, r *http.Request, err error, message string) {
	if errors.Is(err, index.ErrPageNotFound) {
		http.NotFound(w, r)
		return
	}
	http.Error(w, message, http.StatusInternalServerError)
}

func writeTaskError(w http.ResponseWriter, r *http.Request, err error) {
	if errors.Is(err, index.ErrTaskNotFound) {
		http.NotFound(w, r)
		return
	}
	http.Error(w, "failed to load task", http.StatusInternalServerError)
}

func writeSavedQueryError(w http.ResponseWriter, err error) {
	if errors.Is(err, index.ErrSavedQueryNotFound) {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	http.Error(w, "failed to load saved query", http.StatusInternalServerError)
}

func writeQueryBlockError(w http.ResponseWriter, r *http.Request, err error, message string) {
	if errors.Is(err, index.ErrPageNotFound) || errors.Is(err, query.ErrQueryBlockNotFound) {
		http.NotFound(w, r)
		return
	}
	http.Error(w, message, http.StatusInternalServerError)
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func writeMethodNotAllowed(w http.ResponseWriter, methods ...string) {
	if len(methods) > 0 {
		w.Header().Set("Allow", strings.Join(methods, ", "))
	}
	http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
}

func normalizeAPIPagePath(pagePath string) (string, bool) {
	normalized := path.Clean(strings.TrimSpace(strings.TrimSuffix(strings.ReplaceAll(pagePath, "\\", "/"), ".md")))
	normalized = strings.TrimPrefix(normalized, "/")
	if normalized == "" || normalized == "." || normalized == ".." || strings.HasPrefix(normalized, "../") {
		return "", false
	}
	return normalized, true
}

func splitPageSubresource(rawPath string) (string, string, bool) {
	trimmed := strings.Trim(strings.TrimSpace(rawPath), "/")
	if trimmed == "" {
		return "", "", false
	}

	parts := strings.Split(trimmed, "/")
	if len(parts) >= 2 && parts[len(parts)-2] == "query-blocks" && parts[len(parts)-1] == "refresh" {
		pagePath, ok := normalizeAPIPagePath(strings.Join(parts[:len(parts)-2], "/"))
		return pagePath, "query-blocks", ok
	}
	if len(parts) > 2 && parts[len(parts)-2] == "query-blocks" {
		pagePath, ok := normalizeAPIPagePath(strings.Join(parts[:len(parts)-2], "/"))
		return pagePath, "query-blocks", ok
	}
	if len(parts) > 3 && parts[len(parts)-3] == "query-blocks" && parts[len(parts)-2] == "id" {
		pagePath, ok := normalizeAPIPagePath(strings.Join(parts[:len(parts)-3], "/"))
		return pagePath, "query-blocks", ok
	}
	if len(parts) > 3 && parts[len(parts)-3] == "query-blocks" && parts[len(parts)-1] == "refresh" {
		pagePath, ok := normalizeAPIPagePath(strings.Join(parts[:len(parts)-3], "/"))
		return pagePath, "query-blocks", ok
	}
	if len(parts) > 4 && parts[len(parts)-4] == "query-blocks" && parts[len(parts)-3] == "id" && parts[len(parts)-1] == "refresh" {
		pagePath, ok := normalizeAPIPagePath(strings.Join(parts[:len(parts)-4], "/"))
		return pagePath, "query-blocks", ok
	}
	if len(parts) > 1 && parts[len(parts)-1] == "query-blocks" {
		pagePath, ok := normalizeAPIPagePath(strings.Join(parts[:len(parts)-1], "/"))
		return pagePath, "query-blocks", ok
	}
	if len(parts) > 1 {
		last := parts[len(parts)-1]
		switch last {
		case "backlinks", "derived", "frontmatter", "move":
			pagePath, ok := normalizeAPIPagePath(strings.Join(parts[:len(parts)-1], "/"))
			return pagePath, last, ok
		}
	}

	pagePath, ok := normalizeAPIPagePath(trimmed)
	return pagePath, "", ok
}

func parseQueryBlockPath(rawPath string) (string, string, string, bool) {
	trimmed := strings.Trim(strings.TrimSpace(strings.TrimPrefix(rawPath, "/api/pages/")), "/")
	if trimmed == "" {
		return "", "", "", false
	}
	parts := strings.Split(trimmed, "/")
	if len(parts) >= 2 && parts[len(parts)-2] == "query-blocks" && parts[len(parts)-1] == "refresh" {
		return "", "", "refresh", true
	}
	if len(parts) >= 2 && parts[len(parts)-1] == "query-blocks" {
		return "", "", "", true
	}
	if len(parts) >= 4 && parts[len(parts)-3] == "query-blocks" && parts[len(parts)-2] == "id" {
		id := strings.TrimSpace(parts[len(parts)-1])
		if id == "" || id == "." || id == "id" || id == "query-blocks" {
			return "", "", "", false
		}
		return id, "id", "", false
	}
	if len(parts) >= 5 && parts[len(parts)-4] == "query-blocks" && parts[len(parts)-3] == "id" && parts[len(parts)-1] == "refresh" {
		id := strings.TrimSpace(parts[len(parts)-2])
		if id == "" || id == "." || id == "id" || id == "query-blocks" {
			return "", "", "", false
		}
		return id, "id", "refresh", false
	}
	if len(parts) < 3 {
		return "", "", "", false
	}
	if parts[len(parts)-2] == "query-blocks" {
		key := strings.TrimSpace(parts[len(parts)-1])
		if key == "" || key == "." || key == "query-blocks" {
			return "", "", "", false
		}
		return key, "key", "", false
	}
	if len(parts) >= 4 && parts[len(parts)-3] == "query-blocks" && parts[len(parts)-1] == "refresh" {
		key := strings.TrimSpace(parts[len(parts)-2])
		if key == "" || key == "." || key == "query-blocks" {
			return "", "", "", false
		}
		return key, "key", "refresh", false
	}
	return "", "", "", false
}

func countOpenTasks(tasks []index.Task) int {
	count := 0
	for _, task := range tasks {
		if !task.Done {
			count++
		}
	}
	return count
}

func countDoneTasks(tasks []index.Task) int {
	count := 0
	for _, task := range tasks {
		if task.Done {
			count++
		}
	}
	return count
}

func filterPageSummaries(pages []index.PageSummary, queryText string) []index.PageSummary {
	needle := strings.ToLower(strings.TrimSpace(queryText))
	if needle == "" {
		return pages
	}

	filtered := make([]index.PageSummary, 0, len(pages))
	for _, page := range pages {
		if strings.Contains(strings.ToLower(page.Path), needle) || strings.Contains(strings.ToLower(page.Title), needle) {
			filtered = append(filtered, page)
		}
	}
	return filtered
}

func filterSavedQueries(savedQueries []index.SavedQuery, queryText string) []index.SavedQuery {
	needle := strings.ToLower(strings.TrimSpace(queryText))
	if needle == "" {
		return savedQueries
	}

	filtered := make([]index.SavedQuery, 0, len(savedQueries))
	for _, savedQuery := range savedQueries {
		if strings.Contains(strings.ToLower(savedQuery.Name), needle) ||
			strings.Contains(strings.ToLower(savedQuery.Title), needle) ||
			strings.Contains(strings.ToLower(savedQuery.Description), needle) ||
			strings.Contains(strings.ToLower(savedQuery.Folder), needle) ||
			containsSavedQueryTag(savedQuery.Tags, needle) {
			filtered = append(filtered, savedQuery)
		}
	}
	return filtered
}

func filterSavedQueriesByFolder(savedQueries []index.SavedQuery, folder string) []index.SavedQuery {
	needle := strings.TrimSpace(folder)
	if needle == "" {
		return savedQueries
	}

	filtered := make([]index.SavedQuery, 0, len(savedQueries))
	for _, savedQuery := range savedQueries {
		if strings.EqualFold(savedQuery.Folder, needle) {
			filtered = append(filtered, savedQuery)
		}
	}
	return filtered
}

func filterSavedQueriesByTag(savedQueries []index.SavedQuery, tag string) []index.SavedQuery {
	needle := strings.TrimSpace(tag)
	if needle == "" {
		return savedQueries
	}

	filtered := make([]index.SavedQuery, 0, len(savedQueries))
	for _, savedQuery := range savedQueries {
		for _, item := range savedQuery.Tags {
			if strings.EqualFold(strings.TrimSpace(item), needle) {
				filtered = append(filtered, savedQuery)
				break
			}
		}
	}
	return filtered
}

func containsSavedQueryTag(tags []string, needle string) bool {
	for _, tag := range tags {
		if strings.Contains(strings.ToLower(tag), needle) {
			return true
		}
	}
	return false
}

func filterTasks(tasks []index.Task, queryText string) []index.Task {
	needle := strings.ToLower(strings.TrimSpace(queryText))
	if needle == "" {
		return tasks
	}

	filtered := make([]index.Task, 0, len(tasks))
	for _, task := range tasks {
		if strings.Contains(strings.ToLower(task.Ref), needle) ||
			strings.Contains(strings.ToLower(task.Page), needle) ||
			strings.Contains(strings.ToLower(task.Text), needle) {
			filtered = append(filtered, task)
		}
	}
	return filtered
}

func filterTasksByState(tasks []index.Task, stateFilter string) []index.Task {
	filter := strings.ToLower(strings.TrimSpace(stateFilter))
	if filter == "" {
		return tasks
	}

	filtered := make([]index.Task, 0, len(tasks))
	for _, task := range tasks {
		switch filter {
		case "open":
			if !task.Done {
				filtered = append(filtered, task)
			}
		case "done":
			if task.Done {
				filtered = append(filtered, task)
			}
		default:
			if strings.EqualFold(task.State, filter) {
				filtered = append(filtered, task)
			}
		}
	}
	return filtered
}

func filterTasksByWho(tasks []index.Task, whoFilter string) []index.Task {
	needle := strings.TrimSpace(whoFilter)
	if needle == "" {
		return tasks
	}

	filtered := make([]index.Task, 0, len(tasks))
	for _, task := range tasks {
		for _, who := range task.Who {
			if strings.EqualFold(strings.TrimSpace(who), needle) {
				filtered = append(filtered, task)
				break
			}
		}
	}
	return filtered
}

func filterLinks(links []index.Link, queryText string) []index.Link {
	needle := strings.ToLower(strings.TrimSpace(queryText))
	if needle == "" {
		return links
	}

	filtered := make([]index.Link, 0, len(links))
	for _, link := range links {
		if strings.Contains(strings.ToLower(link.SourcePage), needle) ||
			strings.Contains(strings.ToLower(link.TargetPage), needle) ||
			strings.Contains(strings.ToLower(link.LinkText), needle) ||
			strings.Contains(strings.ToLower(link.Kind), needle) {
			filtered = append(filtered, link)
		}
	}
	return filtered
}

func filterLinksBySourcePage(links []index.Link, sourcePage string) []index.Link {
	needle := strings.TrimSpace(sourcePage)
	if needle == "" {
		return links
	}

	filtered := make([]index.Link, 0, len(links))
	for _, link := range links {
		if strings.EqualFold(link.SourcePage, needle) {
			filtered = append(filtered, link)
		}
	}
	return filtered
}

func filterLinksByTargetPage(links []index.Link, targetPage string) []index.Link {
	needle := strings.TrimSpace(targetPage)
	if needle == "" {
		return links
	}

	filtered := make([]index.Link, 0, len(links))
	for _, link := range links {
		if strings.EqualFold(link.TargetPage, needle) {
			filtered = append(filtered, link)
		}
	}
	return filtered
}

func filterLinksByKind(links []index.Link, kind string) []index.Link {
	needle := strings.TrimSpace(kind)
	if needle == "" {
		return links
	}

	filtered := make([]index.Link, 0, len(links))
	for _, link := range links {
		if strings.EqualFold(link.Kind, needle) {
			filtered = append(filtered, link)
		}
	}
	return filtered
}

func summarizeTasks(tasks []index.Task) map[string]int {
	summary := map[string]int{
		"total":      len(tasks),
		"open":       0,
		"done":       0,
		"withDue":    0,
		"withoutDue": 0,
	}
	for _, task := range tasks {
		if task.Done {
			summary["done"]++
		} else {
			summary["open"]++
		}
		if task.Due != nil && strings.TrimSpace(*task.Due) != "" {
			summary["withDue"]++
		} else {
			summary["withoutDue"]++
		}
	}
	return summary
}

func summarizeLinks(links []index.Link) map[string]int {
	summary := map[string]int{
		"total":     len(links),
		"wikilink":  0,
		"markdown":  0,
		"otherKind": 0,
	}
	for _, link := range links {
		switch strings.ToLower(strings.TrimSpace(link.Kind)) {
		case "wikilink":
			summary["wikilink"]++
		case "markdown":
			summary["markdown"]++
		default:
			summary["otherKind"]++
		}
	}
	return summary
}

func buildPageListSummaries(pages []index.PageSummary) ([]map[string]any, error) {
	summaries := make([]map[string]any, 0, len(pages))
	for _, page := range pages {
		summaries = append(summaries, map[string]any{
			"path":      page.Path,
			"title":     page.Title,
			"createdAt": page.CreatedAt,
			"updatedAt": page.UpdatedAt,
			"tags":      append([]string(nil), page.Tags...),
			"counts": map[string]int{
				"outgoingLinks": page.OutgoingLinkCount,
				"backlinks":     page.BacklinkCount,
				"tasks":         page.TaskCount,
				"openTasks":     page.OpenTaskCount,
				"doneTasks":     page.DoneTaskCount,
				"queryBlocks":   page.QueryBlockCount,
			},
		})
	}
	return summaries, nil
}

func buildSavedQuerySummaries(savedQueries []index.SavedQuery) []map[string]any {
	summaries := make([]map[string]any, 0, len(savedQueries))
	for _, savedQuery := range savedQueries {
		summaries = append(summaries, map[string]any{
			"name":        savedQuery.Name,
			"title":       savedQuery.Title,
			"description": savedQuery.Description,
			"folder":      savedQuery.Folder,
			"tags":        append([]string(nil), savedQuery.Tags...),
			"updatedAt":   savedQuery.UpdatedAt,
		})
	}
	return summaries
}

func summarizeSavedQueryFacets(savedQueries []index.SavedQuery) ([]map[string]any, []map[string]any) {
	folderCounts := make(map[string]int)
	tagCounts := make(map[string]int)

	for _, savedQuery := range savedQueries {
		if folder := strings.TrimSpace(savedQuery.Folder); folder != "" {
			folderCounts[folder]++
		}
		for _, tag := range savedQuery.Tags {
			trimmed := strings.TrimSpace(tag)
			if trimmed == "" {
				continue
			}
			tagCounts[trimmed]++
		}
	}

	folders := make([]map[string]any, 0, len(folderCounts))
	for folder, count := range folderCounts {
		folders = append(folders, map[string]any{
			"folder": folder,
			"count":  count,
		})
	}
	sort.Slice(folders, func(i, j int) bool {
		left := folders[i]
		right := folders[j]
		leftCount := left["count"].(int)
		rightCount := right["count"].(int)
		if leftCount != rightCount {
			return leftCount > rightCount
		}
		return left["folder"].(string) < right["folder"].(string)
	})

	tags := make([]map[string]any, 0, len(tagCounts))
	for tag, count := range tagCounts {
		tags = append(tags, map[string]any{
			"tag":   tag,
			"count": count,
		})
	}
	sort.Slice(tags, func(i, j int) bool {
		left := tags[i]
		right := tags[j]
		leftCount := left["count"].(int)
		rightCount := right["count"].(int)
		if leftCount != rightCount {
			return leftCount > rightCount
		}
		return left["tag"].(string) < right["tag"].(string)
	})

	return folders, tags
}

func buildSavedQueryTree(savedQueries []index.SavedQuery) []map[string]any {
	groups := make(map[string][]index.SavedQuery)
	for _, savedQuery := range savedQueries {
		folder := strings.TrimSpace(savedQuery.Folder)
		groups[folder] = append(groups[folder], savedQuery)
	}

	folderNames := make([]string, 0, len(groups))
	for folder := range groups {
		folderNames = append(folderNames, folder)
	}
	sort.Strings(folderNames)

	tree := make([]map[string]any, 0, len(folderNames))
	for _, folder := range folderNames {
		queries := groups[folder]
		sort.Slice(queries, func(i, j int) bool {
			return queries[i].Name < queries[j].Name
		})
		tree = append(tree, map[string]any{
			"folder":  folder,
			"count":   len(queries),
			"queries": buildSavedQuerySummaries(queries),
		})
	}
	return tree
}

func summarizePageRecord(ctx context.Context, indexService *index.Service, pageRecord index.PageRecord) (index.PageSummary, error) {
	backlinks, err := indexService.GetBacklinks(ctx, pageRecord.Path)
	if err != nil && !errors.Is(err, index.ErrPageNotFound) {
		return index.PageSummary{}, err
	}
	queryBlocks, err := indexService.GetQueryBlocks(ctx, pageRecord.Path)
	if err != nil && !errors.Is(err, index.ErrPageNotFound) {
		return index.PageSummary{}, err
	}
	return index.PageSummary{
		Path:              pageRecord.Path,
		Title:             pageRecord.Title,
		Tags:              frontmatterStringList(pageRecord.Frontmatter["tags"]),
		Frontmatter:       pageRecord.Frontmatter,
		OutgoingLinkCount: len(pageRecord.Links),
		BacklinkCount:     len(backlinks),
		TaskCount:         len(pageRecord.Tasks),
		OpenTaskCount:     countOpenTasks(pageRecord.Tasks),
		DoneTaskCount:     countDoneTasks(pageRecord.Tasks),
		QueryBlockCount:   len(queryBlocks),
		CreatedAt:         pageRecord.CreatedAt,
		UpdatedAt:         pageRecord.UpdatedAt,
	}, nil
}

func frontmatterStringList(value any) []string {
	switch typed := value.(type) {
	case []string:
		return append([]string(nil), typed...)
	case []any:
		items := make([]string, 0, len(typed))
		for _, item := range typed {
			text, ok := item.(string)
			if ok && strings.TrimSpace(text) != "" {
				items = append(items, text)
			}
		}
		return items
	case string:
		trimmed := strings.TrimSpace(typed)
		if trimmed == "" {
			return nil
		}
		return []string{trimmed}
	default:
		return nil
	}
}

func filterPageListByTag(pages []map[string]any, tag string) []map[string]any {
	needle := strings.ToLower(strings.TrimSpace(tag))
	if needle == "" {
		return pages
	}

	filtered := make([]map[string]any, 0, len(pages))
	for _, page := range pages {
		tags, ok := page["tags"].([]string)
		if !ok {
			continue
		}
		for _, item := range tags {
			if strings.EqualFold(strings.TrimSpace(item), needle) {
				filtered = append(filtered, page)
				break
			}
		}
	}
	return filtered
}

func performGlobalSearch(ctx context.Context, indexService *index.Service, queryText string, limit int) (map[string]any, error) {
	needle := strings.ToLower(strings.TrimSpace(queryText))
	if needle == "" {
		return map[string]any{
			"query":   "",
			"pages":   []any{},
			"tasks":   []any{},
			"queries": []any{},
			"counts": map[string]int{
				"pages":   0,
				"tasks":   0,
				"queries": 0,
				"total":   0,
			},
		}, nil
	}
	if limit <= 0 {
		limit = 12
	}

	pageSummaries, err := indexService.ListPages(ctx)
	if err != nil {
		return nil, err
	}
	pageResults := make([]map[string]any, 0, limit)
	for _, summary := range pageSummaries {
		if len(pageResults) >= limit {
			break
		}
		record, err := indexService.GetPage(ctx, summary.Path)
		if err != nil {
			continue
		}
		result := searchPageRecord(record, needle)
		if result != nil {
			pageResults = append(pageResults, result)
		}
	}

	tasks, err := indexService.ListTasks(ctx)
	if err != nil {
		return nil, err
	}
	taskResults := make([]map[string]any, 0, limit)
	for _, task := range tasks {
		if len(taskResults) >= limit {
			break
		}
		if result := searchTaskRecord(task, needle); result != nil {
			taskResults = append(taskResults, result)
		}
	}

	savedQueries, err := indexService.ListSavedQueries(ctx)
	if err != nil {
		return nil, err
	}
	queryResults := make([]map[string]any, 0, limit)
	for _, savedQuery := range savedQueries {
		if len(queryResults) >= limit {
			break
		}
		if result := searchSavedQueryRecord(savedQuery, needle); result != nil {
			queryResults = append(queryResults, result)
		}
	}

	return map[string]any{
		"query":   queryText,
		"pages":   pageResults,
		"tasks":   taskResults,
		"queries": queryResults,
		"counts": map[string]int{
			"pages":   len(pageResults),
			"tasks":   len(taskResults),
			"queries": len(queryResults),
			"total":   len(pageResults) + len(taskResults) + len(queryResults),
		},
	}, nil
}

func searchPageRecord(page index.PageRecord, needle string) map[string]any {
	pathValue := page.Path
	titleValue := page.Title
	if strings.Contains(strings.ToLower(pathValue), needle) {
		return map[string]any{
			"path":    page.Path,
			"title":   page.Title,
			"match":   "path",
			"line":    1,
			"snippet": page.Path,
		}
	}
	if strings.Contains(strings.ToLower(titleValue), needle) {
		line := findFirstMatchingLine(page.RawMarkdown, titleValue)
		if line <= 0 {
			line = 1
		}
		return map[string]any{
			"path":    page.Path,
			"title":   page.Title,
			"match":   "title",
			"line":    line,
			"snippet": page.Title,
		}
	}

	for key, value := range page.Frontmatter {
		text := displayFrontmatterSearchValue(value)
		if strings.Contains(strings.ToLower(text), needle) {
			line := findFirstMatchingLine(page.RawMarkdown, key+": "+text)
			if line <= 0 {
				line = findFirstMatchingLine(page.RawMarkdown, key+":")
			}
			if line <= 0 {
				line = findFirstMatchingLine(page.RawMarkdown, text)
			}
			if line <= 0 {
				line = 1
			}
			return map[string]any{
				"path":    page.Path,
				"title":   page.Title,
				"match":   "frontmatter:" + key,
				"line":    line,
				"snippet": key + ": " + clipSnippet(text, 80),
			}
		}
	}

	if snippet := extractSearchSnippet(page.RawMarkdown, needle, 96); snippet != "" {
		line := findFirstMatchingLine(page.RawMarkdown, needle)
		if line <= 0 {
			line = 1
		}
		return map[string]any{
			"path":    page.Path,
			"title":   page.Title,
			"match":   "content",
			"line":    line,
			"snippet": snippet,
		}
	}
	return nil
}

func searchTaskRecord(task index.Task, needle string) map[string]any {
	candidates := []string{
		task.Ref,
		task.Page,
		task.Text,
		strings.Join(task.Who, ", "),
	}
	for _, candidate := range candidates {
		if strings.Contains(strings.ToLower(candidate), needle) {
			return map[string]any{
				"ref":     task.Ref,
				"page":    task.Page,
				"line":    task.Line,
				"text":    task.Text,
				"done":    task.Done,
				"snippet": clipSnippet(candidate, 96),
			}
		}
	}
	return nil
}

func searchSavedQueryRecord(savedQuery index.SavedQuery, needle string) map[string]any {
	candidates := []struct {
		match string
		text  string
	}{
		{match: "name", text: savedQuery.Name},
		{match: "title", text: savedQuery.Title},
		{match: "description", text: savedQuery.Description},
		{match: "folder", text: savedQuery.Folder},
		{match: "query", text: savedQuery.Query},
	}
	for _, candidate := range candidates {
		if strings.Contains(strings.ToLower(candidate.text), needle) {
			return map[string]any{
				"name":        savedQuery.Name,
				"title":       savedQuery.Title,
				"description": savedQuery.Description,
				"folder":      savedQuery.Folder,
				"match":       candidate.match,
				"snippet":     clipSnippet(candidate.text, 96),
			}
		}
	}
	for _, tag := range savedQuery.Tags {
		if strings.Contains(strings.ToLower(tag), needle) {
			return map[string]any{
				"name":        savedQuery.Name,
				"title":       savedQuery.Title,
				"description": savedQuery.Description,
				"folder":      savedQuery.Folder,
				"match":       "tag",
				"snippet":     tag,
			}
		}
	}
	return nil
}

func displayFrontmatterSearchValue(value any) string {
	switch typed := value.(type) {
	case []string:
		return strings.Join(typed, ", ")
	case []any:
		parts := make([]string, 0, len(typed))
		for _, item := range typed {
			parts = append(parts, displayFrontmatterSearchValue(item))
		}
		return strings.Join(parts, ", ")
	case string:
		return typed
	case bool:
		if typed {
			return "true"
		}
		return "false"
	case nil:
		return ""
	default:
		return fmt.Sprint(typed)
	}
}

func extractSearchSnippet(raw string, needle string, width int) string {
	body := strings.ReplaceAll(raw, "\r\n", "\n")
	lower := strings.ToLower(body)
	index := strings.Index(lower, needle)
	if index < 0 {
		return ""
	}
	start := index - width/2
	if start < 0 {
		start = 0
	}
	end := index + len(needle) + width/2
	if end > len(body) {
		end = len(body)
	}
	return clipSnippet(strings.ReplaceAll(body[start:end], "\n", " "), width)
}

func findFirstMatchingLine(raw string, needle string) int {
	if strings.TrimSpace(needle) == "" {
		return 0
	}
	lines := strings.Split(strings.ReplaceAll(raw, "\r\n", "\n"), "\n")
	lowerNeedle := strings.ToLower(needle)
	for idx, line := range lines {
		if strings.Contains(strings.ToLower(line), lowerNeedle) {
			return idx + 1
		}
	}
	return 0
}

func clipSnippet(text string, width int) string {
	normalized := strings.Join(strings.Fields(strings.TrimSpace(text)), " ")
	if width <= 0 || len(normalized) <= width {
		return normalized
	}
	return normalized[:width-1] + "…"
}
