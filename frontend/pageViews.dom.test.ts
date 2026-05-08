// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import { renderPagesTree, type PageTreeInlineEditState } from "./pageViews";
import type { DocumentRecord } from "./types";

function documentRecord(path: string): DocumentRecord {
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

function renderTree(options?: {
  folders?: string[];
  documents?: DocumentRecord[];
  expandedPageFolders?: Record<string, boolean>;
  inlineEdit?: PageTreeInlineEditState | null;
  mountInlineEditInput?: (input: HTMLInputElement) => void;
}): HTMLDivElement {
  const container = document.createElement("div");
  renderPagesTree(
    container,
    [],
    options?.folders || [],
    options?.documents || [],
    "",
    options?.expandedPageFolders || {},
    "",
    "",
    "",
    "Notes",
    function () {},
    function () {},
    function () {},
    function () {},
    function () {},
    function () {},
    function () {},
    function () {},
    function () {},
    function () {},
    function () {},
    function () {},
    function () {},
    options?.inlineEdit || null,
    function () {},
    function () {},
    function () {},
    options?.mountInlineEditInput || function () {},
  );
  return container;
}

describe("renderPagesTree inline edit", function () {
  it("renders a folder-plus svg for the root new-folder action", function () {
    const container = renderTree();

    const button = container.querySelector<HTMLButtonElement>('.page-tree-action[aria-label="New folder"]');
    expect(button).not.toBeNull();
    expect(button?.textContent).toBe("");
    expect(button?.querySelector("svg path")?.getAttribute("fill-rule")).toBe("evenodd");
  });

  it("shows an inline create row at the root even when the tree is empty", function () {
    const onMount = vi.fn();
    const container = renderTree({
      inlineEdit: {
        mode: "create",
        kind: "page",
        parentFolder: "",
        sourcePath: "",
        value: "Untitled",
      },
      mountInlineEditInput: onMount,
    });

    const input = container.querySelector<HTMLInputElement>('[data-page-tree-inline-input="true"]');
    expect(input).not.toBeNull();
    expect(input?.value).toBe("Untitled");
    expect(input?.placeholder).toBe("Untitled");
    expect(onMount).toHaveBeenCalledWith(input);
    expect(container.querySelector(".empty")).toBeNull();
  });

  it("replaces a document row with an inline rename editor", function () {
    const container = renderTree({
      folders: ["docs"],
      documents: [documentRecord("docs/report.pdf")],
      expandedPageFolders: { docs: true },
      inlineEdit: {
        mode: "rename",
        kind: "document",
        parentFolder: "docs",
        sourcePath: "docs/report.pdf",
        value: "renamed.pdf",
      },
    });

    const input = container.querySelector<HTMLInputElement>('[data-page-tree-inline-input="true"]');
    expect(input).not.toBeNull();
    expect(input?.value).toBe("renamed.pdf");
    expect(container.textContent || "").not.toContain("report.pdf");
  });
});
