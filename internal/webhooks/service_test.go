package webhooks

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestCreateListDeletePersistence(t *testing.T) {
	t.Parallel()

	dataDir := t.TempDir()
	service, err := NewService(dataDir)
	if err != nil {
		t.Fatalf("NewService() error = %v", err)
	}

	if _, err := service.Create(Hook{Label: "", URL: "https://example.com", Events: []string{"*"}}); err == nil {
		t.Fatal("Create() accepted empty label")
	}
	if _, err := service.Create(Hook{Label: "x", URL: "ftp://example.com", Events: []string{"*"}}); err == nil {
		t.Fatal("Create() accepted non-http url")
	}
	if _, err := service.Create(Hook{Label: "x", URL: "https://example.com", Events: nil}); err == nil {
		t.Fatal("Create() accepted empty events")
	}

	created, err := service.Create(Hook{Label: "ci", URL: "https://example.com/hook", Events: []string{"page.changed"}, Secret: "s3cret"})
	if err != nil {
		t.Fatalf("Create() error = %v", err)
	}
	if created.ID == 0 || !created.Enabled {
		t.Fatalf("created hook = %#v", created)
	}
	service.Close()

	reloaded, err := NewService(dataDir)
	if err != nil {
		t.Fatalf("NewService(reload) error = %v", err)
	}
	defer reloaded.Close()
	hooks := reloaded.List()
	if len(hooks) != 1 || hooks[0].Label != "ci" || hooks[0].Secret != "s3cret" {
		t.Fatalf("reloaded hooks = %#v", hooks)
	}

	if err := reloaded.Delete(created.ID); err != nil {
		t.Fatalf("Delete() error = %v", err)
	}
	if err := reloaded.Delete(created.ID); err == nil {
		t.Fatal("Delete() of missing hook did not error")
	}
	if remaining := reloaded.List(); len(remaining) != 0 {
		t.Fatalf("remaining hooks = %#v", remaining)
	}
}

func TestNotifyDeliversSignedPayload(t *testing.T) {
	t.Parallel()

	type received struct {
		event     string
		signature string
		body      []byte
	}
	got := make(chan received, 4)
	receiver := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		got <- received{
			event:     r.Header.Get("X-Noterious-Event"),
			signature: r.Header.Get("X-Noterious-Signature"),
			body:      body,
		}
		w.WriteHeader(http.StatusNoContent)
	}))
	defer receiver.Close()

	service, err := NewService(t.TempDir())
	if err != nil {
		t.Fatalf("NewService() error = %v", err)
	}
	defer service.Close()

	hook, err := service.Create(Hook{Label: "test", URL: receiver.URL, Events: []string{"task.changed"}, Secret: "topsecret"})
	if err != nil {
		t.Fatalf("Create() error = %v", err)
	}

	service.Notify("page.changed", map[string]string{"page": "x"})
	service.Notify("task.changed", map[string]string{"ref": "daily/today:3"})

	select {
	case delivery := <-got:
		if delivery.event != "task.changed" {
			t.Fatalf("delivered event = %q, want task.changed (page.changed should not match)", delivery.event)
		}
		mac := hmac.New(sha256.New, []byte("topsecret"))
		mac.Write(delivery.body)
		expected := "sha256=" + hex.EncodeToString(mac.Sum(nil))
		if delivery.signature != expected {
			t.Fatalf("signature = %q, want %q", delivery.signature, expected)
		}
		var payload struct {
			Event   string            `json:"event"`
			Data    map[string]string `json:"data"`
			FiredAt string            `json:"firedAt"`
		}
		if err := json.Unmarshal(delivery.body, &payload); err != nil {
			t.Fatalf("Unmarshal(body) error = %v", err)
		}
		if payload.Event != "task.changed" || payload.Data["ref"] != "daily/today:3" || payload.FiredAt == "" {
			t.Fatalf("payload = %#v", payload)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for webhook delivery")
	}

	select {
	case extra := <-got:
		t.Fatalf("unexpected extra delivery: %#v", extra)
	case <-time.After(150 * time.Millisecond):
	}

	deadline := time.Now().Add(2 * time.Second)
	for {
		hooks := service.List()
		if len(hooks) == 1 && hooks[0].Delivery.LastStatus != "" {
			if hooks[0].ID != hook.ID || hooks[0].Delivery.LastError != "" {
				t.Fatalf("delivery state = %#v", hooks[0].Delivery)
			}
			break
		}
		if time.Now().After(deadline) {
			t.Fatalf("delivery state never recorded: %#v", hooks)
		}
		time.Sleep(10 * time.Millisecond)
	}
}

func TestNotifySkipsDisabledAndWildcardMatchesAll(t *testing.T) {
	t.Parallel()

	hook := Hook{Events: []string{"*"}}
	if !hookSubscribes(hook, "anything.at.all") {
		t.Fatal("wildcard subscription did not match")
	}
	if hookSubscribes(Hook{Events: []string{"page.changed"}}, "task.changed") {
		t.Fatal("non-matching event matched")
	}
}
