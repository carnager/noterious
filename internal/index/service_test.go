package index

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/carnager/noterious/internal/vault"
	"github.com/carnager/noterious/internal/workspaces"
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

func TestWorkspaceStoresAreIsolated(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	dataDir := filepath.Join(rootDir, "data")
	vaultOneDir := filepath.Join(rootDir, "vault-one")
	vaultTwoDir := filepath.Join(rootDir, "vault-two")

	if err := os.MkdirAll(vaultOneDir, 0o755); err != nil {
		t.Fatalf("MkdirAll(vaultOne) error = %v", err)
	}
	if err := os.MkdirAll(vaultTwoDir, 0o755); err != nil {
		t.Fatalf("MkdirAll(vaultTwo) error = %v", err)
	}
	if err := os.WriteFile(filepath.Join(vaultOneDir, "alpha.md"), []byte("# Alpha\n"), 0o644); err != nil {
		t.Fatalf("WriteFile(alpha) error = %v", err)
	}
	if err := os.WriteFile(filepath.Join(vaultTwoDir, "beta.md"), []byte("# Beta\n"), 0o644); err != nil {
		t.Fatalf("WriteFile(beta) error = %v", err)
	}

	indexService := NewService(dataDir)
	if err := indexService.Open(context.Background()); err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	defer func() {
		_ = indexService.Close()
	}()

	workspaceOne := workspaces.WithWorkspace(context.Background(), workspaces.Workspace{ID: 1, VaultPath: vaultOneDir})
	workspaceTwo := workspaces.WithWorkspace(context.Background(), workspaces.Workspace{ID: 2, VaultPath: vaultTwoDir})

	if err := indexService.RebuildFromVault(workspaceOne, vault.NewService(vaultOneDir)); err != nil {
		t.Fatalf("RebuildFromVault(workspaceOne) error = %v", err)
	}
	if err := indexService.RebuildFromVault(workspaceTwo, vault.NewService(vaultTwoDir)); err != nil {
		t.Fatalf("RebuildFromVault(workspaceTwo) error = %v", err)
	}

	pagesOne, err := indexService.ListPages(workspaceOne)
	if err != nil {
		t.Fatalf("ListPages(workspaceOne) error = %v", err)
	}
	if len(pagesOne) != 1 || pagesOne[0].Path != "alpha" {
		t.Fatalf("pagesOne = %#v", pagesOne)
	}

	pagesTwo, err := indexService.ListPages(workspaceTwo)
	if err != nil {
		t.Fatalf("ListPages(workspaceTwo) error = %v", err)
	}
	if len(pagesTwo) != 1 || pagesTwo[0].Path != "beta" {
		t.Fatalf("pagesTwo = %#v", pagesTwo)
	}

	if _, err := indexService.PutSavedQuery(workspaceOne, SavedQuery{Name: "open-tasks", Title: "Open Tasks", Query: "from tasks"}); err != nil {
		t.Fatalf("PutSavedQuery(workspaceOne) error = %v", err)
	}
	if _, err := indexService.GetSavedQuery(workspaceTwo, "open-tasks"); err != ErrSavedQueryNotFound {
		t.Fatalf("GetSavedQuery(workspaceTwo) error = %v, want %v", err, ErrSavedQueryNotFound)
	}

	if got := indexService.DatabasePathForWorkspace(1); got == indexService.DatabasePathForWorkspace(2) {
		t.Fatalf("workspace database paths should differ: %q", got)
	}
}
