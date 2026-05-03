package ai

import (
	"strings"
	"testing"
)

func TestBuildInitialMessagesIncludesDocsAndSchemaButNotSavedQueries(t *testing.T) {
	t.Parallel()

	messages, err := buildInitialMessages(QueryCopilotRequest{
		Intent:       "show open tasks due this week",
		CurrentQuery: "",
	})
	if err != nil {
		t.Fatalf("buildInitialMessages() error = %v", err)
	}
	if len(messages) != 2 {
		t.Fatalf("message count = %d want 2", len(messages))
	}

	prompt := messages[1].Content
	if !strings.Contains(prompt, "Noterious query docs excerpt:") {
		t.Fatalf("prompt missing docs excerpt: %s", prompt)
	}
	if !strings.Contains(prompt, "\"datasets\"") || !strings.Contains(prompt, "\"examples\"") {
		t.Fatalf("prompt missing schema json: %s", prompt)
	}
	if strings.Contains(prompt, "\"savedQueries\"") {
		t.Fatalf("prompt should not include saved queries: %s", prompt)
	}
}

func TestDecodeModelQueryDraftHandlesFencedJSON(t *testing.T) {
	t.Parallel()

	draft, err := decodeModelQueryDraft("```json\n{\"query\":\"from tasks\",\"explanation\":\"Lists tasks\",\"assumptions\":[\"none\"]}\n```")
	if err != nil {
		t.Fatalf("decodeModelQueryDraft() error = %v", err)
	}
	if draft.Query != "from tasks" {
		t.Fatalf("query = %q", draft.Query)
	}
	if len(draft.Assumptions) != 1 || draft.Assumptions[0] != "none" {
		t.Fatalf("assumptions = %#v", draft.Assumptions)
	}
}
