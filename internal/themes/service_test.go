package themes

import (
	"strings"
	"testing"
)

func TestServiceListIncludesBuiltins(t *testing.T) {
	service, err := NewService(t.TempDir())
	if err != nil {
		t.Fatalf("NewService() error = %v", err)
	}

	themes, err := service.List()
	if err != nil {
		t.Fatalf("List() error = %v", err)
	}
	if len(themes) < len(builtinThemeOrder) {
		t.Fatalf("List() count = %d want >= %d", len(themes), len(builtinThemeOrder))
	}
	if themes[0].ID != DefaultThemeID || themes[0].Source != SourceBuiltin {
		t.Fatalf("first theme = %#v", themes[0])
	}
}

func TestCreateAndDeleteCustomTheme(t *testing.T) {
	service, err := NewService(t.TempDir())
	if err != nil {
		t.Fatalf("NewService() error = %v", err)
	}

	created, err := service.CreateFromReader("soft-paper.json", strings.NewReader(`{
  "version": 1,
  "name": "Soft Paper",
  "kind": "light",
  "description": "test",
  "tokens": {
    "bg": "#ffffff",
    "bgGradientStart": "#fafafa",
    "bgGradientEnd": "#f3f3f3",
    "bgGlowA": "rgba(0, 0, 0, 0.02)",
    "bgGlowB": "rgba(0, 0, 0, 0.03)",
    "panel": "rgba(255, 255, 255, 0.9)",
    "panelStrong": "#efefef",
    "surface": "#f5f5f5",
    "surfaceSoft": "#fbfbfb",
    "sidebar": "#f0e8dd",
    "sidebarSoft": "rgba(240, 232, 221, 0.82)",
    "overlay": "rgba(255, 252, 245, 0.98)",
    "overlaySoft": "rgba(248, 243, 233, 0.94)",
    "table": "rgba(245, 239, 228, 0.9)",
    "tableHeader": "rgba(51, 102, 153, 0.08)",
    "editorOverlay": "rgba(248, 243, 233, 0.98)",
    "ink": "#222222",
    "muted": "#666666",
    "accent": "#336699",
    "accentSoft": "rgba(51, 102, 153, 0.14)",
    "warn": "#bb4444",
    "line": "rgba(51, 102, 153, 0.13)",
    "lineStrong": "rgba(51, 102, 153, 0.22)",
    "focusRing": "rgba(51, 102, 153, 0.32)",
    "selection": "rgba(51, 102, 153, 0.18)",
    "shadow": "0 8px 18px rgba(0, 0, 0, 0.12)",
    "themeColor": "#ffffff"
  }
}`))
	if err != nil {
		t.Fatalf("CreateFromReader() error = %v", err)
	}
	if created.ID != "soft-paper" || created.Source != SourceCustom {
		t.Fatalf("created = %#v", created)
	}

	loaded, err := service.Get("soft-paper")
	if err != nil {
		t.Fatalf("Get() error = %v", err)
	}
	if loaded.Name != "Soft Paper" {
		t.Fatalf("loaded.Name = %q", loaded.Name)
	}

	if err := service.Delete("soft-paper"); err != nil {
		t.Fatalf("Delete() error = %v", err)
	}
	if _, err := service.Get("soft-paper"); err == nil {
		t.Fatal("Get() after Delete() expected error")
	}
}

func TestCreateRejectsUnknownToken(t *testing.T) {
	service, err := NewService(t.TempDir())
	if err != nil {
		t.Fatalf("NewService() error = %v", err)
	}

	_, err = service.CreateFromReader("bad.json", strings.NewReader(`{
  "version": 1,
  "name": "Bad",
  "kind": "dark",
  "tokens": {
    "bg": "#111111",
    "bgGradientStart": "#111111",
    "bgGradientEnd": "#000000",
    "bgGlowA": "rgba(255, 255, 255, 0.04)",
    "bgGlowB": "rgba(255, 255, 255, 0.02)",
    "panel": "rgba(0, 0, 0, 0.9)",
    "panelStrong": "#111111",
    "surface": "#222222",
    "surfaceSoft": "#181818",
    "sidebar": "#0f1014",
    "sidebarSoft": "rgba(15, 16, 20, 0.82)",
    "overlay": "rgba(15, 16, 20, 0.98)",
    "overlaySoft": "rgba(24, 24, 24, 0.94)",
    "table": "rgba(28, 28, 28, 0.9)",
    "tableHeader": "rgba(136, 170, 255, 0.08)",
    "editorOverlay": "rgba(24, 24, 24, 0.98)",
    "ink": "#f0f0f0",
    "muted": "#aaaaaa",
    "accent": "#88aaff",
    "accentSoft": "rgba(136, 170, 255, 0.14)",
    "warn": "#ff6666",
    "line": "rgba(136, 170, 255, 0.13)",
    "lineStrong": "rgba(136, 170, 255, 0.22)",
    "focusRing": "rgba(136, 170, 255, 0.32)",
    "selection": "rgba(136, 170, 255, 0.18)",
    "shadow": "0 8px 18px rgba(0, 0, 0, 0.12)",
    "themeColor": "#111111",
    "extra": "#123456"
  }
}`))
	if err == nil {
		t.Fatal("CreateFromReader() error = nil")
	}
}

func TestDeleteBuiltinFails(t *testing.T) {
	service, err := NewService(t.TempDir())
	if err != nil {
		t.Fatalf("NewService() error = %v", err)
	}
	if err := service.Delete(DefaultThemeID); err != ErrBuiltinTheme {
		t.Fatalf("Delete(default) error = %v want %v", err, ErrBuiltinTheme)
	}
}
