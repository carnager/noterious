package documents

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestCreateListAndGetDocument(t *testing.T) {
	t.Parallel()

	service, err := NewService(t.TempDir())
	if err != nil {
		t.Fatalf("NewService() error = %v", err)
	}

	document, err := service.Create(context.Background(), "notes/alpha", "report.pdf", "application/pdf", strings.NewReader("%PDF-1.7"))
	if err != nil {
		t.Fatalf("Create() error = %v", err)
	}

	if document.ID == "" {
		t.Fatalf("document ID should not be empty")
	}
	if document.Name != "report.pdf" {
		t.Fatalf("document name = %q", document.Name)
	}
	if document.Path != "notes/report.pdf" {
		t.Fatalf("document path = %q", document.Path)
	}

	listed, err := service.List(context.Background(), "report")
	if err != nil {
		t.Fatalf("List() error = %v", err)
	}
	if len(listed) != 1 || listed[0].ID != document.ID {
		t.Fatalf("List() = %#v", listed)
	}

	resolved, filePath, err := service.Get(document.Path)
	if err != nil {
		t.Fatalf("Get() error = %v", err)
	}
	if resolved.Name != document.Name {
		t.Fatalf("resolved name = %q", resolved.Name)
	}
	if _, err := os.Stat(filePath); err != nil {
		t.Fatalf("Stat(%q) error = %v", filePath, err)
	}
	if filepath.Ext(filePath) != ".pdf" {
		t.Fatalf("file extension = %q", filepath.Ext(filePath))
	}
}
