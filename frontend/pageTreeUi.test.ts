import { describe, expect, it } from "vitest";

import { pageTreeDisplayStateForScope, type PageTreeUiState } from "./pageTreeUi";
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
      expandedPageFolders: {
        work: false,
        "work/contacts": false,
      },
    };

    const displayState = pageTreeDisplayStateForScope(state);
    expect(displayState.selectedPage).toBe("work/contacts/rasmus");
    expect(displayState.expandedPageFolders).toEqual({});
  });

  it("maps expanded folders and pages into the active scope", function () {
    const state: PageTreeUiState = {
      selectedPage: "Work/contacts/rasmus",
      pages: [
        page("Work/contacts/rasmus"),
        page("Work/notes/index"),
      ],
      expandedPageFolders: {
        Work: true,
        "Work/contacts": true,
      },
      scopePrefix: "Work",
    };

    const displayState = pageTreeDisplayStateForScope(state);
    expect(displayState.selectedPage).toBe("contacts/rasmus");
    expect(displayState.pages.map(function (entry) {
      return entry.path;
    })).toEqual(["contacts/rasmus", "notes/index"]);
    expect(displayState.expandedPageFolders).toEqual({
      contacts: true,
    });
  });
});
