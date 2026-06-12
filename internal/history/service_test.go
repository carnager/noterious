package history

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"
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

func TestVaultHistoryUsesSingleStore(t *testing.T) {
	t.Parallel()

	service, err := NewService(t.TempDir())
	if err != nil {
		t.Fatalf("NewService() error = %v", err)
	}

	if _, err := service.SaveRevision("notes/alpha", []byte("vault-one")); err != nil {
		t.Fatalf("SaveRevision(first) error = %v", err)
	}
	if _, err := service.SaveRevision("notes/alpha", []byte("vault-two")); err != nil {
		t.Fatalf("SaveRevision(second) error = %v", err)
	}

	revisionsOne, err := service.ListRevisions("notes/alpha")
	if err != nil {
		t.Fatalf("ListRevisions(first) error = %v", err)
	}
	revisionsTwo, err := service.ListRevisions("notes/alpha")
	if err != nil {
		t.Fatalf("ListRevisions(second) error = %v", err)
	}
	if len(revisionsOne) != 1 || revisionsOne[0].RawMarkdown != "vault-two" {
		t.Fatalf("revisionsOne = %#v", revisionsOne)
	}
	if len(revisionsTwo) != 1 || revisionsTwo[0].RawMarkdown != "vault-two" {
		t.Fatalf("revisionsTwo = %#v", revisionsTwo)
	}

	if err := service.MoveToTrash("notes/alpha", []byte("vault-one")); err != nil {
		t.Fatalf("MoveToTrash() error = %v", err)
	}
	trashOne, err := service.ListTrash()
	if err != nil {
		t.Fatalf("ListTrash(first) error = %v", err)
	}
	trashTwo, err := service.ListTrash()
	if err != nil {
		t.Fatalf("ListTrash(second) error = %v", err)
	}
	if len(trashOne) != 1 || trashOne[0].RawMarkdown != "vault-one" {
		t.Fatalf("trashOne = %#v", trashOne)
	}
	if len(trashTwo) != 1 || trashTwo[0].RawMarkdown != "vault-one" {
		t.Fatalf("trashTwo = %#v", trashTwo)
	}
}

func writeFakeRevision(t *testing.T, service *Service, page string, savedAt time.Time, content string) {
	t.Helper()
	revisionDir := service.revisionDir(page)
	if err := os.MkdirAll(revisionDir, 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	revision := Revision{
		ID:          fmt.Sprintf("%d", savedAt.UnixNano()),
		Page:        page,
		SavedAt:     savedAt,
		RawMarkdown: content,
	}
	if err := writeJSONFile(filepath.Join(revisionDir, revision.ID+".json"), revision); err != nil {
		t.Fatalf("writeJSONFile() error = %v", err)
	}
}

func TestSaveRevisionPrunesByCount(t *testing.T) {
	t.Parallel()

	service, err := NewService(t.TempDir())
	if err != nil {
		t.Fatalf("NewService() error = %v", err)
	}
	service.SetRetention(2, 0)

	now := time.Now().UTC()
	writeFakeRevision(t, service, "notes/test", now.Add(-3*time.Hour), "v1")
	writeFakeRevision(t, service, "notes/test", now.Add(-2*time.Hour), "v2")
	writeFakeRevision(t, service, "notes/test", now.Add(-1*time.Hour), "v3")

	saved, err := service.SaveRevision("notes/test", []byte("v4"))
	if err != nil {
		t.Fatalf("SaveRevision() error = %v", err)
	}
	if !saved {
		t.Fatal("SaveRevision() = false, want true")
	}

	revisions, err := service.ListRevisions("notes/test")
	if err != nil {
		t.Fatalf("ListRevisions() error = %v", err)
	}
	if len(revisions) != 2 {
		t.Fatalf("len(revisions) = %d, want 2", len(revisions))
	}
	if revisions[0].RawMarkdown != "v4" || revisions[1].RawMarkdown != "v3" {
		t.Fatalf("kept revisions = %q, %q, want v4, v3", revisions[0].RawMarkdown, revisions[1].RawMarkdown)
	}
}

func TestSaveRevisionPrunesByAge(t *testing.T) {
	t.Parallel()

	service, err := NewService(t.TempDir())
	if err != nil {
		t.Fatalf("NewService() error = %v", err)
	}
	service.SetRetention(0, time.Hour)

	now := time.Now().UTC()
	writeFakeRevision(t, service, "notes/test", now.Add(-3*time.Hour), "old")
	writeFakeRevision(t, service, "notes/test", now.Add(-30*time.Minute), "recent")

	if _, err := service.SaveRevision("notes/test", []byte("new")); err != nil {
		t.Fatalf("SaveRevision() error = %v", err)
	}

	revisions, err := service.ListRevisions("notes/test")
	if err != nil {
		t.Fatalf("ListRevisions() error = %v", err)
	}
	if len(revisions) != 2 {
		t.Fatalf("len(revisions) = %d, want 2", len(revisions))
	}
	for _, revision := range revisions {
		if revision.RawMarkdown == "old" {
			t.Fatal("revision older than max age was not pruned")
		}
	}
}

func TestSaveRevisionUnlimitedByDefault(t *testing.T) {
	t.Parallel()

	service, err := NewService(t.TempDir())
	if err != nil {
		t.Fatalf("NewService() error = %v", err)
	}

	now := time.Now().UTC()
	for i := 0; i < 5; i++ {
		writeFakeRevision(t, service, "notes/test", now.Add(-time.Duration(10-i)*time.Hour), fmt.Sprintf("v%d", i))
	}

	if _, err := service.SaveRevision("notes/test", []byte("latest")); err != nil {
		t.Fatalf("SaveRevision() error = %v", err)
	}

	revisions, err := service.ListRevisions("notes/test")
	if err != nil {
		t.Fatalf("ListRevisions() error = %v", err)
	}
	if len(revisions) != 6 {
		t.Fatalf("len(revisions) = %d, want 6", len(revisions))
	}
}
