import { describe, expect, it } from "vitest";

import { displayPathWithinScope, pageTreeDisplayStateForScope, type PageTreeUiState } from "./pageTreeUi";
import type { PageSummary } from "./types";

function page(path: string): PageSummary {
  return {
    path,
    title: path.split("/").slice(-1)[0] || path,
    tags: [],
    frontmatter: {},
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

describe("page tree display state", function () {
  it("does not force-expand selected page ancestors during render", function () {
    const state: PageTreeUiState = {
      selectedPage: "work/contacts/rasmus",
      pages: [
        page("work/contacts/rasmus"),
        page("work/contacts/alina"),
      ],
      folders: [],
      expandedPageFolders: {
        work: false,
        "work/contacts": false,
      },
    };

    const displayState = pageTreeDisplayStateForScope(state);
    expect(displayState.selectedPage).toBe("work/contacts/rasmus");
    expect(displayState.expandedPageFolders).toEqual({});
  });

  it("keeps canonical paths while display labels can still be derived from the active scope", function () {
    const state: PageTreeUiState = {
      selectedPage: "Work/contacts/rasmus",
      pages: [
        page("Work/contacts/rasmus"),
        page("Work/notes/index"),
      ],
      folders: ["Work/contacts", "Work/notes"],
      expandedPageFolders: {
        Work: true,
        "Work/contacts": true,
      },
      scopePrefix: "Work",
    };

    const displayState = pageTreeDisplayStateForScope(state);
    expect(displayState.selectedPage).toBe("Work/contacts/rasmus");
    expect(displayState.pages.map(function (entry) {
      return entry.path;
    })).toEqual(["Work/contacts/rasmus", "Work/notes/index"]);
    expect(displayState.folders).toEqual(["Work/contacts", "Work/notes"]);
    expect(displayState.expandedPageFolders).toEqual({
      Work: true,
      "Work/contacts": true,
    });
    expect(displayPathWithinScope("Work/contacts/rasmus", "Work")).toBe("contacts/rasmus");
    expect(displayPathWithinScope("Work/notes/index", "Work")).toBe("notes/index");
  });

  it("filters out pages from other top-level scopes", function () {
    const state: PageTreeUiState = {
      selectedPage: "Work/contacts/rasmus",
      pages: [
        page("Work/contacts/rasmus"),
        page("Personal/home"),
      ],
      folders: ["Work/contacts", "Personal/projects"],
      expandedPageFolders: {},
      scopePrefix: "Work",
    };

    const displayState = pageTreeDisplayStateForScope(state);
    expect(displayState.pages.map(function (entry) {
      return entry.path;
    })).toEqual(["Work/contacts/rasmus"]);
    expect(displayState.folders).toEqual(["Work/contacts"]);
  });

  it("handles repeated top-level names without collapsing them into the scope root", function () {
    expect(displayPathWithinScope("Contacts/Contacts/alpha", "Contacts")).toBe("Contacts/alpha");
  });

  it("keeps empty folders in the scoped display state", function () {
    const state: PageTreeUiState = {
      selectedPage: "",
      pages: [],
      folders: ["Work/contacts", "Work/empty", "Personal/home"],
      expandedPageFolders: {},
      scopePrefix: "Work",
    };

    const displayState = pageTreeDisplayStateForScope(state);
    expect(displayState.folders).toEqual(["Work/contacts", "Work/empty"]);
  });

  it("hides folders that do not contain visible pages when pruning is enabled", function () {
    const state: PageTreeUiState = {
      selectedPage: "",
      pages: [
        page("Work/contacts/alina"),
      ],
      folders: ["Work/contacts", "Work/empty", "Work/projects/archive"],
      expandedPageFolders: {},
      scopePrefix: "Work",
      pruneFoldersToVisiblePages: true,
    };

    const displayState = pageTreeDisplayStateForScope(state);
    expect(displayState.folders).toEqual(["Work/contacts"]);
  });
});
