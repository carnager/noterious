package ai

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestOpenAICompatibleClientOmitsTemperature(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer r.Body.Close()
		var payload map[string]any
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatalf("decode request: %v", err)
		}
		if _, ok := payload["temperature"]; ok {
			t.Fatalf("temperature should be omitted for provider-compatible defaults")
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"{\"query\":\"from pages\",\"explanation\":\"ok\",\"assumptions\":[]}"}}]}`))
	}))
	defer server.Close()

	client := newOpenAICompatibleClient()
	response, err := client.complete(context.Background(), server.URL, "gpt-5-mini", "secret", []chatMessage{
		{Role: "user", Content: "hello"},
	})
	if err != nil {
		t.Fatalf("complete() error = %v", err)
	}
	if response == "" {
		t.Fatalf("complete() returned empty response")
	}
}
