package themes

import (
	"bytes"
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

//go:embed builtin/*.json
var builtinFS embed.FS

type Source string

const (
	SourceBuiltin Source = "builtin"
	SourceCustom  Source = "custom"
)

type Kind string

const (
	KindDark  Kind = "dark"
	KindLight Kind = "light"
)

const (
	CurrentVersion = 1
	MaxUploadBytes = 256 << 10
	DefaultThemeID = "noterious-night"
)

var (
	ErrThemeNotFound = errors.New("theme not found")
	ErrThemeExists   = errors.New("theme already exists")
	ErrBuiltinTheme  = errors.New("built-in theme cannot be deleted")
	ErrInvalidTheme  = errors.New("invalid theme")
)

var builtinThemeOrder = []string{
	"noterious-night",
	"paper",
	"arc",
	"arc-dark",
	"nord",
	"dracula",
	"solarized-light",
	"solarized-dark",
	"catppuccin-latte",
	"catppuccin-mocha",
	"base16-ocean",
	"base16-eighties",
	"base16-material",
	"spruce",
	"graphite",
}

var allowedTokenKeys = []string{
	"bg",
	"bgGradientStart",
	"bgGradientEnd",
	"bgGlowA",
	"bgGlowB",
	"sidebar",
	"sidebarSoft",
	"panel",
	"panelStrong",
	"surface",
	"surfaceSoft",
	"overlay",
	"overlaySoft",
	"table",
	"tableHeader",
	"editorOverlay",
	"ink",
	"muted",
	"accent",
	"accentSoft",
	"warn",
	"line",
	"lineStrong",
	"focusRing",
	"selection",
	"shadow",
	"themeColor",
}

var allowedTokenSet = func() map[string]struct{} {
	result := make(map[string]struct{}, len(allowedTokenKeys))
	for _, key := range allowedTokenKeys {
		result[key] = struct{}{}
	}
	return result
}()

var (
	hexColorPattern      = regexp.MustCompile(`^#[0-9a-fA-F]{3,8}$`)
	functionColorPattern = regexp.MustCompile(`^(rgb|rgba|hsl|hsla|oklch|oklab|lab|lch|color|color-mix)\(`)
	slugPattern          = regexp.MustCompile(`[^a-z0-9]+`)
)

type Tokens map[string]string

type Record struct {
	Version     int    `json:"version"`
	ID          string `json:"id"`
	Name        string `json:"name"`
	Source      Source `json:"source"`
	Kind        Kind   `json:"kind"`
	Description string `json:"description"`
	Tokens      Tokens `json:"tokens"`
}

type Service struct {
	customDir string
	builtins  map[string]Record
}

func NewService(dataDir string) (*Service, error) {
	root := strings.TrimSpace(dataDir)
	if root == "" {
		return nil, fmt.Errorf("data dir must not be empty")
	}
	customDir := filepath.Join(root, "themes")
	if err := os.MkdirAll(customDir, 0o755); err != nil {
		return nil, fmt.Errorf("create theme dir: %w", err)
	}
	builtins, err := loadBuiltins()
	if err != nil {
		return nil, err
	}
	return &Service{
		customDir: customDir,
		builtins:  builtins,
	}, nil
}

func (s *Service) List() ([]Record, error) {
	custom, err := s.loadCustom()
	if err != nil {
		return nil, err
	}
	result := make([]Record, 0, len(s.builtins)+len(custom))
	for _, id := range builtinThemeOrder {
		if theme, ok := s.builtins[id]; ok {
			result = append(result, theme)
		}
	}
	customThemes := make([]Record, 0, len(custom))
	for _, theme := range custom {
		customThemes = append(customThemes, theme)
	}
	sort.Slice(customThemes, func(i, j int) bool {
		if customThemes[i].Name == customThemes[j].Name {
			return customThemes[i].ID < customThemes[j].ID
		}
		return customThemes[i].Name < customThemes[j].Name
	})
	result = append(result, customThemes...)
	return result, nil
}

func (s *Service) Get(id string) (Record, error) {
	normalizedID := normalizeID(id)
	if normalizedID == "" {
		return Record{}, fmt.Errorf("%w: theme id is required", ErrInvalidTheme)
	}
	if theme, ok := s.builtins[normalizedID]; ok {
		return theme, nil
	}
	return s.loadCustomRecord(normalizedID)
}

func (s *Service) CreateFromReader(filename string, r io.Reader) (Record, error) {
	if !strings.EqualFold(filepath.Ext(strings.TrimSpace(filename)), ".json") {
		return Record{}, fmt.Errorf("%w: theme upload must be a .json file", ErrInvalidTheme)
	}
	limited := io.LimitReader(r, MaxUploadBytes+1)
	raw, err := io.ReadAll(limited)
	if err != nil {
		return Record{}, fmt.Errorf("read theme upload: %w", err)
	}
	if len(raw) > MaxUploadBytes {
		return Record{}, fmt.Errorf("%w: theme upload exceeds 256 KB", ErrInvalidTheme)
	}
	theme, err := decodeRecord(raw, SourceCustom)
	if err != nil {
		return Record{}, err
	}
	if _, ok := s.builtins[theme.ID]; ok {
		return Record{}, fmt.Errorf("%w: %s", ErrThemeExists, theme.ID)
	}
	if _, err := s.loadCustomRecord(theme.ID); err == nil {
		return Record{}, fmt.Errorf("%w: %s", ErrThemeExists, theme.ID)
	} else if !errors.Is(err, ErrThemeNotFound) {
		return Record{}, err
	}
	targetPath := s.customPath(theme.ID)
	if err := os.WriteFile(targetPath, append(prettyJSON(theme), '\n'), 0o644); err != nil {
		return Record{}, fmt.Errorf("write theme: %w", err)
	}
	return theme, nil
}

func (s *Service) Delete(id string) error {
	normalizedID := normalizeID(id)
	if normalizedID == "" {
		return fmt.Errorf("%w: theme id is required", ErrInvalidTheme)
	}
	if _, ok := s.builtins[normalizedID]; ok {
		return ErrBuiltinTheme
	}
	targetPath := s.customPath(normalizedID)
	if err := os.Remove(targetPath); err != nil {
		if os.IsNotExist(err) {
			return ErrThemeNotFound
		}
		return fmt.Errorf("delete theme: %w", err)
	}
	return nil
}

func (s *Service) customPath(id string) string {
	return filepath.Join(s.customDir, id+".json")
}

func (s *Service) loadCustom() (map[string]Record, error) {
	entries, err := os.ReadDir(s.customDir)
	if err != nil {
		return nil, fmt.Errorf("list custom themes: %w", err)
	}
	result := make(map[string]Record, len(entries))
	for _, entry := range entries {
		if entry.IsDir() || !strings.EqualFold(filepath.Ext(entry.Name()), ".json") {
			continue
		}
		id := normalizeID(strings.TrimSuffix(entry.Name(), filepath.Ext(entry.Name())))
		theme, err := s.loadCustomRecord(id)
		if err != nil {
			return nil, err
		}
		result[id] = theme
	}
	return result, nil
}

func (s *Service) loadCustomRecord(id string) (Record, error) {
	raw, err := os.ReadFile(s.customPath(id))
	if err != nil {
		if os.IsNotExist(err) {
			return Record{}, ErrThemeNotFound
		}
		return Record{}, fmt.Errorf("read theme: %w", err)
	}
	return decodeRecord(raw, SourceCustom)
}

func loadBuiltins() (map[string]Record, error) {
	files, err := fs.Glob(builtinFS, "builtin/*.json")
	if err != nil {
		return nil, fmt.Errorf("list built-in themes: %w", err)
	}
	result := make(map[string]Record, len(files))
	for _, name := range files {
		raw, err := builtinFS.ReadFile(name)
		if err != nil {
			return nil, fmt.Errorf("read built-in theme %s: %w", name, err)
		}
		theme, err := decodeRecord(raw, SourceBuiltin)
		if err != nil {
			return nil, fmt.Errorf("decode built-in theme %s: %w", name, err)
		}
		if _, exists := result[theme.ID]; exists {
			return nil, fmt.Errorf("duplicate built-in theme id %q", theme.ID)
		}
		result[theme.ID] = theme
	}
	for _, id := range builtinThemeOrder {
		if _, ok := result[id]; !ok {
			return nil, fmt.Errorf("missing built-in theme %q", id)
		}
	}
	return result, nil
}

func decodeRecord(raw []byte, source Source) (Record, error) {
	var theme Record
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&theme); err != nil {
		return Record{}, fmt.Errorf("%w: malformed theme JSON", ErrInvalidTheme)
	}
	if err := validateRecord(&theme, source); err != nil {
		return Record{}, err
	}
	return theme, nil
}

func validateRecord(theme *Record, source Source) error {
	if theme.Version != CurrentVersion {
		return fmt.Errorf("%w: unsupported theme version", ErrInvalidTheme)
	}
	theme.Name = strings.TrimSpace(theme.Name)
	theme.Description = strings.TrimSpace(theme.Description)
	if theme.Name == "" {
		return fmt.Errorf("%w: theme name is required", ErrInvalidTheme)
	}
	theme.ID = normalizeID(coalesce(theme.ID, theme.Name))
	if theme.ID == "" {
		return fmt.Errorf("%w: theme id is required", ErrInvalidTheme)
	}
	switch theme.Kind {
	case KindDark, KindLight:
	default:
		return fmt.Errorf("%w: theme kind must be dark or light", ErrInvalidTheme)
	}
	theme.Source = source
	if len(theme.Tokens) != len(allowedTokenKeys) {
		return fmt.Errorf("%w: theme must define all approved tokens", ErrInvalidTheme)
	}
	for key, value := range theme.Tokens {
		if _, ok := allowedTokenSet[key]; !ok {
			return fmt.Errorf("%w: unknown token %q", ErrInvalidTheme, key)
		}
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			return fmt.Errorf("%w: token %q must not be empty", ErrInvalidTheme, key)
		}
		if key == "shadow" {
			if strings.ContainsAny(trimmed, "{};") || len(trimmed) > 160 {
				return fmt.Errorf("%w: token %q is invalid", ErrInvalidTheme, key)
			}
		} else if !looksLikeColor(trimmed) {
			return fmt.Errorf("%w: token %q must be a CSS color", ErrInvalidTheme, key)
		}
		theme.Tokens[key] = trimmed
	}
	for _, key := range allowedTokenKeys {
		if _, ok := theme.Tokens[key]; !ok {
			return fmt.Errorf("%w: missing token %q", ErrInvalidTheme, key)
		}
	}
	return nil
}

func normalizeID(value string) string {
	source := strings.ToLower(strings.TrimSpace(value))
	if source == "" {
		return ""
	}
	source = slugPattern.ReplaceAllString(source, "-")
	source = strings.Trim(source, "-")
	return source
}

func looksLikeColor(value string) bool {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "transparent", "currentcolor":
		return true
	}
	return hexColorPattern.MatchString(value) || functionColorPattern.MatchString(strings.ToLower(value))
}

func prettyJSON(theme Record) []byte {
	raw, _ := json.MarshalIndent(theme, "", "  ")
	return raw
}

func coalesce(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}
