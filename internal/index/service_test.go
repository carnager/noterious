package index

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/carnager/noterious/internal/vault"
)

func TestReindexPageUpdatesOnePageAndPreservesOthers(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	if err := os.MkdirAll(filepath.Join(vaultDir, "daily"), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	if err := os.MkdirAll(filepath.Join(vaultDir, "projects"), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}

	files := map[string]string{
		filepath.Join(vaultDir, "daily", "today.md"): `# Today

- [ ] First task due:: 2026-05-01
`,
		filepath.Join(vaultDir, "projects", "alpha.md"): `# Alpha

- [ ] Second task due:: 2026-04-30
`,
	}
	for filePath, content := range files {
		if err := os.WriteFile(filePath, []byte(content), 0o644); err != nil {
			t.Fatalf("WriteFile(%q) error = %v", filePath, err)
		}
	}

	vaultService := vault.NewService(vaultDir)
	indexService := NewService(dataDir)
	if err := indexService.Open(context.Background()); err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	defer func() {
		_ = indexService.Close()
	}()
	if err := indexService.RebuildFromVault(context.Background(), vaultService); err != nil {
		t.Fatalf("RebuildFromVault() error = %v", err)
	}

	if err := os.WriteFile(filepath.Join(vaultDir, "daily", "today.md"), []byte("# Today\n\n- [x] First task due:: 2026-05-02\n"), 0o644); err != nil {
		t.Fatalf("WriteFile(updated) error = %v", err)
	}

	if err := indexService.ReindexPage(context.Background(), vaultService, "daily/today"); err != nil {
		t.Fatalf("ReindexPage() error = %v", err)
	}

	updatedTask, err := indexService.GetTask(context.Background(), "daily/today:3")
	if err != nil {
		t.Fatalf("GetTask(updated) error = %v", err)
	}
	if !updatedTask.Done || updatedTask.State != "done" {
		t.Fatalf("updated task = %#v", updatedTask)
	}
	if updatedTask.Due == nil || *updatedTask.Due != "2026-05-02" {
		t.Fatalf("updated due = %#v", updatedTask.Due)
	}

	otherTask, err := indexService.GetTask(context.Background(), "projects/alpha:3")
	if err != nil {
		t.Fatalf("GetTask(other) error = %v", err)
	}
	if otherTask.Done || otherTask.State != "todo" {
		t.Fatalf("other task = %#v", otherTask)
	}
	if otherTask.Due == nil || *otherTask.Due != "2026-04-30" {
		t.Fatalf("other due = %#v", otherTask.Due)
	}
}
