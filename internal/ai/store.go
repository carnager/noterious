package ai

import (
	"encoding/json"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

const (
	defaultProviderName = "openai-compatible"
	settingsFileName    = "ai-settings.json"
	apiKeyFileName      = "ai-api-key.txt"
)

type Settings struct {
	Enabled  bool   `json:"enabled"`
	Provider string `json:"provider"`
	BaseURL  string `json:"baseUrl"`
	Model    string `json:"model"`
}

type SettingsResponse struct {
	Settings         Settings `json:"settings"`
	APIKeyConfigured bool     `json:"apiKeyConfigured"`
}

type UpdateSettingsRequest struct {
	Settings    Settings `json:"settings"`
	APIKey      string   `json:"apiKey,omitempty"`
	ClearAPIKey bool     `json:"clearApiKey,omitempty"`
}

type Store struct {
	mu           sync.RWMutex
	settingsPath string
	apiKeyPath   string
	settings     Settings
	defaults     Settings
}

func DefaultSettings() Settings {
	return Settings{
		Enabled:  false,
		Provider: defaultProviderName,
		BaseURL:  "https://api.openai.com/v1",
		Model:    "gpt-5-mini",
	}
}

func NewStore(dataDir string, defaults Settings) (*Store, error) {
	if strings.TrimSpace(dataDir) == "" {
		return nil, fmt.Errorf("data dir must not be empty")
	}
	if err := os.MkdirAll(dataDir, 0o755); err != nil {
		return nil, fmt.Errorf("create ai settings dir: %w", err)
	}

	store := &Store{
		settingsPath: filepath.Join(dataDir, settingsFileName),
		apiKeyPath:   filepath.Join(dataDir, apiKeyFileName),
		defaults:     normalizeSettings(defaults, defaults),
	}

	loaded, err := store.load()
	if err != nil {
		return nil, err
	}
	store.settings = loaded
	return store, nil
}

func (s *Store) Snapshot() SettingsResponse {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return SettingsResponse{
		Settings:         s.settings,
		APIKeyConfigured: s.apiKeyConfiguredLocked(),
	}
}

func (s *Store) Update(request UpdateSettingsRequest) (SettingsResponse, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	normalized := normalizeSettings(request.Settings, s.defaults)
	if err := validateSettings(normalized); err != nil {
		return SettingsResponse{}, err
	}

	if err := writeSettingsFile(s.settingsPath, normalized); err != nil {
		return SettingsResponse{}, err
	}
	s.settings = normalized

	switch {
	case request.ClearAPIKey:
		if err := os.Remove(s.apiKeyPath); err != nil && !os.IsNotExist(err) {
			return SettingsResponse{}, fmt.Errorf("clear ai api key: %w", err)
		}
	case strings.TrimSpace(request.APIKey) != "":
		if err := os.WriteFile(s.apiKeyPath, []byte(strings.TrimSpace(request.APIKey)+"\n"), 0o600); err != nil {
			return SettingsResponse{}, fmt.Errorf("write ai api key: %w", err)
		}
	}

	return SettingsResponse{
		Settings:         s.settings,
		APIKeyConfigured: s.apiKeyConfiguredLocked(),
	}, nil
}

func (s *Store) Resolve() (Settings, string, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	raw, err := os.ReadFile(s.apiKeyPath)
	if err != nil {
		if os.IsNotExist(err) {
			return s.settings, "", nil
		}
		return Settings{}, "", fmt.Errorf("read ai api key: %w", err)
	}
	return s.settings, strings.TrimSpace(string(raw)), nil
}

func (s *Store) apiKeyConfiguredLocked() bool {
	raw, err := os.ReadFile(s.apiKeyPath)
	if err != nil {
		return false
	}
	return strings.TrimSpace(string(raw)) != ""
}

func (s *Store) load() (Settings, error) {
	raw, err := os.ReadFile(s.settingsPath)
	if err != nil {
		if os.IsNotExist(err) {
			if err := writeSettingsFile(s.settingsPath, s.defaults); err != nil {
				return Settings{}, err
			}
			return s.defaults, nil
		}
		return Settings{}, fmt.Errorf("read ai settings: %w", err)
	}

	var loaded Settings
	if err := json.Unmarshal(raw, &loaded); err != nil {
		return Settings{}, fmt.Errorf("decode ai settings: %w", err)
	}

	normalized := normalizeSettings(loaded, s.defaults)
	if err := validateSettings(normalized); err != nil {
		return Settings{}, err
	}
	return normalized, nil
}

func normalizeSettings(input Settings, defaults Settings) Settings {
	normalized := input
	if strings.TrimSpace(normalized.Provider) == "" {
		normalized.Provider = defaults.Provider
	}
	if strings.TrimSpace(normalized.BaseURL) == "" {
		normalized.BaseURL = defaults.BaseURL
	}
	if strings.TrimSpace(normalized.Model) == "" {
		normalized.Model = defaults.Model
	}
	normalized.Provider = strings.TrimSpace(strings.ToLower(normalized.Provider))
	normalized.BaseURL = strings.TrimSpace(normalized.BaseURL)
	normalized.Model = strings.TrimSpace(normalized.Model)
	return normalized
}

func validateSettings(settings Settings) error {
	if settings.Provider != defaultProviderName {
		return fmt.Errorf("provider must be %q", defaultProviderName)
	}
	if settings.BaseURL == "" {
		return fmt.Errorf("base URL must not be empty")
	}
	parsed, err := url.Parse(settings.BaseURL)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return fmt.Errorf("base URL must be an absolute http or https URL")
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return fmt.Errorf("base URL must use http or https")
	}
	if strings.TrimSpace(settings.Model) == "" {
		return fmt.Errorf("model must not be empty")
	}
	return nil
}

func writeSettingsFile(path string, payload Settings) error {
	raw, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		return fmt.Errorf("encode ai settings: %w", err)
	}
	raw = append(raw, '\n')
	tempPath := path + ".tmp"
	if err := os.WriteFile(tempPath, raw, 0o644); err != nil {
		return fmt.Errorf("write ai settings: %w", err)
	}
	if err := os.Rename(tempPath, path); err != nil {
		return fmt.Errorf("replace ai settings: %w", err)
	}
	return nil
}
