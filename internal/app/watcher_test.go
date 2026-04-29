package app

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/carnager/noterious/internal/httpapi"
	"github.com/carnager/noterious/internal/index"
	"github.com/carnager/noterious/internal/query"
	"github.com/carnager/noterious/internal/vault"
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
	watcher, err := NewVaultWatcher(context.Background(), vault.Vault{}, vaultService, indexService, queryService, broker)
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
	var queryPayload struct {
		Page        string `json:"page"`
		TriggerPage string `json:"triggerPage"`
		BlockCount  int    `json:"blockCount"`
		Blocks      []struct {
			Page       string `json:"page"`
			RenderHint string `json:"renderHint"`
		} `json:"blocks"`
	}
	queryPayloadBytes, err := json.Marshal(received[4].Data)
	if err != nil {
		t.Fatalf("Marshal(query payload) error = %v", err)
	}
	if err := json.Unmarshal(queryPayloadBytes, &queryPayload); err != nil {
		t.Fatalf("Unmarshal(query payload) error = %v", err)
	}
	if queryPayload.Page != "dashboards/tasks" || queryPayload.TriggerPage != "daily/today" || queryPayload.BlockCount != 1 {
		t.Fatalf("query payload = %#v", queryPayload)
	}
	if len(queryPayload.Blocks) != 1 || queryPayload.Blocks[0].Page != "dashboards/tasks" || queryPayload.Blocks[0].RenderHint != "empty" {
		t.Fatalf("query blocks = %#v", queryPayload.Blocks)
	}
}

func TestVaultWatcherPollPropagatesAcknowledgedOrigin(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	if err := os.MkdirAll(filepath.Join(vaultDir, "daily"), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	pagePath := filepath.Join(vaultDir, "daily", "today.md")
	if err := os.WriteFile(pagePath, []byte("# Today\n"), 0o644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
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
	watcher, err := NewVaultWatcher(context.Background(), vault.Vault{}, vaultService, indexService, queryService, broker)
	if err != nil {
		t.Fatalf("NewVaultWatcher() error = %v", err)
	}
	events, unsubscribe := broker.Subscribe()
	defer unsubscribe()

	watcher.mu.Lock()
	knownModTime := watcher.known["daily/today"]
	watcher.mu.Unlock()

	future := time.Now().Add(2 * time.Second)
	if err := os.WriteFile(pagePath, []byte("# Today\n\nBody.\n"), 0o644); err != nil {
		t.Fatalf("WriteFile(updated) error = %v", err)
	}
	if err := os.Chtimes(pagePath, future, future); err != nil {
		t.Fatalf("Chtimes() error = %v", err)
	}

	watcher.Acknowledge(httpapi.WithEventOrigin(context.Background(), "tab-watcher"), "daily/today")

	watcher.mu.Lock()
	watcher.known["daily/today"] = knownModTime
	watcher.mu.Unlock()

	if err := watcher.Poll(context.Background()); err != nil {
		t.Fatalf("Poll() error = %v", err)
	}

	select {
	case event := <-events:
		if event.Type != "page.changed" {
			t.Fatalf("first event = %#v", event)
		}
		encoded, err := json.Marshal(event.Data)
		if err != nil {
			t.Fatalf("Marshal(page payload) error = %v", err)
		}
		var pagePayloadDecoded struct {
			Page           string `json:"page"`
			OriginClientID string `json:"originClientId"`
		}
		if err := json.Unmarshal(encoded, &pagePayloadDecoded); err != nil {
			t.Fatalf("Unmarshal(page payload) error = %v", err)
		}
		if pagePayloadDecoded.Page != "daily/today" || pagePayloadDecoded.OriginClientID != "tab-watcher" {
			t.Fatalf("page payload = %#v", pagePayloadDecoded)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for watcher page.changed")
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
	watcher, err := NewVaultWatcher(context.Background(), vault.Vault{}, vaultService, indexService, queryService, broker)
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
