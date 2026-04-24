package config

import "testing"

func TestApplyCLIOverrides(t *testing.T) {
	base := Config{ListenAddr: ":8080"}

	t.Run("uses explicit listen address", func(t *testing.T) {
		cfg, err := ApplyCLIOverrides(base, "127.0.0.1:9090", 0)
		if err != nil {
			t.Fatalf("ApplyCLIOverrides() error = %v", err)
		}
		if cfg.ListenAddr != "127.0.0.1:9090" {
			t.Fatalf("ListenAddr = %q", cfg.ListenAddr)
		}
	})

	t.Run("maps port to listen address", func(t *testing.T) {
		cfg, err := ApplyCLIOverrides(base, "", 9090)
		if err != nil {
			t.Fatalf("ApplyCLIOverrides() error = %v", err)
		}
		if cfg.ListenAddr != ":9090" {
			t.Fatalf("ListenAddr = %q", cfg.ListenAddr)
		}
	})

	t.Run("port overrides explicit listen address", func(t *testing.T) {
		cfg, err := ApplyCLIOverrides(base, ":8081", 9090)
		if err != nil {
			t.Fatalf("ApplyCLIOverrides() error = %v", err)
		}
		if cfg.ListenAddr != ":9090" {
			t.Fatalf("ListenAddr = %q", cfg.ListenAddr)
		}
	})

	t.Run("rejects invalid ports", func(t *testing.T) {
		if _, err := ApplyCLIOverrides(base, "", 70000); err == nil {
			t.Fatal("ApplyCLIOverrides() error = nil, want invalid port error")
		}
	})
}
