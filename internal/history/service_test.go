package history

import (
	"path/filepath"
	"testing"
)

func TestServiceSaveListMoveTrashAndPermanentDelete(t *testing.T) {
	t.Parallel()

	service, err := NewService(t.TempDir())
	if err != nil {
		t.Fatalf("NewService() error = %v", err)
	}

	saved, err := service.SaveRevision("notes/alpha", []byte("# Alpha\n"))
	if err != nil {
		t.Fatalf("SaveRevision() error = %v", err)
	}
	if !saved {
		t.Fatalf("SaveRevision() = false, want true")
	}
	saved, err = service.SaveRevision("notes/alpha", []byte("# Alpha\n"))
	if err != nil {
		t.Fatalf("SaveRevision() duplicate error = %v", err)
	}
	if saved {
		t.Fatalf("SaveRevision() duplicate = true, want false")
	}
	saved, err = service.SaveRevision("notes/alpha", []byte("# Alpha 2\n"))
	if err != nil {
		t.Fatalf("SaveRevision() second error = %v", err)
	}
	if !saved {
		t.Fatalf("SaveRevision() second = false, want true")
	}

	revisions, err := service.ListRevisions("notes/alpha")
	if err != nil {
		t.Fatalf("ListRevisions() error = %v", err)
	}
	if len(revisions) != 1 {
		t.Fatalf("ListRevisions() len = %d, want 1", len(revisions))
	}
	if revisions[0].RawMarkdown != "# Alpha 2\n" {
		t.Fatalf("latest revision markdown = %q, want updated content", revisions[0].RawMarkdown)
	}

	if err := service.MovePage("notes/alpha", "archive/alpha"); err != nil {
		t.Fatalf("MovePage() error = %v", err)
	}
	revisions, err = service.ListRevisions("archive/alpha")
	if err != nil {
		t.Fatalf("ListRevisions() moved error = %v", err)
	}
	if len(revisions) != 1 {
		t.Fatalf("ListRevisions() moved len = %d, want 1", len(revisions))
	}
	if revisions[0].Page != "archive/alpha" {
		t.Fatalf("moved revision page = %q, want archive/alpha", revisions[0].Page)
	}

	if err := service.MoveToTrash("archive/alpha", []byte("# Alpha 2\n")); err != nil {
		t.Fatalf("MoveToTrash() error = %v", err)
	}
	trashEntries, err := service.ListTrash()
	if err != nil {
		t.Fatalf("ListTrash() error = %v", err)
	}
	if len(trashEntries) != 1 || trashEntries[0].Page != "archive/alpha" {
		t.Fatalf("ListTrash() = %#v, want archive/alpha", trashEntries)
	}

	entry, err := service.RestoreFromTrash("archive/alpha")
	if err != nil {
		t.Fatalf("RestoreFromTrash() error = %v", err)
	}
	if entry.Page != "archive/alpha" || entry.RawMarkdown != "# Alpha 2\n" {
		t.Fatalf("RestoreFromTrash() = %#v", entry)
	}

	if err := service.MoveToTrash("archive/alpha", []byte("# Alpha 2\n")); err != nil {
		t.Fatalf("MoveToTrash() second error = %v", err)
	}
	if err := service.PermanentlyDelete("archive/alpha"); err != nil {
		t.Fatalf("PermanentlyDelete() error = %v", err)
	}
	revisions, err = service.ListRevisions("archive/alpha")
	if err != nil {
		t.Fatalf("ListRevisions() after permanent delete error = %v", err)
	}
	if len(revisions) != 0 {
		t.Fatalf("ListRevisions() after permanent delete len = %d, want 0", len(revisions))
	}
	trashEntries, err = service.ListTrash()
	if err != nil {
		t.Fatalf("ListTrash() after permanent delete error = %v", err)
	}
	if len(trashEntries) != 0 {
		t.Fatalf("ListTrash() after permanent delete len = %d, want 0", len(trashEntries))
	}
}

func TestServiceMoveAndDeletePrefix(t *testing.T) {
	t.Parallel()

	service, err := NewService(t.TempDir())
	if err != nil {
		t.Fatalf("NewService() error = %v", err)
	}

	if _, err := service.SaveRevision("notes/sub/alpha", []byte("a")); err != nil {
		t.Fatalf("SaveRevision(alpha) error = %v", err)
	}
	if _, err := service.SaveRevision("notes/sub/beta", []byte("b")); err != nil {
		t.Fatalf("SaveRevision(beta) error = %v", err)
	}
	if err := service.MoveToTrash("notes/sub/beta", []byte("b")); err != nil {
		t.Fatalf("MoveToTrash(beta) error = %v", err)
	}

	if err := service.MovePrefix("notes/sub", "archive/sub"); err != nil {
		t.Fatalf("MovePrefix() error = %v", err)
	}
	revisions, err := service.ListRevisions("archive/sub/alpha")
	if err != nil {
		t.Fatalf("ListRevisions() moved alpha error = %v", err)
	}
	if len(revisions) != 1 || revisions[0].Page != "archive/sub/alpha" {
		t.Fatalf("moved alpha revisions = %#v", revisions)
	}
	trashEntries, err := service.ListTrash()
	if err != nil {
		t.Fatalf("ListTrash() moved error = %v", err)
	}
	if len(trashEntries) != 1 || trashEntries[0].Page != "archive/sub/beta" {
		t.Fatalf("moved trash entries = %#v", trashEntries)
	}

	if err := service.DeleteHistoryPrefix("archive/sub"); err != nil {
		t.Fatalf("DeleteHistoryPrefix() error = %v", err)
	}
	if _, err := filepath.Abs(filepath.Join("archive", "sub")); err != nil {
		t.Fatalf("filepath.Abs() sanity error = %v", err)
	}
	revisions, err = service.ListRevisions("archive/sub/alpha")
	if err != nil {
		t.Fatalf("ListRevisions() after delete prefix error = %v", err)
	}
	if len(revisions) != 0 {
		t.Fatalf("ListRevisions() after delete prefix len = %d, want 0", len(revisions))
	}
}

func TestServiceEmptyTrashRemovesHistory(t *testing.T) {
	t.Parallel()

	service, err := NewService(t.TempDir())
	if err != nil {
		t.Fatalf("NewService() error = %v", err)
	}

	if _, err := service.SaveRevision("notes/alpha", []byte("a")); err != nil {
		t.Fatalf("SaveRevision(alpha) error = %v", err)
	}
	if _, err := service.SaveRevision("notes/beta", []byte("b")); err != nil {
		t.Fatalf("SaveRevision(beta) error = %v", err)
	}
	if err := service.MoveToTrash("notes/alpha", []byte("a")); err != nil {
		t.Fatalf("MoveToTrash(alpha) error = %v", err)
	}
	if err := service.MoveToTrash("notes/beta", []byte("b")); err != nil {
		t.Fatalf("MoveToTrash(beta) error = %v", err)
	}

	if err := service.EmptyTrash(); err != nil {
		t.Fatalf("EmptyTrash() error = %v", err)
	}

	trashEntries, err := service.ListTrash()
	if err != nil {
		t.Fatalf("ListTrash() error = %v", err)
	}
	if len(trashEntries) != 0 {
		t.Fatalf("ListTrash() len = %d, want 0", len(trashEntries))
	}
	revisions, err := service.ListRevisions("notes/alpha")
	if err != nil {
		t.Fatalf("ListRevisions(alpha) error = %v", err)
	}
	if len(revisions) != 0 {
		t.Fatalf("ListRevisions(alpha) len = %d, want 0", len(revisions))
	}
	revisions, err = service.ListRevisions("notes/beta")
	if err != nil {
		t.Fatalf("ListRevisions(beta) error = %v", err)
	}
	if len(revisions) != 0 {
		t.Fatalf("ListRevisions(beta) len = %d, want 0", len(revisions))
	}
}
