package httpapi

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/carnager/noterious/internal/webhooks"
)

type webhooksResponse struct {
	Webhooks []webhooks.HookWithState `json:"webhooks"`
	Count    int                      `json:"count"`
}

func mountWebhookEndpoints(mux *http.ServeMux, deps Dependencies) {
	mux.HandleFunc("GET /api/webhooks", func(w http.ResponseWriter, r *http.Request) {
		if deps.Webhooks == nil {
			http.Error(w, "webhooks unavailable", http.StatusServiceUnavailable)
			return
		}
		hooks := deps.Webhooks.List()
		writeJSON(w, http.StatusOK, webhooksResponse{Webhooks: hooks, Count: len(hooks)})
	})

	mux.HandleFunc("POST /api/webhooks", func(w http.ResponseWriter, r *http.Request) {
		if deps.Webhooks == nil {
			http.Error(w, "webhooks unavailable", http.StatusServiceUnavailable)
			return
		}
		var request webhooks.Hook
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}
		created, err := deps.Webhooks.Create(request)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		writeJSON(w, http.StatusOK, created)
	})

	mux.HandleFunc("DELETE /api/webhooks/{id}", func(w http.ResponseWriter, r *http.Request) {
		if deps.Webhooks == nil {
			http.Error(w, "webhooks unavailable", http.StatusServiceUnavailable)
			return
		}
		id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
		if err != nil {
			http.Error(w, "invalid webhook id", http.StatusBadRequest)
			return
		}
		if err := deps.Webhooks.Delete(id); err != nil {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}
		writeJSON(w, http.StatusOK, okStatusResponse{OK: true})
	})
}
