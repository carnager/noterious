import { clearNode, renderEmpty } from "./dom";
import { formatDateTimeValue, formatDateValue } from "./datetime";
import type { BacklinkRecord, DerivedPage, FrontmatterMap, PageRecord, PageSummary, TaskRecord } from "./types";

interface PageTreeFolder {
  key: string;
  name: string;
  folders: Record<string, PageTreeFolder>;
  pages: PageSummary[];
}

interface PageTreeRoot {
  folders: Record<string, PageTreeFolder>;
  pages: PageSummary[];
}

type TreeDragItem =
  | { kind: "page"; path: string }
  | { kind: "folder"; path: string };

let activeDragItem: TreeDragItem | null = null;

function setDragPayload(event: DragEvent, payload: TreeDragItem): void {
  if (!event.dataTransfer) {
    return;
  }
  activeDragItem = payload;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.dropEffect = "move";
  event.dataTransfer.setData("application/x-noterious-tree", JSON.stringify(payload));
  event.dataTransfer.setData("text/plain", payload.path);
}

function getDragPayload(event: DragEvent): TreeDragItem | null {
  if (activeDragItem) {
    return activeDragItem;
  }
  if (!event.dataTransfer) {
    return null;
  }
  const raw = event.dataTransfer.getData("application/x-noterious-tree");
  if (!raw) {
    return null;
  }
  try {
    const payload = JSON.parse(raw) as TreeDragItem;
    if (!payload || !payload.path || (payload.kind !== "page" && payload.kind !== "folder")) {
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
  if (payload.kind === "page") {
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

function buildPageTree(pages: PageSummary[]): PageTreeRoot {
  const root: PageTreeRoot = { folders: {}, pages: [] };

  pages.forEach(function (page) {
    const segments = String(page.path || "").split("/");
    let cursor: PageTreeRoot | PageTreeFolder = root;
    for (let index = 0; index < segments.length - 1; index += 1) {
      const segment = segments[index];
      if (!cursor.folders[segment]) {
        cursor.folders[segment] = { key: segments.slice(0, index + 1).join("/"), name: segment, folders: {}, pages: [] };
      }
      cursor = cursor.folders[segment];
    }
    cursor.pages.push(page);
  });

  return root;
}

function renderPageTreeNode(
  node: PageTreeRoot | PageTreeFolder,
  depth: number,
  expandedPageFolders: Record<string, boolean>,
  selectedPage: string,
  onToggleFolder: (folderKey: string) => void,
  onSelectPage: (pagePath: string) => void,
  onCreatePage: (pagePath: string) => void,
  onCreateSubfolder: (folderKey: string) => void,
  onDeleteFolder: (folderKey: string) => void,
  onDeletePage: (pagePath: string) => void,
  onMovePage: (pagePath: string, folderKey: string) => void,
  onMoveFolder: (folderKey: string, targetFolder: string) => void
): HTMLDivElement {
  const group = document.createElement("div");
  group.className = depth === 0 ? "page-tree-root" : "page-tree-children";

  Object.keys(node.folders)
    .sort()
    .forEach(function (name) {
      const folder = node.folders[name];
      const item = document.createElement("div");
      item.className = "page-tree-node page-tree-folder";
      makeDragSource(item, { kind: "folder", path: folder.key });
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
        onMoveFolder(payload.path, folder.key);
      });

      const row = document.createElement("div");
      row.className = "page-tree-row";

      const button = document.createElement("button");
      button.type = "button";
      button.className = "page-tree-toggle";
      button.setAttribute("aria-expanded", expandedPageFolders[folder.key] ? "true" : "false");
      makeDragSource(button, { kind: "folder", path: folder.key });
      button.addEventListener("click", function () {
        onToggleFolder(folder.key);
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

      const actions = document.createElement("div");
      actions.className = "page-tree-actions";

      const createNote = document.createElement("button");
      createNote.type = "button";
      createNote.className = "page-tree-action";
      createNote.title = "New note";
      createNote.setAttribute("aria-label", "New note in " + folder.name);
      createNote.textContent = "+";
      createNote.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        onCreatePage(folder.key);
      });
      actions.appendChild(createNote);

      const createFolder = document.createElement("button");
      createFolder.type = "button";
      createFolder.className = "page-tree-action";
      createFolder.title = "New subfolder";
      createFolder.setAttribute("aria-label", "New subfolder in " + folder.name);
      createFolder.textContent = "⊞";
      createFolder.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        onCreateSubfolder(folder.key);
      });
      actions.appendChild(createFolder);

      const deleteFolder = document.createElement("button");
      deleteFolder.type = "button";
      deleteFolder.className = "page-tree-action page-tree-action-danger";
      deleteFolder.title = "Delete folder";
      deleteFolder.setAttribute("aria-label", "Delete folder " + folder.name);
      deleteFolder.textContent = "×";
      deleteFolder.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        onDeleteFolder(folder.key);
      });
      actions.appendChild(deleteFolder);

      row.appendChild(actions);
      item.appendChild(row);

      if (expandedPageFolders[folder.key]) {
        item.appendChild(renderPageTreeNode(folder, depth + 1, expandedPageFolders, selectedPage, onToggleFolder, onSelectPage, onCreatePage, onCreateSubfolder, onDeleteFolder, onDeletePage, onMovePage, onMoveFolder));
      }

      group.appendChild(item);
    });

  node.pages
    .slice()
    .sort(function (left, right) {
      return String(left.path).localeCompare(String(right.path));
    })
    .forEach(function (page) {
      const leafName = String(page.path || "").split("/").slice(-1)[0] || page.path;
      const item = document.createElement("div");
      item.className = "page-tree-node page-tree-leaf";
      makeDragSource(item, { kind: "page", path: page.path });

      const row = document.createElement("div");
      row.className = "page-tree-row";

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

      const icon = document.createElement("span");
      icon.className = "page-tree-icon";
      icon.textContent = "•";
      const label = document.createElement("span");
      label.className = "page-tree-label";
      label.textContent = leafName;
      button.appendChild(icon);
      button.appendChild(label);
      row.appendChild(button);

      const actions = document.createElement("div");
      actions.className = "page-tree-actions";

      const deletePage = document.createElement("button");
      deletePage.type = "button";
      deletePage.className = "page-tree-action page-tree-action-danger";
      deletePage.title = "Delete note";
      deletePage.setAttribute("aria-label", "Delete note " + leafName);
      deletePage.textContent = "×";
      deletePage.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        onDeletePage(page.path);
      });
      actions.appendChild(deletePage);
      row.appendChild(actions);
      item.appendChild(row);

      group.appendChild(item);
    });

  return group;
}

export function renderPagesTree(
  container: HTMLDivElement,
  pages: PageSummary[],
  selectedPage: string,
  expandedPageFolders: Record<string, boolean>,
  pageSearchQuery: string,
  onToggleFolder: (folderKey: string) => void,
  onSelectPage: (pagePath: string) => void,
  onCreatePage: (folderKey: string) => void,
  onCreateSubfolder: (folderKey: string) => void,
  onDeleteFolder: (folderKey: string) => void,
  onDeletePage: (pagePath: string) => void,
  onMovePage: (pagePath: string, folderKey: string) => void,
  onMoveFolder: (folderKey: string, targetFolder: string) => void
): void {
  clearNode(container);
  if (!pages.length) {
    renderEmpty(container, "No indexed pages match the current search.");
    return;
  }

  if (pageSearchQuery) {
    const expanded: Record<string, boolean> = {};
    pages.forEach(function (page) {
      const parts = String(page.path || "").split("/");
      let key = "";
      for (let index = 0; index < parts.length - 1; index += 1) {
        key = key ? key + "/" + parts[index] : parts[index];
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
  rootLabel.textContent = "Vault root";
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
    onCreatePage("");
  });
  rootActions.appendChild(createRootNote);

  const createRootFolder = document.createElement("button");
  createRootFolder.type = "button";
  createRootFolder.className = "page-tree-action";
  createRootFolder.title = "New root folder";
  createRootFolder.setAttribute("aria-label", "New root folder");
  createRootFolder.textContent = "⊞";
  createRootFolder.addEventListener("click", function (event) {
    event.preventDefault();
    event.stopPropagation();
    onCreateSubfolder("");
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
      onMovePage(payload.path, "");
      return;
    }
    onMoveFolder(payload.path, "");
  }
  [rootRow, rootLabel, rootActions].forEach(function (element) {
    element.addEventListener("dragover", handleRootDragOver);
    element.addEventListener("dragenter", handleRootDragEnter);
    element.addEventListener("dragleave", handleRootDragLeave);
    element.addEventListener("drop", handleRootDrop);
  });
  container.appendChild(rootRow);

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
      onMovePage(payload.path, "");
      return;
    }
    onMoveFolder(payload.path, "");
  };

  container.appendChild(renderPageTreeNode(buildPageTree(pages), 0, expandedPageFolders, selectedPage, onToggleFolder, onSelectPage, onCreatePage, onCreateSubfolder, onDeleteFolder, onDeletePage, onMovePage, onMoveFolder));
}

export function renderPageTasks(container: HTMLDivElement, tasks: TaskRecord[], onSelectTask: (task: TaskRecord) => void): void {
  clearNode(container);

  if (!tasks || !tasks.length) {
    renderEmpty(container, "No indexed tasks on this page.");
    return;
  }

  tasks.forEach(function (task) {
    const item = document.createElement("div");
    item.className = "page-task-item";

    const button = document.createElement("button");
    button.type = "button";
    button.addEventListener("click", function () {
      onSelectTask(task);
    });

    const title = document.createElement("strong");
    title.textContent = task.text || task.ref;
    button.appendChild(title);

    const meta = document.createElement("div");
    meta.className = "page-task-meta";
    [
      task.done ? "done" : "open",
      task.due ? "due " + formatDateValue(task.due) : "no due",
      task.remind ? "remind " + formatDateTimeValue(task.remind) : "",
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

export function renderPageTags(container: HTMLDivElement, frontmatter: FrontmatterMap | null): void {
  clearNode(container);

  if (!frontmatter) {
    renderEmpty(container, "Select a page to see tags.");
    return;
  }

  const tags = Array.isArray(frontmatter.tags)
    ? frontmatter.tags.map(String)
    : (frontmatter.tags ? [String(frontmatter.tags)] : []);

  if (!tags.length) {
    renderEmpty(container, "No tags on this page.");
    return;
  }

  tags.forEach(function (tag) {
    const chip = document.createElement("span");
    chip.className = "tag-chip";
    chip.textContent = tag;
    container.appendChild(chip);
  });
}
