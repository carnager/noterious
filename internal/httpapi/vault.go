package httpapi

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"sync"

	"github.com/carnager/noterious/internal/auth"
	"github.com/carnager/noterious/internal/config"
	"github.com/carnager/noterious/internal/documents"
	"github.com/carnager/noterious/internal/index"
	"github.com/carnager/noterious/internal/query"
	"github.com/carnager/noterious/internal/settings"
	"github.com/carnager/noterious/internal/vault"
	"github.com/carnager/noterious/internal/vaults"
)

var vaultIndexInitMu sync.Mutex

func wrapWithVault(next http.Handler, vaultRegistry *vaults.Service, authService *auth.Service, settingsStore *settings.Store, cfg config.Config, indexService *index.Service, queryService *query.Service) http.Handler {
	if vaultRegistry == nil {
		return next
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") {
			if authService == nil {
				configuredVault, err := vaultRegistry.RuntimeRoot(r.Context())
				if err != nil {
					slog.Error("configured vault resolution failed",
						"path", r.URL.Path,
						"error", err,
					)
					http.Error(w, "failed to resolve current vault", http.StatusInternalServerError)
					return
				}
				r = r.WithContext(vaults.WithVault(r.Context(), configuredVault))
				next.ServeHTTP(w, r)
				return
			}
			if shouldSkipVaultResolution(r.URL.Path) {
				next.ServeHTTP(w, r)
				return
			}
			user, ok := auth.UserFromContext(r.Context())
			if !ok || user.ID == 0 {
				http.Error(w, auth.ErrAuthenticationRequired.Error(), http.StatusUnauthorized)
				return
			}
			currentVaultID := currentVaultIDForToken(r.Context(), authService, tokenFromContextOrEmpty(r.Context()))
			activeVault, err := resolveVaultForUser(r.Context(), vaultRegistry, settingsStore, cfg, user, currentVaultID)
			if err != nil {
				if errors.Is(err, vaults.ErrVaultMembershipRequired) {
					http.Error(w, err.Error(), http.StatusForbidden)
					return
				}
				slog.Error("request vault resolution failed",
					"path", r.URL.Path,
					"user_id", user.ID,
					"username", user.Username,
					"selected_vault_id", currentVaultID,
					"error", err,
				)
				http.Error(w, "failed to resolve current vault", http.StatusInternalServerError)
				return
			}
			if requiresVaultIndex(r.URL.Path) {
				if err := ensureVaultIndex(r.Context(), activeVault, indexService, queryService); err != nil {
					slog.Error("request vault index initialization failed",
						"path", r.URL.Path,
						"vault_id", activeVault.ID,
						"vault_name", activeVault.Name,
						"vault_path", activeVault.VaultPath,
						"error", err,
					)
					http.Error(w, "failed to initialize vault index", http.StatusInternalServerError)
					return
				}
			}
			ctx := vaults.WithVault(r.Context(), activeVault)
			r = r.WithContext(ctx)
		}
		next.ServeHTTP(w, r)
	})
}

func requiresVaultIndex(requestPath string) bool {
	switch {
	case strings.HasPrefix(requestPath, "/api/pages"),
		strings.HasPrefix(requestPath, "/api/queries"),
		strings.HasPrefix(requestPath, "/api/tasks"),
		strings.HasPrefix(requestPath, "/api/search"),
		strings.HasPrefix(requestPath, "/api/links"):
		return true
	case requestPath == "/api/query/execute",
		requestPath == "/api/query/preview",
		requestPath == "/api/query/count",
		requestPath == "/api/query/workbench":
		return true
	default:
		return false
	}
}

func ensureVaultIndex(ctx context.Context, currentVaultRecord vaults.Vault, indexService *index.Service, queryService *query.Service) error {
	if indexService == nil || currentVaultRecord.ID <= 0 || strings.TrimSpace(currentVaultRecord.VaultPath) == "" {
		return nil
	}
	vaultIndexInitMu.Lock()
	defer vaultIndexInitMu.Unlock()

	vaultService := vault.NewService(currentVaultRecord.VaultPath)
	dbPath := indexService.DatabasePathForVault(currentVaultRecord.ID)
	rebuildReason := ""
	if dbInfo, err := os.Stat(dbPath); err == nil {
		if !currentVaultRecord.UpdatedAt.IsZero() && dbInfo.ModTime().Before(currentVaultRecord.UpdatedAt) {
			rebuildReason = "vault_metadata_updated"
		} else {
			pages, listErr := indexService.ListPages(vaults.WithVault(ctx, currentVaultRecord))
			if listErr == nil && len(pages) > 0 {
				return nil
			}
			pageFiles, scanErr := vaultService.ScanMarkdownPages(ctx)
			if scanErr == nil && len(pageFiles) == 0 {
				return nil
			}
			if listErr != nil {
				rebuildReason = "index_page_list_failed"
			} else {
				rebuildReason = "empty_index_with_markdown_files"
			}
		}
	} else if !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("inspect vault index db: %w", err)
	} else {
		rebuildReason = "missing_index_database"
	}
	return rebuildVaultStateLocked(ctx, currentVaultRecord, vaultService, indexService, queryService, rebuildReason)
}

func rebuildVaultState(ctx context.Context, currentVaultRecord vaults.Vault, vaultService *vault.Service, indexService *index.Service, queryService *query.Service, reason string) error {
	if indexService == nil || currentVaultRecord.ID <= 0 || strings.TrimSpace(currentVaultRecord.VaultPath) == "" {
		return nil
	}
	vaultIndexInitMu.Lock()
	defer vaultIndexInitMu.Unlock()
	return rebuildVaultStateLocked(ctx, currentVaultRecord, vaultService, indexService, queryService, reason)
}

func rebuildVaultStateLocked(ctx context.Context, currentVaultRecord vaults.Vault, vaultService *vault.Service, indexService *index.Service, queryService *query.Service, reason string) error {
	if strings.TrimSpace(reason) == "" {
		reason = "explicit_rebuild"
	}
	if vaultService == nil {
		vaultService = vault.NewService(currentVaultRecord.VaultPath)
	}
	indexCtx := vaults.WithVault(ctx, currentVaultRecord)
	slog.Info("initializing vault index",
		"vault_id", currentVaultRecord.ID,
		"vault_name", currentVaultRecord.Name,
		"vault_path", currentVaultRecord.VaultPath,
		"reason", reason,
	)
	if err := indexService.RebuildFromVault(indexCtx, vaultService); err != nil {
		slog.Error("vault index rebuild failed",
			"vault_id", currentVaultRecord.ID,
			"vault_name", currentVaultRecord.Name,
			"vault_path", currentVaultRecord.VaultPath,
			"reason", reason,
			"error", err,
		)
		return fmt.Errorf("rebuild vault index: %w", err)
	}
	if queryService != nil {
		if err := queryService.RefreshAll(indexCtx, indexService); err != nil {
			slog.Error("vault query refresh failed",
				"vault_id", currentVaultRecord.ID,
				"vault_name", currentVaultRecord.Name,
				"vault_path", currentVaultRecord.VaultPath,
				"reason", reason,
				"error", err,
			)
			return fmt.Errorf("refresh vault query cache: %w", err)
		}
	}
	slog.Info("vault index initialized",
		"vault_id", currentVaultRecord.ID,
		"vault_name", currentVaultRecord.Name,
		"vault_path", currentVaultRecord.VaultPath,
		"reason", reason,
	)
	return nil
}

func shouldSkipVaultResolution(path string) bool {
	switch path {
	case "/api/healthz", "/api/users", "/api/user/vaults":
		return true
	}
	if strings.HasPrefix(path, "/api/user/vaults/") {
		return true
	}
	return strings.HasPrefix(path, "/api/auth/")
}

func currentVaultRecord(ctx context.Context, deps Dependencies) vaults.Vault {
	if activeVault, ok := vaults.VaultFromContext(ctx); ok {
		return activeVault
	}
	return vaults.Vault{
		ID:        vaults.ConfiguredVaultID,
		Key:       "default",
		Name:      "Configured Vault",
		VaultPath: deps.Config.VaultPath,
		HomePage:  deps.Config.HomePage,
	}
}

func currentVault(ctx context.Context, deps Dependencies) *vault.Service {
	activeVault := currentVaultRecord(ctx, deps)
	if activeVault.ID == vaults.ConfiguredVaultID && deps.Vault != nil {
		return deps.Vault
	}
	return vault.NewService(activeVault.VaultPath)
}

func currentDocuments(ctx context.Context, deps Dependencies) (*documents.Service, error) {
	activeVault := currentVaultRecord(ctx, deps)
	if activeVault.ID == vaults.ConfiguredVaultID && deps.Documents != nil {
		return deps.Documents, nil
	}
	service, err := documents.NewService(activeVault.VaultPath)
	if err != nil {
		return nil, fmt.Errorf("init vault document service: %w", err)
	}
	return service, nil
}
