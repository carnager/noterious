package httpapi

import (
	"path/filepath"
	"testing"

	"github.com/carnager/noterious/internal/config"
	"github.com/carnager/noterious/internal/settings"
)

func TestRequiresVaultIndex(t *testing.T) {
	t.Parallel()

	tests := []struct {
		path string
		want bool
	}{
		{path: "/api/pages", want: true},
		{path: "/api/pages/foo", want: true},
		{path: "/api/queries/tree", want: true},
		{path: "/api/query/preview", want: true},
		{path: "/api/query/execute", want: true},
		{path: "/api/query/count", want: true},
		{path: "/api/query/workbench", want: true},
		{path: "/api/query/analyze", want: false},
		{path: "/api/query/plan", want: false},
		{path: "/api/query/lint", want: false},
		{path: "/api/query/suggest", want: false},
		{path: "/api/query/format", want: false},
		{path: "/api/query/schema", want: false},
		{path: "/api/query/editor", want: false},
		{path: "/api/tasks", want: true},
		{path: "/api/search", want: true},
		{path: "/api/links", want: true},
		{path: "/api/meta", want: false},
		{path: "/api/settings", want: false},
		{path: "/api/user/settings", want: false},
		{path: "/api/documents", want: false},
		{path: "/api/events", want: false},
	}

	for _, test := range tests {
		if got := requiresVaultIndex(test.path); got != test.want {
			t.Fatalf("requiresVaultIndex(%q) = %v, want %v", test.path, got, test.want)
		}
	}
}

func TestCurrentVaultRootUsesAppliedRuntimeVault(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	appliedVaultRoot := filepath.Join(rootDir, "applied-vault")
	pendingVaultRoot := filepath.Join(rootDir, "pending-vault")
	store, err := settings.NewStore(rootDir, settings.DefaultSettingsFromConfig(config.Config{
		VaultPath: appliedVaultRoot,
	}))
	if err != nil {
		t.Fatalf("settings.NewStore() error = %v", err)
	}
	if _, err := store.Update(settings.AppSettings{
		Vault: settings.Vault{
			VaultPath: pendingVaultRoot,
		},
		Notifications: settings.Notifications{
			NtfyInterval: "1m",
		},
	}); err != nil {
		t.Fatalf("store.Update() error = %v", err)
	}

	got := currentVaultRoot(Dependencies{
		Config: config.Config{
			VaultPath: appliedVaultRoot,
		},
		Settings: store,
	})
	if got != appliedVaultRoot {
		t.Fatalf("currentVaultRoot() = %q want %q", got, appliedVaultRoot)
	}
}
