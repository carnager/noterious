package config

import (
	"fmt"
	"os"
)

type Config struct {
	ListenAddr string
	VaultPath  string
	DataDir    string
}

func LoadFromEnv() (Config, error) {
	cfg := Config{
		ListenAddr: envOrDefault("NOTERIOUS_LISTEN_ADDR", ":8080"),
		VaultPath:  envOrDefault("NOTERIOUS_VAULT_PATH", "./vault"),
		DataDir:    envOrDefault("NOTERIOUS_DATA_DIR", "./data"),
	}

	if cfg.VaultPath == "" {
		return Config{}, fmt.Errorf("vault path must not be empty")
	}
	if cfg.DataDir == "" {
		return Config{}, fmt.Errorf("data dir must not be empty")
	}

	return cfg, nil
}

func envOrDefault(name, fallback string) string {
	if value := os.Getenv(name); value != "" {
		return value
	}
	return fallback
}
