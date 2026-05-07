import { describe, expect, it } from "vitest";

import { displayPathWithinScope, pageTreeDisplayStateForScope, type PageTreeUiState } from "./pageTreeUi";
import type { DocumentRecord, PageSummary } from "./types";

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

function document(path: string): DocumentRecord {
  return {
    id: path,
    path,
    name: path.split("/").slice(-1)[0] || path,
    contentType: "application/octet-stream",
    size: 1,
    createdAt: "",
    downloadURL: "/api/documents/download?path=" + encodeURIComponent(path),
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
      documents: [],
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
      documents: [document("Work/contacts/avatar.png")],
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
    expect(displayState.documents.map(function (entry) {
      return entry.path;
    })).toEqual(["Work/contacts/avatar.png"]);
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
      documents: [document("Work/contacts/avatar.png"), document("Personal/files/invoice.pdf")],
      expandedPageFolders: {},
      scopePrefix: "Work",
    };

    const displayState = pageTreeDisplayStateForScope(state);
    expect(displayState.pages.map(function (entry) {
      return entry.path;
    })).toEqual(["Work/contacts/rasmus"]);
    expect(displayState.folders).toEqual(["Work/contacts"]);
    expect(displayState.documents.map(function (entry) {
      return entry.path;
    })).toEqual(["Work/contacts/avatar.png"]);
  });

  it("handles repeated top-level names without collapsing them into the scope root", function () {
    expect(displayPathWithinScope("Contacts/Contacts/alpha", "Contacts")).toBe("Contacts/alpha");
  });

  it("keeps empty folders in the scoped display state", function () {
    const state: PageTreeUiState = {
      selectedPage: "",
      pages: [],
      folders: ["Work/contacts", "Work/empty", "Personal/home"],
      documents: [],
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
      documents: [document("Work/empty/image.png"), document("Work/contacts/avatar.png")],
      expandedPageFolders: {},
      scopePrefix: "Work",
      pruneFoldersToVisiblePages: true,
    };

    const displayState = pageTreeDisplayStateForScope(state);
    expect(displayState.folders).toEqual(["Work/contacts"]);
    expect(displayState.documents.map(function (entry) {
      return entry.path;
    })).toEqual(["Work/contacts/avatar.png"]);
  });

  it("can hide notes or files independently", function () {
    const state: PageTreeUiState = {
      selectedPage: "",
      pages: [page("Work/contacts/alina"), page("Work/_templates/contact")],
      folders: ["Work/contacts", "Work/assets", "Work/_templates", "Work/empty"],
      documents: [document("Work/assets/avatar.png")],
      expandedPageFolders: {},
      scopePrefix: "Work",
      showPages: false,
      showDocuments: true,
      showTemplates: false,
    };

    const displayState = pageTreeDisplayStateForScope(state);
    expect(displayState.pages).toEqual([]);
    expect(displayState.documents.map(function (entry) {
      return entry.path;
    })).toEqual(["Work/assets/avatar.png"]);
    expect(displayState.folders).toEqual(["Work/assets", "Work/empty"]);
  });

  it("keeps empty folders visible while hiding template-only folders by default", function () {
    const state: PageTreeUiState = {
      selectedPage: "",
      pages: [page("Work/contacts/alina"), page("Work/_templates/contact")],
      folders: ["Work/contacts", "Work/_templates", "Work/empty"],
      documents: [document("Work/contacts/avatar.png")],
      expandedPageFolders: {},
      scopePrefix: "Work",
      showDocuments: true,
      showTemplates: false,
    };

    const displayState = pageTreeDisplayStateForScope(state);
    expect(displayState.pages.map(function (entry) {
      return entry.path;
    })).toEqual(["Work/contacts/alina"]);
    expect(displayState.folders).toEqual(["Work/contacts", "Work/empty"]);
  });

  it("can show templates independently from normal notes", function () {
    const state: PageTreeUiState = {
      selectedPage: "",
      pages: [page("Work/contacts/alina"), page("Work/_templates/contact")],
      folders: ["Work/contacts", "Work/_templates", "Work/empty"],
      documents: [],
      expandedPageFolders: {},
      scopePrefix: "Work",
      showPages: false,
      showDocuments: false,
      showTemplates: true,
    };

    const displayState = pageTreeDisplayStateForScope(state);
    expect(displayState.pages.map(function (entry) {
      return entry.path;
    })).toEqual(["Work/_templates/contact"]);
    expect(displayState.folders).toEqual(["Work/_templates", "Work/empty"]);
  });
});
