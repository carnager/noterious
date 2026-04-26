package vault

import "context"

type contextKey string

const (
	vaultContextKey       contextKey = "noterious.vault"
	scopePrefixContextKey contextKey = "noterious.scope-prefix"
)

func WithVault(ctx context.Context, currentVault Vault) context.Context {
	return context.WithValue(ctx, vaultContextKey, currentVault)
}

func VaultFromContext(ctx context.Context) (Vault, bool) {
	currentVault, ok := ctx.Value(vaultContextKey).(Vault)
	return currentVault, ok
}

func WithScopePrefix(ctx context.Context, prefix string) context.Context {
	return context.WithValue(ctx, scopePrefixContextKey, prefix)
}

func ScopePrefixFromContext(ctx context.Context) string {
	prefix, _ := ctx.Value(scopePrefixContextKey).(string)
	return prefix
}
