package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/carnager/noterious/internal/ai"
	"github.com/carnager/noterious/internal/auth"
)

func mountAIEndpoints(mux *http.ServeMux, deps Dependencies) {
	mux.HandleFunc("GET /api/ai/settings", func(w http.ResponseWriter, r *http.Request) {
		if deps.AI == nil {
			http.Error(w, "ai settings unavailable", http.StatusInternalServerError)
			return
		}
		if deps.Auth != nil {
			user, ok := auth.UserFromContext(r.Context())
			if !ok || user.ID == 0 {
				http.Error(w, auth.ErrAuthenticationRequired.Error(), http.StatusUnauthorized)
				return
			}
		}
		writeJSON(w, http.StatusOK, deps.AI.Snapshot())
	})

	mux.HandleFunc("PUT /api/ai/settings", func(w http.ResponseWriter, r *http.Request) {
		if deps.AI == nil {
			http.Error(w, "ai settings unavailable", http.StatusInternalServerError)
			return
		}
		if deps.Auth != nil {
			user, ok := auth.UserFromContext(r.Context())
			if !ok || user.ID == 0 {
				http.Error(w, auth.ErrAuthenticationRequired.Error(), http.StatusUnauthorized)
				return
			}
		}
		var request ai.UpdateSettingsRequest
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}
		snapshot, err := deps.AI.Update(request)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		writeJSON(w, http.StatusOK, snapshot)
	})

	mux.HandleFunc("POST /api/query/copilot", func(w http.ResponseWriter, r *http.Request) {
		if deps.AI == nil {
			http.Error(w, "ai query copilot unavailable", http.StatusInternalServerError)
			return
		}
		if deps.Auth != nil {
			user, ok := auth.UserFromContext(r.Context())
			if !ok || user.ID == 0 {
				http.Error(w, auth.ErrAuthenticationRequired.Error(), http.StatusUnauthorized)
				return
			}
		}
		var request ai.QueryCopilotRequest
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}
		response, err := deps.AI.GenerateQuery(r.Context(), deps.Index, request)
		if err != nil {
			status := http.StatusInternalServerError
			switch {
			case errors.Is(err, ai.ErrAIDisabled), errors.Is(err, ai.ErrAIUnconfigured):
				status = http.StatusServiceUnavailable
			case errors.Is(err, ai.ErrAIEmptyIntent):
				status = http.StatusBadRequest
			}
			http.Error(w, err.Error(), status)
			return
		}
		writeJSON(w, http.StatusOK, response)
	})
}
