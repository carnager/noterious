package workspaces

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

const defaultWorkspaceKey = "default"

type Workspace struct {
	ID        int64     `json:"id"`
	Key       string    `json:"key"`
	Name      string    `json:"name"`
	VaultPath string    `json:"vaultPath"`
	HomePage  string    `json:"homePage"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

type DefaultConfig struct {
	Name      string
	VaultPath string
	HomePage  string
}

type Service struct {
	db   *sql.DB
	path string
}

func NewService(ctx context.Context, dataDir string) (*Service, error) {
	if err := os.MkdirAll(dataDir, 0o755); err != nil {
		return nil, fmt.Errorf("create workspace data dir: %w", err)
	}
	dbPath := filepath.Join(dataDir, "noterious.db")
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("open workspace sqlite: %w", err)
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

func (s *Service) EnsureDefault(ctx context.Context, cfg DefaultConfig) (Workspace, error) {
	if s == nil {
		return Workspace{}, fmt.Errorf("workspace service unavailable")
	}

	name := strings.TrimSpace(cfg.Name)
	if name == "" {
		name = "Default Workspace"
	}
	vaultPath := strings.TrimSpace(cfg.VaultPath)
	if vaultPath == "" {
		return Workspace{}, fmt.Errorf("default workspace vault path must not be empty")
	}
	homePage := strings.TrimSpace(cfg.HomePage)

	workspace, err := s.Default(ctx)
	if err != nil && err != sql.ErrNoRows {
		return Workspace{}, err
	}
	now := time.Now().UTC()
	if err == sql.ErrNoRows {
		result, execErr := s.db.ExecContext(ctx, `
			INSERT INTO workspaces(key, name, vault_path, home_page, is_default, created_at, updated_at)
			VALUES(?, ?, ?, ?, 1, ?, ?);
		`, defaultWorkspaceKey, name, vaultPath, homePage, now.UnixMilli(), now.UnixMilli())
		if execErr != nil {
			return Workspace{}, fmt.Errorf("create default workspace: %w", execErr)
		}
		id, execErr := result.LastInsertId()
		if execErr != nil {
			return Workspace{}, fmt.Errorf("read default workspace id: %w", execErr)
		}
		return Workspace{
			ID:        id,
			Key:       defaultWorkspaceKey,
			Name:      name,
			VaultPath: vaultPath,
			HomePage:  homePage,
			CreatedAt: now,
			UpdatedAt: now,
		}, nil
	}

	if workspace.Name != name || workspace.VaultPath != vaultPath || workspace.HomePage != homePage {
		if _, err := s.db.ExecContext(ctx, `
			UPDATE workspaces
			SET name = ?, vault_path = ?, home_page = ?, is_default = 1, updated_at = ?
			WHERE id = ?;
		`, name, vaultPath, homePage, now.UnixMilli(), workspace.ID); err != nil {
			return Workspace{}, fmt.Errorf("update default workspace: %w", err)
		}
		workspace.Name = name
		workspace.VaultPath = vaultPath
		workspace.HomePage = homePage
		workspace.UpdatedAt = now
	}

	return workspace, nil
}

func (s *Service) Default(ctx context.Context) (Workspace, error) {
	if s == nil {
		return Workspace{}, fmt.Errorf("workspace service unavailable")
	}
	row := s.db.QueryRowContext(ctx, `
		SELECT id, key, name, vault_path, home_page, created_at, updated_at
		FROM workspaces
		WHERE key = ?
		LIMIT 1;
	`, defaultWorkspaceKey)

	var workspace Workspace
	var createdAtMillis int64
	var updatedAtMillis int64
	if err := row.Scan(
		&workspace.ID,
		&workspace.Key,
		&workspace.Name,
		&workspace.VaultPath,
		&workspace.HomePage,
		&createdAtMillis,
		&updatedAtMillis,
	); err != nil {
		if err == sql.ErrNoRows {
			return Workspace{}, sql.ErrNoRows
		}
		return Workspace{}, fmt.Errorf("load default workspace: %w", err)
	}
	workspace.CreatedAt = time.UnixMilli(createdAtMillis).UTC()
	workspace.UpdatedAt = time.UnixMilli(updatedAtMillis).UTC()
	return workspace, nil
}

func (s *Service) migrate(ctx context.Context) error {
	statements := []string{
		`PRAGMA journal_mode = WAL;`,
		`PRAGMA foreign_keys = ON;`,
		`CREATE TABLE IF NOT EXISTS workspaces (
			id INTEGER PRIMARY KEY,
			key TEXT NOT NULL UNIQUE,
			name TEXT NOT NULL,
			vault_path TEXT NOT NULL,
			home_page TEXT NOT NULL DEFAULT '',
			is_default INTEGER NOT NULL DEFAULT 0,
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL
		);`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_workspaces_key ON workspaces(key);`,
	}
	for _, statement := range statements {
		if _, err := s.db.ExecContext(ctx, statement); err != nil {
			return fmt.Errorf("migrate workspace sqlite: %w", err)
		}
	}
	return nil
}
