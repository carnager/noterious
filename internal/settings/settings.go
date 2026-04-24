package settings

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/carnager/noterious/internal/config"
)

type Hotkeys struct {
	QuickSwitcher  string `json:"quickSwitcher"`
	GlobalSearch   string `json:"globalSearch"`
	CommandPalette string `json:"commandPalette"`
	QuickNote      string `json:"quickNote"`
	Help           string `json:"help"`
	SaveCurrent    string `json:"saveCurrentPage"`
	ToggleRawMode  string `json:"toggleRawMode"`
}

type Preferences struct {
	Hotkeys Hotkeys `json:"hotkeys"`
	UI      UI      `json:"ui"`
}

type UI struct {
	FontFamily     string `json:"fontFamily"`
	FontSize       string `json:"fontSize"`
	DateTimeFormat string `json:"dateTimeFormat"`
}

type Notifications struct {
	NtfyTopicURL string `json:"ntfyTopicUrl"`
	NtfyToken    string `json:"ntfyToken"`
	NtfyInterval string `json:"ntfyInterval"`
}

type Workspace struct {
	VaultPath string `json:"vaultPath"`
	HomePage  string `json:"homePage"`
}

type AppSettings struct {
	Preferences   Preferences   `json:"preferences"`
	Workspace     Workspace     `json:"workspace"`
	Notifications Notifications `json:"notifications"`
}

type Snapshot struct {
	Settings         AppSettings `json:"settings"`
	AppliedWorkspace Workspace   `json:"appliedWorkspace"`
	RestartRequired  bool        `json:"restartRequired"`
}

type Store struct {
	mu                   sync.RWMutex
	path                 string
	settings             AppSettings
	defaultSettings      AppSettings
	appliedWorkspace     Workspace
	appliedNotifications Notifications
}

func DefaultSettingsFromConfig(cfg config.Config) AppSettings {
	return AppSettings{
		Preferences: Preferences{
			Hotkeys: Hotkeys{
				QuickSwitcher:  "Mod+K",
				GlobalSearch:   "Mod+Shift+K",
				CommandPalette: "Mod+Shift+P",
				QuickNote:      "",
				Help:           "?",
				SaveCurrent:    "Mod+S",
				ToggleRawMode:  "Mod+E",
			},
			UI: UI{
				FontFamily:     "mono",
				FontSize:       "16",
				DateTimeFormat: "browser",
			},
		},
		Workspace: Workspace{
			VaultPath: strings.TrimSpace(cfg.VaultPath),
			HomePage:  strings.TrimSpace(cfg.HomePage),
		},
		Notifications: Notifications{
			NtfyTopicURL: strings.TrimSpace(cfg.NtfyTopicURL),
			NtfyToken:    strings.TrimSpace(cfg.NtfyToken),
			NtfyInterval: strings.TrimSpace(cfg.NtfyInterval.String()),
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
	store.appliedWorkspace = Workspace{
		VaultPath: loaded.Workspace.VaultPath,
		HomePage:  loaded.Workspace.HomePage,
	}
	store.appliedNotifications = Notifications{
		NtfyTopicURL: loaded.Notifications.NtfyTopicURL,
		NtfyToken:    loaded.Notifications.NtfyToken,
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
	return snapshotForApplied(s.settings, s.appliedWorkspace, s.appliedNotifications)
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
	return snapshotForApplied(s.settings, s.appliedWorkspace, s.appliedNotifications), nil
}

func (s *Store) SetAppliedRuntime(settings AppSettings) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.appliedWorkspace.VaultPath = strings.TrimSpace(settings.Workspace.VaultPath)
	s.appliedWorkspace.HomePage = strings.TrimSpace(s.settings.Workspace.HomePage)
	s.appliedNotifications.NtfyTopicURL = strings.TrimSpace(settings.Notifications.NtfyTopicURL)
	s.appliedNotifications.NtfyToken = strings.TrimSpace(settings.Notifications.NtfyToken)
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

	if strings.TrimSpace(normalized.Workspace.VaultPath) == "" {
		normalized.Workspace.VaultPath = defaults.Workspace.VaultPath
	}
	normalized.Workspace.VaultPath = strings.TrimSpace(normalized.Workspace.VaultPath)
	normalized.Workspace.HomePage = strings.TrimSpace(normalized.Workspace.HomePage)
	normalized.Notifications.NtfyTopicURL = strings.TrimSpace(normalized.Notifications.NtfyTopicURL)
	normalized.Notifications.NtfyToken = strings.TrimSpace(normalized.Notifications.NtfyToken)
	if strings.TrimSpace(normalized.Notifications.NtfyInterval) == "" {
		normalized.Notifications.NtfyInterval = defaults.Notifications.NtfyInterval
	}
	normalized.Notifications.NtfyInterval = strings.TrimSpace(normalized.Notifications.NtfyInterval)

	if strings.TrimSpace(normalized.Preferences.Hotkeys.QuickSwitcher) == "" {
		normalized.Preferences.Hotkeys.QuickSwitcher = defaults.Preferences.Hotkeys.QuickSwitcher
	}
	if strings.TrimSpace(normalized.Preferences.Hotkeys.GlobalSearch) == "" {
		normalized.Preferences.Hotkeys.GlobalSearch = defaults.Preferences.Hotkeys.GlobalSearch
	}
	if strings.TrimSpace(normalized.Preferences.Hotkeys.CommandPalette) == "" {
		normalized.Preferences.Hotkeys.CommandPalette = defaults.Preferences.Hotkeys.CommandPalette
	}
	if strings.TrimSpace(normalized.Preferences.Hotkeys.QuickNote) == "" {
		normalized.Preferences.Hotkeys.QuickNote = defaults.Preferences.Hotkeys.QuickNote
	}
	if strings.TrimSpace(normalized.Preferences.Hotkeys.Help) == "" {
		normalized.Preferences.Hotkeys.Help = defaults.Preferences.Hotkeys.Help
	}
	if strings.TrimSpace(normalized.Preferences.Hotkeys.SaveCurrent) == "" {
		normalized.Preferences.Hotkeys.SaveCurrent = defaults.Preferences.Hotkeys.SaveCurrent
	}
	if strings.TrimSpace(normalized.Preferences.Hotkeys.ToggleRawMode) == "" {
		normalized.Preferences.Hotkeys.ToggleRawMode = defaults.Preferences.Hotkeys.ToggleRawMode
	}
	if strings.TrimSpace(normalized.Preferences.UI.FontFamily) == "" {
		normalized.Preferences.UI.FontFamily = defaults.Preferences.UI.FontFamily
	}
	if strings.TrimSpace(normalized.Preferences.UI.FontSize) == "" {
		normalized.Preferences.UI.FontSize = defaults.Preferences.UI.FontSize
	}
	if strings.TrimSpace(normalized.Preferences.UI.DateTimeFormat) == "" {
		normalized.Preferences.UI.DateTimeFormat = defaults.Preferences.UI.DateTimeFormat
	}

	return normalized
}

func validateSettings(settings AppSettings) error {
	if strings.TrimSpace(settings.Workspace.VaultPath) == "" {
		return fmt.Errorf("vault path must not be empty")
	}
	switch strings.TrimSpace(settings.Preferences.UI.FontFamily) {
	case "mono", "sans", "serif":
	default:
		return fmt.Errorf("font family must be mono, sans, or serif")
	}
	switch strings.TrimSpace(settings.Preferences.UI.FontSize) {
	case "14", "15", "16", "17", "18", "19", "20":
	default:
		return fmt.Errorf("font size must be between 14 and 20")
	}
	switch strings.TrimSpace(settings.Preferences.UI.DateTimeFormat) {
	case "browser", "iso", "de":
	default:
		return fmt.Errorf("date/time format must be browser, iso, or de")
	}
	if _, err := time.ParseDuration(strings.TrimSpace(settings.Notifications.NtfyInterval)); err != nil {
		return fmt.Errorf("ntfy interval must be a valid duration")
	}
	return nil
}

func snapshotFor(settings AppSettings, applied Workspace) Snapshot {
	return snapshotForApplied(settings, applied, Notifications{})
}

func snapshotForApplied(settings AppSettings, applied Workspace, appliedNotifications Notifications) Snapshot {
	effectiveApplied := Workspace{
		VaultPath: strings.TrimSpace(applied.VaultPath),
		HomePage:  strings.TrimSpace(settings.Workspace.HomePage),
	}
	restartRequired := !strings.EqualFold(strings.TrimSpace(settings.Workspace.VaultPath), strings.TrimSpace(applied.VaultPath))
	if !restartRequired {
		restartRequired = strings.TrimSpace(settings.Notifications.NtfyTopicURL) != strings.TrimSpace(appliedNotifications.NtfyTopicURL) ||
			strings.TrimSpace(settings.Notifications.NtfyToken) != strings.TrimSpace(appliedNotifications.NtfyToken) ||
			strings.TrimSpace(settings.Notifications.NtfyInterval) != strings.TrimSpace(appliedNotifications.NtfyInterval)
	}
	return Snapshot{
		Settings:         settings,
		AppliedWorkspace: effectiveApplied,
		RestartRequired:  restartRequired,
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
