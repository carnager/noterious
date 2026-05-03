import { normalizePageDraftPath, pageTitleFromPath } from "./commands";
import type { PageSummary } from "./types";

export interface PageOperationsContext {
  pages: PageSummary[];
  selectedPage: string;
  expandedPageFolders: Record<string, boolean>;
}

export interface PageOperationsCallbacks {
  encodePath: (path: string) => string;
  fetchJSON: <T>(input: string, init?: RequestInit) => Promise<T>;
  confirmAction: (options: {
    title: string;
    message: string;
    confirmLabel?: string;
    danger?: boolean;
  }) => Promise<boolean>;
  loadPages: () => Promise<void>;
  navigateToPage: (pagePath: string, replace: boolean) => void;
  clearPageSelection: () => void;
  currentHomePage: () => string;
  clearHomePage: () => void;
  setHomePage: (pagePath: string) => void;
  renderPages: () => void;
  setNoteStatus: (message: string) => void;
}

export interface CreatePageOptions {
  rawMarkdown?: string;
}

function remapPathPrefix(value: string, fromPrefix: string, toPrefix: string): string {
  const source = normalizePageDraftPath(value);
  if (!source) {
    return "";
  }
  if (source === fromPrefix) {
    return toPrefix;
  }
  if (source.startsWith(fromPrefix + "/")) {
    return toPrefix + source.slice(fromPrefix.length);
  }
  return source;
}

function remapExpandedFolderKeys(expandedPageFolders: Record<string, boolean>, fromPrefix: string, toPrefix: string): void {
  const next: Record<string, boolean> = {};
  Object.keys(expandedPageFolders).forEach(function (key) {
    if (!expandedPageFolders[key]) {
      return;
    }
    const remapped = remapPathPrefix(key, fromPrefix, toPrefix);
    next[remapped || key] = true;
  });
  Object.keys(expandedPageFolders).forEach(function (key) {
    delete expandedPageFolders[key];
  });
  Object.assign(expandedPageFolders, next);
}

export async function createPage(
  pagePath: string,
  callbacks: Pick<PageOperationsCallbacks, "encodePath" | "fetchJSON" | "loadPages" | "navigateToPage">,
  options?: CreatePageOptions,
): Promise<void> {
  const normalized = normalizePageDraftPath(pagePath);
  if (!normalized) {
    return;
  }

  const leaf = pageTitleFromPath(normalized);
  const initialMarkdown = typeof options?.rawMarkdown === "string"
    ? options.rawMarkdown
    : (leaf ? "# " + leaf + "\n" : "");

  await callbacks.fetchJSON<unknown>("/api/pages/" + callbacks.encodePath(normalized), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rawMarkdown: initialMarkdown }),
  });

  await callbacks.loadPages();
  callbacks.navigateToPage(normalized, false);
}

export async function deletePage(
  pagePath: string,
  context: PageOperationsContext,
  callbacks: Pick<PageOperationsCallbacks, "encodePath" | "fetchJSON" | "confirmAction" | "loadPages" | "currentHomePage" | "clearHomePage" | "clearPageSelection" | "navigateToPage" | "setNoteStatus">,
): Promise<void> {
  const normalized = normalizePageDraftPath(pagePath);
  if (!normalized) {
    return;
  }
  const deletingSelectedPage = context.selectedPage === normalized;
  const currentIndex = context.pages.findIndex(function (page) {
    return normalizePageDraftPath(page.path) === normalized;
  });
  const fallbackPage = currentIndex >= 0
    ? (context.pages[currentIndex - 1] || context.pages[currentIndex + 1] || null)
    : null;
  const fallbackPath = fallbackPage ? normalizePageDraftPath(fallbackPage.path) : "";

  const confirmed = await callbacks.confirmAction({
    title: "Move Note to Trash",
    message: 'Move "' + normalized + '" to trash?',
    confirmLabel: "Move to Trash",
    danger: true,
  });
  if (!confirmed) {
    return;
  }

  await callbacks.fetchJSON<unknown>("/api/pages/" + callbacks.encodePath(normalized), {
    method: "DELETE",
  });
  callbacks.setNoteStatus("Moved " + normalized + " to trash.");

  if (callbacks.currentHomePage().toLowerCase() === normalized.toLowerCase()) {
    callbacks.clearHomePage();
  }
  await callbacks.loadPages();
  if (deletingSelectedPage) {
    if (fallbackPath && context.pages.some(function (page) { return normalizePageDraftPath(page.path) === fallbackPath; })) {
      callbacks.navigateToPage(fallbackPath, true);
    } else {
      callbacks.clearPageSelection();
    }
  }
}

export async function deleteFolder(
  folderKey: string,
  context: PageOperationsContext,
  callbacks: Pick<PageOperationsCallbacks, "encodePath" | "fetchJSON" | "confirmAction" | "loadPages" | "currentHomePage" | "clearHomePage" | "clearPageSelection">,
): Promise<void> {
  const normalized = normalizePageDraftPath(folderKey);
  if (!normalized) {
    return;
  }
  const pageCount = context.pages.filter(function (page) {
    const path = String(page.path || "");
    return path === normalized || path.startsWith(normalized + "/");
  }).length;
  const confirmed = await callbacks.confirmAction({
    title: "Delete Folder",
    message: 'Delete "' + normalized + '" and everything inside it?\n\n' + String(pageCount) + " note(s) will be removed.",
    confirmLabel: "Delete Folder",
    danger: true,
  });
  if (!confirmed) {
    return;
  }
  await callbacks.fetchJSON<unknown>("/api/folders/" + callbacks.encodePath(normalized), {
    method: "DELETE",
  });
  if (context.selectedPage && (context.selectedPage === normalized || context.selectedPage.startsWith(normalized + "/"))) {
    callbacks.clearPageSelection();
  }
  const currentHomePage = callbacks.currentHomePage().toLowerCase();
  if (currentHomePage === normalized.toLowerCase() || currentHomePage.startsWith(normalized.toLowerCase() + "/")) {
    callbacks.clearHomePage();
  }
  await callbacks.loadPages();
}

export async function movePage(
  pagePath: string,
  targetPage: string,
  callbacks: Pick<PageOperationsCallbacks, "encodePath" | "fetchJSON" | "loadPages" | "currentHomePage" | "setHomePage" | "navigateToPage">,
): Promise<void> {
  const fromPath = normalizePageDraftPath(pagePath);
  const toPath = normalizePageDraftPath(targetPage);
  if (!fromPath || !toPath || fromPath === toPath) {
    return;
  }

  const payload = await callbacks.fetchJSON<{ page: string }>("/api/pages/" + callbacks.encodePath(fromPath) + "/move", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ targetPage: toPath }),
  });

  if (callbacks.currentHomePage().toLowerCase() === fromPath.toLowerCase()) {
    callbacks.setHomePage(toPath);
  }
  await callbacks.loadPages();
  callbacks.navigateToPage(payload.page || toPath, false);
}

export async function renamePage(
  pagePath: string,
  nextLeafName: string,
  callbacks: Pick<PageOperationsCallbacks, "encodePath" | "fetchJSON" | "loadPages" | "currentHomePage" | "setHomePage" | "navigateToPage">,
): Promise<void> {
  const fromPath = normalizePageDraftPath(pagePath);
  const nextLeaf = normalizePageDraftPath(nextLeafName);
  if (!fromPath || !nextLeaf) {
    return;
  }
  let targetPath: string;
  if (nextLeaf.indexOf("/") >= 0) {
    targetPath = nextLeaf;
  } else {
    const slash = fromPath.lastIndexOf("/");
    const parent = slash >= 0 ? fromPath.slice(0, slash) : "";
    targetPath = parent ? (parent + "/" + nextLeaf) : nextLeaf;
  }
  await movePage(fromPath, targetPath, callbacks);
}

export async function movePageToFolder(
  pagePath: string,
  folderKey: string,
  callbacks: Pick<PageOperationsCallbacks, "encodePath" | "fetchJSON" | "loadPages" | "currentHomePage" | "setHomePage" | "navigateToPage">,
): Promise<void> {
  const fromPath = normalizePageDraftPath(pagePath);
  if (!fromPath) {
    return;
  }
  const leaf = pageTitleFromPath(fromPath);
  const targetFolder = normalizePageDraftPath(folderKey);
  const toPath = targetFolder ? (targetFolder + "/" + leaf) : leaf;
  await movePage(fromPath, toPath, callbacks);
}

export async function moveFolder(
  folderKey: string,
  targetFolder: string,
  context: PageOperationsContext,
  callbacks: Pick<PageOperationsCallbacks, "encodePath" | "fetchJSON" | "loadPages" | "currentHomePage" | "setHomePage" | "navigateToPage" | "renderPages">,
): Promise<void> {
  const sourceFolder = normalizePageDraftPath(folderKey);
  const destinationParent = normalizePageDraftPath(targetFolder);
  if (!sourceFolder) {
    return;
  }
  const folderName = pageTitleFromPath(sourceFolder);
  const destinationFolder = destinationParent ? (destinationParent + "/" + folderName) : folderName;
  if (destinationFolder === sourceFolder || destinationParent.startsWith(sourceFolder + "/")) {
    return;
  }

  const payload = await callbacks.fetchJSON<{ folder?: string }>("/api/folders/" + callbacks.encodePath(sourceFolder) + "/move", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ targetFolder: destinationParent, name: "" }),
  });
  const movedFolder = normalizePageDraftPath(payload.folder || destinationFolder);
  const movedSelectedPage = context.selectedPage ? remapPathPrefix(context.selectedPage, sourceFolder, movedFolder) : "";
  const movedHomePage = callbacks.currentHomePage() ? remapPathPrefix(callbacks.currentHomePage(), sourceFolder, movedFolder) : "";

  remapExpandedFolderKeys(context.expandedPageFolders, sourceFolder, movedFolder);
  if (movedHomePage) {
    callbacks.setHomePage(movedHomePage);
  }

  await callbacks.loadPages();
  if (movedSelectedPage && movedSelectedPage !== context.selectedPage) {
    callbacks.navigateToPage(movedSelectedPage, false);
    return;
  }
  callbacks.renderPages();
}

export async function renameFolder(
  folderKey: string,
  nextLeafName: string,
  context: PageOperationsContext,
  callbacks: Pick<PageOperationsCallbacks, "encodePath" | "fetchJSON" | "loadPages" | "currentHomePage" | "setHomePage" | "navigateToPage" | "renderPages">,
): Promise<void> {
  const sourceFolder = normalizePageDraftPath(folderKey);
  const nextLeaf = normalizePageDraftPath(nextLeafName);
  if (!sourceFolder || !nextLeaf) {
    return;
  }
  let parentFolder: string;
  let folderName: string;
  if (nextLeaf.indexOf("/") >= 0) {
    const lastSlash = nextLeaf.lastIndexOf("/");
    parentFolder = nextLeaf.slice(0, lastSlash);
    folderName = nextLeaf.slice(lastSlash + 1);
  } else {
    const slash = sourceFolder.lastIndexOf("/");
    parentFolder = slash >= 0 ? sourceFolder.slice(0, slash) : "";
    folderName = nextLeaf;
  }
  const destinationFolder = parentFolder ? (parentFolder + "/" + folderName) : folderName;
  if (destinationFolder === sourceFolder || destinationFolder.startsWith(sourceFolder + "/")) {
    return;
  }

  const payload = await callbacks.fetchJSON<{ folder?: string }>("/api/folders/" + callbacks.encodePath(sourceFolder) + "/move", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ targetFolder: parentFolder, name: folderName }),
  });
  const movedFolder = normalizePageDraftPath(payload.folder || destinationFolder);
  const movedSelectedPage = context.selectedPage ? remapPathPrefix(context.selectedPage, sourceFolder, movedFolder) : "";
  const movedHomePage = callbacks.currentHomePage() ? remapPathPrefix(callbacks.currentHomePage(), sourceFolder, movedFolder) : "";

  remapExpandedFolderKeys(context.expandedPageFolders, sourceFolder, movedFolder);
  if (movedHomePage) {
    callbacks.setHomePage(movedHomePage);
  }

  await callbacks.loadPages();
  if (movedSelectedPage && movedSelectedPage !== context.selectedPage) {
    callbacks.navigateToPage(movedSelectedPage, false);
    return;
  }
  callbacks.renderPages();
}
