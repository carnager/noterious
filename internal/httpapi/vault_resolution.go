package httpapi

import (
	"context"
	"errors"
	"log/slog"
	"strings"

	"github.com/carnager/noterious/internal/auth"
	"github.com/carnager/noterious/internal/config"
	"github.com/carnager/noterious/internal/settings"
	"github.com/carnager/noterious/internal/vaults"
)

type resolvedUserVaultState struct {
	RootVault        vaults.Vault
	DiscoveredVaults []vaults.Vault
	SelectedVaultID  int64
	CurrentVault     vaults.Vault
}

func configuredVaultRoot(settingsStore *settings.Store, cfg config.Config) string {
	if settingsStore != nil {
		snapshot := settingsStore.Snapshot()
		if strings.TrimSpace(snapshot.AppliedVault.VaultPath) != "" {
			return strings.TrimSpace(snapshot.AppliedVault.VaultPath)
		}
	}
	return strings.TrimSpace(cfg.VaultPath)
}

func loadCurrentVaultForUser(ctx context.Context, authService *auth.Service, vaultRegistry *vaults.Service, settingsStore *settings.Store, cfg config.Config, user auth.User, token string) *vaults.Vault {
	if vaultRegistry == nil || user.ID <= 0 {
		return nil
	}
	state, err := resolveUserVaultState(ctx, authService, vaultRegistry, settingsStore, cfg, user, token)
	if err != nil {
		slog.Error("current vault resolution failed",
			"user_id", user.ID,
			"username", user.Username,
			"selected_vault_id", currentVaultIDForToken(ctx, authService, token),
			"error", err,
		)
		return nil
	}
	return &state.CurrentVault
}

func loadAuthVaultsSnapshotForUser(ctx context.Context, authService *auth.Service, vaultRegistry *vaults.Service, settingsStore *settings.Store, cfg config.Config, user auth.User, token string) (authVaultsResponse, error) {
	state, err := resolveUserVaultState(ctx, authService, vaultRegistry, settingsStore, cfg, user, token)
	if err != nil {
		return authVaultsResponse{}, err
	}
	return authVaultsResponse{
		RootVault:    &state.RootVault,
		Vaults:       state.DiscoveredVaults,
		Count:        len(state.DiscoveredVaults),
		CurrentVault: &state.CurrentVault,
	}, nil
}

func resolveVaultForUser(ctx context.Context, vaultRegistry *vaults.Service, settingsStore *settings.Store, cfg config.Config, user auth.User, vaultID int64) (vaults.Vault, error) {
	state, err := resolveUserVaultStateWithSelectedID(ctx, vaultRegistry, settingsStore, cfg, user, vaultID)
	if err != nil {
		return vaults.Vault{}, err
	}
	return state.CurrentVault, nil
}

func resolveSelectedVaultForUser(ctx context.Context, vaultRegistry *vaults.Service, settingsStore *settings.Store, cfg config.Config, user auth.User, vaultID int64) (vaults.Vault, error) {
	catalog, err := loadUserVaultCatalog(ctx, vaultRegistry, settingsStore, cfg, user)
	if err != nil {
		return vaults.Vault{}, err
	}
	return resolveRequestedVaultFromCatalog(ctx, vaultRegistry, user, catalog, vaultID)
}

func resolveUserVaultState(ctx context.Context, authService *auth.Service, vaultRegistry *vaults.Service, settingsStore *settings.Store, cfg config.Config, user auth.User, token string) (resolvedUserVaultState, error) {
	return resolveUserVaultStateWithSelectedID(ctx, vaultRegistry, settingsStore, cfg, user, currentVaultIDForToken(ctx, authService, token))
}

func resolveUserVaultStateWithSelectedID(ctx context.Context, vaultRegistry *vaults.Service, settingsStore *settings.Store, cfg config.Config, user auth.User, selectedVaultID int64) (resolvedUserVaultState, error) {
	catalog, err := loadUserVaultCatalog(ctx, vaultRegistry, settingsStore, cfg, user)
	if err != nil {
		return resolvedUserVaultState{}, err
	}
	currentVault, err := resolveCurrentVaultFromCatalog(ctx, vaultRegistry, user, catalog, selectedVaultID)
	if err != nil {
		return resolvedUserVaultState{}, err
	}
	return resolvedUserVaultState{
		RootVault:        catalog.RootVault,
		DiscoveredVaults: catalog.DiscoveredVaults,
		SelectedVaultID:  selectedVaultID,
		CurrentVault:     currentVault,
	}, nil
}

type userVaultCatalog struct {
	RootVault        vaults.Vault
	DiscoveredVaults []vaults.Vault
}

func loadUserVaultCatalog(ctx context.Context, vaultRegistry *vaults.Service, settingsStore *settings.Store, cfg config.Config, user auth.User) (userVaultCatalog, error) {
	rootVault, err := resolveRootVaultForUser(ctx, vaultRegistry, settingsStore, cfg, user)
	if err != nil {
		return userVaultCatalog{}, err
	}
	discoveredVaults, err := vaultRegistry.ListDiscoveredPersonal(ctx, configuredVaultRoot(settingsStore, cfg), user.ID, user.Username)
	if err != nil {
		return userVaultCatalog{}, err
	}
	return userVaultCatalog{
		RootVault:        rootVault,
		DiscoveredVaults: discoveredVaults,
	}, nil
}

func resolveRequestedVaultFromCatalog(ctx context.Context, vaultRegistry *vaults.Service, user auth.User, catalog userVaultCatalog, vaultID int64) (vaults.Vault, error) {
	if vaultID == 0 || vaultID == catalog.RootVault.ID {
		return catalog.RootVault, nil
	}
	for _, discoveredVault := range catalog.DiscoveredVaults {
		if discoveredVault.ID == vaultID {
			selectedVault, _, err := vaultRegistry.OwnedVaultForUser(ctx, user.ID, vaultID)
			return selectedVault, err
		}
	}
	return vaults.Vault{}, vaults.ErrVaultMembershipRequired
}

func resolveCurrentVaultFromCatalog(ctx context.Context, vaultRegistry *vaults.Service, user auth.User, catalog userVaultCatalog, selectedVaultID int64) (vaults.Vault, error) {
	if selectedVaultID <= 0 || selectedVaultID == catalog.RootVault.ID {
		return catalog.RootVault, nil
	}

	selectedVault, err := resolveRequestedVaultFromCatalog(ctx, vaultRegistry, user, catalog, selectedVaultID)
	if err == nil {
		return selectedVault, nil
	}
	if errors.Is(err, vaults.ErrVaultMembershipRequired) || errors.Is(err, vaults.ErrVaultNotFound) {
		slog.Warn("selected vault unavailable; falling back to user root",
			"user_id", user.ID,
			"username", user.Username,
			"selected_vault_id", selectedVaultID,
			"root_vault_id", catalog.RootVault.ID,
		)
		return catalog.RootVault, nil
	}
	return vaults.Vault{}, err
}

func resolveRootVaultForUser(ctx context.Context, vaultRegistry *vaults.Service, settingsStore *settings.Store, cfg config.Config, user auth.User) (vaults.Vault, error) {
	vaultRoot := configuredVaultRoot(settingsStore, cfg)
	rootVault, _, err := vaultRegistry.EnsureUserRootVault(ctx, vaultRoot, user.ID, user.Username)
	return rootVault, err
}

func currentVaultIDForToken(ctx context.Context, authService *auth.Service, token string) int64 {
	if authService == nil || strings.TrimSpace(token) == "" {
		return 0
	}
	vaultID, err := authService.CurrentVaultIDByToken(ctx, token)
	if err != nil {
		slog.Warn("load selected vault from session failed", "error", err)
		return 0
	}
	return vaultID
}

func tokenFromContextOrEmpty(ctx context.Context) string {
	token, ok := auth.SessionTokenFromContext(ctx)
	if !ok {
		return ""
	}
	return strings.TrimSpace(token)
}
