package notify

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/carnager/noterious/internal/index"
	"github.com/carnager/noterious/internal/vault"
)

func TestParseNotificationTime(t *testing.T) {
	loc := time.FixedZone("CEST", 2*60*60)

	dateOnly, ok := parseNotificationTime("2026-04-24", 9, loc)
	if !ok {
		t.Fatal("parseNotificationTime(date) = false")
	}
	if dateOnly.Hour() != 9 || dateOnly.Location() != loc {
		t.Fatalf("dateOnly = %v", dateOnly)
	}

	dateTime, ok := parseNotificationTime("2026-04-24 13:45", 9, loc)
	if !ok {
		t.Fatal("parseNotificationTime(datetime) = false")
	}
	if dateTime.Hour() != 13 || dateTime.Minute() != 45 {
		t.Fatalf("dateTime = %v", dateTime)
	}
}

func TestPollSendsAndDeduplicatesDueNotifications(t *testing.T) {
	tempDir := t.TempDir()
	vaultDir := filepath.Join(tempDir, "vault")
	dataDir := filepath.Join(tempDir, "data")
	if err := os.MkdirAll(filepath.Join(vaultDir, "daily"), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	raw := "# Today\n\n- [ ] Follow up with team due:: 2026-04-24 who:: [Ralf]\n"
	pageFile := filepath.Join(vaultDir, "daily", "today.md")
	if err := os.WriteFile(pageFile, []byte(raw), 0o644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}

	indexService := index.NewService(dataDir)
	if err := indexService.Open(context.Background()); err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	defer func() {
		_ = indexService.Close()
	}()
	vaultService := vault.NewService(vaultDir)
	if err := indexService.RebuildFromVault(context.Background(), vaultService); err != nil {
		t.Fatalf("RebuildFromVault() error = %v", err)
	}

	requests := 0
	var lastBody string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests++
		body, _ := io.ReadAll(r.Body)
		lastBody = string(body)
		if got := r.Header.Get("Title"); got != "Task due" {
			t.Fatalf("Title header = %q", got)
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	service, err := NewService(dataDir, indexService, server.URL, "")
	if err != nil {
		t.Fatalf("NewService() error = %v", err)
	}
	service.now = func() time.Time {
		return time.Date(2026, time.April, 24, 10, 0, 0, 0, time.Local)
	}

	if err := service.Poll(context.Background()); err != nil {
		t.Fatalf("Poll() error = %v", err)
	}
	if requests != 1 {
		t.Fatalf("requests = %d, want 1", requests)
	}
	if !strings.Contains(lastBody, "Follow up with team") || !strings.Contains(lastBody, "Due: 2026-04-24") {
		t.Fatalf("lastBody = %q", lastBody)
	}

	if err := service.Poll(context.Background()); err != nil {
		t.Fatalf("second Poll() error = %v", err)
	}
	if requests != 1 {
		t.Fatalf("requests after second poll = %d, want 1", requests)
	}
}
