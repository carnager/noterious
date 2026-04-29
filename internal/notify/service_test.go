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

	"github.com/carnager/noterious/internal/auth"
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

	dateTimeWithT, ok := parseNotificationTime("2026-04-24T13:45", 9, loc)
	if !ok {
		t.Fatal("parseNotificationTime(datetime with T) = false")
	}
	if dateTimeWithT.Hour() != 13 || dateTimeWithT.Minute() != 45 {
		t.Fatalf("dateTimeWithT = %v", dateTimeWithT)
	}
}

func TestParseReminderNotificationTimeCombinesDueDateAndReminderClock(t *testing.T) {
	loc := time.FixedZone("CEST", 2*60*60)

	at, raw, ok := parseReminderNotificationTime("13:45", "2026-04-24", loc)
	if !ok {
		t.Fatal("parseReminderNotificationTime(clock) = false")
	}
	if raw != "2026-04-24 13:45" {
		t.Fatalf("raw = %q", raw)
	}
	if at.Year() != 2026 || at.Month() != time.April || at.Day() != 24 || at.Hour() != 13 || at.Minute() != 45 {
		t.Fatalf("at = %v", at)
	}
}

func TestParseReminderNotificationTimeKeepsLegacyDateTimeReminders(t *testing.T) {
	loc := time.FixedZone("CEST", 2*60*60)

	at, raw, ok := parseReminderNotificationTime("2026-04-24 13:45", "", loc)
	if !ok {
		t.Fatal("parseReminderNotificationTime(datetime) = false")
	}
	if raw != "2026-04-24 13:45" {
		t.Fatalf("raw = %q", raw)
	}
	if at.Hour() != 13 || at.Minute() != 45 {
		t.Fatalf("at = %v", at)
	}
}

func TestPollSendsAndDeduplicatesReminderNotifications(t *testing.T) {
	tempDir := t.TempDir()
	vaultDir := filepath.Join(tempDir, "vault")
	indexDataDir := filepath.Join(tempDir, "index-data")
	authDataDir := filepath.Join(tempDir, "auth-data")
	notifyDataDir := filepath.Join(tempDir, "notify-data")
	if err := os.MkdirAll(filepath.Join(vaultDir, "daily"), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	raw := "# Today\n\n- [ ] Follow up with team due:: 2026-04-24 remind:: 09:30 who:: [Ralf] click:: noteriousshopping://shopping?list=weekly\n"
	pageFile := filepath.Join(vaultDir, "daily", "today.md")
	if err := os.WriteFile(pageFile, []byte(raw), 0o644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}

	indexService := index.NewService(indexDataDir)
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
	authService, err := auth.NewService(context.Background(), authDataDir, "test_session", time.Hour)
	if err != nil {
		t.Fatalf("auth.NewService() error = %v", err)
	}
	defer func() {
		_ = authService.Close()
	}()
	user, err := authService.CreateInitialAccount(context.Background(), "ralf", "secret-pass")
	if err != nil {
		t.Fatalf("CreateInitialAccount() error = %v", err)
	}

	requests := 0
	var lastBody string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests++
		body, _ := io.ReadAll(r.Body)
		lastBody = string(body)
		if got := r.Header.Get("Title"); got != "Task reminder" {
			t.Fatalf("Title header = %q", got)
		}
		if got := r.Header.Get("Click"); got != "noteriousshopping://shopping?list=weekly" {
			t.Fatalf("Click header = %q", got)
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	if _, err := authService.UpdateUserSettings(context.Background(), user.ID, auth.UserSettings{
		Notifications: auth.NotificationSettings{
			NtfyTopicURL: server.URL,
		},
	}); err != nil {
		t.Fatalf("UpdateUserSettings() error = %v", err)
	}

	service, err := NewService(notifyDataDir, indexService, authService)
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
	if !strings.Contains(lastBody, "Follow up with team") || !strings.Contains(lastBody, "Reminder: 2026-04-24 09:30") {
		t.Fatalf("lastBody = %q", lastBody)
	}

	if err := service.Poll(context.Background()); err != nil {
		t.Fatalf("second Poll() error = %v", err)
	}
	if requests != 1 {
		t.Fatalf("requests after second poll = %d, want 1", requests)
	}
}

func TestPollSendsFrontmatterNotificationForNotes(t *testing.T) {
	tempDir := t.TempDir()
	vaultDir := filepath.Join(tempDir, "vault")
	indexDataDir := filepath.Join(tempDir, "index-data")
	authDataDir := filepath.Join(tempDir, "auth-data")
	notifyDataDir := filepath.Join(tempDir, "notify-data")
	if err := os.MkdirAll(filepath.Join(vaultDir, "contacts"), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	raw := strings.Join([]string{
		"---",
		"birthday_notification: 2026-04-24 09:30",
		"birthday_notification_click: noteriousshopping://shopping?contact=ralf",
		"---",
		"# Ralf",
		"",
		"Birthday note",
		"",
	}, "\n")
	pageFile := filepath.Join(vaultDir, "contacts", "ralf.md")
	if err := os.WriteFile(pageFile, []byte(raw), 0o644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}

	indexService := index.NewService(indexDataDir)
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
	authService, err := auth.NewService(context.Background(), authDataDir, "test_session", time.Hour)
	if err != nil {
		t.Fatalf("auth.NewService() error = %v", err)
	}
	defer func() {
		_ = authService.Close()
	}()
	user, err := authService.CreateInitialAccount(context.Background(), "ralf", "secret-pass")
	if err != nil {
		t.Fatalf("CreateInitialAccount() error = %v", err)
	}

	requests := 0
	var lastBody string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests++
		body, _ := io.ReadAll(r.Body)
		lastBody = string(body)
		if got := r.Header.Get("Title"); got != "Note reminder" {
			t.Fatalf("Title header = %q", got)
		}
		if got := r.Header.Get("X-Note-Page"); got != "contacts/ralf" {
			t.Fatalf("X-Note-Page header = %q", got)
		}
		if got := r.Header.Get("X-Note-Field"); got != "birthday_notification" {
			t.Fatalf("X-Note-Field header = %q", got)
		}
		if got := r.Header.Get("Click"); got != "noteriousshopping://shopping?contact=ralf" {
			t.Fatalf("Click header = %q", got)
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	if _, err := authService.UpdateUserSettings(context.Background(), user.ID, auth.UserSettings{
		Notifications: auth.NotificationSettings{
			NtfyTopicURL: server.URL,
		},
	}); err != nil {
		t.Fatalf("UpdateUserSettings() error = %v", err)
	}

	service, err := NewService(notifyDataDir, indexService, authService)
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
	if !strings.Contains(lastBody, "Page: contacts/ralf") || !strings.Contains(lastBody, "Reminder: 2026-04-24 09:30") {
		t.Fatalf("lastBody = %q", lastBody)
	}
}

func TestIsNotificationFrontmatterKeyExcludesClickTargets(t *testing.T) {
	t.Parallel()

	for _, key := range []string{
		"notification_click",
		"birthday_notification_click",
		"birthday-notification-click",
		"click",
	} {
		if isNotificationFrontmatterKey(key) {
			t.Fatalf("isNotificationFrontmatterKey(%q) = true, want false", key)
		}
	}
}

func TestPollSkipsDueOnlyTasksWithoutReminderTime(t *testing.T) {
	tempDir := t.TempDir()
	vaultDir := filepath.Join(tempDir, "vault")
	indexDataDir := filepath.Join(tempDir, "index-data")
	authDataDir := filepath.Join(tempDir, "auth-data")
	notifyDataDir := filepath.Join(tempDir, "notify-data")
	if err := os.MkdirAll(filepath.Join(vaultDir, "daily"), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	raw := "# Today\n\n- [ ] Follow up with team due:: 2026-04-24 who:: [Ralf]\n"
	pageFile := filepath.Join(vaultDir, "daily", "today.md")
	if err := os.WriteFile(pageFile, []byte(raw), 0o644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}

	indexService := index.NewService(indexDataDir)
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
	authService, err := auth.NewService(context.Background(), authDataDir, "test_session", time.Hour)
	if err != nil {
		t.Fatalf("auth.NewService() error = %v", err)
	}
	defer func() {
		_ = authService.Close()
	}()
	user, err := authService.CreateInitialAccount(context.Background(), "ralf", "secret-pass")
	if err != nil {
		t.Fatalf("CreateInitialAccount() error = %v", err)
	}

	requests := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests++
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	if _, err := authService.UpdateUserSettings(context.Background(), user.ID, auth.UserSettings{
		Notifications: auth.NotificationSettings{
			NtfyTopicURL: server.URL,
		},
	}); err != nil {
		t.Fatalf("UpdateUserSettings() error = %v", err)
	}

	service, err := NewService(notifyDataDir, indexService, authService)
	if err != nil {
		t.Fatalf("NewService() error = %v", err)
	}
	service.now = func() time.Time {
		return time.Date(2026, time.April, 24, 10, 0, 0, 0, time.Local)
	}

	if err := service.Poll(context.Background()); err != nil {
		t.Fatalf("Poll() error = %v", err)
	}
	if requests != 0 {
		t.Fatalf("requests = %d, want 0", requests)
	}
}

func TestPollSkipsWhenIndexDatabaseDoesNotExist(t *testing.T) {
	tempDir := t.TempDir()
	indexDataDir := filepath.Join(tempDir, "index-data")
	authDataDir := filepath.Join(tempDir, "auth-data")
	notifyDataDir := filepath.Join(tempDir, "notify-data")

	indexService := index.NewService(indexDataDir)
	if err := indexService.Open(context.Background()); err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	defer func() {
		_ = indexService.Close()
	}()

	authService, err := auth.NewService(context.Background(), authDataDir, "test_session", time.Hour)
	if err != nil {
		t.Fatalf("auth.NewService() error = %v", err)
	}
	defer func() {
		_ = authService.Close()
	}()
	if _, err := authService.CreateInitialAccount(context.Background(), "admin", "secret-pass"); err != nil {
		t.Fatalf("CreateInitialAccount() error = %v", err)
	}

	service, err := NewService(notifyDataDir, indexService, authService)
	if err != nil {
		t.Fatalf("NewService() error = %v", err)
	}

	defaultIndexDB := indexService.DatabasePath()
	if _, err := os.Stat(defaultIndexDB); !os.IsNotExist(err) {
		t.Fatalf("default index db exists before Poll(): %v", err)
	}

	if err := service.Poll(context.Background()); err != nil {
		t.Fatalf("Poll() error = %v", err)
	}

	if _, err := os.Stat(defaultIndexDB); !os.IsNotExist(err) {
		t.Fatalf("default index db exists after Poll(): %v", err)
	}
}
