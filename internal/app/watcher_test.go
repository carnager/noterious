package app

import (
	"context"
	"errors"
	"testing"

	"os"
	"path/filepath"

	"github.com/carnager/noterious/internal/httpapi"
	"github.com/carnager/noterious/internal/index"
	"github.com/carnager/noterious/internal/query"
	"github.com/carnager/noterious/internal/vault"
	"github.com/carnager/noterious/internal/workspaces"
)

func TestVaultWatcherPollReindexesExternalEdit(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	if err := os.MkdirAll(filepath.Join(vaultDir, "daily"), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	if err := os.MkdirAll(filepath.Join(vaultDir, "dashboards"), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}

	files := map[string]string{
		filepath.Join(vaultDir, "daily", "today.md"): `# Today

- [ ] First task due:: 2026-05-01
`,
		filepath.Join(vaultDir, "dashboards", "tasks.md"): "# Tasks\n\n```query\nfrom tasks\nwhere done = false\nselect ref\n```\n",
	}
	for filePath, content := range files {
		if err := os.WriteFile(filePath, []byte(content), 0o644); err != nil {
			t.Fatalf("WriteFile(%q) error = %v", filePath, err)
		}
	}

	vaultService := vault.NewService(vaultDir)
	indexService := index.NewService(dataDir)
	if err := indexService.Open(context.Background()); err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	defer func() {
		_ = indexService.Close()
	}()
	if err := indexService.RebuildFromVault(context.Background(), vaultService); err != nil {
		t.Fatalf("RebuildFromVault() error = %v", err)
	}
	queryService := query.NewService()
	if err := queryService.RefreshAll(context.Background(), indexService); err != nil {
		t.Fatalf("RefreshAll() error = %v", err)
	}

	broker := httpapi.NewEventBroker()
	watcher, err := NewVaultWatcher(context.Background(), workspaces.Workspace{}, vaultService, indexService, queryService, broker)
	if err != nil {
		t.Fatalf("NewVaultWatcher() error = %v", err)
	}

	events, unsubscribe := broker.Subscribe()
	defer unsubscribe()

	if err := os.WriteFile(filepath.Join(vaultDir, "daily", "today.md"), []byte("# Today\n\n- [x] First task due:: 2026-05-02\n"), 0o644); err != nil {
		t.Fatalf("WriteFile(updated) error = %v", err)
	}

	if err := watcher.Poll(context.Background()); err != nil {
		t.Fatalf("Poll() error = %v", err)
	}

	updatedTask, err := indexService.GetTask(context.Background(), "daily/today:3")
	if err != nil {
		t.Fatalf("GetTask() error = %v", err)
	}
	if !updatedTask.Done || updatedTask.State != "done" {
		t.Fatalf("updated task = %#v", updatedTask)
	}
	if updatedTask.Due == nil || *updatedTask.Due != "2026-05-02" {
		t.Fatalf("updated due = %#v", updatedTask.Due)
	}
	queryBlocks, err := indexService.GetQueryBlocks(context.Background(), "dashboards/tasks")
	if err != nil {
		t.Fatalf("GetQueryBlocks() error = %v", err)
	}
	if len(queryBlocks) != 1 {
		t.Fatalf("queryBlocks = %#v", queryBlocks)
	}
	result, ok := queryBlocks[0].Result.(map[string]any)
	if !ok {
		t.Fatalf("cached result = %#v", queryBlocks[0].Result)
	}
	rows, ok := result["rows"].([]any)
	if !ok || len(rows) != 0 {
		t.Fatalf("cached query rows = %#v", result["rows"])
	}

	received := make([]httpapi.Event, 0, 5)
	for len(received) < 5 {
		select {
		case event := <-events:
			received = append(received, event)
		default:
			t.Fatalf("received %d events, want at least 5", len(received))
		}
	}

	if received[0].Type != "page.changed" {
		t.Fatalf("first event = %#v", received[0])
	}
	if received[1].Type != "derived.changed" {
		t.Fatalf("second event = %#v", received[1])
	}
	if received[2].Type != "query-block.changed" {
		t.Fatalf("third event = %#v", received[2])
	}
	if received[3].Type != "derived.changed" {
		t.Fatalf("fourth event = %#v", received[3])
	}
	if received[4].Type != "query.changed" {
		t.Fatalf("fifth event = %#v", received[4])
	}
	queryPayload, ok := received[4].Data.(map[string]any)
	if !ok {
		t.Fatalf("query payload = %#v", received[4].Data)
	}
	if queryPayload["page"] != "dashboards/tasks" || queryPayload["triggerPage"] != "daily/today" || queryPayload["blockCount"] != 1 {
		t.Fatalf("query payload = %#v", queryPayload)
	}
	blocks, ok := queryPayload["blocks"].([]map[string]any)
	if !ok || len(blocks) != 1 || blocks[0]["page"] != "dashboards/tasks" || blocks[0]["renderHint"] != "empty" {
		t.Fatalf("query blocks = %#v", queryPayload["blocks"])
	}
}

func TestVaultWatcherPollRemovesDeletedPage(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	if err := os.MkdirAll(filepath.Join(vaultDir, "daily"), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	if err := os.MkdirAll(filepath.Join(vaultDir, "dashboards"), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}

	files := map[string]string{
		filepath.Join(vaultDir, "daily", "today.md"): `# Today

- [ ] First task due:: 2026-05-01
`,
		filepath.Join(vaultDir, "dashboards", "tasks.md"): "# Tasks\n\n```query\nfrom tasks\nwhere done = false\nselect ref\n```\n",
	}
	for filePath, content := range files {
		if err := os.WriteFile(filePath, []byte(content), 0o644); err != nil {
			t.Fatalf("WriteFile(%q) error = %v", filePath, err)
		}
	}

	vaultService := vault.NewService(vaultDir)
	indexService := index.NewService(dataDir)
	if err := indexService.Open(context.Background()); err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	defer func() {
		_ = indexService.Close()
	}()
	if err := indexService.RebuildFromVault(context.Background(), vaultService); err != nil {
		t.Fatalf("RebuildFromVault() error = %v", err)
	}
	queryService := query.NewService()
	if err := queryService.RefreshAll(context.Background(), indexService); err != nil {
		t.Fatalf("RefreshAll() error = %v", err)
	}

	broker := httpapi.NewEventBroker()
	watcher, err := NewVaultWatcher(context.Background(), workspaces.Workspace{}, vaultService, indexService, queryService, broker)
	if err != nil {
		t.Fatalf("NewVaultWatcher() error = %v", err)
	}

	events, unsubscribe := broker.Subscribe()
	defer unsubscribe()

	if err := os.Remove(filepath.Join(vaultDir, "daily", "today.md")); err != nil {
		t.Fatalf("Remove() error = %v", err)
	}

	if err := watcher.Poll(context.Background()); err != nil {
		t.Fatalf("Poll() error = %v", err)
	}

	_, err = indexService.GetPage(context.Background(), "daily/today")
	if !errors.Is(err, index.ErrPageNotFound) {
		t.Fatalf("GetPage() error = %v, want ErrPageNotFound", err)
	}
	_, err = indexService.GetTask(context.Background(), "daily/today:3")
	if !errors.Is(err, index.ErrTaskNotFound) {
		t.Fatalf("GetTask() error = %v, want ErrTaskNotFound", err)
	}
	queryBlocks, err := indexService.GetQueryBlocks(context.Background(), "dashboards/tasks")
	if err != nil {
		t.Fatalf("GetQueryBlocks() error = %v", err)
	}
	if len(queryBlocks) != 1 {
		t.Fatalf("queryBlocks = %#v", queryBlocks)
	}
	result, ok := queryBlocks[0].Result.(map[string]any)
	if !ok {
		t.Fatalf("cached result = %#v", queryBlocks[0].Result)
	}
	rows, ok := result["rows"].([]any)
	if !ok || len(rows) != 0 {
		t.Fatalf("cached query rows = %#v", result["rows"])
	}

	received := make([]httpapi.Event, 0, 4)
	for len(received) < 4 {
		select {
		case event := <-events:
			received = append(received, event)
		default:
			t.Fatalf("received %d events, want at least 4", len(received))
		}
	}

	if received[0].Type != "page.deleted" {
		t.Fatalf("first event = %#v", received[0])
	}
	if received[1].Type != "query-block.changed" {
		t.Fatalf("second event = %#v", received[1])
	}
	if received[2].Type != "derived.changed" {
		t.Fatalf("third event = %#v", received[2])
	}
	if received[3].Type != "query.changed" {
		t.Fatalf("fourth event = %#v", received[3])
	}
}
