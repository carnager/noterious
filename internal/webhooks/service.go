package webhooks

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

// Hook is one outbound webhook subscription. Events are matched by exact
// event type; "*" subscribes to everything.
type Hook struct {
	ID        int64    `json:"id"`
	Label     string   `json:"label"`
	URL       string   `json:"url"`
	Events    []string `json:"events"`
	Secret    string   `json:"secret,omitempty"`
	Enabled   bool     `json:"enabled"`
	CreatedAt string   `json:"createdAt"`
}

// DeliveryState is in-memory only; it resets on restart.
type DeliveryState struct {
	LastFiredAt string `json:"lastFiredAt,omitempty"`
	LastStatus  string `json:"lastStatus,omitempty"`
	LastError   string `json:"lastError,omitempty"`
}

type HookWithState struct {
	Hook
	Delivery DeliveryState `json:"delivery"`
}

type storedConfig struct {
	NextID int64  `json:"nextId"`
	Hooks  []Hook `json:"hooks"`
}

type delivery struct {
	hook Hook
	kind string
	body []byte
}

type Service struct {
	path   string
	client *http.Client

	mu     sync.Mutex
	hooks  []Hook
	nextID int64
	states map[int64]DeliveryState

	queue chan delivery
	done  chan struct{}
	wg    sync.WaitGroup
}

func NewService(dataDir string) (*Service, error) {
	service := &Service{
		path:   filepath.Join(dataDir, "webhooks.json"),
		client: &http.Client{Timeout: 10 * time.Second},
		nextID: 1,
		states: make(map[int64]DeliveryState),
		queue:  make(chan delivery, 256),
		done:   make(chan struct{}),
	}
	if err := service.load(); err != nil {
		return nil, err
	}
	service.wg.Add(1)
	go service.run()
	return service, nil
}

func (s *Service) Close() {
	if s == nil {
		return
	}
	close(s.done)
	s.wg.Wait()
}

// Notify fans an event out to every enabled, subscribed hook. Enqueueing is
// non-blocking: if the delivery queue is full the event is dropped with a log
// line rather than stalling the caller.
func (s *Service) Notify(eventType string, data any) {
	if s == nil {
		return
	}
	s.mu.Lock()
	matched := make([]Hook, 0)
	for _, hook := range s.hooks {
		if hook.Enabled && hookSubscribes(hook, eventType) {
			matched = append(matched, hook)
		}
	}
	s.mu.Unlock()
	if len(matched) == 0 {
		return
	}

	body, err := json.Marshal(map[string]any{
		"event":   eventType,
		"data":    data,
		"firedAt": time.Now().UTC().Format(time.RFC3339),
	})
	if err != nil {
		slog.Error("webhook payload marshal failed", "event", eventType, "error", err)
		return
	}

	for _, hook := range matched {
		select {
		case s.queue <- delivery{hook: hook, kind: eventType, body: body}:
		default:
			slog.Warn("webhook queue full, dropping event", "hook", hook.Label, "event", eventType)
		}
	}
}

func (s *Service) List() []HookWithState {
	s.mu.Lock()
	defer s.mu.Unlock()
	result := make([]HookWithState, 0, len(s.hooks))
	for _, hook := range s.hooks {
		result = append(result, HookWithState{Hook: hook, Delivery: s.states[hook.ID]})
	}
	return result
}

func (s *Service) Create(hook Hook) (Hook, error) {
	hook.Label = strings.TrimSpace(hook.Label)
	hook.URL = strings.TrimSpace(hook.URL)
	if hook.Label == "" {
		return Hook{}, fmt.Errorf("webhook label must not be empty")
	}
	parsed, err := url.Parse(hook.URL)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" {
		return Hook{}, fmt.Errorf("webhook url must be a valid http(s) url")
	}
	events := make([]string, 0, len(hook.Events))
	for _, event := range hook.Events {
		trimmed := strings.TrimSpace(event)
		if trimmed != "" {
			events = append(events, trimmed)
		}
	}
	if len(events) == 0 {
		return Hook{}, fmt.Errorf("webhook must subscribe to at least one event")
	}
	hook.Events = events
	hook.Enabled = true
	hook.CreatedAt = time.Now().UTC().Format(time.RFC3339)

	s.mu.Lock()
	defer s.mu.Unlock()
	hook.ID = s.nextID
	s.nextID++
	s.hooks = append(s.hooks, hook)
	if err := s.saveLocked(); err != nil {
		s.hooks = s.hooks[:len(s.hooks)-1]
		s.nextID--
		return Hook{}, err
	}
	return hook, nil
}

func (s *Service) Delete(id int64) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for idx, hook := range s.hooks {
		if hook.ID != id {
			continue
		}
		s.hooks = append(s.hooks[:idx], s.hooks[idx+1:]...)
		delete(s.states, id)
		return s.saveLocked()
	}
	return fmt.Errorf("webhook not found")
}

func hookSubscribes(hook Hook, eventType string) bool {
	for _, event := range hook.Events {
		if event == "*" || event == eventType {
			return true
		}
	}
	return false
}

func (s *Service) run() {
	defer s.wg.Done()
	for {
		select {
		case <-s.done:
			return
		case item := <-s.queue:
			s.deliver(item)
		}
	}
}

func (s *Service) deliver(item delivery) {
	state := DeliveryState{LastFiredAt: time.Now().UTC().Format(time.RFC3339)}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, item.hook.URL, bytes.NewReader(item.body))
	if err != nil {
		state.LastError = err.Error()
		s.recordState(item.hook.ID, state)
		return
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("X-Noterious-Event", item.kind)
	request.Header.Set("X-Noterious-Webhook-Id", fmt.Sprintf("%d", item.hook.ID))
	if item.hook.Secret != "" {
		mac := hmac.New(sha256.New, []byte(item.hook.Secret))
		mac.Write(item.body)
		request.Header.Set("X-Noterious-Signature", "sha256="+hex.EncodeToString(mac.Sum(nil)))
	}

	response, err := s.client.Do(request)
	if err != nil {
		state.LastError = err.Error()
		slog.Warn("webhook delivery failed", "hook", item.hook.Label, "event", item.kind, "error", err)
		s.recordState(item.hook.ID, state)
		return
	}
	defer response.Body.Close()
	state.LastStatus = response.Status
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		state.LastError = "unexpected status " + response.Status
		slog.Warn("webhook delivery rejected", "hook", item.hook.Label, "event", item.kind, "status", response.Status)
	}
	s.recordState(item.hook.ID, state)
}

func (s *Service) recordState(id int64, state DeliveryState) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.states[id] = state
}

func (s *Service) load() error {
	payload, err := os.ReadFile(s.path)
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("read webhooks config: %w", err)
	}
	var stored storedConfig
	if err := json.Unmarshal(payload, &stored); err != nil {
		return fmt.Errorf("decode webhooks config: %w", err)
	}
	s.hooks = stored.Hooks
	s.nextID = stored.NextID
	if s.nextID < 1 {
		s.nextID = 1
	}
	for _, hook := range s.hooks {
		if hook.ID >= s.nextID {
			s.nextID = hook.ID + 1
		}
	}
	return nil
}

func (s *Service) saveLocked() error {
	payload, err := json.MarshalIndent(storedConfig{NextID: s.nextID, Hooks: s.hooks}, "", "  ")
	if err != nil {
		return fmt.Errorf("encode webhooks config: %w", err)
	}
	tempPath := s.path + ".tmp"
	if err := os.WriteFile(tempPath, append(payload, '\n'), 0o600); err != nil {
		return fmt.Errorf("write webhooks config: %w", err)
	}
	if err := os.Rename(tempPath, s.path); err != nil {
		_ = os.Remove(tempPath)
		return fmt.Errorf("replace webhooks config: %w", err)
	}
	return nil
}
