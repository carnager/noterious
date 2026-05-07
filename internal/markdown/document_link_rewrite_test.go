package markdown

import "testing"

func TestRewriteDocumentLinksUpdatesMarkdownImageLinks(t *testing.T) {
	raw := "![Cat](Assets/cat.png)"
	updated, changed := RewriteDocumentLinks(raw, "notes/today", "notes/Assets/cat.png", "media/cat.png")

	if !changed {
		t.Fatalf("expected document links to change")
	}
	if updated != "![Cat](../media/cat.png)" {
		t.Fatalf("updated = %q", updated)
	}
}

func TestRewriteDocumentLinksUpdatesWikiEmbeds(t *testing.T) {
	raw := "![[Assets/cat.png|Cat]]"
	updated, changed := RewriteDocumentLinks(raw, "notes/today", "notes/Assets/cat.png", "media/cat.png")

	if !changed {
		t.Fatalf("expected wiki embed to change")
	}
	if updated != "![[../media/cat.png|Cat]]" {
		t.Fatalf("updated = %q", updated)
	}
}

func TestRewriteDocumentLinksLeavesUnrelatedTargetsUntouched(t *testing.T) {
	raw := "![Cat](Assets/cat.png)\n[Spec](Docs/spec.pdf)"
	updated, changed := RewriteDocumentLinks(raw, "notes/today", "Assets/other.png", "media/other.png")

	if changed {
		t.Fatalf("expected unrelated links to remain unchanged")
	}
	if updated != raw {
		t.Fatalf("updated = %q", updated)
	}
}
