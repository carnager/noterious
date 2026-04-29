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
