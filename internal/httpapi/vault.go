package httpapi

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/carnager/noterious/internal/config"
	"github.com/carnager/noterious/internal/documents"
	"github.com/carnager/noterious/internal/index"
	"github.com/carnager/noterious/internal/query"
	"github.com/carnager/noterious/internal/settings"
	"github.com/carnager/noterious/internal/vault"
)

var vaultIndexInitMu sync.Mutex

func wrapWithVault(next http.Handler, settingsStore *settings.Store, cfg config.Config, indexService *index.Service, queryService *query.Service) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") {
			if shouldSkipVaultResolution(r.URL.Path) {
				next.ServeHTTP(w, r)
				return
			}
			scopePrefix, err := resolveRequestScope(settingsStore, cfg, requestedScopePrefix(r))
			if err != nil {
				slog.Error("request scope resolution failed",
					"path", r.URL.Path,
					"scope_prefix", requestedScopePrefix(r),
					"error", err,
				)
				http.Error(w, "failed to resolve request scope", http.StatusInternalServerError)
				return
			}
			if requiresVaultIndex(r.URL.Path) {
				if err := ensureVaultIndex(r.Context(), configuredVaultRoot(settingsStore, cfg), indexService, queryService); err != nil {
					slog.Error("request vault index initialization failed",
						"path", r.URL.Path,
						"vault_path", configuredVaultRoot(settingsStore, cfg),
						"error", err,
					)
					http.Error(w, "failed to initialize vault index", http.StatusInternalServerError)
					return
				}
			}
			ctx := vault.WithScopePrefix(r.Context(), scopePrefix)
			ctx = withRequestEventOriginContext(ctx, r)
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
		requestPath == "/api/query/workbench",
		requestPath == "/api/query/copilot":
		return true
	default:
		return false
	}
}

func ensureVaultIndex(ctx context.Context, rootVaultPath string, indexService *index.Service, queryService *query.Service) error {
	rootVaultPath = strings.TrimSpace(rootVaultPath)
	if indexService == nil || rootVaultPath == "" {
		return nil
	}
	vaultIndexInitMu.Lock()
	defer vaultIndexInitMu.Unlock()

	vaultService := vault.NewService(rootVaultPath)
	dbPath := indexService.DatabasePath()
	rebuildReason := ""
	if _, err := os.Stat(dbPath); err == nil {
		indexCtx := vault.WithScopePrefix(ctx, "")
		pages, listErr := indexService.ListPages(indexCtx)
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
	} else if !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("inspect vault index db: %w", err)
	} else {
		rebuildReason = "missing_index_database"
	}
	return rebuildVaultStateLocked(ctx, rootVaultPath, vaultService, indexService, queryService, rebuildReason)
}

func rebuildVaultState(ctx context.Context, currentVaultRecord vault.Vault, vaultService *vault.Service, indexService *index.Service, queryService *query.Service, reason string) error {
	if indexService == nil || strings.TrimSpace(currentVaultRecord.VaultPath) == "" {
		return nil
	}
	vaultIndexInitMu.Lock()
	defer vaultIndexInitMu.Unlock()
	return rebuildVaultStateLocked(ctx, currentVaultRecord.VaultPath, vaultService, indexService, queryService, reason)
}

func rebuildVaultStateLocked(ctx context.Context, rootVaultPath string, vaultService *vault.Service, indexService *index.Service, queryService *query.Service, reason string) error {
	if strings.TrimSpace(reason) == "" {
		reason = "explicit_rebuild"
	}
	rootVaultPath = strings.TrimSpace(rootVaultPath)
	if rootVaultPath == "" {
		return nil
	}
	if vaultService == nil {
		vaultService = vault.NewService(rootVaultPath)
	}
	indexCtx := vault.WithScopePrefix(ctx, "")
	slog.Info("initializing vault index",
		"vault_path", rootVaultPath,
		"reason", reason,
	)
	if err := indexService.RebuildFromVault(indexCtx, vaultService); err != nil {
		slog.Error("vault index rebuild failed",
			"vault_path", rootVaultPath,
			"reason", reason,
			"error", err,
		)
		return fmt.Errorf("rebuild vault index: %w", err)
	}
	if queryService != nil {
		if err := queryService.RefreshAll(indexCtx, indexService); err != nil {
			slog.Error("vault query refresh failed",
				"vault_path", rootVaultPath,
				"reason", reason,
				"error", err,
			)
			return fmt.Errorf("refresh vault query cache: %w", err)
		}
	}
	slog.Info("vault index initialized",
		"vault_path", rootVaultPath,
		"reason", reason,
	)
	return nil
}

func shouldSkipVaultResolution(path string) bool {
	switch path {
	case "/api/healthz", "/api/user/vaults":
		return true
	}
	if strings.HasPrefix(path, "/api/user/vaults/") {
		return true
	}
	return strings.HasPrefix(path, "/api/auth/")
}

func currentVaultRecord(ctx context.Context, deps Dependencies) vault.Vault {
	scopePrefix := vault.ScopePrefixFromContext(ctx)
	if scopePrefix == "" {
		return configuredVaultRecord(deps)
	}
	activeVault, err := resolveScopeRecord(deps.Settings, deps.Config, scopePrefix)
	if err == nil {
		return activeVault
	}
	return configuredVaultRecord(deps)
}

func currentVault(ctx context.Context, deps Dependencies) *vault.Service {
	configuredVault := configuredVaultRecord(deps)
	if deps.Vault != nil && filepath.Clean(deps.Vault.RootPath()) == filepath.Clean(configuredVault.VaultPath) {
		return deps.Vault
	}
	return vault.NewService(configuredVault.VaultPath)
}

func currentDocuments(ctx context.Context, deps Dependencies) (*documents.Service, error) {
	configuredVault := configuredVaultRecord(deps)
	if deps.Documents != nil {
		return deps.Documents, nil
	}
	service, err := documents.NewService(configuredVault.VaultPath)
	if err != nil {
		return nil, fmt.Errorf("init vault document service: %w", err)
	}
	return service, nil
}

func configuredVaultRecord(deps Dependencies) vault.Vault {
	return configuredVault(deps.Settings, deps.Config)
}

func scopePrefixForVault(rootVault vault.Vault, activeVault vault.Vault) string {
	rootPath := filepath.Clean(strings.TrimSpace(rootVault.VaultPath))
	activePath := filepath.Clean(strings.TrimSpace(activeVault.VaultPath))
	if rootPath == "" || activePath == "" || rootPath == activePath {
		return ""
	}
	relativePath, err := filepath.Rel(rootPath, activePath)
	if err != nil {
		return ""
	}
	relativePath = filepath.ToSlash(strings.TrimSpace(relativePath))
	if relativePath == "." || relativePath == "" || strings.HasPrefix(relativePath, "../") {
		return ""
	}
	return strings.Trim(relativePath, "/")
}
