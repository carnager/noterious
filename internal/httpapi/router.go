package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"
	"path"
	"strconv"
	"strings"
	"time"

	"github.com/carnager/noterious/internal/auth"
	"github.com/carnager/noterious/internal/config"
	"github.com/carnager/noterious/internal/documents"
	"github.com/carnager/noterious/internal/history"
	"github.com/carnager/noterious/internal/index"
	"github.com/carnager/noterious/internal/query"
	"github.com/carnager/noterious/internal/settings"
	"github.com/carnager/noterious/internal/vault"
	"github.com/carnager/noterious/internal/vaults"
)

type Dependencies struct {
	Config        config.Config
	Settings      *settings.Store
	Documents     *documents.Service
	History       *history.Service
	Vaults        *vaults.Service
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
	mountAuthEndpoints(mux, deps.Auth, deps.Vaults, deps.Settings, deps.Config)

	mux.HandleFunc("/api/healthz", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{
			"ok": true,
		})
	})

	mux.HandleFunc("/api/meta", func(w http.ResponseWriter, r *http.Request) {
		runtimeVault := settings.Vault{
			VaultPath: deps.Config.VaultPath,
			HomePage:  deps.Config.HomePage,
		}
		activeVaultRecord := currentVaultRecord(r.Context(), deps)
		var currentVaultPayload *vaults.Vault
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
		writeJSON(w, http.StatusOK, map[string]any{
			"name":            "noterious",
			"listenAddr":      deps.Config.ListenAddr,
			"runtimeVault":    runtimeVault,
			"currentVault":    currentVaultPayload,
			"vaultHealth":     vaultHealth,
			"dataDir":         deps.Config.DataDir,
			"database":        deps.Index.DatabasePathForVault(activeVaultRecord.ID),
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
		if deps.Auth != nil {
			user, ok := auth.UserFromContext(r.Context())
			if !ok || !isAdminUser(user) {
				http.Error(w, "admin privileges required", http.StatusForbidden)
				return
			}
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
	mountDocumentAndFolderEndpoints(mux, deps)

	mux.HandleFunc("/api/pages/", func(w http.ResponseWriter, r *http.Request) {
		handlePageRequest(w, r, deps)
	})
	mountQueryEndpoints(mux, deps)
	mux.HandleFunc("/api/events", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			writeMethodNotAllowed(w, http.MethodGet)
			return
		}
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

	return wrapWithAPIAuth(wrapWithVault(mux, deps.Vaults, deps.Auth, deps.Settings, deps.Config, deps.Index, deps.Query), deps.Auth)
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

func parseVaultPath(rawPath string) (int64, string, bool) {
	trimmed := strings.Trim(strings.TrimSpace(rawPath), "/")
	if trimmed == "" {
		return 0, "", false
	}
	parts := strings.Split(trimmed, "/")
	vaultID, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil || vaultID <= 0 {
		return 0, "", false
	}
	if len(parts) == 1 {
		return vaultID, "", true
	}
	if len(parts) == 2 {
		return vaultID, parts[1], true
	}
	return 0, "", false
}

func statusForFolderMoveError(err error) int {
	if err == nil {
		return http.StatusOK
	}
	message := strings.ToLower(strings.TrimSpace(err.Error()))
	switch {
	case strings.Contains(message, "already exists"):
		return http.StatusConflict
	case strings.Contains(message, "invalid "):
		return http.StatusBadRequest
	case strings.Contains(message, "not exist"), strings.Contains(message, "no such file"):
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
	case errors.Is(err, vaults.ErrVaultNotFound), errors.Is(err, vaults.ErrVaultMembershipRequired):
		return http.StatusNotFound
	}
	message := strings.ToLower(strings.TrimSpace(err.Error()))
	switch {
	case strings.Contains(message, "already exists"), strings.Contains(message, "reserved"), strings.Contains(message, "managed through runtime settings"):
		return http.StatusConflict
	case strings.Contains(message, "required"), strings.Contains(message, "invalid"):
		return http.StatusBadRequest
	default:
		return http.StatusInternalServerError
	}
}

func currentVaultRoot(deps Dependencies) string {
	return configuredVaultRoot(deps.Settings, deps.Config)
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
