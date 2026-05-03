package ai

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestStorePersistsSettingsAndSeparatesAPIKey(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	store, err := NewStore(rootDir, DefaultSettings())
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}

	snapshot, err := store.Update(UpdateSettingsRequest{
		Settings: Settings{
			Enabled:  true,
			Provider: defaultProviderName,
			BaseURL:  "https://api.deepseek.com/v1",
			Model:    "deepseek-chat",
		},
		APIKey: "secret-token",
	})
	if err != nil {
		t.Fatalf("Update() error = %v", err)
	}
	if !snapshot.APIKeyConfigured {
		t.Fatalf("snapshot did not report configured api key")
	}
	if snapshot.Settings.BaseURL != "https://api.deepseek.com/v1" {
		t.Fatalf("baseURL = %q", snapshot.Settings.BaseURL)
	}

	raw, err := os.ReadFile(filepath.Join(rootDir, settingsFileName))
	if err != nil {
		t.Fatalf("ReadFile(settings) error = %v", err)
	}
	if strings.Contains(string(raw), "secret-token") {
		t.Fatalf("settings file leaked api key: %s", string(raw))
	}

	reloaded, err := NewStore(rootDir, DefaultSettings())
	if err != nil {
		t.Fatalf("NewStore(reload) error = %v", err)
	}
	resolved, apiKey, err := reloaded.Resolve()
	if err != nil {
		t.Fatalf("Resolve() error = %v", err)
	}
	if resolved.Model != "deepseek-chat" {
		t.Fatalf("model = %q", resolved.Model)
	}
	if apiKey != "secret-token" {
		t.Fatalf("api key = %q", apiKey)
	}
}

func TestStoreCanClearAPIKey(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	store, err := NewStore(rootDir, DefaultSettings())
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}

	if _, err := store.Update(UpdateSettingsRequest{
		Settings: DefaultSettings(),
		APIKey:   "secret-token",
	}); err != nil {
		t.Fatalf("Update(set key) error = %v", err)
	}
	if _, err := store.Update(UpdateSettingsRequest{
		Settings:    DefaultSettings(),
		ClearAPIKey: true,
	}); err != nil {
		t.Fatalf("Update(clear key) error = %v", err)
	}

	snapshot := store.Snapshot()
	if snapshot.APIKeyConfigured {
		t.Fatalf("snapshot unexpectedly still reports configured api key")
	}
}
