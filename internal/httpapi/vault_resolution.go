package httpapi

import (
	"log/slog"
	"net/http"
	"strings"

	"github.com/carnager/noterious/internal/config"
	"github.com/carnager/noterious/internal/settings"
	"github.com/carnager/noterious/internal/vault"
)

const requestScopeHeader = "X-Noterious-Scope"

func configuredVaultRoot(settingsStore *settings.Store, cfg config.Config) string {
	if settingsStore != nil {
		snapshot := settingsStore.Snapshot()
		if strings.TrimSpace(snapshot.AppliedVault.VaultPath) != "" {
			return strings.TrimSpace(snapshot.AppliedVault.VaultPath)
		}
	}
	return strings.TrimSpace(cfg.VaultPath)
}

func configuredVault(settingsStore *settings.Store, cfg config.Config) vault.Vault {
	return vault.Vault{
		ID:        vault.ConfiguredVaultID,
		Key:       "default",
		Name:      "Configured Vault",
		VaultPath: configuredVaultRoot(settingsStore, cfg),
		HomePage:  strings.TrimSpace(cfg.HomePage),
	}
}

func resolveScopeRecord(settingsStore *settings.Store, cfg config.Config, scopePrefix string) (vault.Vault, error) {
	rootVault := configuredVault(settingsStore, cfg)
	scopePrefix = normalizeScopePrefix(scopePrefix)
	if scopePrefix == "" {
		return rootVault, nil
	}

	discoveredVaults, err := vault.DiscoverTopLevel(rootVault.VaultPath)
	if err != nil {
		return vault.Vault{}, err
	}
	for _, discoveredVault := range discoveredVaults {
		discoveredPrefix := scopePrefixForVault(rootVault, discoveredVault)
		if discoveredPrefix == scopePrefix {
			return discoveredVault, nil
		}
	}
	return rootVault, nil
}

func requestedScopePrefix(r *http.Request) string {
	if r == nil {
		return ""
	}
	if prefix := normalizeScopePrefix(r.URL.Query().Get("scope")); prefix != "" {
		return prefix
	}
	return normalizeScopePrefix(r.Header.Get(requestScopeHeader))
}

func resolveRequestScope(settingsStore *settings.Store, cfg config.Config, requestedPrefix string) (string, error) {
	rootVault := configuredVault(settingsStore, cfg)
	scopePrefix := normalizeScopePrefix(requestedPrefix)
	if scopePrefix == "" {
		return "", nil
	}

	discoveredVaults, err := vault.DiscoverTopLevel(rootVault.VaultPath)
	if err != nil {
		return "", err
	}
	for _, discoveredVault := range discoveredVaults {
		discoveredPrefix := scopePrefixForVault(rootVault, discoveredVault)
		if discoveredPrefix == scopePrefix {
			return discoveredPrefix, nil
		}
	}

	slog.Warn("requested scope is unavailable; falling back to configured root",
		"scope_prefix", scopePrefix,
		"vault_path", rootVault.VaultPath,
	)
	return "", nil
}

func normalizeScopePrefix(prefix string) string {
	trimmed := strings.Trim(strings.ReplaceAll(strings.TrimSpace(prefix), "\\", "/"), "/")
	if trimmed == "" {
		return ""
	}
	parts := strings.Split(trimmed, "/")
	normalized := make([]string, 0, len(parts))
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part == "" || part == "." || part == ".." {
			return ""
		}
		normalized = append(normalized, part)
	}
	return strings.Join(normalized, "/")
}
