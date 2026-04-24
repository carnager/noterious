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
	"strings"
	"sync"
	"time"

	"github.com/carnager/noterious/internal/index"
)

type Service struct {
	index     *index.Service
	topicURL  string
	token     string
	statePath string
	client    *http.Client
	now       func() time.Time

	mu   sync.Mutex
	sent map[string]string
}

func NewService(dataDir string, indexService *index.Service, topicURL string, token string) (*Service, error) {
	if strings.TrimSpace(dataDir) == "" {
		return nil, fmt.Errorf("data dir must not be empty")
	}
	if err := os.MkdirAll(dataDir, 0o755); err != nil {
		return nil, fmt.Errorf("create notify data dir: %w", err)
	}
	service := &Service{
		index:     indexService,
		topicURL:  strings.TrimSpace(topicURL),
		token:     strings.TrimSpace(token),
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
	return s != nil && s.index != nil && s.topicURL != ""
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

	tasks, err := s.index.ListTasks(ctx)
	if err != nil {
		return fmt.Errorf("list tasks: %w", err)
	}

	now := s.now()
	activeKeys := make(map[string]struct{})
	updated := false
	for _, task := range tasks {
		if task.Done {
			continue
		}
		candidate, ok := notificationCandidate(task, now.Location())
		if !ok {
			continue
		}
		activeKeys[candidate.Key] = struct{}{}
		if candidate.At.After(now) {
			continue
		}
		if s.wasSent(candidate.Key) {
			continue
		}
		if err := s.send(ctx, candidate); err != nil {
			return err
		}
		s.markSent(candidate.Key, now.UTC().Format(time.RFC3339Nano))
		updated = true
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

type stateFile struct {
	Sent map[string]string `json:"sent"`
}

type candidateNotification struct {
	Key      string
	Kind     string
	Task     index.Task
	At       time.Time
	Raw      string
	Title    string
	Body     string
	Tags     string
	Priority string
}

func notificationCandidate(task index.Task, loc *time.Location) (candidateNotification, bool) {
	if task.Remind != nil && strings.TrimSpace(*task.Remind) != "" {
		at, ok := parseNotificationTime(*task.Remind, 9, loc)
		if !ok {
			return candidateNotification{}, false
		}
		return buildCandidate(task, "remind", *task.Remind, at), true
	}
	if task.Due != nil && strings.TrimSpace(*task.Due) != "" {
		at, ok := parseNotificationTime(*task.Due, 9, loc)
		if !ok {
			return candidateNotification{}, false
		}
		return buildCandidate(task, "due", *task.Due, at), true
	}
	return candidateNotification{}, false
}

func buildCandidate(task index.Task, kind string, raw string, at time.Time) candidateNotification {
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
		Key:      fmt.Sprintf("%s|%s|%s", task.Ref, kind, raw),
		Kind:     kind,
		Task:     task,
		At:       at,
		Raw:      raw,
		Title:    title,
		Body:     strings.Join(parts, "\n"),
		Tags:     tags,
		Priority: priority,
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
	if parsed, err := time.Parse(time.RFC3339, text); err == nil {
		return parsed, true
	}
	if parsed, err := time.Parse(time.RFC3339Nano, text); err == nil {
		return parsed, true
	}
	return time.Time{}, false
}

func (s *Service) send(ctx context.Context, candidate candidateNotification) error {
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, s.topicURL, bytes.NewBufferString(candidate.Body))
	if err != nil {
		return fmt.Errorf("build ntfy request: %w", err)
	}
	request.Header.Set("Content-Type", "text/plain; charset=utf-8")
	request.Header.Set("Title", candidate.Title)
	request.Header.Set("Tags", candidate.Tags)
	request.Header.Set("Priority", candidate.Priority)
	if candidate.Task.Page != "" {
		request.Header.Set("X-Task-Page", candidate.Task.Page)
	}
	if candidate.Task.Ref != "" {
		request.Header.Set("X-Task-Ref", candidate.Task.Ref)
	}
	if s.token != "" {
		request.Header.Set("Authorization", "Bearer "+s.token)
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
		"task_ref", candidate.Task.Ref,
		"page", candidate.Task.Page,
		"kind", candidate.Kind,
		"at", candidate.At.Format(time.RFC3339),
	)
	return nil
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
