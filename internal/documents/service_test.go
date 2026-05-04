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

	document, err := service.Create(context.Background(), "notes/alpha", UploadPlacementSameFolder, "_files", "report.pdf", "application/pdf", strings.NewReader("%PDF-1.7"))
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

func TestCreateSanitizesUploadedDocumentName(t *testing.T) {
	t.Parallel()

	service, err := NewService(t.TempDir())
	if err != nil {
		t.Fatalf("NewService() error = %v", err)
	}

	document, err := service.Create(context.Background(), "notes/alpha", UploadPlacementSameFolder, "_files", "Meeting Notes (Final) 2026.pdf", "application/pdf", strings.NewReader("%PDF-1.7"))
	if err != nil {
		t.Fatalf("Create() error = %v", err)
	}

	if document.Name != "meeting-notes-final-2026.pdf" {
		t.Fatalf("document name = %q", document.Name)
	}
	if document.Path != "notes/meeting-notes-final-2026.pdf" {
		t.Fatalf("document path = %q", document.Path)
	}
}

func TestCreateSupportsVaultRootAndNoteSubfolderPlacements(t *testing.T) {
	t.Parallel()

	service, err := NewService(t.TempDir())
	if err != nil {
		t.Fatalf("NewService() error = %v", err)
	}

	rootDocument, err := service.Create(context.Background(), "notes/alpha", UploadPlacementVaultRoot, "_files", "root.pdf", "application/pdf", strings.NewReader("%PDF-1.7"))
	if err != nil {
		t.Fatalf("Create(vault-root) error = %v", err)
	}
	if rootDocument.Path != "root.pdf" {
		t.Fatalf("vault-root document path = %q", rootDocument.Path)
	}

	subfolderDocument, err := service.Create(context.Background(), "notes/alpha", UploadPlacementNoteSubfolder, "_files", "nested.pdf", "application/pdf", strings.NewReader("%PDF-1.7"))
	if err != nil {
		t.Fatalf("Create(note-subfolder) error = %v", err)
	}
	if subfolderDocument.Path != "notes/_files/nested.pdf" {
		t.Fatalf("note-subfolder document path = %q", subfolderDocument.Path)
	}
}

func TestCreateRejectsInvalidNoteSubfolderPlacement(t *testing.T) {
	t.Parallel()

	service, err := NewService(t.TempDir())
	if err != nil {
		t.Fatalf("NewService() error = %v", err)
	}

	_, err = service.Create(context.Background(), "notes/alpha", UploadPlacementNoteSubfolder, "../outside", "nested.pdf", "application/pdf", strings.NewReader("%PDF-1.7"))
	if err == nil || !strings.Contains(err.Error(), "document upload subfolder") {
		t.Fatalf("Create() error = %v", err)
	}
}
