package index

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"

	_ "modernc.org/sqlite"
)

func TestSQLiteStoreMigratesTaskClickColumn(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	dbPath := filepath.Join(t.TempDir(), "legacy.db")
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("sql.Open() error = %v", err)
	}
	if _, err := db.ExecContext(ctx, `CREATE TABLE tasks (
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
	);`); err != nil {
		_ = db.Close()
		t.Fatalf("ExecContext(create legacy tasks) error = %v", err)
	}
	if err := db.Close(); err != nil {
		t.Fatalf("Close(legacy db) error = %v", err)
	}

	store, err := OpenSQLitePath(ctx, dbPath)
	if err != nil {
		t.Fatalf("OpenSQLitePath() error = %v", err)
	}
	defer func() {
		_ = store.Close()
	}()

	rows, err := store.db.QueryContext(ctx, `PRAGMA table_info(tasks);`)
	if err != nil {
		t.Fatalf("QueryContext(PRAGMA table_info) error = %v", err)
	}
	defer rows.Close()

	var (
		cid        int
		name       string
		columnType string
		notNull    int
		defaultVal sql.NullString
		pk         int
		foundClick bool
	)
	for rows.Next() {
		if err := rows.Scan(&cid, &name, &columnType, &notNull, &defaultVal, &pk); err != nil {
			t.Fatalf("Scan(PRAGMA table_info) error = %v", err)
		}
		if name == "click" {
			foundClick = true
		}
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("rows.Err() = %v", err)
	}
	if !foundClick {
		t.Fatal("tasks.click column missing after migration")
	}
}

func TestSQLiteStoreSearchPagePaths(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	store, err := OpenSQLitePath(ctx, filepath.Join(t.TempDir(), "noterious.db"))
	if err != nil {
		t.Fatalf("OpenSQLitePath() error = %v", err)
	}
	defer func() {
		_ = store.Close()
	}()

	documents := []Document{
		{Path: "projects/roadmap", Title: "Roadmap", RawMarkdown: "# Roadmap\n\nShipping milestones for the quarter.\n"},
		{Path: "daily/today", Title: "Today", RawMarkdown: "# Today\n\nReview the roadmap with the team.\n"},
		{Path: "recipes/pasta", Title: "Pasta", RawMarkdown: "# Pasta\n\nBoil water, add salt.\n"},
	}
	if err := store.ReplaceAll(ctx, documents); err != nil {
		t.Fatalf("ReplaceAll() error = %v", err)
	}

	paths, err := store.SearchPagePaths(ctx, "roadmap", "", 10)
	if err != nil {
		t.Fatalf("SearchPagePaths() error = %v", err)
	}
	if len(paths) != 2 {
		t.Fatalf("SearchPagePaths(roadmap) = %v, want 2 results", paths)
	}
	if paths[0] != "projects/roadmap" {
		t.Fatalf("SearchPagePaths(roadmap)[0] = %q, want path/title match ranked first", paths[0])
	}

	prefixPaths, err := store.SearchPagePaths(ctx, "road", "", 10)
	if err != nil {
		t.Fatalf("SearchPagePaths(prefix) error = %v", err)
	}
	if len(prefixPaths) != 2 {
		t.Fatalf("SearchPagePaths(road) = %v, want prefix matches", prefixPaths)
	}

	scopedPaths, err := store.SearchPagePaths(ctx, "roadmap", "daily", 10)
	if err != nil {
		t.Fatalf("SearchPagePaths(scoped) error = %v", err)
	}
	if len(scopedPaths) != 1 || scopedPaths[0] != "daily/today" {
		t.Fatalf("SearchPagePaths(roadmap, daily) = %v, want only daily/today", scopedPaths)
	}

	updated := Document{Path: "daily/today", Title: "Today", RawMarkdown: "# Today\n\nNothing planned.\n"}
	if err := store.ReplacePage(ctx, updated); err != nil {
		t.Fatalf("ReplacePage() error = %v", err)
	}
	afterUpdate, err := store.SearchPagePaths(ctx, "roadmap", "", 10)
	if err != nil {
		t.Fatalf("SearchPagePaths(after update) error = %v", err)
	}
	if len(afterUpdate) != 1 || afterUpdate[0] != "projects/roadmap" {
		t.Fatalf("SearchPagePaths after update = %v, want stale match dropped", afterUpdate)
	}

	if err := store.RemovePage(ctx, "projects/roadmap"); err != nil {
		t.Fatalf("RemovePage() error = %v", err)
	}
	afterDelete, err := store.SearchPagePaths(ctx, "roadmap", "", 10)
	if err != nil {
		t.Fatalf("SearchPagePaths(after delete) error = %v", err)
	}
	if len(afterDelete) != 0 {
		t.Fatalf("SearchPagePaths after delete = %v, want empty", afterDelete)
	}

	quoted, err := store.SearchPagePaths(ctx, `pasta "salt`, "", 10)
	if err != nil {
		t.Fatalf("SearchPagePaths(quoted input) error = %v", err)
	}
	if len(quoted) != 1 || quoted[0] != "recipes/pasta" {
		t.Fatalf("SearchPagePaths(quoted input) = %v, want recipes/pasta", quoted)
	}
}

func TestSQLiteStoreFTSBackfillsLegacyDatabase(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	dbPath := filepath.Join(t.TempDir(), "legacy.db")
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("sql.Open() error = %v", err)
	}
	if _, err := db.ExecContext(ctx, `CREATE TABLE pages (
		id INTEGER PRIMARY KEY,
		path TEXT NOT NULL UNIQUE,
		title TEXT,
		raw_markdown TEXT NOT NULL DEFAULT '',
		created_at TEXT,
		updated_at TEXT
	);`); err != nil {
		_ = db.Close()
		t.Fatalf("ExecContext(create legacy pages) error = %v", err)
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO pages(path, title, raw_markdown) VALUES('notes/legacy', 'Legacy', 'Older content about migrations.');`); err != nil {
		_ = db.Close()
		t.Fatalf("ExecContext(insert legacy page) error = %v", err)
	}
	if err := db.Close(); err != nil {
		t.Fatalf("Close(legacy db) error = %v", err)
	}

	store, err := OpenSQLitePath(ctx, dbPath)
	if err != nil {
		t.Fatalf("OpenSQLitePath() error = %v", err)
	}
	defer func() {
		_ = store.Close()
	}()

	paths, err := store.SearchPagePaths(ctx, "migrations", "", 10)
	if err != nil {
		t.Fatalf("SearchPagePaths() error = %v", err)
	}
	if len(paths) != 1 || paths[0] != "notes/legacy" {
		t.Fatalf("SearchPagePaths(legacy) = %v, want notes/legacy", paths)
	}
}

func TestSQLiteStorePersistsTaskClick(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	store, err := OpenSQLitePath(ctx, filepath.Join(t.TempDir(), "noterious.db"))
	if err != nil {
		t.Fatalf("OpenSQLitePath() error = %v", err)
	}
	defer func() {
		_ = store.Close()
	}()

	remind := "2026-04-29 18:00"
	click := "noteriousshopping://shopping?list=weekly"
	document := Document{
		Path:        "daily/today",
		Title:       "Today",
		RawMarkdown: "# Today\n\n- [ ] Follow up remind:: 2026-04-29 18:00 click:: noteriousshopping://shopping?list=weekly\n",
		CreatedAt:   "2026-04-29T10:00:00Z",
		UpdatedAt:   "2026-04-29T10:00:00Z",
		Tasks: []Task{{
			Ref:    "daily/today:3",
			Page:   "daily/today",
			Line:   3,
			Text:   "Follow up",
			State:  "todo",
			Done:   false,
			Remind: &remind,
			Click:  &click,
			Who:    []string{"Ralf"},
		}},
	}

	if err := store.ReplaceAll(ctx, []Document{document}); err != nil {
		t.Fatalf("ReplaceAll() error = %v", err)
	}

	tasks, err := store.ListTasks(ctx)
	if err != nil {
		t.Fatalf("ListTasks() error = %v", err)
	}
	if len(tasks) != 1 {
		t.Fatalf("tasks = %#v", tasks)
	}
	if tasks[0].Click == nil || *tasks[0].Click != click {
		t.Fatalf("task click = %#v", tasks[0].Click)
	}
}
