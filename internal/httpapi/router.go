package httpapi

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/carnager/noterious/internal/config"
	"github.com/carnager/noterious/internal/index"
	"github.com/carnager/noterious/internal/query"
	"github.com/carnager/noterious/internal/vault"
)

type Dependencies struct {
	Config config.Config
	Vault  *vault.Service
	Index  *index.Service
	Query  *query.Service
}

func NewRouter(deps Dependencies) http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("/api/healthz", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{
			"ok": true,
		})
	})

	mux.HandleFunc("/api/meta", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{
			"name":        "noterious",
			"listenAddr":  deps.Config.ListenAddr,
			"vaultPath":   deps.Config.VaultPath,
			"dataDir":     deps.Config.DataDir,
			"database":    deps.Index.DatabasePath(),
			"serverTime":  time.Now().UTC().Format(time.RFC3339),
			"serverFirst": true,
		})
	})

	return mux
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}
