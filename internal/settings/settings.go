package settings

import (
	"encoding/json"
	"fmt"
	"os"
	"path"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/carnager/noterious/internal/config"
)

type Notifications struct {
	NtfyInterval string `json:"ntfyInterval"`
}

type Documents struct {
	UploadPlacement string `json:"uploadPlacement"`
	UploadSubfolder string `json:"uploadSubfolder,omitempty"`
}

type Vault struct {
	VaultPath string `json:"vaultPath"`
}

type AppSettings struct {
	Vault         Vault         `json:"vault"`
	Notifications Notifications `json:"notifications"`
	Documents     Documents     `json:"documents"`
}

type Snapshot struct {
	Settings               AppSettings `json:"settings"`
	AppliedVault           Vault       `json:"appliedVault"`
	RestartRequired        bool        `json:"restartRequired"`
	RestartRequiredReasons []string    `json:"restartRequiredReasons,omitempty"`
}

type Store struct {
	mu                   sync.RWMutex
	path                 string
	settings             AppSettings
	defaultSettings      AppSettings
	appliedVault         Vault
	appliedNotifications Notifications
}

func DefaultSettingsFromConfig(cfg config.Config) AppSettings {
	return AppSettings{
		Vault: Vault{
			VaultPath: strings.TrimSpace(cfg.VaultPath),
		},
		Notifications: Notifications{
			NtfyInterval: strings.TrimSpace(cfg.NtfyInterval.String()),
		},
		Documents: Documents{
			UploadPlacement: "same-folder",
			UploadSubfolder: "_files",
		},
	}
}

func NewStore(dataDir string, defaults AppSettings) (*Store, error) {
	if strings.TrimSpace(dataDir) == "" {
		return nil, fmt.Errorf("data dir must not be empty")
	}
	if err := os.MkdirAll(dataDir, 0o755); err != nil {
		return nil, fmt.Errorf("create settings dir: %w", err)
	}

	store := &Store{
		path:            filepath.Join(dataDir, "settings.json"),
		defaultSettings: normalizeSettings(defaults, defaults),
	}

	loaded, err := store.load()
	if err != nil {
		return nil, err
	}
	store.settings = loaded
	store.appliedVault = Vault{
		VaultPath: loaded.Vault.VaultPath,
	}
	store.appliedNotifications = Notifications{
		NtfyInterval: loaded.Notifications.NtfyInterval,
	}
	return store, nil
}

func (s *Store) Path() string {
	return s.path
}

func (s *Store) Snapshot() Snapshot {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return snapshotForApplied(s.settings, s.appliedVault, s.appliedNotifications)
}

func (s *Store) Settings() AppSettings {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.settings
}

func (s *Store) Update(next AppSettings) (Snapshot, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	normalized := normalizeSettings(next, s.defaultSettings)
	if err := validateSettings(normalized); err != nil {
		return Snapshot{}, err
	}
	if err := writeJSONFile(s.path, normalized); err != nil {
		return Snapshot{}, err
	}
	s.settings = normalized
	return snapshotForApplied(s.settings, s.appliedVault, s.appliedNotifications), nil
}

func (s *Store) SetAppliedRuntime(settings AppSettings) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.appliedVault.VaultPath = strings.TrimSpace(settings.Vault.VaultPath)
	s.appliedNotifications.NtfyInterval = strings.TrimSpace(settings.Notifications.NtfyInterval)
}

func (s *Store) load() (AppSettings, error) {
	raw, err := os.ReadFile(s.path)
	if err != nil {
		if os.IsNotExist(err) {
			if err := writeJSONFile(s.path, s.defaultSettings); err != nil {
				return AppSettings{}, err
			}
			return s.defaultSettings, nil
		}
		return AppSettings{}, fmt.Errorf("read settings: %w", err)
	}

	var loaded AppSettings
	if err := json.Unmarshal(raw, &loaded); err != nil {
		return AppSettings{}, fmt.Errorf("decode settings: %w", err)
	}

	normalized := normalizeSettings(loaded, s.defaultSettings)
	if err := validateSettings(normalized); err != nil {
		return AppSettings{}, err
	}
	return normalized, nil
}

func normalizeSettings(input AppSettings, defaults AppSettings) AppSettings {
	normalized := input

	if strings.TrimSpace(normalized.Vault.VaultPath) == "" {
		normalized.Vault.VaultPath = defaults.Vault.VaultPath
	}
	normalized.Vault.VaultPath = strings.TrimSpace(normalized.Vault.VaultPath)
	if strings.TrimSpace(normalized.Notifications.NtfyInterval) == "" {
		normalized.Notifications.NtfyInterval = defaults.Notifications.NtfyInterval
	}
	normalized.Notifications.NtfyInterval = strings.TrimSpace(normalized.Notifications.NtfyInterval)
	if strings.TrimSpace(normalized.Documents.UploadPlacement) == "" {
		normalized.Documents.UploadPlacement = defaults.Documents.UploadPlacement
	}
	normalized.Documents.UploadPlacement = strings.TrimSpace(normalized.Documents.UploadPlacement)
	if strings.TrimSpace(normalized.Documents.UploadSubfolder) == "" {
		normalized.Documents.UploadSubfolder = defaults.Documents.UploadSubfolder
	}
	normalized.Documents.UploadSubfolder = normalizeUploadSubfolder(normalized.Documents.UploadSubfolder)

	return normalized
}

func validateSettings(settings AppSettings) error {
	if strings.TrimSpace(settings.Vault.VaultPath) == "" {
		return fmt.Errorf("vault path must not be empty")
	}
	if _, err := time.ParseDuration(strings.TrimSpace(settings.Notifications.NtfyInterval)); err != nil {
		return fmt.Errorf("ntfy interval must be a valid duration")
	}
	switch strings.TrimSpace(settings.Documents.UploadPlacement) {
	case "same-folder", "vault-root", "note-subfolder":
	default:
		return fmt.Errorf("document upload placement must be same-folder, vault-root, or note-subfolder")
	}
	if strings.TrimSpace(settings.Documents.UploadPlacement) == "note-subfolder" {
		subfolder := normalizeUploadSubfolder(settings.Documents.UploadSubfolder)
		if subfolder == "" {
			return fmt.Errorf("document upload subfolder must not be empty")
		}
		if subfolder == "." || subfolder == ".." || strings.HasPrefix(subfolder, "../") {
			return fmt.Errorf("document upload subfolder must be a relative path inside the vault")
		}
	}
	return nil
}

func normalizeUploadSubfolder(value string) string {
	cleaned := strings.Trim(strings.TrimSpace(value), "/")
	if cleaned == "" {
		return ""
	}
	cleaned = path.Clean(strings.ReplaceAll(cleaned, "\\", "/"))
	if cleaned == "." {
		return ""
	}
	return strings.TrimPrefix(cleaned, "/")
}

func snapshotFor(settings AppSettings, applied Vault) Snapshot {
	return snapshotForApplied(settings, applied, Notifications{})
}

func snapshotForApplied(settings AppSettings, applied Vault, appliedNotifications Notifications) Snapshot {
	effectiveApplied := Vault{
		VaultPath: strings.TrimSpace(applied.VaultPath),
	}
	restartRequiredReasons := make([]string, 0, 2)
	if !strings.EqualFold(strings.TrimSpace(settings.Vault.VaultPath), strings.TrimSpace(applied.VaultPath)) {
		restartRequiredReasons = append(restartRequiredReasons, "Vault path differs from the running server configuration.")
	}
	if strings.TrimSpace(settings.Notifications.NtfyInterval) != strings.TrimSpace(appliedNotifications.NtfyInterval) {
		restartRequiredReasons = append(restartRequiredReasons, "Notification polling interval differs from the running server configuration.")
	}
	return Snapshot{
		Settings:               settings,
		AppliedVault:           effectiveApplied,
		RestartRequired:        len(restartRequiredReasons) > 0,
		RestartRequiredReasons: restartRequiredReasons,
	}
}

func writeJSONFile(path string, payload AppSettings) error {
	raw, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		return fmt.Errorf("encode settings: %w", err)
	}
	raw = append(raw, '\n')
	tempPath := path + ".tmp"
	if err := os.WriteFile(tempPath, raw, 0o644); err != nil {
		return fmt.Errorf("write settings: %w", err)
	}
	if err := os.Rename(tempPath, path); err != nil {
		return fmt.Errorf("replace settings: %w", err)
	}
	return nil
}
