package markdown

import "testing"

func TestRewritePageLinksUpdatesWikiLinks(t *testing.T) {
	raw := "See [[notes/alpha]], [[notes/alpha#details]], and [[notes/alpha|Alpha]]."
	updated, changed := RewritePageLinks(raw, "notes/beta", "notes/alpha", "projects/alpha-renamed")
	if !changed {
		t.Fatal("expected change")
	}
	expected := "See [[projects/alpha-renamed]], [[projects/alpha-renamed#details]], and [[projects/alpha-renamed|Alpha]]."
	if updated != expected {
		t.Fatalf("updated = %q, want %q", updated, expected)
	}
}

func TestRewritePageLinksUpdatesScopeRelativeWikiLinks(t *testing.T) {
	raw := "See [[Aruntha/Geschenkideen]] and [[Aruntha/Geschenkideen|Ideen]]."
	updated, changed := RewritePageLinks(raw, "Private/index", "Private/Aruntha/Geschenkideen", "Private/Aruntha/test")
	if !changed {
		t.Fatal("expected change")
	}
	expected := "See [[Aruntha/test]] and [[Aruntha/test|Ideen]]."
	if updated != expected {
		t.Fatalf("updated = %q, want %q", updated, expected)
	}
}

func TestRewritePageLinksUpdatesRelativeMarkdownLinks(t *testing.T) {
	raw := "See [Alpha](../notes/alpha.md) and [Detail](../notes/alpha.md#intro)."
	updated, changed := RewritePageLinks(raw, "daily/today", "notes/alpha", "projects/alpha-renamed")
	if !changed {
		t.Fatal("expected change")
	}
	expected := "See [Alpha](../projects/alpha-renamed.md) and [Detail](../projects/alpha-renamed.md#intro)."
	if updated != expected {
		t.Fatalf("updated = %q, want %q", updated, expected)
	}
}

func TestRewritePageLinksLeavesUnrelatedLinksUntouched(t *testing.T) {
	raw := "See [[notes/beta]] and [Alpha](../notes/alpha.md)."
	updated, changed := RewritePageLinks(raw, "daily/today", "notes/gamma", "projects/gamma")
	if changed {
		t.Fatal("did not expect change")
	}
	if updated != raw {
		t.Fatalf("updated = %q, want unchanged", updated)
	}
}
