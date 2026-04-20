package index

import (
	"context"
	"database/sql"
	"fmt"
	"path/filepath"

	_ "modernc.org/sqlite"
)

type SQLiteStore struct {
	db   *sql.DB
	path string
}

func OpenSQLite(ctx context.Context, dataDir string) (*SQLiteStore, error) {
	dbPath := filepath.Join(dataDir, "noterious.db")
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
	}

	store := &SQLiteStore{
		db:   db,
		path: dbPath,
	}

	if err := store.migrate(ctx); err != nil {
		_ = db.Close()
		return nil, err
	}

	return store, nil
}

func (s *SQLiteStore) Close() error {
	if s == nil || s.db == nil {
		return nil
	}
	return s.db.Close()
}

func (s *SQLiteStore) Path() string {
	return s.path
}

func (s *SQLiteStore) migrate(ctx context.Context) error {
	statements := []string{
		`PRAGMA journal_mode = WAL;`,
		`CREATE TABLE IF NOT EXISTS pages (
			id INTEGER PRIMARY KEY,
			path TEXT NOT NULL UNIQUE,
			title TEXT,
			raw_markdown TEXT NOT NULL DEFAULT '',
			created_at TEXT,
			updated_at TEXT
		);`,
		`CREATE TABLE IF NOT EXISTS links (
			id INTEGER PRIMARY KEY,
			source_page TEXT NOT NULL,
			target_page TEXT NOT NULL,
			link_text TEXT,
			kind TEXT NOT NULL DEFAULT 'wikilink',
			line INTEGER NOT NULL DEFAULT 0
		);`,
		`CREATE TABLE IF NOT EXISTS tasks (
			id INTEGER PRIMARY KEY,
			ref TEXT NOT NULL UNIQUE,
			page TEXT NOT NULL,
			line INTEGER NOT NULL,
			text TEXT NOT NULL,
			state TEXT NOT NULL DEFAULT 'todo',
			done INTEGER NOT NULL DEFAULT 0,
			due TEXT,
			remind TEXT,
			who TEXT
		);`,
		`CREATE TABLE IF NOT EXISTS frontmatter_fields (
			id INTEGER PRIMARY KEY,
			page TEXT NOT NULL,
			key TEXT NOT NULL,
			value_json TEXT,
			UNIQUE(page, key)
		);`,
		`CREATE INDEX IF NOT EXISTS idx_links_target_page ON links(target_page);`,
		`CREATE INDEX IF NOT EXISTS idx_tasks_page ON tasks(page);`,
		`CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due);`,
		`CREATE INDEX IF NOT EXISTS idx_frontmatter_page ON frontmatter_fields(page);`,
	}

	for _, statement := range statements {
		if _, err := s.db.ExecContext(ctx, statement); err != nil {
			return fmt.Errorf("migrate sqlite: %w", err)
		}
	}

	return nil
}
