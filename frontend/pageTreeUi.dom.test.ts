// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import { openTreeContextMenu, type PageTreeActions } from "./pageTreeUi";
import type { DocumentRecord } from "./types";

const expectedNotePlusIconPath = "M3.75 2.5A.75.75 0 0 0 3 3.25v9.5c0 .41.34.75.75.75h8.5c.41 0 .75-.34.75-.75V7.35L8.15 2.5H3.75Zm4.65 1.22 3.38 3.38H8.4V3.72ZM6.75 8h1.5v1.5h1.5V11h-1.5v1.5h-1.5V11h-1.5V9.5h1.5V8Z";

function makeActions(): PageTreeActions {
  return {
    navigateToPage: function () {},
    requestCreatePage: async function () {},
    requestCreateSubfolder: async function () {},
    requestRenameFolder: async function () {},
    requestMoveFolder: async function () {},
    deleteFolder: async function () {},
    requestRenamePage: async function () {},
    requestMovePage: async function () {},
    deletePage: async function () {},
    movePageToFolder: async function () {},
    moveFolder: async function () {},
    moveDocumentToFolder: async function () {},
    openPageHistory: function () {},
    openDocument: function (_document: DocumentRecord) {},
    insertDocumentLink: function (_document: DocumentRecord) {},
    requestRenameDocument: async function (_document: DocumentRecord) {},
    requestMoveDocument: async function (_document: DocumentRecord) {},
    deleteDocument: async function (_document: DocumentRecord) {},
    updateInlineEditValue: function () {},
    commitInlineEdit: function () {},
    cancelInlineEdit: function () {},
    mountInlineEditInput: function () {},
    currentHomePage: function () { return ""; },
    setHomePage: function () {},
    setNoteStatus: function () {},
    errorMessage: function (error: unknown) { return String(error || ""); },
  };
}

describe("openTreeContextMenu", function () {
  it("renders a visible note-plus icon for the folder New note action", function () {
    const menu = document.createElement("div");
    menu.className = "tree-context-menu hidden";

    openTreeContextMenu(menu, { kind: "folder", path: "docs", name: "docs" }, 12, 24, makeActions());

    const items = Array.from(menu.querySelectorAll<HTMLButtonElement>(".tree-context-menu-item"));
    const newNote = items.find(function (item) {
      return item.textContent?.includes("New note");
    });

    expect(newNote).not.toBeUndefined();
    expect(newNote?.querySelector("svg path")?.getAttribute("d")).toBe(expectedNotePlusIconPath);
  });
});
