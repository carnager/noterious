package settings

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/carnager/noterious/internal/config"
)

func TestStorePersistsAndMarksRestartRequiredForRuntimeSettings(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	cfg := config.Config{
		DataDir:   filepath.Join(rootDir, "data"),
		VaultPath: filepath.Join(rootDir, "vault-a"),
	}

	store, err := NewStore(cfg.DataDir, DefaultSettingsFromConfig(cfg))
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}

	initial := store.Snapshot()
	if initial.RestartRequired {
		t.Fatalf("initial snapshot unexpectedly requires restart")
	}

	updated, err := store.Update(AppSettings{
		Vault: Vault{
			VaultPath: filepath.Join(rootDir, "vault-b"),
		},
		Notifications: Notifications{
			NtfyInterval: "2m",
		},
	})
	if err != nil {
		t.Fatalf("Update() error = %v", err)
	}
	if !updated.RestartRequired {
		t.Fatalf("updated snapshot should require restart after vault path change")
	}

	reloaded, err := NewStore(cfg.DataDir, DefaultSettingsFromConfig(cfg))
	if err != nil {
		t.Fatalf("NewStore(reload) error = %v", err)
	}
	snapshot := reloaded.Snapshot()
	if snapshot.Settings.Vault.VaultPath != filepath.Join(rootDir, "vault-b") {
		t.Fatalf("vault path not persisted: got %q", snapshot.Settings.Vault.VaultPath)
	}
	if snapshot.Settings.Notifications.NtfyInterval != "2m" {
		t.Fatalf("notification settings not persisted: %#v", snapshot.Settings.Notifications)
	}
	raw, err := os.ReadFile(store.Path())
	if err != nil {
		t.Fatalf("ReadFile(settings) error = %v", err)
	}
	if strings.Contains(string(raw), "\"preferences\"") {
		t.Fatalf("settings file unexpectedly contains client preferences: %s", string(raw))
	}
}
