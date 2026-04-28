package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestApplyCLIOverrides(t *testing.T) {
	base := Config{ListenAddr: ":8080", DataDir: "./data", VaultPath: "./vault"}

	t.Run("uses explicit listen address", func(t *testing.T) {
		cfg, err := ApplyCLIOverrides(base, "127.0.0.1:9090", 0, "", "")
		if err != nil {
			t.Fatalf("ApplyCLIOverrides() error = %v", err)
		}
		if cfg.ListenAddr != "127.0.0.1:9090" {
			t.Fatalf("ListenAddr = %q", cfg.ListenAddr)
		}
	})

	t.Run("maps port to listen address", func(t *testing.T) {
		cfg, err := ApplyCLIOverrides(base, "", 9090, "", "")
		if err != nil {
			t.Fatalf("ApplyCLIOverrides() error = %v", err)
		}
		if cfg.ListenAddr != ":9090" {
			t.Fatalf("ListenAddr = %q", cfg.ListenAddr)
		}
	})

	t.Run("port overrides explicit listen address", func(t *testing.T) {
		cfg, err := ApplyCLIOverrides(base, ":8081", 9090, "", "")
		if err != nil {
			t.Fatalf("ApplyCLIOverrides() error = %v", err)
		}
		if cfg.ListenAddr != ":9090" {
			t.Fatalf("ListenAddr = %q", cfg.ListenAddr)
		}
	})

	t.Run("rejects invalid ports", func(t *testing.T) {
		if _, err := ApplyCLIOverrides(base, "", 70000, "", ""); err == nil {
			t.Fatal("ApplyCLIOverrides() error = nil, want invalid port error")
		}
	})

	t.Run("uses explicit data dir", func(t *testing.T) {
		cfg, err := ApplyCLIOverrides(base, "", 0, "/srv/noterious", "")
		if err != nil {
			t.Fatalf("ApplyCLIOverrides() error = %v", err)
		}
		if cfg.DataDir != "/srv/noterious" {
			t.Fatalf("DataDir = %q", cfg.DataDir)
		}
	})

	t.Run("uses explicit vault dir", func(t *testing.T) {
		cfg, err := ApplyCLIOverrides(base, "", 0, "", "/srv/noterious/vaults")
		if err != nil {
			t.Fatalf("ApplyCLIOverrides() error = %v", err)
		}
		if cfg.VaultPath != "/srv/noterious/vaults" {
			t.Fatalf("VaultPath = %q", cfg.VaultPath)
		}
	})

	t.Run("rejects empty vault dir after override", func(t *testing.T) {
		if _, err := ApplyCLIOverrides(Config{ListenAddr: ":8080", DataDir: "./data"}, "", 0, "", ""); err == nil {
			t.Fatal("ApplyCLIOverrides() error = nil, want empty vault path error")
		}
	})
}

func TestLoadFromEnvSupportsBootstrapPasswordFile(t *testing.T) {
	t.Run("reads bootstrap password from file", func(t *testing.T) {
		rootDir := t.TempDir()
		passwordFile := filepath.Join(rootDir, "bootstrap-password")
		if err := os.WriteFile(passwordFile, []byte("secret-from-file\n"), 0o600); err != nil {
			t.Fatalf("WriteFile() error = %v", err)
		}

		t.Setenv("NOTERIOUS_AUTH_BOOTSTRAP_PASSWORD_FILE", passwordFile)

		cfg, err := LoadFromEnv()
		if err != nil {
			t.Fatalf("LoadFromEnv() error = %v", err)
		}
		if cfg.AuthBootstrapPassword != "secret-from-file" {
			t.Fatalf("AuthBootstrapPassword = %q", cfg.AuthBootstrapPassword)
		}
	})

	t.Run("prefers explicit bootstrap password env over file", func(t *testing.T) {
		rootDir := t.TempDir()
		passwordFile := filepath.Join(rootDir, "bootstrap-password")
		if err := os.WriteFile(passwordFile, []byte("secret-from-file\n"), 0o600); err != nil {
			t.Fatalf("WriteFile() error = %v", err)
		}

		t.Setenv("NOTERIOUS_AUTH_BOOTSTRAP_PASSWORD", "secret-from-env")
		t.Setenv("NOTERIOUS_AUTH_BOOTSTRAP_PASSWORD_FILE", passwordFile)

		cfg, err := LoadFromEnv()
		if err != nil {
			t.Fatalf("LoadFromEnv() error = %v", err)
		}
		if cfg.AuthBootstrapPassword != "secret-from-env" {
			t.Fatalf("AuthBootstrapPassword = %q", cfg.AuthBootstrapPassword)
		}
	})
}
