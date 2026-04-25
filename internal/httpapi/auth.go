package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strings"

	"github.com/carnager/noterious/internal/auth"
	"github.com/carnager/noterious/internal/config"
	"github.com/carnager/noterious/internal/settings"
	"github.com/carnager/noterious/internal/vaults"
)

type authSessionResponse struct {
	Authenticated bool          `json:"authenticated"`
	User          *auth.User    `json:"user,omitempty"`
	Vault         *vaults.Vault `json:"vault,omitempty"`
	SetupRequired bool          `json:"setupRequired,omitempty"`
}

type authVaultsResponse struct {
	RootVault    *vaults.Vault  `json:"rootVault,omitempty"`
	Vaults       []vaults.Vault `json:"vaults"`
	Count        int            `json:"count"`
	CurrentVault *vaults.Vault  `json:"currentVault,omitempty"`
}

type userSettingsResponse struct {
	Settings auth.UserSettings `json:"settings"`
}

type usersResponse struct {
	Users []auth.User `json:"users"`
	Count int         `json:"count"`
}

func mountAuthEndpoints(mux *http.ServeMux, authService *auth.Service, vaultRegistry *vaults.Service, settingsStore *settings.Store, cfg config.Config) {
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

		currentVault := loadCurrentVaultForUser(r.Context(), authService, vaultRegistry, settingsStore, cfg, session.User, session.Token)

		authService.SetSessionCookie(w, r, session)
		writeJSON(w, http.StatusOK, authSessionResponse{
			Authenticated: true,
			User:          &session.User,
			Vault:         currentVault,
		})
	})

	mux.HandleFunc("/api/auth/setup", func(w http.ResponseWriter, r *http.Request) {
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

		createdUser, err := authService.CreateInitialAdmin(r.Context(), request.Username, request.Password)
		if err != nil {
			switch {
			case errors.Is(err, auth.ErrSetupRejected):
				http.Error(w, err.Error(), http.StatusConflict)
				return
			default:
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
		}
		if vaultRegistry != nil {
			if err := ensurePersonalVaultForUser(r.Context(), vaultRegistry, settingsStore, cfg, createdUser); err != nil {
				http.Error(w, "failed to create initial personal vault", http.StatusInternalServerError)
				return
			}
		}

		session, err := authService.Login(r.Context(), request.Username, request.Password)
		if err != nil {
			http.Error(w, "setup login failed", http.StatusInternalServerError)
			return
		}

		currentVault := loadCurrentVaultForUser(r.Context(), authService, vaultRegistry, settingsStore, cfg, session.User, session.Token)

		authService.SetSessionCookie(w, r, session)
		writeJSON(w, http.StatusOK, authSessionResponse{
			Authenticated: true,
			User:          &session.User,
			Vault:         currentVault,
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

	mux.HandleFunc("/api/auth/change-password", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeMethodNotAllowed(w, http.MethodPost)
			return
		}
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

		currentVault := loadCurrentVaultForUser(r.Context(), authService, vaultRegistry, settingsStore, cfg, updatedUser, tokenFromContextOrEmpty(r.Context()))

		writeJSON(w, http.StatusOK, authSessionResponse{
			Authenticated: true,
			User:          &updatedUser,
			Vault:         currentVault,
		})
	})

	mux.HandleFunc("/api/user/settings", func(w http.ResponseWriter, r *http.Request) {
		if authService == nil {
			http.Error(w, "auth unavailable", http.StatusServiceUnavailable)
			return
		}

		user, ok := auth.UserFromContext(r.Context())
		if !ok || user.ID == 0 {
			http.Error(w, auth.ErrAuthenticationRequired.Error(), http.StatusUnauthorized)
			return
		}

		switch r.Method {
		case http.MethodGet:
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
		case http.MethodPut:
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
		default:
			writeMethodNotAllowed(w, http.MethodGet, http.MethodPut)
		}
	})

	mux.HandleFunc("/api/user/vaults", func(w http.ResponseWriter, r *http.Request) {
		if authService == nil || vaultRegistry == nil {
			http.Error(w, "vault management unavailable", http.StatusServiceUnavailable)
			return
		}

		user, ok := auth.UserFromContext(r.Context())
		if !ok || user.ID == 0 {
			http.Error(w, auth.ErrAuthenticationRequired.Error(), http.StatusUnauthorized)
			return
		}

		switch r.Method {
		case http.MethodGet:
			vaultList, err := vaultRegistry.ListDiscoveredPersonal(r.Context(), configuredVaultRoot(settingsStore, cfg), user.ID, user.Username)
			if err != nil {
				http.Error(w, "failed to list vaults", http.StatusInternalServerError)
				return
			}
			writeJSON(w, http.StatusOK, map[string]any{
				"vaults": vaultList,
				"count":  len(vaultList),
			})
		case http.MethodPost:
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

			createdVault, err := vaultRegistry.CreatePersonal(r.Context(), vaults.PersonalCreateConfig{
				VaultRoot: vaultRoot,
				UserID:    user.ID,
				Username:  user.Username,
				Name:      request.Name,
			})
			if err != nil {
				http.Error(w, err.Error(), statusForVaultError(err))
				return
			}
			writeJSON(w, http.StatusCreated, createdVault)
		default:
			writeMethodNotAllowed(w, http.MethodGet, http.MethodPost)
		}
	})

	mux.HandleFunc("/api/user/vaults/", func(w http.ResponseWriter, r *http.Request) {
		if authService == nil || vaultRegistry == nil {
			http.Error(w, "vault management unavailable", http.StatusServiceUnavailable)
			return
		}

		user, ok := auth.UserFromContext(r.Context())
		if !ok || user.ID == 0 {
			http.Error(w, auth.ErrAuthenticationRequired.Error(), http.StatusUnauthorized)
			return
		}

		vaultID, subresource, ok := parseVaultPath(strings.TrimPrefix(r.URL.Path, "/api/user/vaults/"))
		if !ok || subresource != "" {
			http.Error(w, "invalid vault path", http.StatusBadRequest)
			return
		}
		if r.Method != http.MethodPut {
			writeMethodNotAllowed(w, http.MethodPut)
			return
		}

		selectedVault, _, err := vaultRegistry.OwnedVaultForUser(r.Context(), user.ID, vaultID)
		if err != nil {
			if errors.Is(err, vaults.ErrVaultMembershipRequired) {
				http.Error(w, err.Error(), http.StatusForbidden)
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

		updatedVault, err := vaultRegistry.UpdatePersonal(r.Context(), selectedVault.ID, vaults.PersonalUpdateConfig{
			VaultRoot: configuredVaultRoot(settingsStore, cfg),
			Username:  user.Username,
			Name:      request.Name,
		})
		if err != nil {
			http.Error(w, err.Error(), statusForVaultError(err))
			return
		}
		writeJSON(w, http.StatusOK, updatedVault)
	})

	mux.HandleFunc("/api/users", func(w http.ResponseWriter, r *http.Request) {
		if authService == nil {
			http.Error(w, "auth unavailable", http.StatusServiceUnavailable)
			return
		}

		user, ok := auth.UserFromContext(r.Context())
		if !ok || user.ID == 0 {
			http.Error(w, auth.ErrAuthenticationRequired.Error(), http.StatusUnauthorized)
			return
		}
		if !isAdminUser(user) {
			http.Error(w, "admin privileges required", http.StatusForbidden)
			return
		}

		switch r.Method {
		case http.MethodGet:
			users, err := authService.ListUsers(r.Context())
			if err != nil {
				http.Error(w, "failed to list users", http.StatusInternalServerError)
				return
			}
			writeJSON(w, http.StatusOK, usersResponse{
				Users: users,
				Count: len(users),
			})
		case http.MethodPost:
			var request struct {
				Username string `json:"username"`
				Password string `json:"password"`
				Role     string `json:"role"`
			}
			if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
				http.Error(w, "invalid request body", http.StatusBadRequest)
				return
			}
			createdUser, err := authService.CreateUser(r.Context(), request.Username, request.Password, request.Role)
			if err != nil {
				status := http.StatusBadRequest
				if strings.Contains(strings.ToLower(err.Error()), "already exists") {
					status = http.StatusConflict
				}
				http.Error(w, err.Error(), status)
				return
			}
			if vaultRegistry != nil {
				if err := ensurePersonalVaultForUser(r.Context(), vaultRegistry, settingsStore, cfg, createdUser); err != nil {
					http.Error(w, "failed to create personal vault", http.StatusInternalServerError)
					return
				}
			}
			writeJSON(w, http.StatusCreated, createdUser)
		default:
			writeMethodNotAllowed(w, http.MethodGet, http.MethodPost)
		}
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

		currentVault := loadCurrentVaultForUser(r.Context(), authService, vaultRegistry, settingsStore, cfg, user, token)

		writeJSON(w, http.StatusOK, authSessionResponse{
			Authenticated: true,
			User:          &user,
			Vault:         currentVault,
		})
	})

	mux.HandleFunc("/api/auth/vaults", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			writeMethodNotAllowed(w, http.MethodGet)
			return
		}
		if authService == nil || vaultRegistry == nil {
			http.Error(w, "vault selection unavailable", http.StatusServiceUnavailable)
			return
		}

		user, ok := auth.UserFromContext(r.Context())
		if !ok || user.ID == 0 {
			http.Error(w, auth.ErrAuthenticationRequired.Error(), http.StatusUnauthorized)
			return
		}

		vaultSnapshot, err := loadAuthVaultsSnapshotForUser(r.Context(), authService, vaultRegistry, settingsStore, cfg, user, tokenFromContextOrEmpty(r.Context()))
		if err != nil {
			if errors.Is(err, vaults.ErrVaultMembershipRequired) {
				http.Error(w, err.Error(), http.StatusForbidden)
				return
			}
			http.Error(w, "failed to load available vaults", http.StatusInternalServerError)
			return
		}

		writeJSON(w, http.StatusOK, vaultSnapshot)
	})

	mux.HandleFunc("/api/auth/vault", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPut {
			writeMethodNotAllowed(w, http.MethodPut)
			return
		}
		if authService == nil || vaultRegistry == nil {
			http.Error(w, "vault selection unavailable", http.StatusServiceUnavailable)
			return
		}

		user, ok := auth.UserFromContext(r.Context())
		if !ok || user.ID == 0 {
			http.Error(w, auth.ErrAuthenticationRequired.Error(), http.StatusUnauthorized)
			return
		}
		token := tokenFromContextOrEmpty(r.Context())
		if token == "" {
			http.Error(w, auth.ErrAuthenticationRequired.Error(), http.StatusUnauthorized)
			return
		}

		var request struct {
			VaultID int64 `json:"vaultId"`
		}
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}

		selectedVault, err := resolveSelectedVaultForUser(r.Context(), vaultRegistry, settingsStore, cfg, user, request.VaultID)
		if err != nil {
			if errors.Is(err, vaults.ErrVaultMembershipRequired) {
				http.Error(w, err.Error(), http.StatusForbidden)
				return
			}
			http.Error(w, "failed to resolve current vault", http.StatusInternalServerError)
			return
		}
		if err := authService.SetCurrentVaultID(r.Context(), token, selectedVault.ID); err != nil {
			if errors.Is(err, auth.ErrAuthenticationRequired) {
				http.Error(w, auth.ErrAuthenticationRequired.Error(), http.StatusUnauthorized)
				return
			}
			http.Error(w, "failed to update current vault", http.StatusInternalServerError)
			return
		}
		slog.Info("current vault selected",
			"user_id", user.ID,
			"username", user.Username,
			"vault_id", selectedVault.ID,
			"vault_name", selectedVault.Name,
			"vault_path", selectedVault.VaultPath,
		)

		writeJSON(w, http.StatusOK, authSessionResponse{
			Authenticated: true,
			User:          &user,
			Vault:         &selectedVault,
		})
	})
}

func ensurePersonalVaultForUser(ctx context.Context, vaultRegistry *vaults.Service, settingsStore *settings.Store, cfg config.Config, user auth.User) error {
	if vaultRegistry == nil || user.ID <= 0 || strings.TrimSpace(user.Username) == "" {
		return nil
	}
	vaultRoot := configuredVaultRoot(settingsStore, cfg)
	if strings.TrimSpace(vaultRoot) == "" {
		return fmt.Errorf("vault root is not configured")
	}
	_, _, err := vaultRegistry.EnsureUserRootVault(ctx, vaultRoot, user.ID, user.Username)
	return err
}

func isAdminUser(user auth.User) bool {
	return strings.EqualFold(strings.TrimSpace(user.Role), "admin")
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
		ctx = auth.WithSessionToken(ctx, token)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}
