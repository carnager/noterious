package ai

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/carnager/noterious/internal/index"
	"github.com/carnager/noterious/internal/query"
)

func TestServiceGenerateQueryRepairsInvalidFirstDraft(t *testing.T) {
	t.Parallel()

	attempt := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		attempt++
		_ = json.NewEncoder(w).Encode(map[string]any{
			"choices": []any{
				map[string]any{
					"message": map[string]any{
						"content": func() string {
							if attempt == 1 {
								return `{"query":"from tasks\nselect count(*) as total, ref","explanation":"broken","assumptions":["first try"]}`
							}
							return `{"query":"from tasks\nwhere done = false\norder by due\nselect ref, due","explanation":"Lists open tasks by due date.","assumptions":["Due means the due field."]}`
						}(),
					},
				},
			},
		})
	}))
	defer server.Close()

	rootDir := t.TempDir()
	dataDir := filepath.Join(rootDir, "data")
	indexService := index.NewService(dataDir)
	if err := indexService.Open(context.Background()); err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	defer func() {
		_ = indexService.Close()
	}()

	service, err := NewService(dataDir)
	if err != nil {
		t.Fatalf("NewService() error = %v", err)
	}
	if _, err := service.Update(UpdateSettingsRequest{
		Settings: Settings{
			Enabled:  true,
			Provider: defaultProviderName,
			BaseURL:  server.URL,
			Model:    "test-model",
		},
		APIKey: "secret-token",
	}); err != nil {
		t.Fatalf("Update() error = %v", err)
	}

	response, err := service.GenerateQuery(context.Background(), indexService, QueryCopilotRequest{
		Intent:       "show open tasks due this week",
		CurrentQuery: "",
		PreviewLimit: 5,
	})
	if err != nil {
		t.Fatalf("GenerateQuery() error = %v", err)
	}
	if !response.Valid {
		t.Fatalf("response should be valid after repair: %#v", response)
	}
	if !response.Repaired || response.Attempts != 2 {
		t.Fatalf("repair metadata = attempts:%d repaired:%t", response.Attempts, response.Repaired)
	}
	if response.Analyze.Dataset != "tasks" {
		t.Fatalf("analyze dataset = %q", response.Analyze.Dataset)
	}
	if response.Workbench.Preview == nil || !response.Workbench.Preview.Valid {
		t.Fatalf("preview = %#v", response.Workbench.Preview)
	}
}

func TestServiceGenerateQueryRejectsDisabledOrUnconfigured(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	dataDir := filepath.Join(rootDir, "data")
	indexService := index.NewService(dataDir)
	if err := indexService.Open(context.Background()); err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	defer func() {
		_ = indexService.Close()
	}()

	service, err := NewService(dataDir)
	if err != nil {
		t.Fatalf("NewService() error = %v", err)
	}

	if _, err := service.GenerateQuery(context.Background(), indexService, QueryCopilotRequest{Intent: "show open tasks"}); err != ErrAIDisabled {
		t.Fatalf("GenerateQuery(disabled) error = %v want %v", err, ErrAIDisabled)
	}

	if _, err := service.Update(UpdateSettingsRequest{
		Settings: Settings{
			Enabled:  true,
			Provider: defaultProviderName,
			BaseURL:  "https://api.openai.com/v1",
			Model:    "gpt-5-mini",
		},
	}); err != nil {
		t.Fatalf("Update() error = %v", err)
	}

	if _, err := service.GenerateQuery(context.Background(), indexService, QueryCopilotRequest{Intent: "show open tasks"}); err != ErrAIUnconfigured {
		t.Fatalf("GenerateQuery(unconfigured) error = %v want %v", err, ErrAIUnconfigured)
	}
}

func TestServiceGenerateQueryRejectsMalformedModelOutputCleanly(t *testing.T) {
	t.Parallel()

	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"choices": []any{
				map[string]any{
					"message": map[string]any{
						"content": "definitely not json",
					},
				},
			},
		})
	}))
	defer upstream.Close()

	rootDir := t.TempDir()
	dataDir := filepath.Join(rootDir, "data")
	indexService := index.NewService(dataDir)
	if err := indexService.Open(context.Background()); err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	defer func() {
		_ = indexService.Close()
	}()

	service, err := NewService(dataDir)
	if err != nil {
		t.Fatalf("NewService() error = %v", err)
	}
	if _, err := service.Update(UpdateSettingsRequest{
		Settings: Settings{
			Enabled:  true,
			Provider: defaultProviderName,
			BaseURL:  upstream.URL,
			Model:    "test-model",
		},
		APIKey: "secret-token",
	}); err != nil {
		t.Fatalf("Update() error = %v", err)
	}

	response, err := service.GenerateQuery(context.Background(), indexService, QueryCopilotRequest{
		Intent: "show open tasks due this week",
	})
	if err != nil {
		t.Fatalf("GenerateQuery() error = %v", err)
	}
	if response.Valid {
		t.Fatalf("response should remain invalid for malformed model output: %#v", response)
	}
	if response.Error == "" {
		t.Fatalf("response should include a decode error: %#v", response)
	}
	if response.Attempts != 2 || !response.Repaired {
		t.Fatalf("repair metadata = attempts:%d repaired:%t", response.Attempts, response.Repaired)
	}
}

func TestValidateGeneratedQueryUsesExistingQueryTooling(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	dataDir := filepath.Join(rootDir, "data")
	indexService := index.NewService(dataDir)
	if err := indexService.Open(context.Background()); err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	defer func() {
		_ = indexService.Close()
	}()

	response, validationErrors := validateGeneratedQuery(context.Background(), indexService, modelQueryDraft{
		Query:       "from tasks\nwhere done = false\norder by due\nselect ref, due",
		Explanation: "Lists unfinished tasks.",
	}, 5)

	if validationErrors != "" {
		t.Fatalf("validation errors = %q", validationErrors)
	}
	if !response.Valid {
		t.Fatalf("response should be valid: %#v", response)
	}
	if response.Lint.Count != query.Lint(response.Query).Count {
		t.Fatalf("lint count mismatch = %d", response.Lint.Count)
	}
}
