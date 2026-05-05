import { describe, expect, it, vi } from "vitest";

import {
  buildSystemHelpPage,
  emptySystemDerivedPage,
  loadSystemHelpMarkdown,
  placeholderHelpMarkdown,
  SYSTEM_HELP_PATH,
} from "./systemHelp";

describe("systemHelp helpers", function () {
  it("builds a synthetic readonly help page from markdown", function () {
    const page = buildSystemHelpPage("# Noterious Help\n\nRead me.");

    expect(page.page).toBe(SYSTEM_HELP_PATH);
    expect(page.path).toBe(SYSTEM_HELP_PATH);
    expect(page.title).toBe("Noterious Help");
    expect(page.rawMarkdown).toContain("Read me.");
    expect(page.frontmatter).toEqual({});
  });

  it("returns an empty derived payload for system pages", function () {
    expect(emptySystemDerivedPage()).toEqual({
      toc: [],
      backlinks: [],
      queryBlocks: [],
      linkCounts: {},
      taskCounts: {},
    });
  });

  it("loads the bundled help markdown", async function () {
    const fetchImpl = vi.fn(async function () {
      return new Response("# Help\n");
    });

    await expect(loadSystemHelpMarkdown(fetchImpl as unknown as typeof fetch)).resolves.toBe("# Help\n");
    expect(fetchImpl).toHaveBeenCalledWith("/help.md");
  });

  it("creates placeholder markdown with a visible status", function () {
    expect(placeholderHelpMarkdown("Loading help…")).toContain("Loading help…");
  });
});
