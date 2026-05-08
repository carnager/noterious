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
			UploadFolder:    "Shared/Uploads",
		},
	})
	if err != nil {
		t.Fatalf("Update() error = %v", err)
	}
	if !updated.RestartRequired {
		t.Fatalf("updated snapshot should require restart after notification interval change")
	}
	if len(updated.RestartRequiredReasons) != 1 {
		t.Fatalf("updated snapshot restart reasons = %#v, want 1 reason", updated.RestartRequiredReasons)
	}

	reloaded, err := NewStore(cfg.DataDir, DefaultSettingsFromConfig(cfg))
	if err != nil {
		t.Fatalf("NewStore(reload) error = %v", err)
	}
	snapshot := reloaded.Snapshot()
	if snapshot.Settings.Vault.VaultPath != cfg.VaultPath {
		t.Fatalf("vault path should stay on the configured startup path: got %q want %q", snapshot.Settings.Vault.VaultPath, cfg.VaultPath)
	}
	if snapshot.Settings.Notifications.NtfyInterval != "2m" {
		t.Fatalf("notification settings not persisted: %#v", snapshot.Settings.Notifications)
	}
	if snapshot.Settings.Documents.UploadPlacement != "note-subfolder" || snapshot.Settings.Documents.UploadSubfolder != "_uploads" || snapshot.Settings.Documents.UploadFolder != "Shared/Uploads" {
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

func TestStoreIgnoresVaultPathEditsAndOnlyReportsRuntimeNotificationChanges(t *testing.T) {
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
			UploadFolder:    "",
		},
	})
	if err != nil {
		t.Fatalf("Update() error = %v", err)
	}

	if !updated.RestartRequired {
		t.Fatalf("updated snapshot should require restart")
	}
	if len(updated.RestartRequiredReasons) != 1 {
		t.Fatalf("RestartRequiredReasons = %#v, want 1 entry", updated.RestartRequiredReasons)
	}
	if updated.Settings.Vault.VaultPath != cfg.VaultPath {
		t.Fatalf("Settings.Vault.VaultPath = %q want %q", updated.Settings.Vault.VaultPath, cfg.VaultPath)
	}
	if !strings.Contains(updated.RestartRequiredReasons[0], "Notification polling interval") {
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

func TestStoreRejectsInvalidDocumentUploadFolder(t *testing.T) {
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
			UploadPlacement: "specific-folder",
			UploadSubfolder: "_files",
			UploadFolder:    "../outside",
		},
	})
	if err == nil || !strings.Contains(err.Error(), "document upload folder") {
		t.Fatalf("Update() error = %v, want document upload folder validation", err)
	}
}
