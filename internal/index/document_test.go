package index

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/carnager/noterious/internal/vault"
)

func TestParseDocumentExtractsStructuredData(t *testing.T) {
	t.Parallel()

	modTime := time.Date(2026, time.April, 20, 10, 30, 0, 0, time.UTC)
	page := vault.PageFile{
		Path:    "notes/today",
		ModTime: modTime,
	}
	raw := []byte(`---
title: Daily Notes
aliases:
  - Today
  - Journal
published: true
count: 3
---
# Ignored Because Frontmatter Title Wins

See [[Project Alpha|Alpha]] and [Roadmap](plans/roadmap.md).

- [ ] Follow up with team due:: 2026-05-01 remind:: 2026-04-30 who:: [Ralf, Mina]
- [x] Done already
`)

	document, err := ParseDocument(page, raw)
	if err != nil {
		t.Fatalf("ParseDocument() error = %v", err)
	}

	if document.Title != "today" {
		t.Fatalf("Title = %q, want %q", document.Title, "today")
	}
	if document.CreatedAt != modTime.Format(time.RFC3339) {
		t.Fatalf("CreatedAt = %q", document.CreatedAt)
	}
	if len(document.Frontmatter) != 4 {
		t.Fatalf("Frontmatter fields = %d, want 4", len(document.Frontmatter))
	}
	if len(document.Links) != 2 {
		t.Fatalf("Links = %d, want 2", len(document.Links))
	}
	if document.Links[0].TargetPage != "Project Alpha" || document.Links[0].Kind != "wikilink" {
		t.Fatalf("First link = %+v", document.Links[0])
	}
	if document.Links[1].TargetPage != "plans/roadmap" || document.Links[1].Kind != "markdown" {
		t.Fatalf("Second link = %+v", document.Links[1])
	}
	if len(document.Tasks) != 2 {
		t.Fatalf("Tasks = %d, want 2", len(document.Tasks))
	}

	firstTask := document.Tasks[0]
	if firstTask.Ref != "notes/today:13" {
		t.Fatalf("first task ref = %q", firstTask.Ref)
	}
	if firstTask.State != "todo" || firstTask.Done {
		t.Fatalf("first task state = %+v", firstTask)
	}
	if firstTask.Due == nil || *firstTask.Due != "2026-05-01" {
		t.Fatalf("first task due = %v", firstTask.Due)
	}
	if firstTask.Remind == nil || *firstTask.Remind != "2026-04-30" {
		t.Fatalf("first task remind = %v", firstTask.Remind)
	}
	if firstTask.Text != "Follow up with team" {
		t.Fatalf("first task text = %q", firstTask.Text)
	}
	if len(firstTask.Who) != 2 || firstTask.Who[0] != "Ralf" || firstTask.Who[1] != "Mina" {
		t.Fatalf("first task who = %#v", firstTask.Who)
	}

	secondTask := document.Tasks[1]
	if secondTask.State != "done" || !secondTask.Done {
		t.Fatalf("second task = %+v", secondTask)
	}
}

func TestParseDocumentStripsLegacyTaskMetadataFromDisplayText(t *testing.T) {
	t.Parallel()

	page := vault.PageFile{
		Path:    "notes/tasks",
		ModTime: time.Date(2026, time.April, 20, 10, 30, 0, 0, time.UTC),
	}
	raw := []byte("- [x] Legacy task [remind: \"2026-04-19 12:10\"] #remind [completed: \"2026-04-19T12:19:47\"]\n")

	document, err := ParseDocument(page, raw)
	if err != nil {
		t.Fatalf("ParseDocument() error = %v", err)
	}
	if len(document.Tasks) != 1 {
		t.Fatalf("Tasks = %d, want 1", len(document.Tasks))
	}
	if document.Tasks[0].Text != "Legacy task" {
		t.Fatalf("legacy task text = %q", document.Tasks[0].Text)
	}
	if document.Tasks[0].Remind == nil || *document.Tasks[0].Remind != "2026-04-19 12:10" {
		t.Fatalf("legacy task remind = %v", document.Tasks[0].Remind)
	}
}

func TestParseDocumentParsesUnindentedFrontmatterLists(t *testing.T) {
	t.Parallel()

	page := vault.PageFile{
		Path:    "contacts/claudia-braun",
		ModTime: time.Date(2026, time.April, 24, 8, 0, 0, 0, time.UTC),
	}
	raw := []byte(`---
tags: contact
phone_work:
- "+49 202 26923094"
- "+49 202 97443-154"
email:
- "kita-hahnerberg@diakonie-wuppertal.de"
- "kita-karlgreisstr@diakonie-wuppertal.de"
---
# Claudia Braun
`)

	document, err := ParseDocument(page, raw)
	if err != nil {
		t.Fatalf("ParseDocument() error = %v", err)
	}

	frontmatter := make(map[string]any, len(document.Frontmatter))
	for _, field := range document.Frontmatter {
		var value any
		if err := json.Unmarshal([]byte(field.ValueJSON), &value); err != nil {
			t.Fatalf("json.Unmarshal(%q) error = %v", field.Key, err)
		}
		frontmatter[field.Key] = value
	}

	phoneWork, ok := frontmatter["phone_work"].([]any)
	if !ok || len(phoneWork) != 2 {
		t.Fatalf("phone_work = %#v", frontmatter["phone_work"])
	}
	email, ok := frontmatter["email"].([]any)
	if !ok || len(email) != 2 {
		t.Fatalf("email = %#v", frontmatter["email"])
	}
}
