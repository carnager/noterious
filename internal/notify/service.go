package notify

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/carnager/noterious/internal/auth"
	"github.com/carnager/noterious/internal/index"
)

type Service struct {
	index     *index.Service
	auth      *auth.Service
	statePath string
	client    *http.Client
	now       func() time.Time

	mu   sync.Mutex
	sent map[string]string
}

func NewService(dataDir string, indexService *index.Service, authService *auth.Service) (*Service, error) {
	if strings.TrimSpace(dataDir) == "" {
		return nil, fmt.Errorf("data dir must not be empty")
	}
	if err := os.MkdirAll(dataDir, 0o755); err != nil {
		return nil, fmt.Errorf("create notify data dir: %w", err)
	}
	service := &Service{
		index:     indexService,
		auth:      authService,
		statePath: filepath.Join(dataDir, "ntfy-state.json"),
		client:    &http.Client{Timeout: 10 * time.Second},
		now:       time.Now,
		sent:      make(map[string]string),
	}
	if err := service.loadState(); err != nil {
		return nil, err
	}
	return service, nil
}

func (s *Service) Enabled() bool {
	return s != nil && s.index != nil && s.auth != nil
}

func (s *Service) Run(ctx context.Context, interval time.Duration) {
	if !s.Enabled() || interval <= 0 {
		return
	}

	_ = s.Poll(ctx)

	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			slog.Info("ntfy notifier stopped")
			return
		case <-ticker.C:
			if err := s.Poll(ctx); err != nil {
				slog.Error("ntfy notifier poll failed", "error", err)
			}
		}
	}
}

func (s *Service) Poll(ctx context.Context) error {
	if !s.Enabled() {
		return nil
	}
	if !s.indexDatabaseExists(ctx) {
		return nil
	}

	tasks, err := s.index.ListTasks(ctx)
	if err != nil {
		return fmt.Errorf("list tasks: %w", err)
	}
	pages, err := s.index.ListPages(ctx)
	if err != nil {
		return fmt.Errorf("list pages: %w", err)
	}
	targets, err := s.auth.ListNotificationTargets(ctx)
	if err != nil {
		return fmt.Errorf("list notification targets: %w", err)
	}
	targetsByUser := make(map[string]auth.NotificationTarget, len(targets))
	for _, target := range targets {
		targetsByUser[normalizeUsername(target.Username)] = target
	}
	var soleTarget auth.NotificationTarget
	hasSoleTarget := len(targets) == 1
	if hasSoleTarget {
		soleTarget = targets[0]
	}

	now := s.now()
	activeKeys := make(map[string]struct{})
	updated := false
	for _, task := range tasks {
		if task.Done {
			continue
		}
		candidate, ok := taskNotificationCandidate(task, now.Location())
		if !ok {
			continue
		}
		recipients := notificationTargetsForTask(task, targetsByUser, soleTarget, hasSoleTarget)
		delivered, err := s.deliverCandidate(ctx, candidate, recipients, now, activeKeys)
		if err != nil {
			return err
		}
		updated = updated || delivered
	}
	for _, page := range pages {
		if isTemplatePage(page.Path) {
			continue
		}
		recipients := notificationTargetsForPage(page, targetsByUser, soleTarget, hasSoleTarget)
		if len(recipients) == 0 {
			continue
		}
		for _, candidate := range noteNotificationCandidates(page, now.Location()) {
			delivered, err := s.deliverCandidate(ctx, candidate, recipients, now, activeKeys)
			if err != nil {
				return err
			}
			updated = updated || delivered
		}
	}

	if s.prune(activeKeys) {
		updated = true
	}
	if updated {
		if err := s.saveState(); err != nil {
			return err
		}
	}
	return nil
}

func (s *Service) indexDatabaseExists(ctx context.Context) bool {
	if s == nil || s.index == nil {
		return false
	}
	dbPath := s.index.DatabasePath()
	if strings.TrimSpace(dbPath) == "" {
		return false
	}
	_, err := os.Stat(dbPath)
	return err == nil
}

type stateFile struct {
	Sent map[string]string `json:"sent"`
}

type candidateNotification struct {
	Key      string
	Kind     string
	At       time.Time
	Raw      string
	Click    string
	Title    string
	Body     string
	Tags     string
	Priority string
	Page     string
	TaskRef  string
	FieldKey string
}

func taskNotificationCandidate(task index.Task, loc *time.Location) (candidateNotification, bool) {
	if task.Remind == nil || strings.TrimSpace(*task.Remind) == "" {
		return candidateNotification{}, false
	}
	at, raw, ok := parseReminderNotificationTime(*task.Remind, derefTaskValue(task.Due), loc)
	if !ok {
		return candidateNotification{}, false
	}
	return buildTaskCandidate(task, "remind", raw, at, strings.TrimSpace(derefTaskValue(task.Click))), true
}

func noteNotificationCandidates(page index.PageSummary, loc *time.Location) []candidateNotification {
	frontmatter := page.Frontmatter
	if len(frontmatter) == 0 {
		return nil
	}

	keys := make([]string, 0, len(frontmatter))
	for key := range frontmatter {
		if isNotificationFrontmatterKey(key) {
			keys = append(keys, key)
		}
	}
	sort.Strings(keys)

	candidates := make([]candidateNotification, 0, len(keys))
	for _, key := range keys {
		raw, ok := frontmatterStringValue(frontmatter[key])
		if !ok {
			continue
		}
		at, ok := parseNotificationTime(raw, 9, loc)
		if !ok {
			continue
		}
		candidates = append(candidates, buildPageCandidate(page, key, raw, at, notificationClickTarget(page.Frontmatter, key)))
	}
	return candidates
}

func buildTaskCandidate(task index.Task, kind string, raw string, at time.Time, click string) candidateNotification {
	title := "Task due"
	tags := "calendar"
	priority := "default"
	if kind == "remind" {
		title = "Task reminder"
		tags = "alarm_clock"
		priority = "high"
	}
	parts := []string{strings.TrimSpace(task.Text)}
	if task.Page != "" {
		parts = append(parts, "Page: "+task.Page)
	}
	if strings.TrimSpace(raw) != "" {
		label := "Due"
		if kind == "remind" {
			label = "Reminder"
		}
		parts = append(parts, label+": "+strings.TrimSpace(raw))
	}
	if len(task.Who) > 0 {
		parts = append(parts, "Who: "+strings.Join(task.Who, ", "))
	}
	return candidateNotification{
		Key:      fmt.Sprintf("%s|%s|%s", task.Ref, kind, at.UTC().Format(time.RFC3339)),
		Kind:     kind,
		At:       at,
		Raw:      raw,
		Click:    click,
		Title:    title,
		Body:     strings.Join(parts, "\n"),
		Tags:     tags,
		Priority: priority,
		Page:     task.Page,
		TaskRef:  task.Ref,
	}
}

func buildPageCandidate(page index.PageSummary, fieldKey string, raw string, at time.Time, click string) candidateNotification {
	titleText := strings.TrimSpace(page.Title)
	if titleText == "" {
		titleText = strings.TrimSpace(page.Path)
	}

	parts := make([]string, 0, 4)
	if titleText != "" {
		parts = append(parts, titleText)
	}
	if page.Path != "" && page.Path != titleText {
		parts = append(parts, "Page: "+page.Path)
	}
	if fieldKey != "" && !isGenericNotificationField(fieldKey) {
		parts = append(parts, "Field: "+fieldKey)
	}
	if strings.TrimSpace(raw) != "" {
		parts = append(parts, "Reminder: "+strings.TrimSpace(raw))
	}

	return candidateNotification{
		Key:      fmt.Sprintf("page:%s|%s|%s", page.Path, fieldKey, at.UTC().Format(time.RFC3339)),
		Kind:     "notification",
		At:       at,
		Raw:      raw,
		Click:    click,
		Title:    "Note reminder",
		Body:     strings.Join(parts, "\n"),
		Tags:     "alarm_clock",
		Priority: "high",
		Page:     page.Path,
		FieldKey: fieldKey,
	}
}

func parseNotificationTime(raw string, dateOnlyHour int, loc *time.Location) (time.Time, bool) {
	text := strings.TrimSpace(raw)
	if text == "" {
		return time.Time{}, false
	}
	if parsed, err := time.ParseInLocation("2006-01-02", text, loc); err == nil {
		return time.Date(parsed.Year(), parsed.Month(), parsed.Day(), dateOnlyHour, 0, 0, 0, loc), true
	}
	if parsed, err := time.ParseInLocation("2006-01-02 15:04", text, loc); err == nil {
		return parsed, true
	}
	if parsed, err := time.ParseInLocation("2006-01-02T15:04", text, loc); err == nil {
		return parsed, true
	}
	if parsed, err := time.Parse(time.RFC3339, text); err == nil {
		return parsed, true
	}
	if parsed, err := time.Parse(time.RFC3339Nano, text); err == nil {
		return parsed, true
	}
	return time.Time{}, false
}

func parseReminderNotificationTime(remindRaw string, dueRaw string, loc *time.Location) (time.Time, string, bool) {
	remindText := strings.TrimSpace(remindRaw)
	if remindText == "" {
		return time.Time{}, "", false
	}
	if hour, minute, ok := parseClockTime(remindText); ok {
		dueDate, ok := parseNotificationDate(dueRaw, loc)
		if !ok {
			return time.Time{}, "", false
		}
		at := time.Date(dueDate.Year(), dueDate.Month(), dueDate.Day(), hour, minute, 0, 0, loc)
		return at, at.Format("2006-01-02 15:04"), true
	}
	at, ok := parseNotificationTime(remindText, 9, loc)
	if !ok {
		return time.Time{}, "", false
	}
	return at, remindText, true
}

func parseClockTime(raw string) (int, int, bool) {
	var hour int
	var minute int
	if _, err := fmt.Sscanf(strings.TrimSpace(raw), "%02d:%02d", &hour, &minute); err != nil {
		return 0, 0, false
	}
	if hour < 0 || hour > 23 || minute < 0 || minute > 59 {
		return 0, 0, false
	}
	return hour, minute, true
}

func parseNotificationDate(raw string, loc *time.Location) (time.Time, bool) {
	text := strings.TrimSpace(raw)
	if text == "" {
		return time.Time{}, false
	}
	if parsed, err := time.ParseInLocation("2006-01-02", text, loc); err == nil {
		return parsed, true
	}
	if parsed, err := time.ParseInLocation("2006-01-02 15:04", text, loc); err == nil {
		return time.Date(parsed.Year(), parsed.Month(), parsed.Day(), 0, 0, 0, 0, loc), true
	}
	if parsed, err := time.Parse(time.RFC3339, text); err == nil {
		local := parsed.In(loc)
		return time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, loc), true
	}
	if parsed, err := time.Parse(time.RFC3339Nano, text); err == nil {
		local := parsed.In(loc)
		return time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, loc), true
	}
	return time.Time{}, false
}

func derefTaskValue(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func (s *Service) send(ctx context.Context, target auth.NotificationTarget, candidate candidateNotification) error {
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, target.TopicURL, bytes.NewBufferString(candidate.Body))
	if err != nil {
		return fmt.Errorf("build ntfy request: %w", err)
	}
	request.Header.Set("Content-Type", "text/plain; charset=utf-8")
	request.Header.Set("Title", candidate.Title)
	request.Header.Set("Tags", candidate.Tags)
	request.Header.Set("Priority", candidate.Priority)
	if candidate.Click != "" {
		request.Header.Set("Click", candidate.Click)
	}
	if candidate.Page != "" {
		request.Header.Set("X-Note-Page", candidate.Page)
	}
	if candidate.TaskRef != "" {
		request.Header.Set("X-Task-Ref", candidate.TaskRef)
	}
	if candidate.FieldKey != "" {
		request.Header.Set("X-Note-Field", candidate.FieldKey)
	}
	if target.Token != "" {
		request.Header.Set("Authorization", "Bearer "+target.Token)
	}
	response, err := s.client.Do(request)
	if err != nil {
		return fmt.Errorf("send ntfy notification: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return fmt.Errorf("send ntfy notification: unexpected status %s", response.Status)
	}
	slog.Info("ntfy notification sent",
		"username", target.Username,
		"task_ref", candidate.TaskRef,
		"page", candidate.Page,
		"field", candidate.FieldKey,
		"kind", candidate.Kind,
		"at", candidate.At.Format(time.RFC3339),
	)
	return nil
}

func (s *Service) deliverCandidate(
	ctx context.Context,
	candidate candidateNotification,
	recipients []auth.NotificationTarget,
	now time.Time,
	activeKeys map[string]struct{},
) (bool, error) {
	for _, target := range recipients {
		activeKeys[notificationKey(candidate.Key, target.Username)] = struct{}{}
	}
	if candidate.At.After(now) {
		return false, nil
	}

	updated := false
	for _, target := range recipients {
		key := notificationKey(candidate.Key, target.Username)
		if s.wasSent(key) {
			continue
		}
		if err := s.send(ctx, target, candidate); err != nil {
			return false, err
		}
		s.markSent(key, now.UTC().Format(time.RFC3339Nano))
		updated = true
	}
	return updated, nil
}

func notificationTargetsForTask(
	task index.Task,
	targetsByUser map[string]auth.NotificationTarget,
	soleTarget auth.NotificationTarget,
	hasSoleTarget bool,
) []auth.NotificationTarget {
	if len(task.Who) == 0 {
		if hasSoleTarget {
			return []auth.NotificationTarget{soleTarget}
		}
		return nil
	}

	return notificationTargetsForNames(task.Who, targetsByUser)
}

func notificationTargetsForPage(
	page index.PageSummary,
	targetsByUser map[string]auth.NotificationTarget,
	soleTarget auth.NotificationTarget,
	hasSoleTarget bool,
) []auth.NotificationTarget {
	if recipients := notificationTargetsForNames(frontmatterStringValues(page.Frontmatter["who"]), targetsByUser); len(recipients) > 0 {
		return recipients
	}
	if hasSoleTarget {
		return []auth.NotificationTarget{soleTarget}
	}
	return nil
}

func notificationTargetsForNames(values []string, targetsByUser map[string]auth.NotificationTarget) []auth.NotificationTarget {
	recipients := make([]auth.NotificationTarget, 0, len(values))
	seen := make(map[string]struct{}, len(values))
	for _, raw := range values {
		username := normalizeUsername(raw)
		if username == "" {
			continue
		}
		if _, ok := seen[username]; ok {
			continue
		}
		target, ok := targetsByUser[username]
		if !ok {
			continue
		}
		seen[username] = struct{}{}
		recipients = append(recipients, target)
	}
	return recipients
}

func isNotificationFrontmatterKey(key string) bool {
	normalized := strings.TrimSpace(strings.ToLower(key))
	if normalized == "" {
		return false
	}
	if isNotificationClickKey(normalized) {
		return false
	}
	return normalized == "notification" ||
		normalized == "notify" ||
		normalized == "remind" ||
		normalized == "reminder" ||
		strings.Contains(normalized, "_notification") ||
		strings.Contains(normalized, "_notify") ||
		strings.Contains(normalized, "_remind") ||
		strings.Contains(normalized, "_reminder") ||
		strings.HasSuffix(normalized, "-notification") ||
		strings.HasSuffix(normalized, "-notify") ||
		strings.HasSuffix(normalized, "-remind") ||
		strings.HasSuffix(normalized, "-reminder") ||
		strings.HasPrefix(normalized, "notification_") ||
		strings.HasPrefix(normalized, "notify_") ||
		strings.HasPrefix(normalized, "remind_") ||
		strings.HasPrefix(normalized, "reminder_")
}

func notificationClickTarget(frontmatter map[string]any, fieldKey string) string {
	for _, candidate := range []string{fieldKey + "_click", fieldKey + "-click"} {
		if value, ok := frontmatterStringValue(frontmatter[candidate]); ok {
			return value
		}
	}
	return ""
}

func isNotificationClickKey(key string) bool {
	normalized := strings.TrimSpace(strings.ToLower(key))
	return normalized == "click" ||
		strings.HasSuffix(normalized, "_click") ||
		strings.HasSuffix(normalized, "-click")
}

func isGenericNotificationField(key string) bool {
	switch strings.TrimSpace(strings.ToLower(key)) {
	case "notification", "notify", "remind", "reminder":
		return true
	default:
		return false
	}
}

func frontmatterStringValue(value any) (string, bool) {
	text, ok := value.(string)
	if !ok {
		return "", false
	}
	text = strings.TrimSpace(text)
	if text == "" {
		return "", false
	}
	return text, true
}

func frontmatterStringValues(value any) []string {
	switch typed := value.(type) {
	case []string:
		return append([]string(nil), typed...)
	case []any:
		values := make([]string, 0, len(typed))
		for _, entry := range typed {
			text := strings.TrimSpace(fmt.Sprint(entry))
			if text != "" {
				values = append(values, text)
			}
		}
		return values
	case string:
		if strings.TrimSpace(typed) == "" {
			return nil
		}
		parts := strings.Split(typed, ",")
		values := make([]string, 0, len(parts))
		for _, part := range parts {
			text := strings.TrimSpace(part)
			if text != "" {
				values = append(values, text)
			}
		}
		return values
	default:
		return nil
	}
}

func isTemplatePage(pagePath string) bool {
	normalized := strings.TrimSpace(pagePath)
	return strings.HasPrefix(normalized, "_templates/") || strings.Contains(normalized, "/_templates/")
}

func notificationKey(candidateKey string, username string) string {
	return candidateKey + "|" + normalizeUsername(username)
}

func normalizeUsername(value string) string {
	return strings.ToLower(strings.TrimSpace(value))
}

func (s *Service) wasSent(key string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	_, ok := s.sent[key]
	return ok
}

func (s *Service) markSent(key string, at string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.sent[key] = at
}

func (s *Service) prune(active map[string]struct{}) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	changed := false
	for key := range s.sent {
		if _, ok := active[key]; ok {
			continue
		}
		delete(s.sent, key)
		changed = true
	}
	return changed
}

func (s *Service) loadState() error {
	raw, err := os.ReadFile(s.statePath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return fmt.Errorf("read ntfy state: %w", err)
	}
	var payload stateFile
	if err := json.Unmarshal(raw, &payload); err != nil {
		return fmt.Errorf("decode ntfy state: %w", err)
	}
	if payload.Sent != nil {
		s.sent = payload.Sent
	}
	return nil
}

func (s *Service) saveState() error {
	s.mu.Lock()
	payload := stateFile{Sent: make(map[string]string, len(s.sent))}
	for key, value := range s.sent {
		payload.Sent[key] = value
	}
	s.mu.Unlock()
	raw, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		return fmt.Errorf("encode ntfy state: %w", err)
	}
	raw = append(raw, '\n')
	tempPath := s.statePath + ".tmp"
	if err := os.WriteFile(tempPath, raw, 0o644); err != nil {
		return fmt.Errorf("write ntfy state: %w", err)
	}
	if err := os.Rename(tempPath, s.statePath); err != nil {
		return fmt.Errorf("replace ntfy state: %w", err)
	}
	return nil
}
