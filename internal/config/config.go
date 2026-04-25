package config

import (
	"fmt"
	"os"
	"strings"
	"time"
)

type Config struct {
	ListenAddr            string
	VaultPath             string
	DataDir               string
	HomePage              string
	WatchInterval         time.Duration
	NtfyInterval          time.Duration
	AuthCookieName        string
	AuthSessionTTL        time.Duration
	AuthBootstrapUsername string
	AuthBootstrapPassword string
}

func LoadFromEnv() (Config, error) {
	watchInterval, err := parseDurationEnv("NOTERIOUS_WATCH_INTERVAL", "2s")
	if err != nil {
		return Config{}, err
	}
	ntfyInterval, err := parseDurationEnv("NOTERIOUS_NTFY_INTERVAL", "1m")
	if err != nil {
		return Config{}, err
	}
	authSessionTTL, err := parseDurationEnv("NOTERIOUS_AUTH_SESSION_TTL", "720h")
	if err != nil {
		return Config{}, err
	}

	cfg := Config{
		ListenAddr:            envOrDefault("NOTERIOUS_LISTEN_ADDR", ":3000"),
		VaultPath:             envOrDefault("NOTERIOUS_VAULT_PATH", "./vault"),
		DataDir:               envOrDefault("NOTERIOUS_DATA_DIR", "./data"),
		HomePage:              envOrDefault("NOTERIOUS_HOME_PAGE", ""),
		WatchInterval:         watchInterval,
		NtfyInterval:          ntfyInterval,
		AuthCookieName:        envOrDefault("NOTERIOUS_AUTH_COOKIE_NAME", "noterious_session"),
		AuthSessionTTL:        authSessionTTL,
		AuthBootstrapUsername: envOrDefault("NOTERIOUS_AUTH_BOOTSTRAP_USERNAME", ""),
		AuthBootstrapPassword: envOrDefault("NOTERIOUS_AUTH_BOOTSTRAP_PASSWORD", ""),
	}

	if cfg.VaultPath == "" {
		return Config{}, fmt.Errorf("vault path must not be empty")
	}
	if cfg.DataDir == "" {
		return Config{}, fmt.Errorf("data dir must not be empty")
	}

	return cfg, nil
}

func ApplyCLIOverrides(cfg Config, listenAddr string, port int, dataDir string) (Config, error) {
	if strings.TrimSpace(listenAddr) != "" {
		cfg.ListenAddr = strings.TrimSpace(listenAddr)
	}
	if port != 0 {
		if port < 0 || port > 65535 {
			return Config{}, fmt.Errorf("port must be between 1 and 65535")
		}
		cfg.ListenAddr = fmt.Sprintf(":%d", port)
	}
	if strings.TrimSpace(dataDir) != "" {
		cfg.DataDir = strings.TrimSpace(dataDir)
	}
	return cfg, nil
}

func envOrDefault(name, fallback string) string {
	if value := os.Getenv(name); value != "" {
		return value
	}
	return fallback
}

func parseDurationEnv(name, fallback string) (time.Duration, error) {
	value := envOrDefault(name, fallback)
	duration, err := time.ParseDuration(value)
	if err != nil {
		return 0, fmt.Errorf("invalid duration for %s: %w", name, err)
	}
	return duration, nil
}
