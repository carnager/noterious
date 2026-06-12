package httpapi

import (
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/carnager/noterious/internal/auth"
	"github.com/carnager/noterious/internal/config"
	"github.com/carnager/noterious/internal/settings"
	"github.com/carnager/noterious/internal/vault"
)

const (
	loginAttemptLimit  = 10
	loginAttemptWindow = 15 * time.Minute
)

// loginLimiter tracks failed login attempts per client address in a fixed
// window so the single account cannot be brute-forced unthrottled.
type loginLimiter struct {
	mu       sync.Mutex
	failures map[string]loginFailureWindow
}

type loginFailureWindow struct {
	count      int
	windowFrom time.Time
}

func newLoginLimiter() *loginLimiter {
	return &loginLimiter{failures: make(map[string]loginFailureWindow)}
}

func (l *loginLimiter) blocked(key string) bool {
	now := time.Now()
	l.mu.Lock()
	defer l.mu.Unlock()
	window, ok := l.failures[key]
	if !ok || now.Sub(window.windowFrom) > loginAttemptWindow {
		return false
	}
	return window.count >= loginAttemptLimit
}

func (l *loginLimiter) recordFailure(key string) {
	now := time.Now()
	l.mu.Lock()
	defer l.mu.Unlock()
	for existingKey, window := range l.failures {
		if now.Sub(window.windowFrom) > loginAttemptWindow {
			delete(l.failures, existingKey)
		}
	}
	window, ok := l.failures[key]
	if !ok || now.Sub(window.windowFrom) > loginAttemptWindow {
		l.failures[key] = loginFailureWindow{count: 1, windowFrom: now}
		return
	}
	window.count++
	l.failures[key] = window
}

func (l *loginLimiter) recordSuccess(key string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	delete(l.failures, key)
}

func clientAddress(r *http.Request) string {
	forwarded := strings.TrimSpace(strings.Split(r.Header.Get("X-Forwarded-For"), ",")[0])
	if forwarded != "" {
		return forwarded
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

type authSessionResponse struct {
	Authenticated bool         `json:"authenticated"`
	User          *auth.User   `json:"user,omitempty"`
	Vault         *vault.Vault `json:"vault,omitempty"`
	SetupRequired bool         `json:"setupRequired,omitempty"`
}

type userSettingsResponse struct {
	Settings auth.UserSettings `json:"settings"`
}

type vaultsResponse struct {
	Vaults []vault.Vault `json:"vaults"`
	Count  int           `json:"count"`
}

type apiTokensResponse struct {
	Tokens []auth.APIToken `json:"tokens"`
}

type apiTokenCreatedResponse struct {
	Token    string        `json:"token"`
	APIToken auth.APIToken `json:"apiToken"`
}

func mountAuthEndpoints(mux *http.ServeMux, authService *auth.Service, settingsStore *settings.Store, cfg config.Config) {
	limiter := newLoginLimiter()
	mux.HandleFunc("POST /api/auth/login", func(w http.ResponseWriter, r *http.Request) {
		if authService == nil {
			http.Error(w, "auth unavailable", http.StatusServiceUnavailable)
			return
		}

		limiterKey := clientAddress(r)
		if limiter.blocked(limiterKey) {
			http.Error(w, "too many failed login attempts, try again later", http.StatusTooManyRequests)
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
				limiter.recordFailure(limiterKey)
				http.Error(w, err.Error(), http.StatusUnauthorized)
				return
			}
			http.Error(w, "login failed", http.StatusInternalServerError)
			return
		}
		limiter.recordSuccess(limiterKey)

		currentVault := configuredVault(settingsStore, cfg)

		authService.SetSessionCookie(w, r, session)
		writeJSON(w, http.StatusOK, authSessionResponse{
			Authenticated: true,
			User:          &session.User,
			Vault:         &currentVault,
		})
	})

	mux.HandleFunc("POST /api/auth/setup", func(w http.ResponseWriter, r *http.Request) {
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

		_, err := authService.CreateInitialAccount(r.Context(), request.Username, request.Password)
		if err != nil {
			switch {
			case errors.Is(err, auth.ErrInitialAccountRejected):
				http.Error(w, err.Error(), http.StatusConflict)
				return
			default:
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
		}
		session, err := authService.Login(r.Context(), request.Username, request.Password)
		if err != nil {
			http.Error(w, "setup login failed", http.StatusInternalServerError)
			return
		}

		currentVault := configuredVault(settingsStore, cfg)

		authService.SetSessionCookie(w, r, session)
		writeJSON(w, http.StatusOK, authSessionResponse{
			Authenticated: true,
			User:          &session.User,
			Vault:         &currentVault,
		})
	})

	mux.HandleFunc("POST /api/auth/logout", func(w http.ResponseWriter, r *http.Request) {
		if authService != nil {
			if cookie, err := r.Cookie(authService.CookieName()); err == nil && strings.TrimSpace(cookie.Value) != "" {
				_ = authService.Logout(r.Context(), cookie.Value)
			}
		}
		authService.ClearSessionCookie(w, r)
		writeJSON(w, http.StatusOK, okStatusResponse{OK: true})
	})

	mux.HandleFunc("POST /api/auth/change-password", func(w http.ResponseWriter, r *http.Request) {
		if authService == nil {
			http.Error(w, "auth unavailable", http.StatusServiceUnavailable)
			return
		}

		user, ok := auth.UserFromContext(r.Context())
		if !ok || user.ID == 0 {
			http.Error(w, auth.ErrAuthenticationRequired.Error(), http.StatusUnauthorized)
			return
		}

		var request struct {
			CurrentPassword string `json:"currentPassword"`
			NewPassword     string `json:"newPassword"`
		}
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}

		updatedUser, err := authService.ChangePassword(r.Context(), user.ID, request.CurrentPassword, request.NewPassword)
		if err != nil {
			switch {
			case errors.Is(err, auth.ErrInvalidCredentials):
				http.Error(w, err.Error(), http.StatusUnauthorized)
				return
			case errors.Is(err, auth.ErrPasswordChangeRejected):
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			case errors.Is(err, auth.ErrAuthenticationRequired):
				http.Error(w, auth.ErrAuthenticationRequired.Error(), http.StatusUnauthorized)
				return
			default:
				http.Error(w, "password change failed", http.StatusInternalServerError)
				return
			}
		}

		currentVault := configuredVault(settingsStore, cfg)

		writeJSON(w, http.StatusOK, authSessionResponse{
			Authenticated: true,
			User:          &updatedUser,
			Vault:         &currentVault,
		})
	})

	mux.HandleFunc("GET /api/user/settings", func(w http.ResponseWriter, r *http.Request) {
		if authService == nil {
			http.Error(w, "auth unavailable", http.StatusServiceUnavailable)
			return
		}

		user, ok := auth.UserFromContext(r.Context())
		if !ok || user.ID == 0 {
			http.Error(w, auth.ErrAuthenticationRequired.Error(), http.StatusUnauthorized)
			return
		}

		settings, err := authService.UserSettings(r.Context(), user.ID)
		if err != nil {
			if errors.Is(err, auth.ErrAuthenticationRequired) {
				http.Error(w, auth.ErrAuthenticationRequired.Error(), http.StatusUnauthorized)
				return
			}
			http.Error(w, "failed to load user settings", http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, userSettingsResponse{
			Settings: settings,
		})
	})
	mux.HandleFunc("PUT /api/user/settings", func(w http.ResponseWriter, r *http.Request) {
		if authService == nil {
			http.Error(w, "auth unavailable", http.StatusServiceUnavailable)
			return
		}

		user, ok := auth.UserFromContext(r.Context())
		if !ok || user.ID == 0 {
			http.Error(w, auth.ErrAuthenticationRequired.Error(), http.StatusUnauthorized)
			return
		}

		var request userSettingsResponse
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}
		settings, err := authService.UpdateUserSettings(r.Context(), user.ID, request.Settings)
		if err != nil {
			if errors.Is(err, auth.ErrAuthenticationRequired) {
				http.Error(w, auth.ErrAuthenticationRequired.Error(), http.StatusUnauthorized)
				return
			}
			http.Error(w, "failed to update user settings", http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, userSettingsResponse{
			Settings: settings,
		})
	})

	mux.HandleFunc("GET /api/user/vaults", func(w http.ResponseWriter, r *http.Request) {
		if authService == nil {
			http.Error(w, "vault management unavailable", http.StatusServiceUnavailable)
			return
		}

		user, ok := auth.UserFromContext(r.Context())
		if !ok || user.ID == 0 {
			http.Error(w, auth.ErrAuthenticationRequired.Error(), http.StatusUnauthorized)
			return
		}

		vaultList, err := vault.DiscoverTopLevel(configuredVaultRoot(settingsStore, cfg))
		if err != nil {
			http.Error(w, "failed to list vaults", http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, vaultsResponse{Vaults: vaultList, Count: len(vaultList)})
	})
	mux.HandleFunc("POST /api/user/vaults", func(w http.ResponseWriter, r *http.Request) {
		if authService == nil {
			http.Error(w, "vault management unavailable", http.StatusServiceUnavailable)
			return
		}

		user, ok := auth.UserFromContext(r.Context())
		if !ok || user.ID == 0 {
			http.Error(w, auth.ErrAuthenticationRequired.Error(), http.StatusUnauthorized)
			return
		}

		vaultRoot := configuredVaultRoot(settingsStore, cfg)
		if strings.TrimSpace(vaultRoot) == "" {
			http.Error(w, "vault root is not configured", http.StatusServiceUnavailable)
			return
		}

		var request struct {
			Name string `json:"name"`
		}
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}

		createdVault, err := vault.CreateTopLevel(vaultRoot, request.Name)
		if err != nil {
			http.Error(w, err.Error(), statusForVaultError(err))
			return
		}
		writeJSON(w, http.StatusCreated, createdVault)
	})
	mux.HandleFunc("PUT /api/user/vaults/{vaultID}", func(w http.ResponseWriter, r *http.Request) {
		if authService == nil {
			http.Error(w, "vault management unavailable", http.StatusServiceUnavailable)
			return
		}

		user, ok := auth.UserFromContext(r.Context())
		if !ok || user.ID == 0 {
			http.Error(w, auth.ErrAuthenticationRequired.Error(), http.StatusUnauthorized)
			return
		}

		vaultID, err := strconv.ParseInt(strings.TrimSpace(r.PathValue("vaultID")), 10, 64)
		if err != nil || vaultID <= 0 {
			http.Error(w, "invalid vault path", http.StatusBadRequest)
			return
		}

		selectedVault, err := vault.FindTopLevelByID(configuredVaultRoot(settingsStore, cfg), vaultID)
		if err != nil {
			if errors.Is(err, vault.ErrVaultNotFound) {
				http.Error(w, err.Error(), http.StatusNotFound)
				return
			}
			http.Error(w, "failed to load vault", http.StatusInternalServerError)
			return
		}

		var request struct {
			Name string `json:"name"`
		}
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}

		updatedVault, err := vault.RenameTopLevel(configuredVaultRoot(settingsStore, cfg), selectedVault, request.Name)
		if err != nil {
			http.Error(w, err.Error(), statusForVaultError(err))
			return
		}
		writeJSON(w, http.StatusOK, updatedVault)
	})

	sessionUser := func(w http.ResponseWriter, r *http.Request) (auth.User, bool) {
		user, _, err := authService.SessionUserFromRequest(r)
		if err != nil {
			http.Error(w, "api token management requires a browser session", http.StatusForbidden)
			return auth.User{}, false
		}
		return user, true
	}

	mux.HandleFunc("GET /api/auth/tokens", func(w http.ResponseWriter, r *http.Request) {
		user, ok := sessionUser(w, r)
		if !ok {
			return
		}
		tokens, err := authService.ListAPITokens(r.Context(), user.ID)
		if err != nil {
			http.Error(w, "failed to list api tokens", http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, apiTokensResponse{Tokens: tokens})
	})

	mux.HandleFunc("POST /api/auth/tokens", func(w http.ResponseWriter, r *http.Request) {
		user, ok := sessionUser(w, r)
		if !ok {
			return
		}
		var request struct {
			Label string `json:"label"`
		}
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}
		created, token, err := authService.CreateAPIToken(r.Context(), user.ID, request.Label)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		writeJSON(w, http.StatusOK, apiTokenCreatedResponse{Token: token, APIToken: created})
	})

	mux.HandleFunc("DELETE /api/auth/tokens/{id}", func(w http.ResponseWriter, r *http.Request) {
		user, ok := sessionUser(w, r)
		if !ok {
			return
		}
		tokenID, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
		if err != nil {
			http.Error(w, "invalid token id", http.StatusBadRequest)
			return
		}
		if err := authService.DeleteAPIToken(r.Context(), user.ID, tokenID); err != nil {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}
		writeJSON(w, http.StatusOK, okStatusResponse{OK: true})
	})

	mux.HandleFunc("GET /api/auth/me", func(w http.ResponseWriter, r *http.Request) {
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
				setupRequired, setupErr := authService.SetupRequired(r.Context())
				if setupErr != nil {
					http.Error(w, "failed to load auth setup state", http.StatusInternalServerError)
					return
				}
				writeJSON(w, http.StatusOK, authSessionResponse{
					Authenticated: false,
					SetupRequired: setupRequired,
				})
				return
			}
			http.Error(w, "failed to load session", http.StatusInternalServerError)
			return
		}

		currentVault := configuredVault(settingsStore, cfg)

		writeJSON(w, http.StatusOK, authSessionResponse{
			Authenticated: true,
			User:          &user,
			Vault:         &currentVault,
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
		"/api/auth/setup":  {},
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
		if user.MustChangePassword {
			switch r.URL.Path {
			case "/api/auth/me", "/api/auth/logout", "/api/auth/change-password":
			default:
				http.Error(w, "password change required", http.StatusForbidden)
				return
			}
		}

		ctx := auth.WithUser(r.Context(), user)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}
