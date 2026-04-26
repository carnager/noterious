package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"path"
	"strings"
	"time"

	"github.com/carnager/noterious/internal/auth"
	"github.com/carnager/noterious/internal/config"
	"github.com/carnager/noterious/internal/documents"
	"github.com/carnager/noterious/internal/history"
	"github.com/carnager/noterious/internal/index"
	"github.com/carnager/noterious/internal/query"
	"github.com/carnager/noterious/internal/settings"
	"github.com/carnager/noterious/internal/themes"
	"github.com/carnager/noterious/internal/vault"
)

type Dependencies struct {
	Config        config.Config
	Settings      *settings.Store
	Documents     *documents.Service
	History       *history.Service
	Themes        *themes.Service
	Vault         *vault.Service
	Index         *index.Service
	Query         *query.Service
	Events        *EventBroker
	Auth          *auth.Service
	OnPageChanged func(pagePath string)
}

type okStatusResponse struct {
	OK bool `json:"ok"`
}

type metaResponse struct {
	Name            string         `json:"name"`
	ListenAddr      string         `json:"listenAddr"`
	RuntimeVault    settings.Vault `json:"runtimeVault"`
	CurrentVault    *vault.Vault   `json:"currentVault,omitempty"`
	VaultHealth     any            `json:"vaultHealth"`
	DataDir         string         `json:"dataDir"`
	Database        string         `json:"database"`
	ServerTime      string         `json:"serverTime"`
	ServerFirst     bool           `json:"serverFirst"`
	RestartRequired bool           `json:"restartRequired"`
}

func NewRouter(deps Dependencies) http.Handler {
	if deps.Events == nil {
		deps.Events = NewEventBroker()
	}

	mux := http.NewServeMux()
	mountUI(mux)
	mountAuthEndpoints(mux, deps.Auth, deps.Settings, deps.Config)

	mux.HandleFunc("GET /api/healthz", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, okStatusResponse{OK: true})
	})

	mux.HandleFunc("GET /api/meta", func(w http.ResponseWriter, r *http.Request) {
		runtimeVault := settings.Vault{
			VaultPath: deps.Config.VaultPath,
			HomePage:  deps.Config.HomePage,
		}
		activeVaultRecord := currentVaultRecord(r.Context(), deps)
		var currentVaultPayload *vault.Vault
		restartRequired := false
		if deps.Settings != nil {
			snapshot := deps.Settings.Snapshot()
			runtimeVault = snapshot.AppliedVault
			restartRequired = snapshot.RestartRequired
		}
		if activeVaultRecord.VaultPath != "" {
			currentVaultPayload = &activeVaultRecord
		}
		vaultHealth := currentVault(r.Context(), deps).Health()
		writeJSON(w, http.StatusOK, metaResponse{
			Name:            "noterious",
			ListenAddr:      deps.Config.ListenAddr,
			RuntimeVault:    runtimeVault,
			CurrentVault:    currentVaultPayload,
			VaultHealth:     vaultHealth,
			DataDir:         deps.Config.DataDir,
			Database:        deps.Index.DatabasePath(),
			ServerTime:      time.Now().UTC().Format(time.RFC3339),
			ServerFirst:     true,
			RestartRequired: restartRequired,
		})
	})

	mux.HandleFunc("GET /api/settings", func(w http.ResponseWriter, r *http.Request) {
		if deps.Settings == nil {
			http.Error(w, "settings unavailable", http.StatusInternalServerError)
			return
		}
		if deps.Auth != nil {
			user, ok := auth.UserFromContext(r.Context())
			if !ok || user.ID == 0 {
				http.Error(w, auth.ErrAuthenticationRequired.Error(), http.StatusUnauthorized)
				return
			}
		}
		writeJSON(w, http.StatusOK, deps.Settings.Snapshot())
	})
	mux.HandleFunc("PUT /api/settings", func(w http.ResponseWriter, r *http.Request) {
		if deps.Settings == nil {
			http.Error(w, "settings unavailable", http.StatusInternalServerError)
			return
		}
		if deps.Auth != nil {
			user, ok := auth.UserFromContext(r.Context())
			if !ok || user.ID == 0 {
				http.Error(w, auth.ErrAuthenticationRequired.Error(), http.StatusUnauthorized)
				return
			}
		}
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
	})
	mountThemeEndpoints(mux, deps)
	mountDocumentAndFolderEndpoints(mux, deps)

	mountPageEndpoints(mux, deps)
	mountQueryEndpoints(mux, deps)
	mux.HandleFunc("GET /api/events", func(w http.ResponseWriter, r *http.Request) {
		serveEvents(w, r, deps.Events)
	})
	mountTaskEndpoints(mux, deps)
	mountDiscoveryEndpoints(mux, deps)

	mux.HandleFunc("/api/page-history/", func(w http.ResponseWriter, r *http.Request) {
		handlePageHistoryRequest(w, r, deps)
	})

	mux.HandleFunc("/api/trash/pages", func(w http.ResponseWriter, r *http.Request) {
		handleTrashPagesRequest(w, r, deps)
	})

	mux.HandleFunc("/api/trash/pages/", func(w http.ResponseWriter, r *http.Request) {
		handleTrashPageRequest(w, r, deps)
	})

	return wrapWithAPIAuth(wrapWithVault(mux, deps.Settings, deps.Config, deps.Index, deps.Query), deps.Auth)
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

func statusForFolderMoveError(err error) int {
	if err == nil {
		return http.StatusOK
	}
	switch {
	case errors.Is(err, vault.ErrFolderAlreadyExists):
		return http.StatusConflict
	case errors.Is(err, vault.ErrInvalidFolderPath),
		errors.Is(err, vault.ErrInvalidTargetFolderPath),
		errors.Is(err, vault.ErrInvalidTargetFolderName),
		errors.Is(err, vault.ErrInvalidFolderMove):
		return http.StatusBadRequest
	case errors.Is(err, os.ErrNotExist):
		return http.StatusNotFound
	default:
		return http.StatusInternalServerError
	}
}

func statusForVaultError(err error) int {
	if err == nil {
		return http.StatusOK
	}
	switch {
	case errors.Is(err, vault.ErrVaultNotFound):
		return http.StatusNotFound
	case errors.Is(err, vault.ErrVaultAlreadyExists):
		return http.StatusConflict
	case errors.Is(err, vault.ErrVaultNameRequired),
		errors.Is(err, vault.ErrInvalidVaultName),
		errors.Is(err, vault.ErrVaultRootRequired):
		return http.StatusBadRequest
	default:
		return http.StatusInternalServerError
	}
}

func currentVaultRoot(deps Dependencies) string {
	return configuredVaultRoot(deps.Settings, deps.Config)
}

func countTaskStates(tasks []index.Task) (open int, done int) {
	for _, task := range tasks {
		if task.Done {
			done++
			continue
		}
		open++
	}
	return open, done
}
