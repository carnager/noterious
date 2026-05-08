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

func TestRewriteDocumentLinksUpdatesWrappedTargetsWithSpaces(t *testing.T) {
	raw := "[Quarterly Report](<Docs/Quarterly Report.pdf>)"
	updated, changed := RewriteDocumentLinks(raw, "notes/today", "notes/Docs/Quarterly Report.pdf", "archive/Quarterly Report.pdf")

	if !changed {
		t.Fatalf("expected wrapped spaced target to change")
	}
	if updated != "[Quarterly Report](<../archive/Quarterly Report.pdf>)" {
		t.Fatalf("updated = %q", updated)
	}
}

func TestRewriteDocumentLinksKeepsAnchorsInsideWrappedTargets(t *testing.T) {
	raw := "[Quarterly Report](Docs/Quarterly Report.pdf#page=2)"
	updated, changed := RewriteDocumentLinks(raw, "notes/today", "notes/Docs/Quarterly Report.pdf", "archive/Quarterly Report.pdf")

	if !changed {
		t.Fatalf("expected spaced target with anchor to change")
	}
	if updated != "[Quarterly Report](<../archive/Quarterly Report.pdf#page=2>)" {
		t.Fatalf("updated = %q", updated)
	}
}
