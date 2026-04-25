package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/carnager/noterious/internal/auth"
	"github.com/carnager/noterious/internal/workspaces"
)

type authSessionResponse struct {
	Authenticated bool       `json:"authenticated"`
	User          *auth.User `json:"user,omitempty"`
	Workspace     *workspaces.Workspace `json:"workspace,omitempty"`
}

func mountAuthEndpoints(mux *http.ServeMux, authService *auth.Service, workspaceService *workspaces.Service) {
	mux.HandleFunc("/api/auth/login", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeMethodNotAllowed(w, http.MethodPost)
			return
		}
		if authService == nil {
			http.Error(w, "auth unavailable", http.StatusServiceUnavailable)
			return
		}

		var request struct {
			Username string `json:"username"`
			Password string `json:"password"`
		}
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}

		session, err := authService.Login(r.Context(), request.Username, request.Password)
		if err != nil {
			if errors.Is(err, auth.ErrInvalidCredentials) {
				http.Error(w, err.Error(), http.StatusUnauthorized)
				return
			}
			http.Error(w, "login failed", http.StatusInternalServerError)
			return
		}

		var currentWorkspace *workspaces.Workspace
		if workspaceService != nil {
			if workspace, err := workspaceService.Default(r.Context()); err == nil {
				currentWorkspace = &workspace
			}
		}

		authService.SetSessionCookie(w, r, session)
		writeJSON(w, http.StatusOK, authSessionResponse{
			Authenticated: true,
			User:          &session.User,
			Workspace:     currentWorkspace,
		})
	})

	mux.HandleFunc("/api/auth/logout", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeMethodNotAllowed(w, http.MethodPost)
			return
		}
		if authService != nil {
			if cookie, err := r.Cookie(authService.CookieName()); err == nil && strings.TrimSpace(cookie.Value) != "" {
				_ = authService.Logout(r.Context(), cookie.Value)
			}
		}
		authService.ClearSessionCookie(w, r)
		writeJSON(w, http.StatusOK, map[string]any{
			"ok": true,
		})
	})

	mux.HandleFunc("/api/auth/me", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			writeMethodNotAllowed(w, http.MethodGet)
			return
		}
		if authService == nil {
			writeJSON(w, http.StatusOK, authSessionResponse{
				Authenticated: false,
			})
			return
		}

		user, token, err := authService.AuthenticateRequest(r)
		if err != nil {
			if errors.Is(err, auth.ErrAuthenticationRequired) {
				if strings.TrimSpace(token) != "" {
					authService.ClearSessionCookie(w, r)
				}
				writeJSON(w, http.StatusOK, authSessionResponse{
					Authenticated: false,
				})
				return
			}
			http.Error(w, "failed to load session", http.StatusInternalServerError)
			return
		}

		var currentWorkspace *workspaces.Workspace
		if workspaceService != nil {
			if workspace, err := workspaceService.Default(r.Context()); err == nil {
				currentWorkspace = &workspace
			}
		}

		writeJSON(w, http.StatusOK, authSessionResponse{
			Authenticated: true,
			User:          &user,
			Workspace:     currentWorkspace,
		})
	})
}

func wrapWithAPIAuth(next http.Handler, authService *auth.Service) http.Handler {
	if authService == nil {
		return next
	}

	publicPaths := map[string]struct{}{
		"/api/healthz":     {},
		"/api/auth/login":  {},
		"/api/auth/logout": {},
		"/api/auth/me":     {},
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.URL.Path, "/api/") {
			next.ServeHTTP(w, r)
			return
		}
		if _, ok := publicPaths[r.URL.Path]; ok {
			next.ServeHTTP(w, r)
			return
		}

		user, token, err := authService.AuthenticateRequest(r)
		if err != nil {
			if errors.Is(err, auth.ErrAuthenticationRequired) {
				if strings.TrimSpace(token) != "" {
					authService.ClearSessionCookie(w, r)
				}
				http.Error(w, auth.ErrAuthenticationRequired.Error(), http.StatusUnauthorized)
				return
			}
			http.Error(w, "failed to authenticate request", http.StatusInternalServerError)
			return
		}

		next.ServeHTTP(w, r.WithContext(auth.WithUser(r.Context(), user)))
	})
}
