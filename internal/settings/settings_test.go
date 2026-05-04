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
		Documents: Documents{
			UploadPlacement: "note-subfolder",
			UploadSubfolder: "_uploads",
		},
	})
	if err != nil {
		t.Fatalf("Update() error = %v", err)
	}
	if !updated.RestartRequired {
		t.Fatalf("updated snapshot should require restart after vault path change")
	}
	if len(updated.RestartRequiredReasons) != 2 {
		t.Fatalf("updated snapshot restart reasons = %#v, want 2 reasons", updated.RestartRequiredReasons)
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
	if snapshot.Settings.Documents.UploadPlacement != "note-subfolder" || snapshot.Settings.Documents.UploadSubfolder != "_uploads" {
		t.Fatalf("document settings not persisted: %#v", snapshot.Settings.Documents)
	}
	raw, err := os.ReadFile(store.Path())
	if err != nil {
		t.Fatalf("ReadFile(settings) error = %v", err)
	}
	if strings.Contains(string(raw), "\"preferences\"") {
		t.Fatalf("settings file unexpectedly contains client preferences: %s", string(raw))
	}
}

func TestStoreReportsSpecificRestartReasons(t *testing.T) {
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

	updated, err := store.Update(AppSettings{
		Vault: Vault{
			VaultPath: filepath.Join(rootDir, "vault-b"),
		},
		Notifications: Notifications{
			NtfyInterval: "2m",
		},
		Documents: Documents{
			UploadPlacement: "same-folder",
			UploadSubfolder: "_files",
		},
	})
	if err != nil {
		t.Fatalf("Update() error = %v", err)
	}

	if !updated.RestartRequired {
		t.Fatalf("updated snapshot should require restart")
	}
	if len(updated.RestartRequiredReasons) != 2 {
		t.Fatalf("RestartRequiredReasons = %#v, want 2 entries", updated.RestartRequiredReasons)
	}
	if !strings.Contains(updated.RestartRequiredReasons[0], "Vault path") && !strings.Contains(updated.RestartRequiredReasons[1], "Vault path") {
		t.Fatalf("RestartRequiredReasons = %#v, want vault path reason", updated.RestartRequiredReasons)
	}
	if !strings.Contains(updated.RestartRequiredReasons[0], "Notification polling interval") && !strings.Contains(updated.RestartRequiredReasons[1], "Notification polling interval") {
		t.Fatalf("RestartRequiredReasons = %#v, want notification polling interval reason", updated.RestartRequiredReasons)
	}
}

func TestStoreRejectsInvalidDocumentUploadPlacement(t *testing.T) {
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

	_, err = store.Update(AppSettings{
		Vault: Vault{
			VaultPath: filepath.Join(rootDir, "vault-a"),
		},
		Notifications: Notifications{
			NtfyInterval: "1m",
		},
		Documents: Documents{
			UploadPlacement: "mystery-mode",
		},
	})
	if err == nil || !strings.Contains(err.Error(), "document upload placement") {
		t.Fatalf("Update() error = %v, want document upload placement validation", err)
	}
}

func TestStoreRejectsInvalidDocumentUploadSubfolder(t *testing.T) {
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

	_, err = store.Update(AppSettings{
		Vault: Vault{
			VaultPath: filepath.Join(rootDir, "vault-a"),
		},
		Notifications: Notifications{
			NtfyInterval: "1m",
		},
		Documents: Documents{
			UploadPlacement: "note-subfolder",
			UploadSubfolder: "../outside",
		},
	})
	if err == nil || !strings.Contains(err.Error(), "document upload subfolder") {
		t.Fatalf("Update() error = %v, want document upload subfolder validation", err)
	}
}
