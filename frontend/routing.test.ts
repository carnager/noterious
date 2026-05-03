import { describe, expect, it, vi } from "vitest";

import { applyURLState, buildSelectionURL, navigateToPageSelection, parseURLState } from "./routing";
import type { PageSummary } from "./types";

function samplePage(path: string): PageSummary {
  return {
    path,
    title: path,
    tags: [],
    outgoingLinkCount: 0,
    backlinkCount: 0,
    taskCount: 0,
    openTaskCount: 0,
    doneTaskCount: 0,
    queryBlockCount: 0,
    createdAt: "",
    updatedAt: "",
  };
}

describe("routing helpers", function () {
  it("parses and rebuilds selection URLs", function () {
    expect(parseURLState("https://example.test/?page=notes%2Falpha&query=recent")).toEqual({
      page: "notes/alpha",
      query: "recent",
      screen: "notes",
    });

    expect(buildSelectionURL("https://example.test/?old=1", "notes/alpha", "", "notes").toString()).toBe(
      "https://example.test/?old=1&page=notes%2Falpha"
    );
    expect(buildSelectionURL("https://example.test/?old=1", "", "recent", "queries").toString()).toBe(
      "https://example.test/?old=1&query=recent&screen=queries"
    );
    expect(buildSelectionURL("https://example.test/?query=recent&screen=queries", "", "recent", "notes").toString()).toBe(
      "https://example.test/"
    );
  });

  it("applies URL state with page, query, home page, or idle fallback", function () {
    const onNavigateToPage = vi.fn();
    const onSelectSavedQuery = vi.fn();
    const onOpenQueriesScreen = vi.fn();
    const onRenderIdle = vi.fn();

    applyURLState({
      href: "https://example.test/?page=notes/alpha",
      currentHomePage: "",
      pages: [samplePage("notes/alpha")],
      onNavigateToPage,
      onSelectSavedQuery,
      onOpenQueriesScreen,
      onRenderIdle,
    });
    expect(onNavigateToPage).toHaveBeenCalledWith("notes/alpha", true);

    onNavigateToPage.mockReset();
    onRenderIdle.mockReset();
    applyURLState({
      href: "https://example.test/?page=notes/private-only",
      currentHomePage: "",
      pages: [samplePage("notes/work-home")],
      onNavigateToPage,
      onSelectSavedQuery,
      onOpenQueriesScreen,
      onRenderIdle,
    });
    expect(onNavigateToPage).not.toHaveBeenCalled();
    expect(onRenderIdle).toHaveBeenCalled();

    onRenderIdle.mockReset();
    applyURLState({
      href: "https://example.test/?query=recent",
      currentHomePage: "",
      pages: [],
      onNavigateToPage,
      onSelectSavedQuery,
      onOpenQueriesScreen,
      onRenderIdle,
    });
    expect(onOpenQueriesScreen).toHaveBeenCalled();
    expect(onSelectSavedQuery).toHaveBeenCalledWith("recent");

    onSelectSavedQuery.mockReset();
    onOpenQueriesScreen.mockReset();
    applyURLState({
      href: "https://example.test/",
      currentHomePage: "notes/home",
      pages: [samplePage("notes/home")],
      onNavigateToPage,
      onSelectSavedQuery,
      onOpenQueriesScreen,
      onRenderIdle,
    });
    expect(onNavigateToPage).toHaveBeenCalledWith("notes/home", true);

    onNavigateToPage.mockReset();
    applyURLState({
      href: "https://example.test/",
      currentHomePage: "notes/missing",
      pages: [samplePage("notes/home")],
      onNavigateToPage,
      onSelectSavedQuery,
      onOpenQueriesScreen,
      onRenderIdle,
    });
    expect(onRenderIdle).toHaveBeenCalled();

    onRenderIdle.mockReset();
    applyURLState({
      href: "https://example.test/?screen=queries",
      currentHomePage: "",
      pages: [samplePage("notes/home")],
      onNavigateToPage,
      onSelectSavedQuery,
      onOpenQueriesScreen,
      onRenderIdle,
    });
    expect(onOpenQueriesScreen).toHaveBeenCalled();
  });

  it("drives page selection callbacks in the correct order", function () {
    const calls: string[] = [];

    navigateToPageSelection({
      pagePath: "notes/alpha",
      lineNumber: "12",
      taskRef: "task-1",
      replace: false,
      onExpandAncestors: function (pagePath: string) {
        calls.push("expand:" + pagePath);
      },
      onSetPendingFocus: function (lineNumber: number | null, taskRef: string) {
        calls.push("pending:" + lineNumber + ":" + taskRef);
      },
      onSelectPage: function (pagePath: string) {
        calls.push("select:" + pagePath);
      },
      onSyncURL: function (replace: boolean) {
        calls.push("sync:" + replace);
      },
      onRenderPages: function () {
        calls.push("render-pages");
      },
      onRenderSavedQueryTree: function () {
        calls.push("render-queries");
      },
      onLoadPageDetail: function (pagePath: string) {
        calls.push("load:" + pagePath);
      },
    });

    expect(calls).toEqual([
      "pending:12:task-1",
      "select:notes/alpha",
      "expand:notes/alpha",
      "sync:false",
      "render-pages",
      "render-queries",
      "load:notes/alpha",
    ]);
  });
});
