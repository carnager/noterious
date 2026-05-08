import { clearNode, renderEmpty } from "./dom";
import { formatDateTimeValue, formatDateValue, formatTimeValue } from "./datetime";
import { renderInline } from "./markdown";
import type { BacklinkRecord, DerivedPage, DocumentRecord, PageRecord, PageSummary, TaskRecord } from "./types";

interface PageTreeFolder {
  key: string;
  name: string;
  folders: Record<string, PageTreeFolder>;
  pages: PageSummary[];
  documents: DocumentRecord[];
}

interface PageTreeRoot {
  folders: Record<string, PageTreeFolder>;
  pages: PageSummary[];
  documents: DocumentRecord[];
}

export interface PageTreeInlineEditState {
  mode: "create" | "rename";
  kind: "page" | "folder" | "document";
  parentFolder: string;
  sourcePath: string;
  value: string;
}

export type PageTreeMenuTarget =
  | { kind: "page"; path: string; name: string }
  | { kind: "folder"; path: string; name: string }
  | { kind: "document"; path: string; name: string; document: DocumentRecord };

export const pageTreeDragMimeType = "application/x-noterious-tree";

export type TreeDragItem =
  | { kind: "page"; path: string }
  | { kind: "folder"; path: string }
  | { kind: "document"; path: string };

let activeDragItem: TreeDragItem | null = null;

function normalizeScopePrefix(scopePrefix: string): string {
  return String(scopePrefix || "").trim().replace(/^\/+|\/+$/g, "");
}

export function pageWithinScope(path: string, scopePrefix: string): boolean {
  const normalizedPath = String(path || "").trim().replace(/^\/+|\/+$/g, "");
  const normalizedScopePrefix = normalizeScopePrefix(scopePrefix);
  if (!normalizedPath) {
    return false;
  }
  if (!normalizedScopePrefix) {
    return true;
  }
  return normalizedPath === normalizedScopePrefix || normalizedPath.startsWith(normalizedScopePrefix + "/");
}

function displayPathWithinScope(path: string, scopePrefix: string): string {
  const normalizedPath = String(path || "").trim().replace(/^\/+|\/+$/g, "");
  const normalizedScopePrefix = normalizeScopePrefix(scopePrefix);
  if (!normalizedPath || !normalizedScopePrefix) {
    return normalizedPath;
  }
  if (normalizedPath === normalizedScopePrefix) {
    return "";
  }
  if (normalizedPath.startsWith(normalizedScopePrefix + "/")) {
    return normalizedPath.slice(normalizedScopePrefix.length + 1);
  }
  return normalizedPath;
}

function parentFolderPath(path: string): string {
  const normalizedPath = String(path || "").trim().replace(/^\/+|\/+$/g, "");
  const lastSlash = normalizedPath.lastIndexOf("/");
  return lastSlash >= 0 ? normalizedPath.slice(0, lastSlash) : "";
}

function inlineEditMatchesCreate(inlineEdit: PageTreeInlineEditState | null | undefined, kind: "page" | "folder", parentFolder: string): boolean {
  return Boolean(
    inlineEdit
    && inlineEdit.mode === "create"
    && inlineEdit.kind === kind
    && String(inlineEdit.parentFolder || "").trim().replace(/^\/+|\/+$/g, "") === String(parentFolder || "").trim().replace(/^\/+|\/+$/g, "")
  );
}

function inlineEditMatchesRename(inlineEdit: PageTreeInlineEditState | null | undefined, kind: "page" | "folder" | "document", path: string): boolean {
  return Boolean(
    inlineEdit
    && inlineEdit.mode === "rename"
    && inlineEdit.kind === kind
    && String(inlineEdit.sourcePath || "").trim().replace(/^\/+|\/+$/g, "") === String(path || "").trim().replace(/^\/+|\/+$/g, "")
  );
}

function renderPageTreeInlineItem(
  kind: "page" | "folder" | "document",
  value: string,
  onValueChange: (value: string) => void,
  onCommit: () => void,
  onCancel: () => void,
): HTMLDivElement {
  const item = document.createElement("div");
  item.className = kind === "folder"
    ? "page-tree-node page-tree-folder page-tree-inline-node"
    : ("page-tree-node page-tree-leaf page-tree-inline-node" + (kind === "document" ? " page-tree-document-leaf" : ""));

  const row = document.createElement("div");
  row.className = "page-tree-row";

  const shell = document.createElement("div");
  shell.className = "page-tree-inline-editor";

  if (kind === "folder") {
    const chevron = document.createElement("span");
    chevron.className = "page-tree-chevron page-tree-chevron-placeholder";
    chevron.textContent = "▸";
    shell.appendChild(chevron);
  }

  const icon = document.createElement("span");
  icon.className = "page-tree-icon";
  icon.textContent = kind === "folder" ? "📁" : (kind === "document" ? "↗" : "•");
  shell.appendChild(icon);

  const input = document.createElement("input");
  input.type = "text";
  input.className = "page-tree-inline-input";
  input.value = value;
  input.placeholder = kind === "folder" ? "Untitled folder" : (kind === "document" ? "untitled-file" : "Untitled");
  input.autocapitalize = "none";
  input.spellcheck = false;
  input.setAttribute("data-page-tree-inline-input", "true");

  let settled = false;
  function finish(callback: () => void): void {
    if (settled) {
      return;
    }
    settled = true;
    callback();
  }

  input.addEventListener("click", function (event) {
    event.stopPropagation();
  });
  input.addEventListener("mousedown", function (event) {
    event.stopPropagation();
  });
  input.addEventListener("contextmenu", function (event) {
    event.stopPropagation();
  });
  input.addEventListener("input", function () {
    onValueChange(input.value);
  });
  input.addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      finish(onCommit);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      finish(onCancel);
    }
  });
  input.addEventListener("blur", function () {
    window.setTimeout(function () {
      if (!settled) {
        finish(onCommit);
      }
    }, 0);
  });
  shell.appendChild(input);

  row.appendChild(shell);
  item.appendChild(row);
  return item;
}

export function filterPagesByScope(pages: PageSummary[], scopePrefix: string): PageSummary[] {
  return (Array.isArray(pages) ? pages : []).filter(function (page) {
    return pageWithinScope(String(page.path || ""), scopePrefix);
  });
}

export function filterFoldersByScope(folders: string[], scopePrefix: string): string[] {
  return (Array.isArray(folders) ? folders : []).filter(function (folder) {
    return pageWithinScope(String(folder || ""), scopePrefix);
  });
}

export function filterDocumentsByScope(documents: DocumentRecord[], scopePrefix: string): DocumentRecord[] {
  return (Array.isArray(documents) ? documents : []).filter(function (document) {
    return pageWithinScope(String(document.path || ""), scopePrefix);
  });
}

function formatReminderLabel(value: string): string {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }
  if (/^\d{2}:\d{2}(?::\d{2})?$/.test(text)) {
    return formatTimeValue(text);
  }
  return formatDateTimeValue(text);
}

function setDragPayload(event: DragEvent, payload: TreeDragItem): void {
  if (!event.dataTransfer) {
    return;
  }
  activeDragItem = payload;
  const effect = payload.kind === "document" ? "copyMove" : "move";
  event.dataTransfer.effectAllowed = effect;
  event.dataTransfer.dropEffect = payload.kind === "document" ? "copy" : "move";
  event.dataTransfer.setData(pageTreeDragMimeType, JSON.stringify(payload));
  event.dataTransfer.setData("text/plain", payload.path);
}

function getDragPayload(event: DragEvent): TreeDragItem | null {
  if (activeDragItem) {
    return activeDragItem;
  }
  if (!event.dataTransfer) {
    return null;
  }
  const raw = event.dataTransfer.getData(pageTreeDragMimeType);
  if (!raw) {
    return null;
  }
  try {
    const payload = JSON.parse(raw) as TreeDragItem;
    if (!payload || !payload.path || (payload.kind !== "page" && payload.kind !== "folder" && payload.kind !== "document")) {
      return null;
    }
    return payload;
  } catch (_error) {
    return null;
  }
}

function canDropOnFolder(payload: TreeDragItem | null, folderKey: string): boolean {
  if (!payload || !folderKey) {
    return false;
  }
  if (payload.kind === "page" || payload.kind === "document") {
    const pageLeaf = String(payload.path || "").split("/").pop() || "";
    return folderKey + "/" + pageLeaf !== payload.path;
  }
  return payload.path !== folderKey && !folderKey.startsWith(payload.path + "/");
}

function canDropOnRoot(payload: TreeDragItem | null): boolean {
  if (!payload) {
    return false;
  }
  return String(payload.path || "").indexOf("/") >= 0;
}

function makeDragSource(element: HTMLElement, payload: TreeDragItem): void {
  element.draggable = true;
  element.setAttribute("data-drag-kind", payload.kind);
  element.setAttribute("data-drag-path", payload.path);
  element.addEventListener("dragstart", function (event) {
    event.stopPropagation();
    setDragPayload(event, payload);
    document.body.classList.add("tree-dragging");
    element.classList.add("drag-source");
  });
  element.addEventListener("dragend", function (event) {
    event.stopPropagation();
    activeDragItem = null;
    document.body.classList.remove("tree-dragging");
    element.classList.remove("drag-source");
  });
}

export function ensureExpandedPageAncestors(path: string, expandedPageFolders: Record<string, boolean>): void {
  const parts = String(path || "").split("/");
  let key = "";
  for (let index = 0; index < parts.length - 1; index += 1) {
    key = key ? key + "/" + parts[index] : parts[index];
    expandedPageFolders[key] = true;
  }
}

function ensureFolderPath(root: PageTreeRoot, canonicalPath: string, scopePrefix: string): void {
  const normalizedCanonicalPath = String(canonicalPath || "").trim().replace(/^\/+|\/+$/g, "");
  if (!normalizedCanonicalPath) {
    return;
  }
  const displayPath = displayPathWithinScope(normalizedCanonicalPath, scopePrefix);
  const segments = displayPath ? displayPath.split("/") : [];
  const canonicalSegments = normalizedCanonicalPath.split("/").filter(Boolean);
  const normalizedScopePrefix = normalizeScopePrefix(scopePrefix);
  const scopeParts = normalizedScopePrefix ? normalizedScopePrefix.split("/") : [];
  const offset = normalizedScopePrefix && normalizedCanonicalPath.startsWith(normalizedScopePrefix + "/")
    ? scopeParts.length
    : 0;

  let cursor: PageTreeRoot | PageTreeFolder = root;
  segments.forEach(function (segment, index) {
    const canonicalKey = canonicalSegments.slice(0, offset + index + 1).join("/");
    if (!cursor.folders[segment]) {
      cursor.folders[segment] = { key: canonicalKey, name: segment, folders: {}, pages: [], documents: [] };
    }
    cursor = cursor.folders[segment];
  });
}

function buildPageTree(pages: PageSummary[], folders: string[], documents: DocumentRecord[], scopePrefix: string): PageTreeRoot {
  const root: PageTreeRoot = { folders: {}, pages: [], documents: [] };
  const normalizedScopePrefix = normalizeScopePrefix(scopePrefix);
  const scopeParts = normalizedScopePrefix ? normalizedScopePrefix.split("/") : [];

  folders.forEach(function (folderPath) {
    ensureFolderPath(root, folderPath, normalizedScopePrefix);
  });

  pages.forEach(function (page) {
    const canonicalPath = String(page.path || "");
    const displayPath = displayPathWithinScope(canonicalPath, normalizedScopePrefix);
    const segments = displayPath ? displayPath.split("/") : [];
    const canonicalSegments = canonicalPath.split("/").filter(Boolean);
    const offset = normalizedScopePrefix && canonicalPath.startsWith(normalizedScopePrefix + "/")
      ? scopeParts.length
      : 0;

    if (segments.length <= 1) {
      root.pages.push(page);
      return;
    }

    let cursor: PageTreeRoot | PageTreeFolder = root;
    for (let index = 0; index < segments.length - 1; index += 1) {
      const segment = segments[index];
      const canonicalKey = canonicalSegments.slice(0, offset + index + 1).join("/");
      if (!cursor.folders[segment]) {
        cursor.folders[segment] = { key: canonicalKey, name: segment, folders: {}, pages: [], documents: [] };
      }
      cursor = cursor.folders[segment];
    }
    cursor.pages.push(page);
  });

  documents.forEach(function (document) {
    const canonicalPath = String(document.path || "");
    const displayPath = displayPathWithinScope(canonicalPath, normalizedScopePrefix);
    const segments = displayPath ? displayPath.split("/") : [];
    const canonicalSegments = canonicalPath.split("/").filter(Boolean);
    const offset = normalizedScopePrefix && canonicalPath.startsWith(normalizedScopePrefix + "/")
      ? scopeParts.length
      : 0;

    if (segments.length <= 1) {
      root.documents.push(document);
      return;
    }

    let cursor: PageTreeRoot | PageTreeFolder = root;
    for (let index = 0; index < segments.length - 1; index += 1) {
      const segment = segments[index];
      const canonicalKey = canonicalSegments.slice(0, offset + index + 1).join("/");
      if (!cursor.folders[segment]) {
        cursor.folders[segment] = { key: canonicalKey, name: segment, folders: {}, pages: [], documents: [] };
      }
      cursor = cursor.folders[segment];
    }
    cursor.documents.push(document);
  });

  return root;
}

function makeTreeActionIcon(pathData: string): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", pathData);
  path.setAttribute("fill", "currentColor");
  svg.appendChild(path);
  return svg;
}

const folderPlusIconPath = "M1.5 4.25A1.75 1.75 0 0 1 3.25 2.5h2.38c.33 0 .65.13.88.37l.88.88c.14.14.33.22.53.22h4.83A1.75 1.75 0 0 1 14.5 5.72v4.53A1.75 1.75 0 0 1 12.75 12H3.25A1.75 1.75 0 0 1 1.5 10.25v-6Zm1.75-.75a.75.75 0 0 0-.75.75v6c0 .41.34.75.75.75h9.5c.41 0 .75-.34.75-.75V5.72a.75.75 0 0 0-.75-.75H8.03c-.47 0-.92-.19-1.24-.51l-.88-.88a.25.25 0 0 0-.18-.08h-2.2ZM9.5 6.2c.28 0 .5.22.5.5v1.05h1.05a.5.5 0 0 1 0 1H10v1.05a.5.5 0 0 1-1 0V8.75H7.95a.5.5 0 0 1 0-1H9V6.7c0-.28.22-.5.5-.5Z";

function renderPageTreeNode(
  node: PageTreeRoot | PageTreeFolder,
  currentFolderKey: string,
  depth: number,
  expandedPageFolders: Record<string, boolean>,
  selectedPage: string,
  onToggleFolder: (folderKey: string) => void,
  onSelectPage: (pagePath: string) => void,
  onOpenDocument: (document: DocumentRecord) => void,
  onCreatePage: (pagePath: string) => void,
  onCreateSubfolder: (folderKey: string) => void,
  onRenameFolder: (folderKey: string) => void,
  onDeleteFolder: (folderKey: string) => void,
  onRenamePage: (pagePath: string) => void,
  onDeletePage: (pagePath: string) => void,
  onOpenContextMenu: (target: PageTreeMenuTarget, left: number, top: number) => void,
  onMovePage: (pagePath: string, folderKey: string) => void,
  onMoveFolder: (folderKey: string, targetFolder: string) => void,
  onMoveDocument: (documentPath: string, folderKey: string) => void,
  inlineEdit: PageTreeInlineEditState | null,
  onInlineEditValueChange: (value: string) => void,
  onInlineEditCommit: () => void,
  onInlineEditCancel: () => void,
): HTMLDivElement {
  const group = document.createElement("div");
  group.className = depth === 0 ? "page-tree-root" : "page-tree-children";

  if (inlineEditMatchesCreate(inlineEdit, "folder", currentFolderKey)) {
    group.appendChild(renderPageTreeInlineItem("folder", inlineEdit?.value || "", onInlineEditValueChange, onInlineEditCommit, onInlineEditCancel));
  }

  Object.keys(node.folders)
    .sort()
    .forEach(function (name) {
      const folder = node.folders[name];
      const item = document.createElement("div");
      item.className = "page-tree-node page-tree-folder";
      item.addEventListener("dragover", function (event) {
        const payload = getDragPayload(event);
        if (!canDropOnFolder(payload, folder.key)) {
          return;
        }
        event.preventDefault();
        if (event.dataTransfer) {
          event.dataTransfer.dropEffect = "move";
        }
        item.classList.add("drag-target");
      });
      item.addEventListener("dragleave", function () {
        item.classList.remove("drag-target");
      });
      item.addEventListener("drop", function (event) {
        const payload = getDragPayload(event);
        item.classList.remove("drag-target");
        if (!payload || !canDropOnFolder(payload, folder.key)) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        if (payload.kind === "page") {
          onMovePage(payload.path, folder.key);
          return;
        }
        if (payload.kind === "document") {
          onMoveDocument(payload.path, folder.key);
          return;
        }
        onMoveFolder(payload.path, folder.key);
      });

      const row = document.createElement("div");
      row.className = "page-tree-row";

      if (inlineEditMatchesRename(inlineEdit, "folder", folder.key)) {
        row.appendChild(renderPageTreeInlineItem("folder", inlineEdit?.value || "", onInlineEditValueChange, onInlineEditCommit, onInlineEditCancel).firstElementChild as HTMLElement);
      } else {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "page-tree-toggle";
        button.setAttribute("aria-expanded", expandedPageFolders[folder.key] ? "true" : "false");
        makeDragSource(button, { kind: "folder", path: folder.key });
        button.addEventListener("click", function () {
          onToggleFolder(folder.key);
        });
        button.addEventListener("contextmenu", function (event) {
          event.preventDefault();
          event.stopPropagation();
          onOpenContextMenu({ kind: "folder", path: folder.key, name: folder.name }, event.clientX, event.clientY);
        });

        const chevron = document.createElement("span");
        chevron.className = "page-tree-chevron";
        chevron.textContent = expandedPageFolders[folder.key] ? "▾" : "▸";
        const icon = document.createElement("span");
        icon.className = "page-tree-icon";
        icon.textContent = expandedPageFolders[folder.key] ? "📂" : "📁";
        const label = document.createElement("span");
        label.className = "page-tree-label";
        label.textContent = folder.name;
        button.appendChild(chevron);
        button.appendChild(icon);
        button.appendChild(label);
        row.appendChild(button);
      }

      item.appendChild(row);

      if (expandedPageFolders[folder.key]) {
        item.appendChild(renderPageTreeNode(
          folder,
          folder.key,
          depth + 1,
          expandedPageFolders,
          selectedPage,
          onToggleFolder,
          onSelectPage,
          onOpenDocument,
          onCreatePage,
          onCreateSubfolder,
          onRenameFolder,
          onDeleteFolder,
          onRenamePage,
          onDeletePage,
          onOpenContextMenu,
          onMovePage,
          onMoveFolder,
          onMoveDocument,
          inlineEdit,
          onInlineEditValueChange,
          onInlineEditCommit,
          onInlineEditCancel,
        ));
      }

      group.appendChild(item);
    });

  if (inlineEditMatchesCreate(inlineEdit, "page", currentFolderKey)) {
    group.appendChild(renderPageTreeInlineItem("page", inlineEdit?.value || "", onInlineEditValueChange, onInlineEditCommit, onInlineEditCancel));
  }

  node.pages
    .slice()
    .sort(function (left, right) {
      return String(left.path).localeCompare(String(right.path));
    })
    .forEach(function (page) {
      const leafName = String(page.path || "").split("/").slice(-1)[0] || page.path;
      const item = document.createElement("div");
      item.className = "page-tree-node page-tree-leaf";

      const row = document.createElement("div");
      row.className = "page-tree-row";

      if (inlineEditMatchesRename(inlineEdit, "page", page.path)) {
        row.appendChild(renderPageTreeInlineItem("page", inlineEdit?.value || "", onInlineEditValueChange, onInlineEditCommit, onInlineEditCancel).firstElementChild as HTMLElement);
      } else {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "page-tree-page";
        makeDragSource(button, { kind: "page", path: page.path });
        if (selectedPage === page.path) {
          button.classList.add("active");
        }
        button.addEventListener("click", function () {
          onSelectPage(page.path);
        });
        button.addEventListener("contextmenu", function (event) {
          event.preventDefault();
          event.stopPropagation();
          onOpenContextMenu({ kind: "page", path: page.path, name: leafName }, event.clientX, event.clientY);
        });

        const icon = document.createElement("span");
        icon.className = "page-tree-icon";
        icon.textContent = "•";
        const label = document.createElement("span");
        label.className = "page-tree-label";
        label.textContent = leafName;
        button.appendChild(icon);
        button.appendChild(label);
        row.appendChild(button);
      }

      item.appendChild(row);

      group.appendChild(item);
    });

  node.documents
    .slice()
    .sort(function (left, right) {
      return String(left.path).localeCompare(String(right.path));
    })
    .forEach(function (doc) {
      const leafName = String(doc.name || "").trim() || (String(doc.path || "").split("/").slice(-1)[0] || doc.path);
      const item = document.createElement("div");
      item.className = "page-tree-node page-tree-leaf page-tree-document-leaf";

      const row = document.createElement("div");
      row.className = "page-tree-row";

      if (inlineEditMatchesRename(inlineEdit, "document", doc.path)) {
        row.appendChild(renderPageTreeInlineItem("document", inlineEdit?.value || "", onInlineEditValueChange, onInlineEditCommit, onInlineEditCancel).firstElementChild as HTMLElement);
      } else {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "page-tree-page page-tree-document";
        makeDragSource(button, { kind: "document", path: doc.path });
        button.addEventListener("click", function () {
          onOpenDocument(doc);
        });
        button.addEventListener("contextmenu", function (event) {
          event.preventDefault();
          event.stopPropagation();
          onOpenContextMenu({ kind: "document", path: doc.path, name: leafName, document: doc }, event.clientX, event.clientY);
        });

        const icon = document.createElement("span");
        icon.className = "page-tree-icon";
        icon.textContent = "↗";
        const label = document.createElement("span");
        label.className = "page-tree-label";
        label.textContent = leafName;
        button.appendChild(icon);
        button.appendChild(label);
        row.appendChild(button);
      }

      item.appendChild(row);
      group.appendChild(item);
    });

  return group;
}

export function renderPagesTree(
  container: HTMLDivElement,
  pages: PageSummary[],
  folders: string[],
  documents: DocumentRecord[],
  selectedPage: string,
  expandedPageFolders: Record<string, boolean>,
  pageSearchQuery: string,
  scopePrefix: string,
  rootFolderPath: string,
  rootLabelText: string,
  onToggleFolder: (folderKey: string) => void,
  onSelectPage: (pagePath: string) => void,
  onOpenDocument: (document: DocumentRecord) => void,
  onCreatePage: (folderKey: string) => void,
  onCreateSubfolder: (folderKey: string) => void,
  onRenameFolder: (folderKey: string) => void,
  onDeleteFolder: (folderKey: string) => void,
  onRenamePage: (pagePath: string) => void,
  onDeletePage: (pagePath: string) => void,
  onOpenContextMenu: (target: PageTreeMenuTarget, left: number, top: number) => void,
  onMovePage: (pagePath: string, folderKey: string) => void,
  onMoveFolder: (folderKey: string, targetFolder: string) => void,
  onMoveDocument: (documentPath: string, folderKey: string) => void,
  inlineEdit: PageTreeInlineEditState | null,
  onInlineEditValueChange: (value: string) => void,
  onInlineEditCommit: () => void,
  onInlineEditCancel: () => void,
  onInlineEditMount: (input: HTMLInputElement) => void,
): void {
  clearNode(container);
  const normalizedScopePrefix = normalizeScopePrefix(scopePrefix);
  const normalizedRootFolderPath = String(rootFolderPath || "").trim().replace(/^\/+|\/+$/g, "");
  const searchNeedle = String(pageSearchQuery || "").trim().toLowerCase();
  const visiblePages = pages.filter(function (page) {
    if (!searchNeedle) {
      return true;
    }
    const haystack = [page.title, page.path, ...(Array.isArray(page.tags) ? page.tags : [])].join(" ").toLowerCase();
    return haystack.includes(searchNeedle);
  });
  const visibleFolders = searchNeedle ? [] : folders;
  const visibleDocuments = documents.filter(function (document) {
    if (!searchNeedle) {
      return true;
    }
    const haystack = [document.name, document.path, document.contentType].join(" ").toLowerCase();
    return haystack.includes(searchNeedle);
  });

  if (searchNeedle) {
    const expanded: Record<string, boolean> = {};
    visiblePages.forEach(function (page) {
      const displayPath = displayPathWithinScope(String(page.path || ""), normalizedScopePrefix);
      const parts = displayPath ? displayPath.split("/") : [];
      const canonicalParts = String(page.path || "").split("/").filter(Boolean);
      const offset = normalizedScopePrefix && String(page.path || "").startsWith(normalizedScopePrefix + "/")
        ? normalizedScopePrefix.split("/").length
        : 0;
      for (let index = 0; index < parts.length - 1; index += 1) {
        const key = canonicalParts.slice(0, offset + index + 1).join("/");
        expanded[key] = true;
      }
    });
    visibleDocuments.forEach(function (document) {
      const displayPath = displayPathWithinScope(String(document.path || ""), normalizedScopePrefix);
      const parts = displayPath ? displayPath.split("/") : [];
      const canonicalParts = String(document.path || "").split("/").filter(Boolean);
      const offset = normalizedScopePrefix && String(document.path || "").startsWith(normalizedScopePrefix + "/")
        ? normalizedScopePrefix.split("/").length
        : 0;
      for (let index = 0; index < parts.length - 1; index += 1) {
        const key = canonicalParts.slice(0, offset + index + 1).join("/");
        expanded[key] = true;
      }
    });
    Object.keys(expanded).forEach(function (key) {
      expandedPageFolders[key] = true;
    });
  }

  const rootRow = document.createElement("div");
  rootRow.className = "page-tree-root-drop";

  const rootLabel = document.createElement("div");
  rootLabel.className = "page-tree-root-label";
  rootLabel.textContent = rootLabelText;
  rootRow.appendChild(rootLabel);

  const rootActions = document.createElement("div");
  rootActions.className = "page-tree-actions page-tree-actions-visible";

  const createRootNote = document.createElement("button");
  createRootNote.type = "button";
  createRootNote.className = "page-tree-action";
  createRootNote.title = "New root note";
  createRootNote.setAttribute("aria-label", "New root note");
  createRootNote.textContent = "+";
  createRootNote.addEventListener("click", function (event) {
    event.preventDefault();
    event.stopPropagation();
    onCreatePage(normalizedRootFolderPath);
  });
  rootActions.appendChild(createRootNote);

  const createRootFolder = document.createElement("button");
  createRootFolder.type = "button";
  createRootFolder.className = "page-tree-action";
  createRootFolder.title = "New folder";
  createRootFolder.setAttribute("aria-label", "New folder");
  const createRootFolderIcon = makeTreeActionIcon(folderPlusIconPath);
  createRootFolderIcon.querySelector("path")?.setAttribute("fill-rule", "evenodd");
  createRootFolder.appendChild(createRootFolderIcon);
  createRootFolder.addEventListener("click", function (event) {
    event.preventDefault();
    event.stopPropagation();
    onCreateSubfolder(normalizedRootFolderPath);
  });
  rootActions.appendChild(createRootFolder);

  rootRow.appendChild(rootActions);
  function isPointerOverRoot(event: DragEvent): boolean {
    const hovered = document.elementFromPoint(event.clientX, event.clientY);
    return !!hovered && hovered.closest(".page-tree-root-drop") === rootRow;
  }
  function syncRootTarget(event: DragEvent, payload: TreeDragItem | null): boolean {
    const canDrop = canDropOnRoot(payload) && isPointerOverRoot(event);
    rootRow.classList.toggle("drag-target", canDrop);
    return canDrop;
  }
  function handleRootDragOver(event: DragEvent): void {
    const payload = getDragPayload(event);
    const isRootTarget = syncRootTarget(event, payload);
    if (!canDropOnRoot(payload)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "move";
    }
  }
  function handleRootDragEnter(event: DragEvent): void {
    const payload = getDragPayload(event);
    const isRootTarget = syncRootTarget(event, payload);
    if (!canDropOnRoot(payload)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "move";
    }
  }
  function handleRootDragLeave(): void {
    rootRow.classList.remove("drag-target");
  }
  function handleRootDrop(event: DragEvent): void {
    const payload = getDragPayload(event);
    const isRootTarget = syncRootTarget(event, payload);
    rootRow.classList.remove("drag-target");
    if (!payload || !canDropOnRoot(payload) || !isRootTarget) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (payload.kind === "page") {
      onMovePage(payload.path, normalizedRootFolderPath);
      return;
    }
    if (payload.kind === "document") {
      onMoveDocument(payload.path, normalizedRootFolderPath);
      return;
    }
    onMoveFolder(payload.path, normalizedRootFolderPath);
  }
  [rootRow, rootLabel, rootActions].forEach(function (element) {
    element.addEventListener("dragover", handleRootDragOver);
    element.addEventListener("dragenter", handleRootDragEnter);
    element.addEventListener("dragleave", handleRootDragLeave);
    element.addEventListener("drop", handleRootDrop);
  });
  container.appendChild(rootRow);

  if (!visiblePages.length && !visibleFolders.length && !visibleDocuments.length && !inlineEdit) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = pageSearchQuery
      ? "No indexed notes or files match the current search."
      : "No notes or files yet. Use + to create the first note.";
    container.appendChild(empty);
    return;
  }

  container.ondragover = function (event) {
    const payload = getDragPayload(event);
    if (!canDropOnRoot(payload)) {
      rootRow.classList.remove("drag-target");
      return;
    }
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "move";
    }
    container.classList.add("drag-target");
    syncRootTarget(event, payload);
  };
  container.ondragleave = function () {
    container.classList.remove("drag-target");
    rootRow.classList.remove("drag-target");
  };
  container.ondrop = function (event) {
    const payload = getDragPayload(event);
    container.classList.remove("drag-target");
    const isRootTarget = syncRootTarget(event, payload);
    rootRow.classList.remove("drag-target");
    if (!payload || !canDropOnRoot(payload)) {
      return;
    }
    event.preventDefault();
    if (!isRootTarget) {
      return;
    }
    if (payload.kind === "page") {
      onMovePage(payload.path, normalizedRootFolderPath);
      return;
    }
    if (payload.kind === "document") {
      onMoveDocument(payload.path, normalizedRootFolderPath);
      return;
    }
    onMoveFolder(payload.path, normalizedRootFolderPath);
  };

  container.appendChild(renderPageTreeNode(
    buildPageTree(visiblePages, visibleFolders, visibleDocuments, normalizedScopePrefix),
    normalizedRootFolderPath,
    0,
    expandedPageFolders,
    selectedPage,
    onToggleFolder,
    onSelectPage,
    onOpenDocument,
    onCreatePage,
    onCreateSubfolder,
    onRenameFolder,
    onDeleteFolder,
    onRenamePage,
    onDeletePage,
    onOpenContextMenu,
    onMovePage,
    onMoveFolder,
    onMoveDocument,
    inlineEdit,
    onInlineEditValueChange,
    onInlineEditCommit,
    onInlineEditCancel,
  ));

  const inlineInput = container.querySelector<HTMLInputElement>('[data-page-tree-inline-input="true"]');
  if (inlineInput) {
    onInlineEditMount(inlineInput);
  }
}

export interface TaskPanelFilters {
  currentPage: boolean;
  notDone: boolean;
  hasDue: boolean;
  hasReminder: boolean;
}

export interface TagPanelEntry {
  tag: string;
  count: number;
}

export function filterTasks(tasks: TaskRecord[], filters: TaskPanelFilters, currentPagePath?: string | null): TaskRecord[] {
  if (!tasks || !tasks.length) {
    return [];
  }
  return tasks.filter(function (task) {
    if (filters.currentPage && (!currentPagePath || task.page !== currentPagePath)) {
      return false;
    }
    if (filters.notDone && task.done) {
      return false;
    }
    if (filters.hasDue && !task.due) {
      return false;
    }
    if (filters.hasReminder && !task.remind) {
      return false;
    }
    return true;
  });
}

export function renderPageTasks(
  container: HTMLDivElement,
  tasks: TaskRecord[],
  onSelectTask: (task: TaskRecord) => void,
  onToggleTask: (task: TaskRecord) => void,
  filters: TaskPanelFilters,
  currentPagePath?: string | null
): void {
  clearNode(container);

  const filtered = filterTasks(tasks, filters, currentPagePath);
  if (!filtered.length) {
    const activeFilters = [
      filters.currentPage,
      filters.notDone,
      filters.hasDue,
      filters.hasReminder,
    ].filter(Boolean).length;
    if (!tasks.length) {
      renderEmpty(container, "No indexed tasks in this vault.");
      return;
    }
    if (filters.currentPage && !currentPagePath) {
      renderEmpty(container, "Select a page to filter tasks to the current page.");
      return;
    }
    renderEmpty(container, activeFilters ? "No matching tasks." : "No indexed tasks in this vault.");
    return;
  }

  filtered.forEach(function (task) {
    const item = document.createElement("div");
    item.className = "page-task-item";
    if (task.done) {
      item.classList.add("page-task-done");
    }

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "page-task-checkbox";
    checkbox.checked = task.done;
    checkbox.title = task.done ? "Mark as not done" : "Mark as done";
    checkbox.addEventListener("click", function (event) {
      event.stopPropagation();
      onToggleTask(task);
    });
    item.appendChild(checkbox);

    const button = document.createElement("button");
    button.type = "button";
    button.addEventListener("click", function () {
      onSelectTask(task);
    });

    const title = document.createElement("span");
    title.className = "page-task-title";
    title.innerHTML = renderInline(task.text || task.ref, {currentPagePath: task.page || currentPagePath || ""});
    button.appendChild(title);

    const meta = document.createElement("div");
    meta.className = "page-task-meta";
    [
      task.due ? "due " + formatDateValue(task.due) : "no due",
      task.remind ? "remind " + formatReminderLabel(task.remind) : "",
      task.who && task.who.length ? task.who.join(", ") : "",
    ]
      .filter(Boolean)
      .forEach(function (part) {
        const token = document.createElement("span");
        token.className = "token";
        if (part.indexOf("no due") === 0) {
          token.classList.add("warn");
        }
        token.textContent = part;
        meta.appendChild(token);
      });

    button.appendChild(meta);
    item.appendChild(button);
    container.appendChild(item);
  });
}

export function renderPageContext(container: HTMLDivElement, currentPage: PageRecord | null, currentDerived: DerivedPage | null): void {
  clearNode(container);

  if (!currentPage || !currentDerived) {
    renderEmpty(container, "Select a page to see backlinks, links, and query blocks.");
    return;
  }

  const cards = [
    {
      title: "Backlinks",
      body:
        (currentDerived.backlinks && currentDerived.backlinks.length
          ? currentDerived.backlinks.slice(0, 4).map(function (item: BacklinkRecord) {
              return item.sourcePage || "unknown";
            }).join(", ")
          : "No backlinks yet."),
    },
    {
      title: "Outgoing Links",
      body:
        (currentPage.links && currentPage.links.length
          ? currentPage.links.slice(0, 4).map(function (item) {
              return item.targetPage || "unknown";
            }).join(", ")
          : "No outgoing links."),
    },
    {
      title: "Embedded Queries",
      body:
        (currentDerived.queryBlocks && currentDerived.queryBlocks.length
          ? String(currentDerived.queryBlocks.length) + " cached block(s)"
          : "No query blocks."),
    },
  ];

  cards.forEach(function (card) {
    const item = document.createElement("div");
    item.className = "context-item";
    const strong = document.createElement("strong");
    strong.textContent = card.title;
    const small = document.createElement("small");
    small.textContent = card.body;
    item.appendChild(strong);
    item.appendChild(small);
    container.appendChild(item);
  });
}

function pageTagStrings(page: PageSummary): string[] {
  const seen = new Set<string>();
  return (Array.isArray(page.tags) ? page.tags : [])
    .map(function (tag) {
      return String(tag || "").trim();
    })
    .filter(function (tag) {
      const key = tag.toLowerCase();
      if (!key || seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
}

export function filterPagesByTag(pages: PageSummary[], activeTag: string): PageSummary[] {
  const normalizedTag = String(activeTag || "").trim().toLowerCase();
  if (!normalizedTag) {
    return Array.isArray(pages) ? pages.slice() : [];
  }
  return (Array.isArray(pages) ? pages : []).filter(function (page) {
    return pageTagStrings(page).some(function (tag) {
      return tag.toLowerCase() === normalizedTag;
    });
  });
}

export function summarizeTagsForPages(pages: PageSummary[]): TagPanelEntry[] {
  const counts = new Map<string, TagPanelEntry>();

  (Array.isArray(pages) ? pages : []).forEach(function (page) {
    pageTagStrings(page).forEach(function (tag) {
      const key = tag.toLowerCase();
      const existing = counts.get(key);
      if (existing) {
        existing.count += 1;
        return;
      }
      counts.set(key, {
        tag,
        count: 1,
      });
    });
  });

  return Array.from(counts.values()).sort(function (left, right) {
    if (right.count !== left.count) {
      return right.count - left.count;
    }
    return left.tag.localeCompare(right.tag);
  });
}

export function renderPageTags(
  container: HTMLDivElement,
  pages: PageSummary[],
  activeTag: string,
  onToggleTag: (tag: string) => void
): void {
  clearNode(container);

  const entries = summarizeTagsForPages(pages);
  if (!entries.length) {
    renderEmpty(container, "No indexed tags in this scope.");
    return;
  }

  const normalizedActiveTag = String(activeTag || "").trim().toLowerCase();
  entries.forEach(function (entry) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "tag-chip";
    if (normalizedActiveTag && entry.tag.toLowerCase() === normalizedActiveTag) {
      chip.classList.add("active");
      chip.setAttribute("aria-pressed", "true");
      chip.title = 'Clear tag filter "' + entry.tag + '"';
    } else {
      chip.setAttribute("aria-pressed", "false");
      chip.title = 'Filter pages by tag "' + entry.tag + '"';
    }
    chip.addEventListener("click", function () {
      onToggleTag(entry.tag);
    });

    const label = document.createElement("span");
    label.textContent = "#" + entry.tag;
    chip.appendChild(label);

    const count = document.createElement("span");
    count.className = "tag-chip-count";
    count.textContent = String(entry.count);
    chip.appendChild(count);

    container.appendChild(chip);
  });
}
