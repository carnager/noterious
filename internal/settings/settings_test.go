package settings

import (
	"path/filepath"
	"testing"

	"github.com/carnager/noterious/internal/config"
)

func TestStorePersistsAndMarksRestartRequiredForRuntimeSettings(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	cfg := config.Config{
		DataDir:   filepath.Join(rootDir, "data"),
		VaultPath: filepath.Join(rootDir, "vault-a"),
		HomePage:  "notes/home",
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
		Preferences: Preferences{
			Hotkeys: initial.Settings.Preferences.Hotkeys,
			UI: UI{
				FontFamily:     "sans",
				FontSize:       "18",
				DateTimeFormat: "de",
			},
		},
		Workspace: Workspace{
			VaultPath: filepath.Join(rootDir, "vault-b"),
			HomePage:  "notes/start",
		},
		Notifications: Notifications{
			NtfyTopicURL: "https://ntfy.sh/noterious-test",
			NtfyToken:    "secret-token",
			NtfyInterval: "2m",
		},
	})
	if err != nil {
		t.Fatalf("Update() error = %v", err)
	}
	if !updated.RestartRequired {
		t.Fatalf("updated snapshot should require restart after vault path change")
	}
	if updated.AppliedWorkspace.HomePage != "notes/start" {
		t.Fatalf("applied home page mismatch: got %q", updated.AppliedWorkspace.HomePage)
	}

	reloaded, err := NewStore(cfg.DataDir, DefaultSettingsFromConfig(cfg))
	if err != nil {
		t.Fatalf("NewStore(reload) error = %v", err)
	}
	snapshot := reloaded.Snapshot()
	if snapshot.Settings.Workspace.VaultPath != filepath.Join(rootDir, "vault-b") {
		t.Fatalf("vault path not persisted: got %q", snapshot.Settings.Workspace.VaultPath)
	}
	if snapshot.Settings.Workspace.HomePage != "notes/start" {
		t.Fatalf("home page not persisted: got %q", snapshot.Settings.Workspace.HomePage)
	}
	if snapshot.Settings.Preferences.UI.FontFamily != "sans" || snapshot.Settings.Preferences.UI.FontSize != "18" || snapshot.Settings.Preferences.UI.DateTimeFormat != "de" {
		t.Fatalf("ui settings not persisted: %#v", snapshot.Settings.Preferences.UI)
	}
	if snapshot.Settings.Notifications.NtfyTopicURL != "https://ntfy.sh/noterious-test" ||
		snapshot.Settings.Notifications.NtfyToken != "secret-token" ||
		snapshot.Settings.Notifications.NtfyInterval != "2m" {
		t.Fatalf("notification settings not persisted: %#v", snapshot.Settings.Notifications)
	}
}
