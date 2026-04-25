package app

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/carnager/noterious/internal/config"
)

func TestNewDoesNotEagerlyBuildConfiguredVaultIndex(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	if err := os.MkdirAll(filepath.Join(vaultDir, "notes"), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	if err := os.WriteFile(filepath.Join(vaultDir, "notes", "alpha.md"), []byte("# Alpha\n"), 0o644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}

	app, err := New(config.Config{
		ListenAddr:            ":0",
		VaultPath:             vaultDir,
		DataDir:               dataDir,
		HomePage:              "index",
		WatchInterval:         time.Minute,
		NtfyInterval:          time.Minute,
		AuthCookieName:        "test_session",
		AuthSessionTTL:        time.Hour,
		AuthBootstrapUsername: "admin",
		AuthBootstrapPassword: "secret-pass",
	})
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}
	t.Cleanup(func() {
		_ = app.auth.Close()
		_ = app.vaults.Close()
		_ = app.index.Close()
	})

	if app.configuredVaultWatcher == nil {
		t.Fatal("configuredVaultWatcher = nil")
	}

	defaultIndexDB := app.index.DatabasePath()
	if _, err := os.Stat(defaultIndexDB); !os.IsNotExist(err) {
		t.Fatalf("default index db exists after startup: %v", err)
	}
}
