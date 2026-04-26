import { afterEach, describe, expect, it } from "vitest";

import { defaultClientPreferences } from "./clientPreferences";
import { applyTheme, builtinThemeLibrary, defaultThemeId, mergedThemeLibrary, resolveTheme } from "./themes";
import type { ThemeRecord } from "./types";

describe("themes", function () {
  afterEach(function () {
    delete (globalThis as { document?: unknown }).document;
  });

  it("defaults client preferences to noterious-night", function () {
    expect(defaultClientPreferences().ui.themeId).toBe(defaultThemeId);
  });

  it("resolves built-in themes without a server payload", function () {
    const resolved = resolveTheme("paper", [], {});
    expect(resolved.id).toBe("paper");
    expect(resolved.source).toBe("builtin");
  });

  it("uses cached custom themes before the authenticated library loads", function () {
    const cachedTheme: ThemeRecord = {
      version: 1,
      id: "my-custom",
      name: "My Custom",
      source: "custom",
      kind: "dark",
      description: "cached",
      tokens: builtinThemeLibrary()[0].tokens,
    };
    const resolved = resolveTheme("my-custom", [], {
      "my-custom": cachedTheme,
    });
    expect(resolved.id).toBe("my-custom");
    expect(resolved.source).toBe("custom");
  });

  it("merges server custom themes with frontend built-ins", function () {
    const merged = mergedThemeLibrary([
      {
        version: 1,
        id: "soft-paper",
        name: "Soft Paper",
        source: "custom",
        kind: "light",
        description: "custom",
        tokens: builtinThemeLibrary()[0].tokens,
      },
      {
        version: 1,
        id: "paper",
        name: "Paper",
        source: "builtin",
        kind: "light",
        description: "stale server builtin",
        tokens: builtinThemeLibrary()[0].tokens,
      },
    ]);
    expect(merged.some(function (theme) {
      return theme.id === "github-light";
    })).toBe(true);
    expect(merged.filter(function (theme) {
      return theme.id === "paper";
    })).toHaveLength(1);
    expect(merged.some(function (theme) {
      return theme.id === "soft-paper" && theme.source === "custom";
    })).toBe(true);
  });

  it("falls back to noterious-night when a theme cannot be resolved", function () {
    const resolved = resolveTheme("missing-theme", [], {});
    expect(resolved.id).toBe(defaultThemeId);
  });

  it("applies theme variables and meta theme-color", function () {
    const styles: Record<string, string> = {};
    const meta = { content: "" };
    (globalThis as { document?: unknown }).document = {
      documentElement: {
        style: {
          setProperty(name: string, value: string) {
            styles[name] = value;
          },
        },
        setAttribute() {
          return;
        },
      },
      querySelector(selector: string) {
        return selector === 'meta[name="theme-color"]' ? meta : null;
      },
    };

    const theme = builtinThemeLibrary().find(function (item) {
      return item.id === "paper";
    });
    if (!theme) {
      throw new Error("paper theme missing");
    }
    applyTheme(theme);
    expect(styles["--bg"]).toBe(theme.tokens.bg);
    expect(styles["--accent"]).toBe(theme.tokens.accent);
    expect(meta.content).toBe(theme.tokens.themeColor);
  });
});
