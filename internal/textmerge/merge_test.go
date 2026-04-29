package textmerge

import (
	"errors"
	"testing"
)

func TestMergeCombinesDisjointLineEdits(t *testing.T) {
	t.Parallel()

	base := "# Note\nalpha\nbeta\n"
	local := "# Note\nalpha changed\nbeta\n"
	remote := "# Note\nalpha\nbeta changed\n"

	merged, err := Merge(base, local, remote)
	if err != nil {
		t.Fatalf("Merge() error = %v", err)
	}

	want := "# Note\nalpha changed\nbeta changed\n"
	if merged != want {
		t.Fatalf("merged = %q want %q", merged, want)
	}
}

func TestMergeRejectsOverlappingLineEdits(t *testing.T) {
	t.Parallel()

	base := "# Note\nalpha\nbeta\n"
	local := "# Note\nalpha from local\nbeta\n"
	remote := "# Note\nalpha from remote\nbeta\n"

	_, err := Merge(base, local, remote)
	if !errors.Is(err, ErrConflict) {
		t.Fatalf("Merge() error = %v want conflict", err)
	}
}

func TestMergeKeepsInsertionsAroundUnrelatedChanges(t *testing.T) {
	t.Parallel()

	base := "# Note\nalpha\nbeta\n"
	local := "# Note\nalpha\nlocal insert\nbeta\n"
	remote := "# Note\nalpha changed\nbeta\n"

	merged, err := Merge(base, local, remote)
	if err != nil {
		t.Fatalf("Merge() error = %v", err)
	}

	want := "# Note\nalpha changed\nlocal insert\nbeta\n"
	if merged != want {
		t.Fatalf("merged = %q want %q", merged, want)
	}
}
