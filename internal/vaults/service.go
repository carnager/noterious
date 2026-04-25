package vaults

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"hash/fnv"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

const defaultVaultKey = "default"

const (
	RoleOwner = "owner"
)

var ErrVaultMembershipRequired = errors.New("vault membership required")
var ErrVaultNotFound = errors.New("vault not found")

type Vault struct {
	ID          int64     `json:"id"`
	Key         string    `json:"key"`
	Name        string    `json:"name"`
	VaultPath   string    `json:"vaultPath"`
	HomePage    string    `json:"homePage"`
	OwnerUserID int64     `json:"-"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

type Membership struct {
	VaultID   int64     `json:"vaultId"`
	UserID    int64     `json:"userId"`
	Role      string    `json:"role"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

type RuntimeRootConfig struct {
	Name      string
	VaultPath string
	HomePage  string
}

type CreateConfig struct {
	Key         string
	Name        string
	VaultPath   string
	HomePage    string
	OwnerUserID int64
}

type UpdateConfig struct {
	Key       string
	Name      string
	VaultPath string
	HomePage  string
}

type PersonalCreateConfig struct {
	VaultRoot string
	UserID    int64
	Username  string
	Name      string
	HomePage  string
}

type PersonalUpdateConfig struct {
	VaultRoot string
	Username  string
	Name      string
}

const defaultPersonalVaultName = "Main"

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
			INSERT INTO vaults(key, name, vault_path, home_page, owner_user_id, is_default, created_at, updated_at)
			VALUES(?, ?, ?, ?, 0, 1, ?, ?);
		`, defaultVaultKey, name, vaultPath, homePage, now.UnixMilli(), now.UnixMilli())
		if execErr != nil {
			return Vault{}, fmt.Errorf("create configured vault record: %w", execErr)
		}
		id, execErr := result.LastInsertId()
		if execErr != nil {
			return Vault{}, fmt.Errorf("read configured vault record id: %w", execErr)
		}
		return Vault{
			ID:          id,
			Key:         defaultVaultKey,
			Name:        name,
			VaultPath:   vaultPath,
			HomePage:    homePage,
			OwnerUserID: 0,
			CreatedAt:   now,
			UpdatedAt:   now,
		}, nil
	}

	if currentVault.Name != name || currentVault.VaultPath != vaultPath || currentVault.HomePage != homePage {
		if _, err := s.db.ExecContext(ctx, `
			UPDATE vaults
			SET name = ?, vault_path = ?, home_page = ?, owner_user_id = 0, is_default = 1, updated_at = ?
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
		SELECT id, key, name, vault_path, home_page, owner_user_id, created_at, updated_at
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
		&vaultRecord.OwnerUserID,
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
		SELECT id, key, name, vault_path, home_page, owner_user_id, created_at, updated_at
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
		SELECT id, key, name, vault_path, home_page, owner_user_id, created_at, updated_at
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
		INSERT INTO vaults(key, name, vault_path, home_page, owner_user_id, is_default, created_at, updated_at)
		VALUES(?, ?, ?, ?, ?, 0, ?, ?);
	`, key, name, vaultPath, homePage, cfg.OwnerUserID, now.UnixMilli(), now.UnixMilli())
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
		ID:          id,
		Key:         key,
		Name:        name,
		VaultPath:   vaultPath,
		HomePage:    homePage,
		OwnerUserID: cfg.OwnerUserID,
		CreatedAt:   now,
		UpdatedAt:   now,
	}, nil
}

func (s *Service) CreatePersonal(ctx context.Context, cfg PersonalCreateConfig) (Vault, error) {
	if s == nil {
		return Vault{}, fmt.Errorf("vault service unavailable")
	}
	name, key, err := normalizePersonalVaultIdentity(cfg.Username, cfg.Name)
	if err != nil {
		return Vault{}, err
	}
	vaultPath, err := PersonalVaultPath(cfg.VaultRoot, cfg.Username, name)
	if err != nil {
		return Vault{}, err
	}
	if err := os.MkdirAll(vaultPath, 0o755); err != nil {
		return Vault{}, fmt.Errorf("create vault directory: %w", err)
	}
	return s.Create(ctx, CreateConfig{
		Key:         key,
		Name:        name,
		VaultPath:   vaultPath,
		HomePage:    strings.TrimSpace(cfg.HomePage),
		OwnerUserID: cfg.UserID,
	})
}

func (s *Service) EnsureUserRootVault(ctx context.Context, vaultRoot string, userID int64, username string) (Vault, Membership, error) {
	if s == nil {
		return Vault{}, Membership{}, fmt.Errorf("vault service unavailable")
	}
	if userID <= 0 {
		return Vault{}, Membership{}, ErrVaultMembershipRequired
	}
	rootPath, err := PersonalRootPath(vaultRoot, username)
	if err != nil {
		return Vault{}, Membership{}, err
	}
	if err := os.MkdirAll(rootPath, 0o755); err != nil {
		return Vault{}, Membership{}, fmt.Errorf("create personal vault root: %w", err)
	}

	rootKey, err := userRootVaultKey(username)
	if err != nil {
		return Vault{}, Membership{}, err
	}
	rootName := filepath.Base(rootPath)
	if strings.TrimSpace(rootName) == "" {
		rootName = strings.TrimSpace(username)
	}

	vaultRecord, err := s.vaultByKey(ctx, rootKey)
	switch {
	case err == nil:
	case errors.Is(err, ErrVaultNotFound):
		vaultRecord, err = s.Create(ctx, CreateConfig{
			Key:         rootKey,
			Name:        rootName,
			VaultPath:   rootPath,
			HomePage:    "",
			OwnerUserID: userID,
		})
		if err != nil {
			if !strings.Contains(strings.ToLower(err.Error()), "already exists") {
				return Vault{}, Membership{}, err
			}
			vaultRecord, err = s.vaultByKey(ctx, rootKey)
			if err != nil {
				return Vault{}, Membership{}, err
			}
		}
	default:
		return Vault{}, Membership{}, err
	}

	if vaultRecord.OwnerUserID != userID {
		if err := s.reassignOwner(ctx, vaultRecord.ID, userID); err != nil {
			return Vault{}, Membership{}, err
		}
		vaultRecord.OwnerUserID = userID
	}

	if filepath.Clean(vaultRecord.VaultPath) != filepath.Clean(rootPath) || strings.TrimSpace(vaultRecord.Name) != strings.TrimSpace(rootName) {
		vaultRecord, err = s.Update(ctx, vaultRecord.ID, UpdateConfig{
			Name:      rootName,
			VaultPath: rootPath,
			HomePage:  vaultRecord.HomePage,
		})
		if err != nil {
			return Vault{}, Membership{}, err
		}
	}

	return vaultRecord, syntheticOwnerMembership(vaultRecord.ID, userID, vaultRecord.CreatedAt, vaultRecord.UpdatedAt), nil
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

func (s *Service) UpdatePersonal(ctx context.Context, vaultID int64, cfg PersonalUpdateConfig) (Vault, error) {
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
	name, key, err := normalizePersonalVaultIdentity(cfg.Username, cfg.Name)
	if err != nil {
		return Vault{}, err
	}
	vaultPath, err := PersonalVaultPath(cfg.VaultRoot, cfg.Username, name)
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

func normalizePersonalVaultIdentity(username string, name string) (string, string, error) {
	normalizedName := strings.TrimSpace(name)
	if normalizedName == "" {
		return "", "", fmt.Errorf("vault name is required")
	}
	vaultSlug, ok := normalizeVaultSlug(normalizedName)
	if !ok {
		return "", "", fmt.Errorf("vault name must include at least one letter or number")
	}
	usernameSlug, ok := normalizeVaultSlug(username)
	if !ok {
		return "", "", fmt.Errorf("username is required")
	}
	return normalizedName, usernameSlug + "__" + vaultSlug, nil
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

func (s *Service) VaultForUser(ctx context.Context, userID int64, vaultID int64) (Vault, Membership, error) {
	if s == nil {
		return Vault{}, Membership{}, fmt.Errorf("vault service unavailable")
	}
	if userID <= 0 || vaultID <= 0 {
		return Vault{}, Membership{}, ErrVaultMembershipRequired
	}

	row := s.db.QueryRowContext(ctx, `
		SELECT id, key, name, vault_path, home_page, owner_user_id, created_at, updated_at
		FROM vaults
		WHERE id = ? AND owner_user_id = ? AND is_default = 0
		LIMIT 1;
	`, vaultID, userID)

	vaultRecord, err := scanVaultRow(row)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return Vault{}, Membership{}, ErrVaultMembershipRequired
		}
		return Vault{}, Membership{}, fmt.Errorf("load vault owner mapping: %w", err)
	}
	return vaultRecord, syntheticOwnerMembership(vaultRecord.ID, userID, vaultRecord.CreatedAt, vaultRecord.UpdatedAt), nil
}

func (s *Service) ListOwnedByUser(ctx context.Context, userID int64) ([]Vault, error) {
	if s == nil {
		return nil, fmt.Errorf("vault service unavailable")
	}
	if userID <= 0 {
		return nil, ErrVaultMembershipRequired
	}

	rows, err := s.db.QueryContext(ctx, `
		SELECT id, key, name, vault_path, home_page, owner_user_id, created_at, updated_at
		FROM vaults
		WHERE owner_user_id = ? AND is_default = 0
		ORDER BY name ASC, key ASC;
	`, userID)
	if err != nil {
		return nil, fmt.Errorf("list owned vaults: %w", err)
	}
	defer rows.Close()

	vaultsList := make([]Vault, 0)
	for rows.Next() {
		vaultRecord, err := scanVaultRows(rows)
		if err != nil {
			return nil, fmt.Errorf("scan owned vault: %w", err)
		}
		vaultsList = append(vaultsList, vaultRecord)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate owned vaults: %w", err)
	}
	return vaultsList, nil
}

func (s *Service) OwnedVaultForUser(ctx context.Context, userID int64, vaultID int64) (Vault, Membership, error) {
	vaultRecord, membership, err := s.VaultForUser(ctx, userID, vaultID)
	if err != nil {
		return Vault{}, Membership{}, err
	}
	return vaultRecord, membership, nil
}

func (s *Service) EnsurePersonalVault(ctx context.Context, vaultRoot string, userID int64, username string) (Vault, Membership, error) {
	return s.EnsureUserRootVault(ctx, vaultRoot, userID, username)
}

func (s *Service) ListDiscoveredPersonal(ctx context.Context, vaultRoot string, userID int64, username string) ([]Vault, error) {
	if s == nil {
		return nil, fmt.Errorf("vault service unavailable")
	}
	if userID <= 0 {
		return nil, ErrVaultMembershipRequired
	}
	rootPath, err := PersonalRootPath(vaultRoot, username)
	if err != nil {
		return nil, err
	}
	info, err := os.Stat(rootPath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return []Vault{}, nil
		}
		return nil, fmt.Errorf("inspect personal vault root: %w", err)
	}
	if !info.IsDir() {
		return nil, fmt.Errorf("personal vault root is not a directory")
	}

	entries, err := os.ReadDir(rootPath)
	if err != nil {
		return nil, fmt.Errorf("read personal vault root: %w", err)
	}
	owned, err := s.ListOwnedByUser(ctx, userID)
	if err != nil && !errors.Is(err, ErrVaultMembershipRequired) {
		return nil, err
	}
	ownedByPath := make(map[string]Vault, len(owned))
	ownedByLoosePath := make(map[string]Vault, len(owned))
	ownedByKey := make(map[string]Vault, len(owned))
	for _, ownedVault := range owned {
		cleanPath := filepath.Clean(ownedVault.VaultPath)
		ownedByPath[cleanPath] = ownedVault
		ownedByLoosePath[strings.ToLower(cleanPath)] = ownedVault
		ownedByKey[ownedVault.Key] = ownedVault
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
		if existingVault, ok := ownedByPath[cleanPath]; ok {
			discovered = append(discovered, existingVault)
			continue
		}
		vaultKey := filesystemVaultKey(username, entry.Name())
		if existingVault, ok := ownedByLoosePath[strings.ToLower(cleanPath)]; ok {
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
		if existingVault, ok := ownedByKey[vaultKey]; ok {
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
			if existing.OwnerUserID != userID {
				if err := s.reassignOwner(ctx, existing.ID, userID); err != nil {
					return nil, err
				}
				existing.OwnerUserID = userID
			}
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
			Key:         vaultKey,
			Name:        entry.Name(),
			VaultPath:   cleanPath,
			HomePage:    "",
			OwnerUserID: userID,
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

func (s *Service) ResolveDiscoveredPersonal(ctx context.Context, vaultRoot string, userID int64, username string, vaultID int64) (Vault, Membership, error) {
	discovered, err := s.ListDiscoveredPersonal(ctx, vaultRoot, userID, username)
	if err != nil {
		return Vault{}, Membership{}, err
	}
	if len(discovered) == 0 {
		return s.EnsureUserRootVault(ctx, vaultRoot, userID, username)
	}
	if vaultID > 0 {
		for _, discoveredVault := range discovered {
			if discoveredVault.ID == vaultID {
				return s.OwnedVaultForUser(ctx, userID, discoveredVault.ID)
			}
		}
	}
	return s.OwnedVaultForUser(ctx, userID, discovered[0].ID)
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
			owner_user_id INTEGER NOT NULL DEFAULT 0,
			is_default INTEGER NOT NULL DEFAULT 0,
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL
		);`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_vaults_key ON vaults(key);`,
		`CREATE INDEX IF NOT EXISTS idx_vaults_owner_user_id ON vaults(owner_user_id);`,
	}
	for _, statement := range statements {
		if _, err := s.db.ExecContext(ctx, statement); err != nil {
			return fmt.Errorf("migrate vault sqlite: %w", err)
		}
	}
	if err := s.ensureVaultsOwnerUserIDColumn(ctx); err != nil {
		return err
	}
	return nil
}

func (s *Service) ensureVaultsOwnerUserIDColumn(ctx context.Context) error {
	rows, err := s.db.QueryContext(ctx, `PRAGMA table_info(vaults);`)
	if err != nil {
		return fmt.Errorf("inspect vaults schema: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var cid int
		var name string
		var columnType string
		var notNull int
		var defaultValue sql.NullString
		var primaryKey int
		if err := rows.Scan(&cid, &name, &columnType, &notNull, &defaultValue, &primaryKey); err != nil {
			return fmt.Errorf("scan vaults schema: %w", err)
		}
		if name == "owner_user_id" {
			return nil
		}
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("iterate vaults schema: %w", err)
	}
	if _, err := s.db.ExecContext(ctx, `ALTER TABLE vaults ADD COLUMN owner_user_id INTEGER NOT NULL DEFAULT 0;`); err != nil {
		return fmt.Errorf("add vaults.owner_user_id column: %w", err)
	}
	if _, err := s.db.ExecContext(ctx, `CREATE INDEX IF NOT EXISTS idx_vaults_owner_user_id ON vaults(owner_user_id);`); err != nil {
		return fmt.Errorf("create vaults.owner_user_id index: %w", err)
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

func syntheticOwnerMembership(vaultID int64, userID int64, createdAt time.Time, updatedAt time.Time) Membership {
	return Membership{
		VaultID:   vaultID,
		UserID:    userID,
		Role:      RoleOwner,
		CreatedAt: createdAt,
		UpdatedAt: updatedAt,
	}
}

func (s *Service) reassignOwner(ctx context.Context, vaultID int64, userID int64) error {
	if _, err := s.db.ExecContext(ctx, `
		UPDATE vaults
		SET owner_user_id = ?, updated_at = ?
		WHERE id = ?;
	`, userID, time.Now().UTC().UnixMilli(), vaultID); err != nil {
		return fmt.Errorf("reassign vault owner: %w", err)
	}
	return nil
}

func PersonalRootPath(vaultRoot string, username string) (string, error) {
	normalizedRoot := strings.TrimSpace(vaultRoot)
	if normalizedRoot == "" {
		return "", fmt.Errorf("vault root is required")
	}
	normalizedUsername, ok := normalizeVaultSlug(username)
	if !ok {
		return "", fmt.Errorf("username is required")
	}
	entries, err := os.ReadDir(normalizedRoot)
	if err == nil {
		for _, entry := range entries {
			if !entry.IsDir() {
				continue
			}
			entrySlug, ok := normalizeVaultSlug(entry.Name())
			if !ok {
				continue
			}
			if entrySlug == normalizedUsername {
				return filepath.Join(normalizedRoot, entry.Name()), nil
			}
		}
	} else if !errors.Is(err, os.ErrNotExist) {
		return "", fmt.Errorf("read vault root: %w", err)
	}
	return filepath.Join(normalizedRoot, normalizedUsername), nil
}

func PersonalVaultPath(vaultRoot string, username string, name string) (string, error) {
	rootPath, err := PersonalRootPath(vaultRoot, username)
	if err != nil {
		return "", err
	}
	normalizedName, ok := normalizeVaultSlug(name)
	if !ok {
		return "", fmt.Errorf("vault name is required")
	}
	return filepath.Join(rootPath, normalizedName), nil
}

func filesystemVaultKey(username string, folderName string) string {
	usernameSlug, ok := normalizeVaultSlug(username)
	if !ok {
		usernameSlug = "user"
	}
	folderSlug, ok := normalizeVaultSlug(folderName)
	if !ok {
		folderSlug = "vault"
	}
	hasher := fnv.New32a()
	_, _ = hasher.Write([]byte(strings.TrimSpace(folderName)))
	return fmt.Sprintf("%s__fs__%s__%08x", usernameSlug, folderSlug, hasher.Sum32())
}

func userRootVaultKey(username string) (string, error) {
	usernameSlug, ok := normalizeVaultSlug(username)
	if !ok {
		return "", fmt.Errorf("username is required")
	}
	return usernameSlug + "__root", nil
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
		&vaultRecord.OwnerUserID,
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
		SELECT id, key, name, vault_path, home_page, owner_user_id, created_at, updated_at
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
		&vaultRecord.OwnerUserID,
		&createdAtMillis,
		&updatedAtMillis,
	); err != nil {
		return Vault{}, err
	}
	vaultRecord.CreatedAt = time.UnixMilli(createdAtMillis).UTC()
	vaultRecord.UpdatedAt = time.UnixMilli(updatedAtMillis).UTC()
	return vaultRecord, nil
}
