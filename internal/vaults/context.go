package vaults

import "context"

type contextKey string

const (
	vaultContextKey   contextKey = "noterious.vault"
	ConfiguredVaultID int64      = 0
)

func WithVault(ctx context.Context, vault Vault) context.Context {
	return context.WithValue(ctx, vaultContextKey, vault)
}

func VaultFromContext(ctx context.Context) (Vault, bool) {
	vault, ok := ctx.Value(vaultContextKey).(Vault)
	return vault, ok
}

func VaultIDFromContext(ctx context.Context) int64 {
	vault, ok := VaultFromContext(ctx)
	if !ok || vault.ID <= 0 {
		return ConfiguredVaultID
	}
	return vault.ID
}
