import { clearNode, renderEmpty } from "./dom";
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
  onSelectPage: (pagePath: string) => void
): HTMLDivElement {
  const group = document.createElement("div");
  group.className = depth === 0 ? "page-tree-root" : "page-tree-children";

  Object.keys(node.folders)
    .sort()
    .forEach(function (name) {
      const folder = node.folders[name];
      const item = document.createElement("div");
      item.className = "page-tree-node page-tree-folder";

      const button = document.createElement("button");
      button.type = "button";
      button.className = "page-tree-toggle";
      button.setAttribute("aria-expanded", expandedPageFolders[folder.key] ? "true" : "false");
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
      item.appendChild(button);

      if (expandedPageFolders[folder.key]) {
        item.appendChild(renderPageTreeNode(folder, depth + 1, expandedPageFolders, selectedPage, onToggleFolder, onSelectPage));
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

      const button = document.createElement("button");
      button.type = "button";
      button.className = "page-tree-page";
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
      item.appendChild(button);
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
  onSelectPage: (pagePath: string) => void
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

  container.appendChild(renderPageTreeNode(buildPageTree(pages), 0, expandedPageFolders, selectedPage, onToggleFolder, onSelectPage));
}

export function renderPageTasks(container: HTMLDivElement, tasks: TaskRecord[], onOpenTask: (task: TaskRecord) => void): void {
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
      onOpenTask(task);
    });

    const title = document.createElement("strong");
    title.textContent = task.text || task.ref;
    button.appendChild(title);

    const meta = document.createElement("div");
    meta.className = "page-task-meta";
    [
      task.done ? "done" : "open",
      task.due ? "due " + task.due : "no due",
      task.remind ? "remind " + task.remind : "",
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
