import { normalizePageDraftPath } from "./commands";
import { clearNode } from "./dom";
import { isTemplatePagePath } from "./noteTemplates";
import {
  filterDocumentsByScope,
  filterFoldersByScope,
  filterPagesByScope,
  renderPagesTree,
  type PageTreeMenuTarget,
} from "./pageViews";
import type { DocumentRecord, PageSummary } from "./types";

export interface PageTreeUiState {
  selectedPage: string;
  pages: PageSummary[];
  folders: string[];
  documents: DocumentRecord[];
  expandedPageFolders: Record<string, boolean>;
  scopePrefix?: string;
  pruneFoldersToVisiblePages?: boolean;
  showPages?: boolean;
  showDocuments?: boolean;
  showTemplates?: boolean;
}

export interface PageTreeElements {
  pageList: HTMLDivElement;
  pageSearch: HTMLInputElement;
  treeContextMenu: HTMLDivElement;
}

export interface PageTreeActions {
  navigateToPage: (pagePath: string, replace: boolean) => void;
  requestCreatePage: (folderKey: string) => Promise<void>;
  requestCreateSubfolder: (folderKey: string) => Promise<void>;
  requestRenameFolder: (folderKey: string) => Promise<void>;
  deleteFolder: (folderKey: string) => Promise<void>;
  requestRenamePage: (pagePath: string) => Promise<void>;
  deletePage: (pagePath: string) => Promise<void>;
  movePageToFolder: (pagePath: string, folderKey: string) => Promise<void>;
  moveFolder: (folderKey: string, targetFolder: string) => Promise<void>;
  moveDocumentToFolder: (documentPath: string, folderKey: string) => Promise<void>;
  openPageHistory: (pagePath: string) => void;
  openDocument: (document: DocumentRecord) => void;
  insertDocumentLink: (document: DocumentRecord) => void;
  requestRenameDocument: (document: DocumentRecord) => Promise<void>;
  deleteDocument: (document: DocumentRecord) => Promise<void>;
  currentHomePage: () => string;
  setHomePage: (pagePath: string) => void;
  setNoteStatus: (message: string) => void;
  errorMessage: (error: unknown) => string;
}

export interface PageTreeDisplayState {
  selectedPage: string;
  pages: PageSummary[];
  folders: string[];
  documents: DocumentRecord[];
  expandedPageFolders: Record<string, boolean>;
}

function updatePageListScrollState(pageList: HTMLDivElement): void {
  window.requestAnimationFrame(function () {
    const overflow = pageList.scrollHeight - pageList.clientHeight;
    pageList.classList.toggle("no-scroll", overflow <= 8);
  });
}

function normalizeScopePrefix(scopePrefix: string): string {
  return normalizePageDraftPath(scopePrefix || "");
}

function folderAncestorsForPaths(paths: string[]): Set<string> {
  const keep = new Set<string>();
  (Array.isArray(paths) ? paths : []).forEach(function (path) {
    const normalizedPath = normalizePageDraftPath(path || "");
    if (!normalizedPath) {
      return;
    }
    const parts = normalizedPath.split("/");
    for (let index = 0; index < parts.length - 1; index += 1) {
      keep.add(parts.slice(0, index + 1).join("/"));
    }
  });
  return keep;
}

export function displayPathWithinScope(path: string, scopePrefix: string): string {
  const normalizedPath = normalizePageDraftPath(path || "");
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

export function pageTreeDisplayStateForScope(state: PageTreeUiState): PageTreeDisplayState {
  const scopePrefix = normalizeScopePrefix(state.scopePrefix || "");
  const selectedPage = state.selectedPage;
  const scopedPages = filterPagesByScope(state.pages, scopePrefix).map(function (page) {
    return {
      ...page,
      path: page.path,
    };
  });
  const scopedDocuments = filterDocumentsByScope(state.documents, scopePrefix);
  let pages = scopedPages.filter(function (page) {
    const isTemplate = isTemplatePagePath(page.path || "");
    if (isTemplate) {
      return state.showTemplates !== false;
    }
    return state.showPages !== false;
  });
  let documents = state.showDocuments === false ? [] : scopedDocuments;
  let folders = filterFoldersByScope(state.folders, scopePrefix);
  if (state.pruneFoldersToVisiblePages) {
    const keptFolders = folderAncestorsForPaths(pages.map(function (page) {
      return page.path;
    }));
    folders = folders.filter(function (folder) {
      return keptFolders.has(normalizePageDraftPath(folder || ""));
    });
    documents = documents.filter(function (document) {
      const normalizedPath = normalizePageDraftPath(document.path || "");
      const parts = normalizedPath.split("/").filter(Boolean);
      if (parts.length <= 1) {
        return false;
      }
      return keptFolders.has(parts.slice(0, -1).join("/"));
    });
  }
  const hiddenPages = scopedPages.filter(function (page) {
    const isTemplate = isTemplatePagePath(page.path || "");
    if (isTemplate) {
      return state.showTemplates === false;
    }
    return state.showPages === false;
  });
  const hiddenDocuments = state.showDocuments === false ? scopedDocuments : [];
  const visibleFolderKeys = folderAncestorsForPaths(
    pages.map(function (page) {
      return page.path;
    }).concat(documents.map(function (document) {
      return document.path;
    }))
  );
  const hiddenFolderKeys = folderAncestorsForPaths(
    hiddenPages.map(function (page) {
      return page.path;
    }).concat(hiddenDocuments.map(function (document) {
      return document.path;
    }))
  );
  folders = folders.filter(function (folder) {
    const normalizedFolder = normalizePageDraftPath(folder || "");
    if (!normalizedFolder) {
      return false;
    }
    return !hiddenFolderKeys.has(normalizedFolder) || visibleFolderKeys.has(normalizedFolder);
  });
  const expandedPageFolders: Record<string, boolean> = {};
  Object.keys(state.expandedPageFolders).forEach(function (key) {
    if (!state.expandedPageFolders[key]) {
      return;
    }
    expandedPageFolders[key] = true;
  });
  return {
    selectedPage: selectedPage,
    pages: pages,
    folders: folders,
    documents: documents,
    expandedPageFolders: expandedPageFolders,
  };
}

export function renderPagesSection(state: PageTreeUiState, els: PageTreeElements, actions: PageTreeActions, openTreeContextMenu: (target: PageTreeMenuTarget, left: number, top: number) => void): void {
  const scopePrefix = normalizeScopePrefix(state.scopePrefix || "");
  const displayState = pageTreeDisplayStateForScope(state);
  const rootFolderPath = scopePrefix;
  const rootLabel = scopePrefix ? "Scope root" : "Vault root";

  renderPagesTree(
    els.pageList,
    displayState.pages,
    displayState.folders,
    displayState.documents,
    displayState.selectedPage,
    displayState.expandedPageFolders,
    els.pageSearch.value.trim(),
    scopePrefix,
    rootFolderPath,
    rootLabel,
    function (folderKey) {
      state.expandedPageFolders[folderKey] = !state.expandedPageFolders[folderKey];
      renderPagesSection(state, els, actions, openTreeContextMenu);
    },
    function (pagePath) {
      actions.navigateToPage(pagePath, false);
    },
    function (document) {
      actions.openDocument(document);
    },
    function (folderKey) {
      actions.requestCreatePage(folderKey).catch(function (error) {
        actions.setNoteStatus("Create page failed: " + actions.errorMessage(error));
      });
    },
    function (folderKey) {
      actions.requestCreateSubfolder(folderKey).catch(function (error) {
        actions.setNoteStatus("Create folder failed: " + actions.errorMessage(error));
      });
    },
    function (folderKey) {
      actions.requestRenameFolder(folderKey).catch(function (error) {
        actions.setNoteStatus("Rename folder failed: " + actions.errorMessage(error));
      });
    },
    function (folderKey) {
      actions.deleteFolder(folderKey).catch(function (error) {
        actions.setNoteStatus("Delete folder failed: " + actions.errorMessage(error));
      });
    },
    function (pagePath) {
      actions.requestRenamePage(pagePath).catch(function (error) {
        actions.setNoteStatus("Rename note failed: " + actions.errorMessage(error));
      });
    },
    function (pagePath) {
      actions.deletePage(pagePath).catch(function (error) {
        actions.setNoteStatus("Delete page failed: " + actions.errorMessage(error));
      });
    },
    function (target, left, top) {
      openTreeContextMenu(target, left, top);
    },
    function (pagePath, folderKey) {
      actions.movePageToFolder(
        pagePath,
        folderKey
      ).catch(function (error) {
        actions.setNoteStatus("Move page failed: " + actions.errorMessage(error));
      });
    },
    function (folderKey, targetFolder) {
      actions.moveFolder(
        folderKey,
        targetFolder
      ).catch(function (error) {
        actions.setNoteStatus("Move folder failed: " + actions.errorMessage(error));
      });
    },
    function (documentPath, folderKey) {
      actions.moveDocumentToFolder(
        documentPath,
        folderKey
      ).catch(function (error) {
        actions.setNoteStatus("Move file failed: " + actions.errorMessage(error));
      });
    }
  );
  updatePageListScrollState(els.pageList);
}

export function closeTreeContextMenu(treeContextMenu: HTMLDivElement): void {
  treeContextMenu.classList.add("hidden");
  clearNode(treeContextMenu);
}

function positionTreeContextMenu(treeContextMenu: HTMLDivElement, left: number, top: number): void {
  const width = treeContextMenu.offsetWidth || 220;
  const height = treeContextMenu.offsetHeight || 200;
  const maxLeft = Math.max(12, window.innerWidth - width - 12);
  const maxTop = Math.max(12, window.innerHeight - height - 12);
  treeContextMenu.style.left = Math.max(12, Math.min(left, maxLeft)) + "px";
  treeContextMenu.style.top = Math.max(12, Math.min(top, maxTop)) + "px";
}

function appendTreeContextMenuItem(
  treeContextMenu: HTMLDivElement,
  label: string,
  iconPath: string,
  onSelect: () => void,
  danger?: boolean
): void {
  const button = document.createElement("button");
  button.type = "button";
  button.className = danger ? "tree-context-menu-item danger" : "tree-context-menu-item";
  button.setAttribute("role", "menuitem");

  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("viewBox", "0 0 16 16");
  icon.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", iconPath);
  path.setAttribute("fill", "currentColor");
  icon.appendChild(path);
  button.appendChild(icon);

  const text = document.createElement("span");
  text.textContent = label;
  button.appendChild(text);

  button.addEventListener("click", function () {
    closeTreeContextMenu(treeContextMenu);
    onSelect();
  });
  treeContextMenu.appendChild(button);
}

function appendTreeContextMenuDivider(treeContextMenu: HTMLDivElement): void {
  const divider = document.createElement("div");
  divider.className = "tree-context-menu-divider";
  treeContextMenu.appendChild(divider);
}

export function openTreeContextMenu(
  treeContextMenu: HTMLDivElement,
  target: PageTreeMenuTarget,
  left: number,
  top: number,
  actions: PageTreeActions,
): void {
  clearNode(treeContextMenu);

  if (target.kind === "page") {
    appendTreeContextMenuItem(treeContextMenu, "Open note", "M3 2.5h5.7L13 6.8V13a1 1 0 0 1-1 1H3.9a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1Zm5 .9v3.2h3.2", function () {
      actions.navigateToPage(target.path, false);
    });
    appendTreeContextMenuItem(
      treeContextMenu,
      actions.currentHomePage().toLowerCase() === target.path.toLowerCase() ? "Home Page Already Set" : "Set as Homepage",
      "M8 1.8 14.2 7H13v6.2a1 1 0 0 1-1 1H9V10H7v4.2H4a1 1 0 0 1-1-1V7H1.8L8 1.8Z",
      function () {
        if (actions.currentHomePage().toLowerCase() === target.path.toLowerCase()) {
          actions.setNoteStatus("Home page already set to " + target.path + ".");
          return;
        }
        actions.setHomePage(target.path);
        actions.setNoteStatus("Home page set to " + target.path + ".");
      }
    );
    appendTreeContextMenuItem(treeContextMenu, "Show version history", "M8 2.2a5.8 5.8 0 1 0 4.1 1.7l.9-.9v2.8H10l1.1-1.1A4.4 4.4 0 1 1 8 3.6v1.1l2.3 1.4-.7 1.1L7.4 6V2.2H8Z", function () {
      actions.openPageHistory(target.path);
    });
    appendTreeContextMenuDivider(treeContextMenu);
    appendTreeContextMenuItem(treeContextMenu, "Rename…", "M11.72 1.72a1.5 1.5 0 0 1 2.12 2.12l-7.3 7.3-3.13.75.75-3.13 7.56-7.04zm-6.42 7.54-.38 1.56 1.56-.38 6.3-6.3-.9-.9-6.58 6.02z", function () {
      actions.requestRenamePage(target.path).catch(function (error) {
        actions.setNoteStatus("Rename note failed: " + actions.errorMessage(error));
      });
    });
    appendTreeContextMenuItem(treeContextMenu, "Delete", "M5.2 3h5.6l.4 1.2H14v1.2H2V4.2h2.8L5.2 3Zm-1 3.2h7.6l-.5 6.1a1 1 0 0 1-1 .9H5.7a1 1 0 0 1-1-.9L4.2 6.2Z", function () {
      actions.deletePage(target.path).catch(function (error) {
        actions.setNoteStatus("Delete page failed: " + actions.errorMessage(error));
      });
    }, true);
  } else if (target.kind === "folder") {
    appendTreeContextMenuItem(treeContextMenu, "New note", "M8 2.5v11M2.5 8h11", function () {
      actions.requestCreatePage(target.path).catch(function (error) {
        actions.setNoteStatus("Create page failed: " + actions.errorMessage(error));
      });
    });
    appendTreeContextMenuItem(treeContextMenu, "New folder", "M8 2.5v11M2.5 8h11", function () {
      actions.requestCreateSubfolder(target.path).catch(function (error) {
        actions.setNoteStatus("Create folder failed: " + actions.errorMessage(error));
      });
    });
    appendTreeContextMenuDivider(treeContextMenu);
    appendTreeContextMenuItem(treeContextMenu, "Rename…", "M11.72 1.72a1.5 1.5 0 0 1 2.12 2.12l-7.3 7.3-3.13.75.75-3.13 7.56-7.04zm-6.42 7.54-.38 1.56 1.56-.38 6.3-6.3-.9-.9-6.58 6.02z", function () {
      actions.requestRenameFolder(target.path).catch(function (error) {
        actions.setNoteStatus("Rename folder failed: " + actions.errorMessage(error));
      });
    });
    appendTreeContextMenuItem(treeContextMenu, "Delete", "M5.2 3h5.6l.4 1.2H14v1.2H2V4.2h2.8L5.2 3Zm-1 3.2h7.6l-.5 6.1a1 1 0 0 1-1 .9H5.7a1 1 0 0 1-1-.9L4.2 6.2Z", function () {
      actions.deleteFolder(target.path).catch(function (error) {
        actions.setNoteStatus("Delete folder failed: " + actions.errorMessage(error));
      });
    }, true);
  } else {
    appendTreeContextMenuItem(treeContextMenu, "Open file", "M3 2.5h5.7L13 6.8V13a1 1 0 0 1-1 1H3.9a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1Zm5 .9v3.2h3.2M4.8 9.3h6.4M4.8 11.4h6.4", function () {
      actions.openDocument(target.document);
    });
    appendTreeContextMenuItem(treeContextMenu, "Insert link into current note", "M3.8 8a2.7 2.7 0 0 1 2.7-2.7H9v1.3H6.5A1.4 1.4 0 1 0 6.5 9.4H9v1.3H6.5A2.7 2.7 0 0 1 3.8 8Zm3.6.7h1.2V7.3H7.4v1.4Zm2.7-3.4h2.4a2.7 2.7 0 1 1 0 5.4h-2.4V9.4h2.4a1.4 1.4 0 0 0 0-2.8h-2.4V5.3Z", function () {
      actions.insertDocumentLink(target.document);
    });
    appendTreeContextMenuDivider(treeContextMenu);
    appendTreeContextMenuItem(treeContextMenu, "Rename…", "M11.72 1.72a1.5 1.5 0 0 1 2.12 2.12l-7.3 7.3-3.13.75.75-3.13 7.56-7.04zm-6.42 7.54-.38 1.56 1.56-.38 6.3-6.3-.9-.9-6.58 6.02z", function () {
      actions.requestRenameDocument(target.document).catch(function (error) {
        actions.setNoteStatus("Rename file failed: " + actions.errorMessage(error));
      });
    });
    appendTreeContextMenuItem(treeContextMenu, "Delete", "M5.2 3h5.6l.4 1.2H14v1.2H2V4.2h2.8L5.2 3Zm-1 3.2h7.6l-.5 6.1a1 1 0 0 1-1 .9H5.7a1 1 0 0 1-1-.9L4.2 6.2Z", function () {
      actions.deleteDocument(target.document).catch(function (error) {
        actions.setNoteStatus("Delete file failed: " + actions.errorMessage(error));
      });
    }, true);
  }

  treeContextMenu.classList.remove("hidden");
  window.requestAnimationFrame(function () {
    positionTreeContextMenu(treeContextMenu, left, top);
  });
}
