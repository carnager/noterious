package index

import (
	"context"
	"crypto/sha1"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"path/filepath"
	"sort"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

type SQLiteStore struct {
	db   *sql.DB
	path string
}

func OpenSQLite(ctx context.Context, dataDir string) (*SQLiteStore, error) {
	dbPath := filepath.Join(dataDir, "noterious.db")
	return OpenSQLitePath(ctx, dbPath)
}

func OpenSQLitePath(ctx context.Context, dbPath string) (*SQLiteStore, error) {
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
			click TEXT,
			who TEXT
		);`,
		`CREATE TABLE IF NOT EXISTS frontmatter_fields (
			id INTEGER PRIMARY KEY,
			page TEXT NOT NULL,
			key TEXT NOT NULL,
			value_json TEXT,
			UNIQUE(page, key)
		);`,
		`CREATE TABLE IF NOT EXISTS query_caches (
			id INTEGER PRIMARY KEY,
			page TEXT NOT NULL,
			line INTEGER NOT NULL,
			query_id TEXT NOT NULL DEFAULT '',
			block_key TEXT NOT NULL DEFAULT '',
			group_key TEXT NOT NULL DEFAULT '',
			anchor TEXT NOT NULL DEFAULT '',
			source TEXT NOT NULL,
			result_json TEXT,
			error TEXT NOT NULL DEFAULT '',
			updated_at TEXT NOT NULL,
			UNIQUE(page, line)
		);`,
		`CREATE TABLE IF NOT EXISTS query_dependencies (
			id INTEGER PRIMARY KEY,
			page TEXT NOT NULL,
			line INTEGER NOT NULL,
			dataset TEXT NOT NULL,
			UNIQUE(page, line, dataset)
		);`,
		`CREATE TABLE IF NOT EXISTS query_page_scopes (
			id INTEGER PRIMARY KEY,
			page TEXT NOT NULL,
			line INTEGER NOT NULL,
			dataset TEXT NOT NULL,
			match_page TEXT NOT NULL,
			UNIQUE(page, line, dataset)
		);`,
		`CREATE TABLE IF NOT EXISTS saved_queries (
			id INTEGER PRIMARY KEY,
			name TEXT NOT NULL UNIQUE,
			title TEXT NOT NULL DEFAULT '',
			description TEXT NOT NULL DEFAULT '',
			folder TEXT NOT NULL DEFAULT '',
			tags_json TEXT NOT NULL DEFAULT '[]',
			query_text TEXT NOT NULL,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);`,
		`CREATE INDEX IF NOT EXISTS idx_links_target_page ON links(target_page);`,
		`CREATE INDEX IF NOT EXISTS idx_tasks_page ON tasks(page);`,
		`CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due);`,
		`CREATE INDEX IF NOT EXISTS idx_frontmatter_page ON frontmatter_fields(page);`,
		`CREATE INDEX IF NOT EXISTS idx_query_caches_page ON query_caches(page);`,
		`CREATE INDEX IF NOT EXISTS idx_query_dependencies_dataset ON query_dependencies(dataset, page);`,
		`CREATE INDEX IF NOT EXISTS idx_query_page_scopes_match_page ON query_page_scopes(match_page, dataset, page);`,
		`CREATE INDEX IF NOT EXISTS idx_saved_queries_name ON saved_queries(name);`,
	}

	for _, statement := range statements {
		if _, err := s.db.ExecContext(ctx, statement); err != nil {
			return fmt.Errorf("migrate sqlite: %w", err)
		}
	}
	if err := s.ensureQueryCacheColumns(ctx); err != nil {
		return err
	}
	if err := s.ensureSavedQueryColumns(ctx); err != nil {
		return err
	}
	if err := s.ensureTaskColumns(ctx); err != nil {
		return err
	}

	return nil
}

func (s *SQLiteStore) ReplaceAll(ctx context.Context, documents []Document) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin sqlite rebuild: %w", err)
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()

	for _, statement := range []string{
		`DELETE FROM links;`,
		`DELETE FROM tasks;`,
		`DELETE FROM frontmatter_fields;`,
		`DELETE FROM query_caches;`,
		`DELETE FROM query_dependencies;`,
		`DELETE FROM query_page_scopes;`,
		`DELETE FROM pages;`,
	} {
		if _, err = tx.ExecContext(ctx, statement); err != nil {
			return fmt.Errorf("clear sqlite tables: %w", err)
		}
	}

	pageStmt, err := tx.PrepareContext(ctx, `INSERT INTO pages(path, title, raw_markdown, created_at, updated_at) VALUES(?, ?, ?, ?, ?);`)
	if err != nil {
		return fmt.Errorf("prepare page insert: %w", err)
	}
	defer pageStmt.Close()

	linkStmt, err := tx.PrepareContext(ctx, `INSERT INTO links(source_page, target_page, link_text, kind, line) VALUES(?, ?, ?, ?, ?);`)
	if err != nil {
		return fmt.Errorf("prepare link insert: %w", err)
	}
	defer linkStmt.Close()

	taskStmt, err := tx.PrepareContext(ctx, `INSERT INTO tasks(ref, page, line, text, state, done, due, remind, click, who) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`)
	if err != nil {
		return fmt.Errorf("prepare task insert: %w", err)
	}
	defer taskStmt.Close()

	frontmatterStmt, err := tx.PrepareContext(ctx, `INSERT INTO frontmatter_fields(page, key, value_json) VALUES(?, ?, ?);`)
	if err != nil {
		return fmt.Errorf("prepare frontmatter insert: %w", err)
	}
	defer frontmatterStmt.Close()

	sort.Slice(documents, func(i, j int) bool {
		return documents[i].Path < documents[j].Path
	})

	for _, document := range documents {
		if err := insertDocument(ctx, pageStmt, linkStmt, taskStmt, frontmatterStmt, document); err != nil {
			return err
		}
	}

	if err = tx.Commit(); err != nil {
		return fmt.Errorf("commit sqlite rebuild: %w", err)
	}
	return nil
}

func (s *SQLiteStore) listDocuments(ctx context.Context) ([]Document, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT path, COALESCE(title, ''), COALESCE(raw_markdown, ''), COALESCE(created_at, ''), COALESCE(updated_at, '')
		FROM pages
		ORDER BY path;
	`)
	if err != nil {
		return nil, fmt.Errorf("list pages for migration: %w", err)
	}
	defer rows.Close()

	documents := make([]Document, 0)
	documentsByPath := make(map[string]*Document)
	for rows.Next() {
		var document Document
		if err := rows.Scan(&document.Path, &document.Title, &document.RawMarkdown, &document.CreatedAt, &document.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan migration page: %w", err)
		}
		documents = append(documents, document)
		documentsByPath[document.Path] = &documents[len(documents)-1]
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate migration pages: %w", err)
	}
	if len(documents) == 0 {
		return nil, nil
	}

	frontmatterRows, err := s.db.QueryContext(ctx, `
		SELECT page, key, value_json
		FROM frontmatter_fields
		ORDER BY page, key;
	`)
	if err != nil {
		return nil, fmt.Errorf("list frontmatter for migration: %w", err)
	}
	defer frontmatterRows.Close()
	for frontmatterRows.Next() {
		var (
			pagePath  string
			key       string
			valueJSON string
		)
		if err := frontmatterRows.Scan(&pagePath, &key, &valueJSON); err != nil {
			return nil, fmt.Errorf("scan migration frontmatter: %w", err)
		}
		document := documentsByPath[pagePath]
		if document == nil {
			continue
		}
		document.Frontmatter = append(document.Frontmatter, FrontmatterField{
			Key:       key,
			ValueJSON: valueJSON,
		})
	}
	if err := frontmatterRows.Err(); err != nil {
		return nil, fmt.Errorf("iterate migration frontmatter: %w", err)
	}

	linkRows, err := s.db.QueryContext(ctx, `
		SELECT source_page, target_page, COALESCE(link_text, ''), kind, line
		FROM links
		ORDER BY source_page, line, id;
	`)
	if err != nil {
		return nil, fmt.Errorf("list links for migration: %w", err)
	}
	defer linkRows.Close()
	for linkRows.Next() {
		var link Link
		if err := linkRows.Scan(&link.SourcePage, &link.TargetPage, &link.LinkText, &link.Kind, &link.Line); err != nil {
			return nil, fmt.Errorf("scan migration link: %w", err)
		}
		document := documentsByPath[link.SourcePage]
		if document == nil {
			continue
		}
		document.Links = append(document.Links, link)
	}
	if err := linkRows.Err(); err != nil {
		return nil, fmt.Errorf("iterate migration links: %w", err)
	}

	tasks, err := s.loadTasks(ctx, `
		SELECT ref, page, line, text, state, done, due, remind, click, who
		FROM tasks
		ORDER BY page, line, id;
	`)
	if err != nil {
		return nil, fmt.Errorf("list tasks for migration: %w", err)
	}
	for _, task := range tasks {
		document := documentsByPath[task.Page]
		if document == nil {
			continue
		}
		document.Tasks = append(document.Tasks, task)
	}

	return documents, nil
}

func (s *SQLiteStore) ReplacePage(ctx context.Context, document Document) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin sqlite page reindex: %w", err)
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()

	if err = clearPageIndexRows(ctx, tx, document.Path); err != nil {
		return err
	}

	pageStmt, err := tx.PrepareContext(ctx, `INSERT INTO pages(path, title, raw_markdown, created_at, updated_at) VALUES(?, ?, ?, ?, ?);`)
	if err != nil {
		return fmt.Errorf("prepare page insert: %w", err)
	}
	defer pageStmt.Close()

	linkStmt, err := tx.PrepareContext(ctx, `INSERT INTO links(source_page, target_page, link_text, kind, line) VALUES(?, ?, ?, ?, ?);`)
	if err != nil {
		return fmt.Errorf("prepare link insert: %w", err)
	}
	defer linkStmt.Close()

	taskStmt, err := tx.PrepareContext(ctx, `INSERT INTO tasks(ref, page, line, text, state, done, due, remind, click, who) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`)
	if err != nil {
		return fmt.Errorf("prepare task insert: %w", err)
	}
	defer taskStmt.Close()

	frontmatterStmt, err := tx.PrepareContext(ctx, `INSERT INTO frontmatter_fields(page, key, value_json) VALUES(?, ?, ?);`)
	if err != nil {
		return fmt.Errorf("prepare frontmatter insert: %w", err)
	}
	defer frontmatterStmt.Close()

	if err = insertDocument(ctx, pageStmt, linkStmt, taskStmt, frontmatterStmt, document); err != nil {
		return err
	}

	if err = tx.Commit(); err != nil {
		return fmt.Errorf("commit sqlite page reindex for %q: %w", document.Path, err)
	}
	return nil
}

func (s *SQLiteStore) RemovePage(ctx context.Context, pagePath string) error {
	if !s.pageExists(ctx, pagePath) {
		return ErrPageNotFound
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin sqlite page removal: %w", err)
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()

	if err = clearPage(ctx, tx, pagePath); err != nil {
		return err
	}

	if err = tx.Commit(); err != nil {
		return fmt.Errorf("commit sqlite page removal for %q: %w", pagePath, err)
	}
	return nil
}

type PageRecord struct {
	Path        string
	Title       string
	RawMarkdown string
	CreatedAt   string
	UpdatedAt   string
	Frontmatter map[string]any
	Links       []Link
	Tasks       []Task
}

type PageSummary struct {
	Path              string         `json:"path"`
	Title             string         `json:"title"`
	Tags              []string       `json:"tags,omitempty"`
	Frontmatter       map[string]any `json:"frontmatter,omitempty"`
	OutgoingLinkCount int            `json:"outgoingLinkCount"`
	BacklinkCount     int            `json:"backlinkCount"`
	TaskCount         int            `json:"taskCount"`
	OpenTaskCount     int            `json:"openTaskCount"`
	DoneTaskCount     int            `json:"doneTaskCount"`
	QueryBlockCount   int            `json:"queryBlockCount"`
	CreatedAt         string         `json:"createdAt"`
	UpdatedAt         string         `json:"updatedAt"`
}

type QueryBlock struct {
	Source      string   `json:"source"`
	Line        int      `json:"line"`
	ID          string   `json:"id,omitempty"`
	BlockKey    string   `json:"key"`
	Datasets    []string `json:"datasets,omitempty"`
	MatchPage   string   `json:"matchPage,omitempty"`
	GroupKey    string   `json:"-"`
	Anchor      string   `json:"-"`
	Result      any      `json:"result,omitempty"`
	Error       string   `json:"error,omitempty"`
	RowCount    int      `json:"rowCount"`
	RenderHint  string   `json:"renderHint,omitempty"`
	UpdatedAt   string   `json:"updatedAt,omitempty"`
	Stale       bool     `json:"stale"`
	StalePage   string   `json:"stalePage,omitempty"`
	StaleSince  string   `json:"staleSince,omitempty"`
	StaleReason string   `json:"staleReason,omitempty"`
}

type BacklinkRecord struct {
	SourcePage  string `json:"sourcePage"`
	SourceTitle string `json:"sourceTitle"`
	LinkText    string `json:"linkText"`
	Kind        string `json:"kind"`
	Line        int    `json:"line"`
}

type SavedQuery struct {
	Name        string   `json:"name"`
	Title       string   `json:"title"`
	Description string   `json:"description,omitempty"`
	Folder      string   `json:"folder,omitempty"`
	Tags        []string `json:"tags,omitempty"`
	Query       string   `json:"query"`
	CreatedAt   string   `json:"createdAt"`
	UpdatedAt   string   `json:"updatedAt"`
}

func (s *SQLiteStore) GetPage(ctx context.Context, pagePath string) (PageRecord, error) {
	var record PageRecord
	if err := s.scanPageRecord(ctx, pagePath, &record); err != nil {
		return PageRecord{}, fmt.Errorf("query page %q: %w", pagePath, err)
	}

	frontmatterRows, err := s.db.QueryContext(ctx, `SELECT key, value_json FROM frontmatter_fields WHERE page = ? ORDER BY key;`, pagePath)
	if err != nil {
		return PageRecord{}, fmt.Errorf("query frontmatter for %q: %w", pagePath, err)
	}
	defer frontmatterRows.Close()

	record.Frontmatter = make(map[string]any)
	for frontmatterRows.Next() {
		var key string
		var valueJSON string
		if err := frontmatterRows.Scan(&key, &valueJSON); err != nil {
			return PageRecord{}, fmt.Errorf("scan frontmatter for %q: %w", pagePath, err)
		}

		var value any
		if err := json.Unmarshal([]byte(valueJSON), &value); err != nil {
			value = valueJSON
		}
		record.Frontmatter[key] = value
	}
	if err := frontmatterRows.Err(); err != nil {
		return PageRecord{}, fmt.Errorf("iterate frontmatter for %q: %w", pagePath, err)
	}

	linkRows, err := s.db.QueryContext(ctx, `SELECT source_page, target_page, link_text, kind, line FROM links WHERE source_page = ? ORDER BY line, id;`, pagePath)
	if err != nil {
		return PageRecord{}, fmt.Errorf("query links for %q: %w", pagePath, err)
	}
	defer linkRows.Close()

	record.Links = make([]Link, 0)
	for linkRows.Next() {
		var link Link
		if err := linkRows.Scan(&link.SourcePage, &link.TargetPage, &link.LinkText, &link.Kind, &link.Line); err != nil {
			return PageRecord{}, fmt.Errorf("scan links for %q: %w", pagePath, err)
		}
		record.Links = append(record.Links, link)
	}
	if err := linkRows.Err(); err != nil {
		return PageRecord{}, fmt.Errorf("iterate links for %q: %w", pagePath, err)
	}

	tasks, err := s.loadTasks(ctx, `SELECT ref, page, line, text, state, done, due, remind, click, who FROM tasks WHERE page = ? ORDER BY line, id;`, pagePath)
	if err != nil {
		return PageRecord{}, fmt.Errorf("query tasks for %q: %w", pagePath, err)
	}
	record.Tasks = tasks

	return record, nil
}

func (s *SQLiteStore) GetBacklinks(ctx context.Context, pagePath string) ([]BacklinkRecord, error) {
	if !s.pageExists(ctx, pagePath) {
		return nil, ErrPageNotFound
	}

	rows, err := s.db.QueryContext(ctx, `
		SELECT l.source_page, COALESCE(p.title, ''), l.link_text, l.kind, l.line
		FROM links l
		LEFT JOIN pages p ON p.path = l.source_page
		WHERE l.target_page = ?
		ORDER BY l.source_page, l.line, l.id;
	`, pagePath)
	if err != nil {
		return nil, fmt.Errorf("query backlinks for %q: %w", pagePath, err)
	}
	defer rows.Close()

	backlinks := make([]BacklinkRecord, 0)
	for rows.Next() {
		var backlink BacklinkRecord
		if err := rows.Scan(&backlink.SourcePage, &backlink.SourceTitle, &backlink.LinkText, &backlink.Kind, &backlink.Line); err != nil {
			return nil, fmt.Errorf("scan backlinks for %q: %w", pagePath, err)
		}
		backlinks = append(backlinks, backlink)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate backlinks for %q: %w", pagePath, err)
	}

	return backlinks, nil
}

func (s *SQLiteStore) ListTasks(ctx context.Context) ([]Task, error) {
	tasks, err := s.loadTasks(ctx, `
		SELECT ref, page, line, text, state, done, due, remind, click, who
		FROM tasks
		ORDER BY done, CASE WHEN due IS NULL OR due = '' THEN 1 ELSE 0 END, due, page, line, id;
	`)
	if err != nil {
		return nil, fmt.Errorf("list tasks: %w", err)
	}
	return tasks, nil
}

func (s *SQLiteStore) GetTask(ctx context.Context, ref string) (Task, error) {
	tasks, err := s.loadTasks(ctx, `
		SELECT ref, page, line, text, state, done, due, remind, click, who
		FROM tasks
		WHERE ref = ?
		LIMIT 1;
	`, ref)
	if err != nil {
		return Task{}, fmt.Errorf("get task %q: %w", ref, err)
	}
	if len(tasks) == 0 {
		return Task{}, ErrTaskNotFound
	}
	return tasks[0], nil
}

func (s *SQLiteStore) ListPages(ctx context.Context) ([]PageSummary, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT path, COALESCE(title, ''), COALESCE(created_at, ''), COALESCE(updated_at, '')
		FROM pages
		ORDER BY path;
	`)
	if err != nil {
		return nil, fmt.Errorf("list pages: %w", err)
	}
	defer rows.Close()

	pages := make([]PageSummary, 0)
	for rows.Next() {
		var page PageSummary
		if err := rows.Scan(&page.Path, &page.Title, &page.CreatedAt, &page.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan pages: %w", err)
		}
		pages = append(pages, page)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate pages: %w", err)
	}

	frontmatterRows, err := s.db.QueryContext(ctx, `
		SELECT page, key, value_json
		FROM frontmatter_fields
		ORDER BY page, key;
	`)
	if err != nil {
		return nil, fmt.Errorf("list page frontmatter: %w", err)
	}
	defer frontmatterRows.Close()

	frontmatterByPage := make(map[string]map[string]any)
	for frontmatterRows.Next() {
		var (
			pagePath  string
			key       string
			valueJSON string
		)
		if err := frontmatterRows.Scan(&pagePath, &key, &valueJSON); err != nil {
			return nil, fmt.Errorf("scan page frontmatter: %w", err)
		}
		var raw any
		if err := json.Unmarshal([]byte(valueJSON), &raw); err != nil {
			continue
		}
		fields := frontmatterByPage[pagePath]
		if fields == nil {
			fields = make(map[string]any)
			frontmatterByPage[pagePath] = fields
		}
		fields[key] = raw
	}
	if err := frontmatterRows.Err(); err != nil {
		return nil, fmt.Errorf("iterate page frontmatter: %w", err)
	}

	for idx := range pages {
		frontmatter := cloneFrontmatterMap(frontmatterByPage[pages[idx].Path])
		pages[idx].Frontmatter = frontmatter
		pages[idx].Tags = append([]string(nil), frontmatterStringList(frontmatter["tags"])...)
	}
	outgoingCounts, err := loadOutgoingLinkCounts(ctx, s.db)
	if err != nil {
		return nil, fmt.Errorf("list outgoing link counts: %w", err)
	}
	backlinkCounts, err := loadBacklinkCounts(ctx, s.db)
	if err != nil {
		return nil, fmt.Errorf("list backlink counts: %w", err)
	}
	queryBlockCounts, err := loadQueryBlockCounts(ctx, s.db)
	if err != nil {
		return nil, fmt.Errorf("list query block counts: %w", err)
	}
	taskCounts, openTaskCounts, doneTaskCounts, err := loadTaskCountMaps(ctx, s.db)
	if err != nil {
		return nil, fmt.Errorf("list task counts: %w", err)
	}

	for idx := range pages {
		page := &pages[idx]
		page.OutgoingLinkCount = outgoingCounts[page.Path]
		page.BacklinkCount = backlinkCounts[page.Path]
		page.TaskCount = taskCounts[page.Path]
		page.OpenTaskCount = openTaskCounts[page.Path]
		page.DoneTaskCount = doneTaskCounts[page.Path]
		page.QueryBlockCount = queryBlockCounts[page.Path]
	}

	return pages, nil
}

func (s *SQLiteStore) ListLinks(ctx context.Context) ([]Link, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT source_page, target_page, link_text, kind, line
		FROM links
		ORDER BY source_page, line, id;
	`)
	if err != nil {
		return nil, fmt.Errorf("list links: %w", err)
	}
	defer rows.Close()

	links := make([]Link, 0)
	for rows.Next() {
		var link Link
		if err := rows.Scan(&link.SourcePage, &link.TargetPage, &link.LinkText, &link.Kind, &link.Line); err != nil {
			return nil, fmt.Errorf("scan links: %w", err)
		}
		links = append(links, link)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate links: %w", err)
	}
	return links, nil
}

func (s *SQLiteStore) ListSavedQueries(ctx context.Context) ([]SavedQuery, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT name, title, description, folder, tags_json, query_text, created_at, updated_at
		FROM saved_queries
		ORDER BY name;
	`)
	if err != nil {
		return nil, fmt.Errorf("list saved queries: %w", err)
	}
	defer rows.Close()

	queries := make([]SavedQuery, 0)
	for rows.Next() {
		var query SavedQuery
		var tagsJSON string
		if err := rows.Scan(&query.Name, &query.Title, &query.Description, &query.Folder, &tagsJSON, &query.Query, &query.CreatedAt, &query.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan saved queries: %w", err)
		}
		query.Tags = decodeSavedQueryTags(tagsJSON)
		queries = append(queries, query)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate saved queries: %w", err)
	}
	return queries, nil
}

func (s *SQLiteStore) GetSavedQuery(ctx context.Context, name string) (SavedQuery, error) {
	var query SavedQuery
	var tagsJSON string
	err := s.db.QueryRowContext(ctx, `
		SELECT name, title, description, folder, tags_json, query_text, created_at, updated_at
		FROM saved_queries
		WHERE name = ?
		LIMIT 1;
	`, name).Scan(&query.Name, &query.Title, &query.Description, &query.Folder, &tagsJSON, &query.Query, &query.CreatedAt, &query.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return SavedQuery{}, ErrSavedQueryNotFound
	}
	if err != nil {
		return SavedQuery{}, fmt.Errorf("get saved query %q: %w", name, err)
	}
	query.Tags = decodeSavedQueryTags(tagsJSON)
	return query, nil
}

func (s *SQLiteStore) PutSavedQuery(ctx context.Context, query SavedQuery) (SavedQuery, error) {
	existing, err := s.GetSavedQuery(ctx, query.Name)
	if err != nil && !errors.Is(err, ErrSavedQueryNotFound) {
		return SavedQuery{}, err
	}

	now := nowTimestamp()
	createdAt := now
	if err == nil {
		createdAt = existing.CreatedAt
	}
	tagsJSON, err := encodeSavedQueryTags(query.Tags)
	if err != nil {
		return SavedQuery{}, fmt.Errorf("encode saved query %q tags: %w", query.Name, err)
	}

	if _, err := s.db.ExecContext(ctx, `
		INSERT INTO saved_queries(name, title, description, folder, tags_json, query_text, created_at, updated_at)
		VALUES(?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(name) DO UPDATE SET
			title = excluded.title,
			description = excluded.description,
			folder = excluded.folder,
			tags_json = excluded.tags_json,
			query_text = excluded.query_text,
			updated_at = excluded.updated_at;
	`, query.Name, query.Title, query.Description, query.Folder, tagsJSON, query.Query, createdAt, now); err != nil {
		return SavedQuery{}, fmt.Errorf("put saved query %q: %w", query.Name, err)
	}

	return s.GetSavedQuery(ctx, query.Name)
}

func (s *SQLiteStore) DeleteSavedQuery(ctx context.Context, name string) error {
	result, err := s.db.ExecContext(ctx, `DELETE FROM saved_queries WHERE name = ?;`, name)
	if err != nil {
		return fmt.Errorf("delete saved query %q: %w", name, err)
	}
	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("delete saved query %q rows affected: %w", name, err)
	}
	if rowsAffected == 0 {
		return ErrSavedQueryNotFound
	}
	return nil
}

func frontmatterStringList(value any) []string {
	switch typed := value.(type) {
	case []string:
		return append([]string(nil), typed...)
	case []any:
		items := make([]string, 0, len(typed))
		for _, item := range typed {
			text, ok := item.(string)
			if ok && strings.TrimSpace(text) != "" {
				items = append(items, text)
			}
		}
		return items
	case string:
		trimmed := strings.TrimSpace(typed)
		if trimmed == "" {
			return nil
		}
		return []string{trimmed}
	default:
		return nil
	}
}

func cloneFrontmatterMap(fields map[string]any) map[string]any {
	if len(fields) == 0 {
		return nil
	}
	cloned := make(map[string]any, len(fields))
	for key, value := range fields {
		cloned[key] = cloneFrontmatterValue(value)
	}
	return cloned
}

func cloneFrontmatterValue(value any) any {
	switch typed := value.(type) {
	case []any:
		items := make([]any, len(typed))
		for idx, item := range typed {
			items[idx] = cloneFrontmatterValue(item)
		}
		return items
	case []string:
		return append([]string(nil), typed...)
	case map[string]any:
		items := make(map[string]any, len(typed))
		for key, item := range typed {
			items[key] = cloneFrontmatterValue(item)
		}
		return items
	default:
		return typed
	}
}

func nowTimestamp() string {
	return time.Now().UTC().Format(time.RFC3339Nano)
}

func decodeSavedQueryTags(tagsJSON string) []string {
	if strings.TrimSpace(tagsJSON) == "" {
		return nil
	}
	var tags []string
	if err := json.Unmarshal([]byte(tagsJSON), &tags); err != nil {
		return nil
	}
	return normalizeSavedQueryTags(tags)
}

func encodeSavedQueryTags(tags []string) (string, error) {
	normalized := normalizeSavedQueryTags(tags)
	encoded, err := json.Marshal(normalized)
	if err != nil {
		return "", err
	}
	return string(encoded), nil
}

func normalizeSavedQueryTags(tags []string) []string {
	if len(tags) == 0 {
		return nil
	}
	normalized := make([]string, 0, len(tags))
	seen := make(map[string]struct{}, len(tags))
	for _, tag := range tags {
		trimmed := strings.TrimSpace(tag)
		if trimmed == "" {
			continue
		}
		key := strings.ToLower(trimmed)
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		normalized = append(normalized, trimmed)
	}
	return normalized
}

func loadOutgoingLinkCounts(ctx context.Context, db *sql.DB) (map[string]int, error) {
	rows, err := db.QueryContext(ctx, `SELECT source_page, COUNT(*) FROM links GROUP BY source_page;`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	return scanPageCountRows(rows)
}

func loadBacklinkCounts(ctx context.Context, db *sql.DB) (map[string]int, error) {
	rows, err := db.QueryContext(ctx, `SELECT target_page, COUNT(*) FROM links GROUP BY target_page;`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	return scanPageCountRows(rows)
}

func loadQueryBlockCounts(ctx context.Context, db *sql.DB) (map[string]int, error) {
	rows, err := db.QueryContext(ctx, `SELECT page, COUNT(*) FROM query_caches GROUP BY page;`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	return scanPageCountRows(rows)
}

func scanPageCountRows(rows *sql.Rows) (map[string]int, error) {
	counts := make(map[string]int)
	for rows.Next() {
		var (
			pagePath string
			count    int
		)
		if err := rows.Scan(&pagePath, &count); err != nil {
			return nil, err
		}
		counts[pagePath] = count
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return counts, nil
}

func loadTaskCountMaps(ctx context.Context, db *sql.DB) (map[string]int, map[string]int, map[string]int, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT page,
			COUNT(*),
			SUM(CASE WHEN done = 0 THEN 1 ELSE 0 END),
			SUM(CASE WHEN done != 0 THEN 1 ELSE 0 END)
		FROM tasks
		GROUP BY page;
	`)
	if err != nil {
		return nil, nil, nil, err
	}
	defer rows.Close()

	total := make(map[string]int)
	open := make(map[string]int)
	done := make(map[string]int)
	for rows.Next() {
		var (
			pagePath string
			t        int
			o        int
			d        int
		)
		if err := rows.Scan(&pagePath, &t, &o, &d); err != nil {
			return nil, nil, nil, err
		}
		total[pagePath] = t
		open[pagePath] = o
		done[pagePath] = d
	}
	if err := rows.Err(); err != nil {
		return nil, nil, nil, err
	}
	return total, open, done, nil
}

func (s *SQLiteStore) ReplaceQueryBlocks(ctx context.Context, pagePath string, blocks []QueryBlock) error {
	if !s.pageExists(ctx, pagePath) {
		return ErrPageNotFound
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin sqlite query cache replace: %w", err)
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()

	if _, err = tx.ExecContext(ctx, `DELETE FROM query_caches WHERE page = ?;`, pagePath); err != nil {
		return fmt.Errorf("clear query cache for %q: %w", pagePath, err)
	}
	if _, err = tx.ExecContext(ctx, `DELETE FROM query_dependencies WHERE page = ?;`, pagePath); err != nil {
		return fmt.Errorf("clear query dependencies for %q: %w", pagePath, err)
	}
	if _, err = tx.ExecContext(ctx, `DELETE FROM query_page_scopes WHERE page = ?;`, pagePath); err != nil {
		return fmt.Errorf("clear query page scopes for %q: %w", pagePath, err)
	}

	cacheStmt, err := tx.PrepareContext(ctx, `INSERT INTO query_caches(page, line, query_id, block_key, group_key, anchor, source, result_json, error, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`)
	if err != nil {
		return fmt.Errorf("prepare query cache insert: %w", err)
	}
	defer cacheStmt.Close()

	dependencyStmt, err := tx.PrepareContext(ctx, `INSERT INTO query_dependencies(page, line, dataset) VALUES(?, ?, ?);`)
	if err != nil {
		return fmt.Errorf("prepare query dependency insert: %w", err)
	}
	defer dependencyStmt.Close()

	scopeStmt, err := tx.PrepareContext(ctx, `INSERT INTO query_page_scopes(page, line, dataset, match_page) VALUES(?, ?, ?, ?);`)
	if err != nil {
		return fmt.Errorf("prepare query page scope insert: %w", err)
	}
	defer scopeStmt.Close()

	for _, block := range blocks {
		resultJSON := ""
		if block.Result != nil {
			encoded, marshalErr := json.Marshal(block.Result)
			if marshalErr != nil {
				return fmt.Errorf("encode query cache for %q:%d: %w", pagePath, block.Line, marshalErr)
			}
			resultJSON = string(encoded)
		}

		if _, err = cacheStmt.ExecContext(ctx, pagePath, block.Line, block.ID, block.BlockKey, block.GroupKey, block.Anchor, block.Source, resultJSON, block.Error, block.UpdatedAt); err != nil {
			return fmt.Errorf("insert query cache for %q:%d: %w", pagePath, block.Line, err)
		}
		for _, dataset := range block.Datasets {
			if _, err = dependencyStmt.ExecContext(ctx, pagePath, block.Line, dataset); err != nil {
				return fmt.Errorf("insert query dependency for %q:%d: %w", pagePath, block.Line, err)
			}
			if block.MatchPage != "" {
				if _, err = scopeStmt.ExecContext(ctx, pagePath, block.Line, dataset, block.MatchPage); err != nil {
					return fmt.Errorf("insert query page scope for %q:%d: %w", pagePath, block.Line, err)
				}
			}
		}
	}

	if err = tx.Commit(); err != nil {
		return fmt.Errorf("commit sqlite query cache replace for %q: %w", pagePath, err)
	}
	return nil
}

func (s *SQLiteStore) GetQueryBlocks(ctx context.Context, pagePath string) ([]QueryBlock, error) {
	if !s.pageExists(ctx, pagePath) {
		return nil, ErrPageNotFound
	}

	rows, err := s.db.QueryContext(ctx, `
		SELECT COALESCE(query_id, ''), COALESCE(block_key, ''), COALESCE(group_key, ''), COALESCE(anchor, ''), source, line, COALESCE(result_json, ''), COALESCE(error, ''), COALESCE(updated_at, '')
		FROM query_caches
		WHERE page = ?
		ORDER BY line, id;
	`, pagePath)
	if err != nil {
		return nil, fmt.Errorf("query cached blocks for %q: %w", pagePath, err)
	}
	defer rows.Close()

	blocks := make([]QueryBlock, 0)
	for rows.Next() {
		var block QueryBlock
		var resultJSON string
		if err := rows.Scan(&block.ID, &block.BlockKey, &block.GroupKey, &block.Anchor, &block.Source, &block.Line, &resultJSON, &block.Error, &block.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan cached blocks for %q: %w", pagePath, err)
		}
		if resultJSON != "" {
			var result any
			if err := json.Unmarshal([]byte(resultJSON), &result); err == nil {
				block.Result = result
			}
		}
		blocks = append(blocks, block)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate cached blocks for %q: %w", pagePath, err)
	}

	assignLegacyQueryBlockKeys(blocks)
	return blocks, nil
}

func assignLegacyQueryBlockKeys(blocks []QueryBlock) {
	occurrences := make(map[string]int, len(blocks))
	for idx := range blocks {
		if blocks[idx].BlockKey != "" {
			continue
		}
		source := strings.TrimSpace(blocks[idx].Source)
		occurrences[source]++
		blocks[idx].BlockKey = legacyQueryBlockKey(source, occurrences[source])
	}
}

func (s *SQLiteStore) ListQueryPagesByDataset(ctx context.Context, datasets []string) ([]string, error) {
	return s.ListQueryPagesByDatasetAndPage(ctx, datasets, "")
}

func (s *SQLiteStore) ListQueryPagesByDatasetAndPage(ctx context.Context, datasets []string, pagePath string) ([]string, error) {
	if len(datasets) == 0 {
		return nil, nil
	}

	seen := make(map[string]struct{}, len(datasets))
	placeholders := make([]string, 0, len(datasets))
	args := make([]any, 0, len(datasets))
	for _, dataset := range datasets {
		if dataset == "" {
			continue
		}
		if _, ok := seen[dataset]; ok {
			continue
		}
		seen[dataset] = struct{}{}
		placeholders = append(placeholders, "?")
		args = append(args, dataset)
	}
	if len(placeholders) == 0 {
		return nil, nil
	}

	query := fmt.Sprintf(`
		SELECT DISTINCT d.page
		FROM query_dependencies d
		LEFT JOIN query_page_scopes s
			ON s.page = d.page
			AND s.line = d.line
			AND s.dataset = d.dataset
		WHERE d.dataset IN (%s)
			AND (s.match_page IS NULL OR s.match_page = '' OR s.match_page = ?)
		ORDER BY d.page;
	`, strings.Join(placeholders, ", "))
	args = append(args, pagePath)
	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("list query pages by dataset and page: %w", err)
	}
	defer rows.Close()

	pages := make([]string, 0)
	for rows.Next() {
		var page string
		if err := rows.Scan(&page); err != nil {
			return nil, fmt.Errorf("scan query page dependency: %w", err)
		}
		pages = append(pages, page)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate query page dependencies: %w", err)
	}

	return pages, nil
}

func clearPage(ctx context.Context, tx *sql.Tx, pagePath string) error {
	if err := clearPageIndexRows(ctx, tx, pagePath); err != nil {
		return err
	}
	for _, statement := range []string{
		`DELETE FROM query_caches WHERE page = ?;`,
		`DELETE FROM query_dependencies WHERE page = ?;`,
		`DELETE FROM query_page_scopes WHERE page = ?;`,
	} {
		if _, err := tx.ExecContext(ctx, statement, pagePath); err != nil {
			return fmt.Errorf("clear page %q: %w", pagePath, err)
		}
	}
	return nil
}

func clearPageIndexRows(ctx context.Context, tx *sql.Tx, pagePath string) error {
	for _, statement := range []string{
		`DELETE FROM links WHERE source_page = ?;`,
		`DELETE FROM tasks WHERE page = ?;`,
		`DELETE FROM frontmatter_fields WHERE page = ?;`,
		`DELETE FROM pages WHERE path = ?;`,
	} {
		if _, err := tx.ExecContext(ctx, statement, pagePath); err != nil {
			return fmt.Errorf("clear page %q: %w", pagePath, err)
		}
	}
	return nil
}

func insertDocument(ctx context.Context, pageStmt, linkStmt, taskStmt, frontmatterStmt *sql.Stmt, document Document) error {
	if _, err := pageStmt.ExecContext(ctx, document.Path, document.Title, document.RawMarkdown, document.CreatedAt, document.UpdatedAt); err != nil {
		return fmt.Errorf("insert page %q: %w", document.Path, err)
	}

	for _, link := range document.Links {
		if _, err := linkStmt.ExecContext(ctx, link.SourcePage, link.TargetPage, link.LinkText, link.Kind, link.Line); err != nil {
			return fmt.Errorf("insert link %q -> %q: %w", link.SourcePage, link.TargetPage, err)
		}
	}

	for _, task := range document.Tasks {
		whoJSON, marshalErr := json.Marshal(task.Who)
		if marshalErr != nil {
			return fmt.Errorf("encode task who for %q: %w", task.Ref, marshalErr)
		}
		if _, err := taskStmt.ExecContext(ctx, task.Ref, task.Page, task.Line, task.Text, task.State, boolToInt(task.Done), task.Due, task.Remind, task.Click, string(whoJSON)); err != nil {
			return fmt.Errorf("insert task %q: %w", task.Ref, err)
		}
	}

	for _, field := range document.Frontmatter {
		if _, err := frontmatterStmt.ExecContext(ctx, document.Path, field.Key, field.ValueJSON); err != nil {
			return fmt.Errorf("insert frontmatter %q.%s: %w", document.Path, field.Key, err)
		}
	}

	return nil
}

func (s *SQLiteStore) scanPageRecord(ctx context.Context, pagePath string, record *PageRecord) error {
	row := s.db.QueryRowContext(ctx, `SELECT path, title, raw_markdown, created_at, updated_at FROM pages WHERE path = ?;`, pagePath)
	if err := row.Scan(&record.Path, &record.Title, &record.RawMarkdown, &record.CreatedAt, &record.UpdatedAt); err != nil {
		if err == sql.ErrNoRows {
			return ErrPageNotFound
		}
		return err
	}
	return nil
}

func (s *SQLiteStore) pageExists(ctx context.Context, pagePath string) bool {
	var exists int
	err := s.db.QueryRowContext(ctx, `SELECT 1 FROM pages WHERE path = ?;`, pagePath).Scan(&exists)
	return err == nil && exists == 1
}

func (s *SQLiteStore) loadTasks(ctx context.Context, query string, args ...any) ([]Task, error) {
	taskRows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer taskRows.Close()

	tasks := make([]Task, 0)
	for taskRows.Next() {
		var task Task
		var done int
		var whoJSON string
		if err := taskRows.Scan(&task.Ref, &task.Page, &task.Line, &task.Text, &task.State, &done, &task.Due, &task.Remind, &task.Click, &whoJSON); err != nil {
			return nil, err
		}
		task.Done = done != 0
		if err := json.Unmarshal([]byte(whoJSON), &task.Who); err != nil {
			task.Who = nil
		}
		tasks = append(tasks, task)
	}
	if err := taskRows.Err(); err != nil {
		return nil, err
	}
	return tasks, nil
}

func boolToInt(value bool) int {
	if value {
		return 1
	}
	return 0
}

func legacyQueryBlockKey(source string, occurrence int) string {
	sum := sha1.Sum([]byte(fmt.Sprintf("%s\x00%d", source, occurrence)))
	return hex.EncodeToString(sum[:])
}

func (s *SQLiteStore) ensureQueryCacheColumns(ctx context.Context) error {
	rows, err := s.db.QueryContext(ctx, `PRAGMA table_info(query_caches);`)
	if err != nil {
		return fmt.Errorf("inspect query_caches columns: %w", err)
	}
	defer rows.Close()

	var (
		cid        int
		name       string
		columnType string
		notNull    int
		defaultVal sql.NullString
		pk         int
	)
	seen := make(map[string]struct{}, 4)
	for rows.Next() {
		if err := rows.Scan(&cid, &name, &columnType, &notNull, &defaultVal, &pk); err != nil {
			return fmt.Errorf("scan query_caches columns: %w", err)
		}
		seen[name] = struct{}{}
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("iterate query_caches columns: %w", err)
	}

	for _, column := range []struct {
		name string
		sql  string
	}{
		{name: "query_id", sql: `ALTER TABLE query_caches ADD COLUMN query_id TEXT NOT NULL DEFAULT '';`},
		{name: "block_key", sql: `ALTER TABLE query_caches ADD COLUMN block_key TEXT NOT NULL DEFAULT '';`},
		{name: "group_key", sql: `ALTER TABLE query_caches ADD COLUMN group_key TEXT NOT NULL DEFAULT '';`},
		{name: "anchor", sql: `ALTER TABLE query_caches ADD COLUMN anchor TEXT NOT NULL DEFAULT '';`},
	} {
		if _, ok := seen[column.name]; ok {
			continue
		}
		if _, err := s.db.ExecContext(ctx, column.sql); err != nil {
			return fmt.Errorf("add query_caches.%s: %w", column.name, err)
		}
	}
	return nil
}

func (s *SQLiteStore) ensureSavedQueryColumns(ctx context.Context) error {
	rows, err := s.db.QueryContext(ctx, `PRAGMA table_info(saved_queries);`)
	if err != nil {
		return fmt.Errorf("inspect saved_queries columns: %w", err)
	}
	defer rows.Close()

	var (
		cid        int
		name       string
		columnType string
		notNull    int
		defaultVal sql.NullString
		pk         int
	)
	seen := make(map[string]struct{}, 2)
	for rows.Next() {
		if err := rows.Scan(&cid, &name, &columnType, &notNull, &defaultVal, &pk); err != nil {
			return fmt.Errorf("scan saved_queries columns: %w", err)
		}
		seen[name] = struct{}{}
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("iterate saved_queries columns: %w", err)
	}

	for _, column := range []struct {
		name string
		sql  string
	}{
		{name: "folder", sql: `ALTER TABLE saved_queries ADD COLUMN folder TEXT NOT NULL DEFAULT '';`},
		{name: "tags_json", sql: `ALTER TABLE saved_queries ADD COLUMN tags_json TEXT NOT NULL DEFAULT '[]';`},
	} {
		if _, ok := seen[column.name]; ok {
			continue
		}
		if _, err := s.db.ExecContext(ctx, column.sql); err != nil {
			return fmt.Errorf("add saved_queries.%s: %w", column.name, err)
		}
	}
	return nil
}

func (s *SQLiteStore) ensureTaskColumns(ctx context.Context) error {
	rows, err := s.db.QueryContext(ctx, `PRAGMA table_info(tasks);`)
	if err != nil {
		return fmt.Errorf("inspect tasks columns: %w", err)
	}
	defer rows.Close()

	var (
		cid        int
		name       string
		columnType string
		notNull    int
		defaultVal sql.NullString
		pk         int
	)
	seen := make(map[string]struct{}, 1)
	for rows.Next() {
		if err := rows.Scan(&cid, &name, &columnType, &notNull, &defaultVal, &pk); err != nil {
			return fmt.Errorf("scan tasks columns: %w", err)
		}
		seen[name] = struct{}{}
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("iterate tasks columns: %w", err)
	}

	for _, column := range []struct {
		name string
		sql  string
	}{
		{name: "click", sql: `ALTER TABLE tasks ADD COLUMN click TEXT;`},
	} {
		if _, ok := seen[column.name]; ok {
			continue
		}
		if _, err := s.db.ExecContext(ctx, column.sql); err != nil {
			return fmt.Errorf("add tasks.%s: %w", column.name, err)
		}
	}
	return nil
}
