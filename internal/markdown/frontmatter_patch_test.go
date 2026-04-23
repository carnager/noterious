package markdown

import "testing"

func TestApplyFrontmatterPatchUpdatesExistingBlock(t *testing.T) {
	t.Parallel()

	raw := "---\n" +
		"title: Alpha\n" +
		"tags:\n" +
		"  - work\n" +
		"obsolete: true\n" +
		"---\n" +
		"# Alpha\n"

	updated, err := ApplyFrontmatterPatch(raw, map[string]any{
		"title":    "Alpha",
		"tags":     []any{"work"},
		"obsolete": true,
	}, FrontmatterPatch{
		Set: map[string]any{
			"title": "Updated Alpha",
			"tags":  []string{"work", "urgent"},
			"count": int64(3),
		},
		Remove: []string{"obsolete"},
	})
	if err != nil {
		t.Fatalf("ApplyFrontmatterPatch() error = %v", err)
	}

	expected := "---\n" +
		"count: 3\n" +
		"tags:\n" +
		"  - work\n" +
		"  - urgent\n" +
		"title: Updated Alpha\n" +
		"---\n" +
		"# Alpha\n"
	if updated != expected {
		t.Fatalf("updated = %q, want %q", updated, expected)
	}
}

func TestApplyFrontmatterPatchCreatesBlockWhenMissing(t *testing.T) {
	t.Parallel()

	raw := "# Alpha\n\nBody.\n"
	updated, err := ApplyFrontmatterPatch(raw, nil, FrontmatterPatch{
		Set: map[string]any{
			"title": "Alpha",
			"tags":  []string{"work"},
		},
	})
	if err != nil {
		t.Fatalf("ApplyFrontmatterPatch() error = %v", err)
	}

	expected := "---\n" +
		"tags:\n" +
		"  - work\n" +
		"title: Alpha\n" +
		"---\n" +
		"# Alpha\n\nBody.\n"
	if updated != expected {
		t.Fatalf("updated = %q, want %q", updated, expected)
	}
}
