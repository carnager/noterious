package vaults

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

const defaultVaultKey = "default"

var ErrVaultNotFound = errors.New("vault not found")

type Vault struct {
	ID        int64     `json:"id"`
	Key       string    `json:"key"`
	Name      string    `json:"name"`
	VaultPath string    `json:"vaultPath"`
	HomePage  string    `json:"homePage"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

type RuntimeRootConfig struct {
	Name      string
	VaultPath string
	HomePage  string
}

type CreateConfig struct {
	Key       string
	Name      string
	VaultPath string
	HomePage  string
}

type UpdateConfig struct {
	Key       string
	Name      string
	VaultPath string
	HomePage  string
}

type TopLevelCreateConfig struct {
	VaultRoot string
	Name      string
	HomePage  string
}

type TopLevelUpdateConfig struct {
	VaultRoot string
	Name      string
}

type Service struct {
	db   *sql.DB
	path string
}

func NewService(ctx context.Context, dataDir string) (*Service, error) {
	if err := os.MkdirAll(dataDir, 0o755); err != nil {
		return nil, fmt.Errorf("create vault data dir: %w", err)
	}
	dbPath := filepath.Join(dataDir, "noterious.db")
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("open vault sqlite: %w", err)
	}

	service := &Service{
		db:   db,
		path: dbPath,
	}
	if err := service.migrate(ctx); err != nil {
		_ = db.Close()
		return nil, err
	}
	return service, nil
}

func (s *Service) Close() error {
	if s == nil || s.db == nil {
		return nil
	}
	return s.db.Close()
}

func (s *Service) Path() string {
	return s.path
}

func (s *Service) EnsureRuntimeRoot(ctx context.Context, cfg RuntimeRootConfig) (Vault, error) {
	if s == nil {
		return Vault{}, fmt.Errorf("vault service unavailable")
	}

	name := strings.TrimSpace(cfg.Name)
	if name == "" {
		name = "Configured Vault"
	}
	vaultPath := strings.TrimSpace(cfg.VaultPath)
	if vaultPath == "" {
		return Vault{}, fmt.Errorf("configured vault path must not be empty")
	}
	homePage := strings.TrimSpace(cfg.HomePage)

	currentVault, err := s.RuntimeRoot(ctx)
	if err != nil && err != sql.ErrNoRows {
		return Vault{}, err
	}
	now := time.Now().UTC()
	if err == sql.ErrNoRows {
		result, execErr := s.db.ExecContext(ctx, `
			INSERT INTO vaults(key, name, vault_path, home_page, is_default, created_at, updated_at)
			VALUES(?, ?, ?, ?, 1, ?, ?);
		`, defaultVaultKey, name, vaultPath, homePage, now.UnixMilli(), now.UnixMilli())
		if execErr != nil {
			return Vault{}, fmt.Errorf("create configured vault record: %w", execErr)
		}
		id, execErr := result.LastInsertId()
		if execErr != nil {
			return Vault{}, fmt.Errorf("read configured vault record id: %w", execErr)
		}
		return Vault{
			ID:        id,
			Key:       defaultVaultKey,
			Name:      name,
			VaultPath: vaultPath,
			HomePage:  homePage,
			CreatedAt: now,
			UpdatedAt: now,
		}, nil
	}

	if currentVault.Name != name || currentVault.VaultPath != vaultPath || currentVault.HomePage != homePage {
		if _, err := s.db.ExecContext(ctx, `
			UPDATE vaults
			SET name = ?, vault_path = ?, home_page = ?, is_default = 1, updated_at = ?
			WHERE id = ?;
		`, name, vaultPath, homePage, now.UnixMilli(), currentVault.ID); err != nil {
			return Vault{}, fmt.Errorf("update configured vault record: %w", err)
		}
		currentVault.Name = name
		currentVault.VaultPath = vaultPath
		currentVault.HomePage = homePage
		currentVault.UpdatedAt = now
	}

	return currentVault, nil
}

func (s *Service) RuntimeRoot(ctx context.Context) (Vault, error) {
	if s == nil {
		return Vault{}, fmt.Errorf("vault service unavailable")
	}
	row := s.db.QueryRowContext(ctx, `
		SELECT id, key, name, vault_path, home_page, created_at, updated_at
		FROM vaults
		WHERE key = ?
		LIMIT 1;
	`, defaultVaultKey)

	var vaultRecord Vault
	var createdAtMillis int64
	var updatedAtMillis int64
	if err := row.Scan(
		&vaultRecord.ID,
		&vaultRecord.Key,
		&vaultRecord.Name,
		&vaultRecord.VaultPath,
		&vaultRecord.HomePage,
		&createdAtMillis,
		&updatedAtMillis,
	); err != nil {
		if err == sql.ErrNoRows {
			return Vault{}, sql.ErrNoRows
		}
		return Vault{}, fmt.Errorf("load configured vault record: %w", err)
	}
	vaultRecord.CreatedAt = time.UnixMilli(createdAtMillis).UTC()
	vaultRecord.UpdatedAt = time.UnixMilli(updatedAtMillis).UTC()
	return vaultRecord, nil
}

func (s *Service) GetByID(ctx context.Context, vaultID int64) (Vault, error) {
	if s == nil {
		return Vault{}, fmt.Errorf("vault service unavailable")
	}
	if vaultID <= 0 {
		return Vault{}, ErrVaultNotFound
	}
	row := s.db.QueryRowContext(ctx, `
		SELECT id, key, name, vault_path, home_page, created_at, updated_at
		FROM vaults
		WHERE id = ?
		LIMIT 1;
	`, vaultID)
	vaultRecord, err := scanVaultRow(row)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return Vault{}, ErrVaultNotFound
		}
		return Vault{}, fmt.Errorf("load vault by id: %w", err)
	}
	return vaultRecord, nil
}

func (s *Service) List(ctx context.Context) ([]Vault, error) {
	if s == nil {
		return nil, fmt.Errorf("vault service unavailable")
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, key, name, vault_path, home_page, created_at, updated_at
		FROM vaults
		ORDER BY is_default DESC, name ASC, key ASC;
	`)
	if err != nil {
		return nil, fmt.Errorf("list vaults: %w", err)
	}
	defer rows.Close()

	vaultsList := make([]Vault, 0)
	for rows.Next() {
		vaultRecord, err := scanVaultRows(rows)
		if err != nil {
			return nil, fmt.Errorf("scan vault: %w", err)
		}
		vaultsList = append(vaultsList, vaultRecord)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate vaults: %w", err)
	}
	return vaultsList, nil
}

func (s *Service) Create(ctx context.Context, cfg CreateConfig) (Vault, error) {
	if s == nil {
		return Vault{}, fmt.Errorf("vault service unavailable")
	}
	key, name, vaultPath, homePage, err := normalizeVaultInput(cfg.Key, cfg.Name, cfg.VaultPath, cfg.HomePage)
	if err != nil {
		return Vault{}, err
	}
	if key == defaultVaultKey {
		return Vault{}, fmt.Errorf("vault key %q is reserved", key)
	}

	now := time.Now().UTC()
	result, err := s.db.ExecContext(ctx, `
		INSERT INTO vaults(key, name, vault_path, home_page, is_default, created_at, updated_at)
		VALUES(?, ?, ?, ?, 0, ?, ?);
	`, key, name, vaultPath, homePage, now.UnixMilli(), now.UnixMilli())
	if err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "unique constraint failed: vaults.key") {
			return Vault{}, fmt.Errorf("vault key already exists")
		}
		return Vault{}, fmt.Errorf("create vault: %w", err)
	}
	id, err := result.LastInsertId()
	if err != nil {
		return Vault{}, fmt.Errorf("read created vault id: %w", err)
	}
	return Vault{
		ID:        id,
		Key:       key,
		Name:      name,
		VaultPath: vaultPath,
		HomePage:  homePage,
		CreatedAt: now,
		UpdatedAt: now,
	}, nil
}

func (s *Service) CreateTopLevel(ctx context.Context, cfg TopLevelCreateConfig) (Vault, error) {
	if s == nil {
		return Vault{}, fmt.Errorf("vault service unavailable")
	}
	name, key, err := normalizeTopLevelVaultIdentity(cfg.Name)
	if err != nil {
		return Vault{}, err
	}
	vaultPath, err := TopLevelVaultPath(cfg.VaultRoot, name)
	if err != nil {
		return Vault{}, err
	}
	if err := os.MkdirAll(vaultPath, 0o755); err != nil {
		return Vault{}, fmt.Errorf("create vault directory: %w", err)
	}
	return s.Create(ctx, CreateConfig{
		Key:       key,
		Name:      name,
		VaultPath: vaultPath,
		HomePage:  strings.TrimSpace(cfg.HomePage),
	})
}

func (s *Service) Update(ctx context.Context, vaultID int64, cfg UpdateConfig) (Vault, error) {
	if s == nil {
		return Vault{}, fmt.Errorf("vault service unavailable")
	}
	if vaultID <= 0 {
		return Vault{}, ErrVaultNotFound
	}
	current, err := s.GetByID(ctx, vaultID)
	if err != nil {
		return Vault{}, err
	}
	if current.Key == defaultVaultKey {
		return Vault{}, fmt.Errorf("configured vault is managed through runtime settings")
	}

	nextKey := current.Key
	if strings.TrimSpace(cfg.Key) != "" {
		nextKey = cfg.Key
	}
	key, name, vaultPath, homePage, err := normalizeVaultInput(nextKey, cfg.Name, cfg.VaultPath, cfg.HomePage)
	if err != nil {
		return Vault{}, err
	}

	now := time.Now().UTC()
	if _, err := s.db.ExecContext(ctx, `
		UPDATE vaults
		SET key = ?, name = ?, vault_path = ?, home_page = ?, updated_at = ?
		WHERE id = ?;
	`, key, name, vaultPath, homePage, now.UnixMilli(), vaultID); err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "unique constraint failed: vaults.key") {
			return Vault{}, fmt.Errorf("vault name already exists")
		}
		return Vault{}, fmt.Errorf("update vault: %w", err)
	}
	current.Key = key
	current.Name = name
	current.VaultPath = vaultPath
	current.HomePage = homePage
	current.UpdatedAt = now
	return current, nil
}

func (s *Service) UpdateTopLevel(ctx context.Context, vaultID int64, cfg TopLevelUpdateConfig) (Vault, error) {
	if s == nil {
		return Vault{}, fmt.Errorf("vault service unavailable")
	}
	current, err := s.GetByID(ctx, vaultID)
	if err != nil {
		return Vault{}, err
	}
	if current.Key == defaultVaultKey {
		return Vault{}, fmt.Errorf("configured vault is managed through runtime settings")
	}
	name, key, err := normalizeTopLevelVaultIdentity(cfg.Name)
	if err != nil {
		return Vault{}, err
	}
	vaultPath, err := TopLevelVaultPath(cfg.VaultRoot, name)
	if err != nil {
		return Vault{}, err
	}
	moved := false
	if filepath.Clean(current.VaultPath) != filepath.Clean(vaultPath) {
		if err := moveVaultDir(current.VaultPath, vaultPath); err != nil {
			return Vault{}, err
		}
		moved = true
	}
	updated, err := s.Update(ctx, vaultID, UpdateConfig{
		Key:       key,
		Name:      name,
		VaultPath: vaultPath,
		HomePage:  current.HomePage,
	})
	if err != nil && moved {
		_ = moveVaultDir(vaultPath, current.VaultPath)
	}
	if err != nil {
		return Vault{}, err
	}
	return updated, nil
}

func moveVaultDir(currentPath string, nextPath string) error {
	currentPath = filepath.Clean(strings.TrimSpace(currentPath))
	nextPath = filepath.Clean(strings.TrimSpace(nextPath))
	if currentPath == "" || nextPath == "" {
		return fmt.Errorf("vault folder path is required")
	}
	if currentPath == nextPath {
		return nil
	}
	if _, err := os.Stat(currentPath); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return fmt.Errorf("current vault folder does not exist")
		}
		return fmt.Errorf("check current vault folder: %w", err)
	}
	if _, err := os.Stat(nextPath); err == nil {
		return fmt.Errorf("vault folder already exists")
	} else if !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("check target vault folder: %w", err)
	}
	if err := os.MkdirAll(filepath.Dir(nextPath), 0o755); err != nil {
		return fmt.Errorf("create target vault parent dir: %w", err)
	}
	if err := os.Rename(currentPath, nextPath); err != nil {
		return fmt.Errorf("move vault folder: %w", err)
	}
	return nil
}

func normalizeTopLevelVaultIdentity(name string) (string, string, error) {
	normalizedName := strings.TrimSpace(name)
	if normalizedName == "" {
		return "", "", fmt.Errorf("vault name is required")
	}
	_, ok := normalizeVaultSlug(normalizedName)
	if !ok {
		return "", "", fmt.Errorf("vault name must include at least one letter or number")
	}
	return normalizedName, topLevelVaultKey(normalizedName), nil
}

func normalizeVaultSlug(value string) (string, bool) {
	normalized := strings.ToLower(strings.TrimSpace(value))
	if normalized == "" {
		return "", false
	}
	var builder strings.Builder
	lastDash := false
	for _, r := range normalized {
		switch {
		case r >= 'a' && r <= 'z':
			builder.WriteRune(r)
			lastDash = false
		case r >= '0' && r <= '9':
			builder.WriteRune(r)
			lastDash = false
		default:
			if builder.Len() > 0 && !lastDash {
				builder.WriteByte('-')
				lastDash = true
			}
		}
	}
	slug := strings.Trim(builder.String(), "-")
	return slug, slug != ""
}

func (s *Service) ListDiscoveredTopLevel(ctx context.Context, vaultRoot string) ([]Vault, error) {
	if s == nil {
		return nil, fmt.Errorf("vault service unavailable")
	}
	rootPath := filepath.Clean(strings.TrimSpace(vaultRoot))
	if rootPath == "" {
		return nil, fmt.Errorf("vault root must not be empty")
	}
	info, err := os.Stat(rootPath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return []Vault{}, nil
		}
		return nil, fmt.Errorf("inspect vault root: %w", err)
	}
	if !info.IsDir() {
		return nil, fmt.Errorf("vault root is not a directory")
	}

	entries, err := os.ReadDir(rootPath)
	if err != nil {
		return nil, fmt.Errorf("read vault root: %w", err)
	}

	allVaults, err := s.List(ctx)
	if err != nil {
		return nil, err
	}
	knownByPath := make(map[string]Vault, len(allVaults))
	knownByLoosePath := make(map[string]Vault, len(allVaults))
	knownByKey := make(map[string]Vault, len(allVaults))
	for _, knownVault := range allVaults {
		if knownVault.Key == defaultVaultKey {
			continue
		}
		cleanPath := filepath.Clean(knownVault.VaultPath)
		knownByPath[cleanPath] = knownVault
		knownByLoosePath[strings.ToLower(cleanPath)] = knownVault
		knownByKey[knownVault.Key] = knownVault
	}

	discovered := make([]Vault, 0, len(entries))
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		name := strings.TrimSpace(entry.Name())
		if name == "" || strings.HasPrefix(name, ".") {
			continue
		}
		vaultPath := filepath.Join(rootPath, entry.Name())
		cleanPath := filepath.Clean(vaultPath)
		if existingVault, ok := knownByPath[cleanPath]; ok {
			discovered = append(discovered, existingVault)
			continue
		}
		vaultKey := topLevelVaultKey(entry.Name())
		if existingVault, ok := knownByLoosePath[strings.ToLower(cleanPath)]; ok {
			if existingVault.VaultPath != cleanPath || existingVault.Name != entry.Name() {
				existingVault, err = s.Update(ctx, existingVault.ID, UpdateConfig{
					Name:      entry.Name(),
					VaultPath: cleanPath,
					HomePage:  existingVault.HomePage,
				})
				if err != nil {
					return nil, err
				}
			}
			discovered = append(discovered, existingVault)
			continue
		}
		if existingVault, ok := knownByKey[vaultKey]; ok {
			if existingVault.VaultPath != cleanPath || existingVault.Name != entry.Name() {
				existingVault, err = s.Update(ctx, existingVault.ID, UpdateConfig{
					Name:      entry.Name(),
					VaultPath: cleanPath,
					HomePage:  existingVault.HomePage,
				})
				if err != nil {
					return nil, err
				}
			}
			discovered = append(discovered, existingVault)
			continue
		}
		existing, lookupErr := s.vaultByKey(ctx, vaultKey)
		if lookupErr == nil {
			if existing.VaultPath != cleanPath || existing.Name != entry.Name() {
				existing, err = s.Update(ctx, existing.ID, UpdateConfig{
					Name:      entry.Name(),
					VaultPath: cleanPath,
					HomePage:  existing.HomePage,
				})
				if err != nil {
					return nil, err
				}
			}
			discovered = append(discovered, existing)
			continue
		}
		if !errors.Is(lookupErr, ErrVaultNotFound) {
			return nil, lookupErr
		}
		createdVault, err := s.Create(ctx, CreateConfig{
			Key:       vaultKey,
			Name:      entry.Name(),
			VaultPath: cleanPath,
			HomePage:  "",
		})
		if err != nil {
			return nil, err
		}
		discovered = append(discovered, createdVault)
	}
	sort.Slice(discovered, func(i int, j int) bool {
		leftName := strings.ToLower(strings.TrimSpace(discovered[i].Name))
		rightName := strings.ToLower(strings.TrimSpace(discovered[j].Name))
		if leftName == rightName {
			return discovered[i].ID < discovered[j].ID
		}
		return leftName < rightName
	})
	return discovered, nil
}

func (s *Service) migrate(ctx context.Context) error {
	statements := []string{
		`PRAGMA journal_mode = WAL;`,
		`PRAGMA foreign_keys = ON;`,
		`CREATE TABLE IF NOT EXISTS vaults (
			id INTEGER PRIMARY KEY,
			key TEXT NOT NULL UNIQUE,
			name TEXT NOT NULL,
			vault_path TEXT NOT NULL,
			home_page TEXT NOT NULL DEFAULT '',
			is_default INTEGER NOT NULL DEFAULT 0,
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL
		);`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_vaults_key ON vaults(key);`,
	}
	for _, statement := range statements {
		if _, err := s.db.ExecContext(ctx, statement); err != nil {
			return fmt.Errorf("migrate vault sqlite: %w", err)
		}
	}
	return nil
}

func normalizeVaultInput(key string, name string, vaultPath string, homePage string) (string, string, string, string, error) {
	normalizedKey, ok := normalizeVaultKey(key)
	if !ok {
		return "", "", "", "", fmt.Errorf("vault key is required and may only contain lowercase letters, numbers, dashes, or underscores")
	}
	normalizedName := strings.TrimSpace(name)
	if normalizedName == "" {
		normalizedName = normalizedKey
	}
	normalizedVaultPath := strings.TrimSpace(vaultPath)
	if normalizedVaultPath == "" {
		return "", "", "", "", fmt.Errorf("vault path must not be empty")
	}
	normalizedHomePage := strings.TrimSpace(homePage)
	return normalizedKey, normalizedName, normalizedVaultPath, normalizedHomePage, nil
}

func TopLevelVaultPath(vaultRoot string, name string) (string, error) {
	rootPath := filepath.Clean(strings.TrimSpace(vaultRoot))
	if rootPath == "" {
		return "", fmt.Errorf("vault root must not be empty")
	}
	normalizedName := strings.TrimSpace(name)
	if normalizedName == "" {
		return "", fmt.Errorf("vault name is required")
	}
	folderSlug, ok := normalizeVaultSlug(normalizedName)
	if !ok {
		return "", fmt.Errorf("vault name must include at least one letter or number")
	}
	return filepath.Join(rootPath, folderSlug), nil
}

func topLevelVaultKey(folderName string) string {
	folderSlug, ok := normalizeVaultSlug(folderName)
	if !ok {
		return "root__"
	}
	return "root__" + folderSlug
}

func normalizeVaultKey(value string) (string, bool) {
	normalized := strings.ToLower(strings.TrimSpace(value))
	if normalized == "" {
		return "", false
	}
	for _, r := range normalized {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '-' || r == '_' {
			continue
		}
		return "", false
	}
	return normalized, true
}

func scanVaultRow(row *sql.Row) (Vault, error) {
	var vaultRecord Vault
	var createdAtMillis int64
	var updatedAtMillis int64
	if err := row.Scan(
		&vaultRecord.ID,
		&vaultRecord.Key,
		&vaultRecord.Name,
		&vaultRecord.VaultPath,
		&vaultRecord.HomePage,
		&createdAtMillis,
		&updatedAtMillis,
	); err != nil {
		return Vault{}, err
	}
	vaultRecord.CreatedAt = time.UnixMilli(createdAtMillis).UTC()
	vaultRecord.UpdatedAt = time.UnixMilli(updatedAtMillis).UTC()
	return vaultRecord, nil
}

func (s *Service) vaultByKey(ctx context.Context, key string) (Vault, error) {
	if s == nil {
		return Vault{}, fmt.Errorf("vault service unavailable")
	}
	normalizedKey, ok := normalizeVaultKey(key)
	if !ok {
		return Vault{}, ErrVaultNotFound
	}
	row := s.db.QueryRowContext(ctx, `
		SELECT id, key, name, vault_path, home_page, created_at, updated_at
		FROM vaults
		WHERE key = ?
		LIMIT 1;
	`, normalizedKey)
	vaultRecord, err := scanVaultRow(row)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return Vault{}, ErrVaultNotFound
		}
		return Vault{}, fmt.Errorf("load vault by key: %w", err)
	}
	return vaultRecord, nil
}

type vaultScanner interface {
	Scan(dest ...any) error
}

func scanVaultRows(scanner vaultScanner) (Vault, error) {
	var vaultRecord Vault
	var createdAtMillis int64
	var updatedAtMillis int64
	if err := scanner.Scan(
		&vaultRecord.ID,
		&vaultRecord.Key,
		&vaultRecord.Name,
		&vaultRecord.VaultPath,
		&vaultRecord.HomePage,
		&createdAtMillis,
		&updatedAtMillis,
	); err != nil {
		return Vault{}, err
	}
	vaultRecord.CreatedAt = time.UnixMilli(createdAtMillis).UTC()
	vaultRecord.UpdatedAt = time.UnixMilli(updatedAtMillis).UTC()
	return vaultRecord, nil
}
