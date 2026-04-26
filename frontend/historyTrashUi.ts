import { formatDateTimeValue } from "./datetime";
import { clearNode, focusWithoutScroll, renderEmpty } from "./dom";
import { pageTitleFromPath } from "./commands";
import type { PageRevisionRecord, TrashPageRecord } from "./types";

export interface HistoryTrashState {
  pageHistory: PageRevisionRecord[];
  selectedHistoryRevisionId: string;
  historyShowChanges: boolean;
  trashPages: TrashPageRecord[];
}

export interface HistoryTrashElements {
  searchModalShell: HTMLElement;
  commandModalShell: HTMLElement;
  quickSwitcherModalShell: HTMLElement;
  documentsModalShell: HTMLElement;
  helpModalShell: HTMLElement;
  settingsModalShell: HTMLElement;
  trashModalShell: HTMLElement;
  pageHistoryModalShell: HTMLElement;
  pageHistoryShowChanges: HTMLInputElement;
  closePageHistoryModal: HTMLButtonElement;
  pageHistoryResults: HTMLDivElement;
  pageHistoryPreview: HTMLElement;
  copyPageHistory: HTMLButtonElement;
  restorePageHistory: HTMLButtonElement;
  pageHistoryTitle: HTMLElement;
  closeTrashModal: HTMLButtonElement;
  trashResults: HTMLDivElement;
}

function firstContentLine(rawMarkdown: string): string {
  const line = String(rawMarkdown || "")
    .split(/\r?\n/)
    .map(function (part) {
      return part.trim();
    })
    .find(Boolean);
  return line || "Empty note";
}

function historyChangePreview(rawMarkdown: string, previousMarkdown: string): string {
  const currentLines = String(rawMarkdown || "").split(/\r?\n/);
  const previousLines = String(previousMarkdown || "").split(/\r?\n/);
  const changes: string[] = [];
  const limit = Math.max(currentLines.length, previousLines.length);

  for (let index = 0; index < limit; index += 1) {
    const currentLine = String(currentLines[index] || "").trim();
    const previousLine = String(previousLines[index] || "").trim();
    if (currentLine === previousLine) {
      continue;
    }
    if (previousLine) {
      changes.push("– " + previousLine);
    }
    if (currentLine) {
      changes.push("+ " + currentLine);
    }
    if (changes.length >= 2) {
      break;
    }
  }

  if (!changes.length) {
    return firstContentLine(rawMarkdown);
  }
  return changes.slice(0, 2).join(" · ");
}

export function historyDiffContent(rawMarkdown: string, previousMarkdown: string): string {
  const currentLines = String(rawMarkdown || "").split(/\r?\n/);
  const previousLines = String(previousMarkdown || "").split(/\r?\n/);
  const result: string[] = [];
  const limit = Math.max(currentLines.length, previousLines.length);

  for (let index = 0; index < limit; index += 1) {
    const currentLine = currentLines[index];
    const previousLine = previousLines[index];
    if (currentLine === previousLine) {
      continue;
    }
    if (typeof previousLine === "string") {
      result.push("- " + previousLine);
    }
    if (typeof currentLine === "string") {
      result.push("+ " + currentLine);
    }
  }

  return result.join("\n").trim() || "No changes.";
}

export function selectedPageHistoryRevision(state: HistoryTrashState): PageRevisionRecord | null {
  if (!state.pageHistory.length) {
    return null;
  }
  return state.pageHistory.find(function (revision) {
    return revision.id === state.selectedHistoryRevisionId;
  }) || state.pageHistory[0] || null;
}

export function renderPageHistoryPreview(state: HistoryTrashState, els: HistoryTrashElements): void {
  const revision = selectedPageHistoryRevision(state);
  if (!revision) {
    els.pageHistoryPreview.textContent = "Select a revision to preview it.";
    els.copyPageHistory.disabled = true;
    els.restorePageHistory.disabled = true;
    return;
  }
  const index = state.pageHistory.findIndex(function (entry) {
    return entry.id === revision.id;
  });
  const previousMarkdown = index >= 0 && index + 1 < state.pageHistory.length
    ? state.pageHistory[index + 1].rawMarkdown
    : "";
  els.pageHistoryPreview.textContent = state.historyShowChanges
    ? historyDiffContent(revision.rawMarkdown, previousMarkdown)
    : String(revision.rawMarkdown || "");
  els.copyPageHistory.disabled = false;
  els.restorePageHistory.disabled = false;
}

export function setPageHistoryOpen(
  state: HistoryTrashState,
  els: HistoryTrashElements,
  open: boolean,
  onBeforeOpen: () => void,
): void {
  if (open) {
    onBeforeOpen();
    els.searchModalShell.classList.add("hidden");
    els.commandModalShell.classList.add("hidden");
    els.quickSwitcherModalShell.classList.add("hidden");
    els.documentsModalShell.classList.add("hidden");
    els.helpModalShell.classList.add("hidden");
    els.settingsModalShell.classList.add("hidden");
    els.trashModalShell.classList.add("hidden");
    els.pageHistoryModalShell.classList.remove("hidden");
    els.pageHistoryShowChanges.checked = state.historyShowChanges;
    window.requestAnimationFrame(function () {
      focusWithoutScroll(els.closePageHistoryModal);
    });
    return;
  }
  els.pageHistoryModalShell.classList.add("hidden");
}

export function renderPageHistory(
  state: HistoryTrashState,
  els: HistoryTrashElements,
  onSelectRevision: () => void,
): void {
  clearNode(els.pageHistoryResults);
  if (!state.pageHistory.length) {
    state.selectedHistoryRevisionId = "";
    renderEmpty(els.pageHistoryResults, "No saved revisions for this page yet.");
    renderPageHistoryPreview(state, els);
    return;
  }
  if (!selectedPageHistoryRevision(state)) {
    state.selectedHistoryRevisionId = state.pageHistory[0].id;
  }

  state.pageHistory.forEach(function (revision, index) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "history-item";
    if (revision.id === state.selectedHistoryRevisionId) {
      item.classList.add("active");
    }
    item.addEventListener("click", function () {
      state.selectedHistoryRevisionId = revision.id;
      onSelectRevision();
    });

    const meta = document.createElement("div");
    meta.className = "history-item-meta";
    meta.textContent = formatDateTimeValue(revision.savedAt);

    const snippet = document.createElement("div");
    snippet.className = "history-item-snippet";
    snippet.textContent = historyChangePreview(
      revision.rawMarkdown,
      index + 1 < state.pageHistory.length ? state.pageHistory[index + 1].rawMarkdown : ""
    );
    item.appendChild(meta);
    item.appendChild(snippet);
    els.pageHistoryResults.appendChild(item);
  });
  renderPageHistoryPreview(state, els);
}

export function setTrashOpen(
  els: HistoryTrashElements,
  open: boolean,
  onBeforeOpen: () => void,
): void {
  if (open) {
    onBeforeOpen();
    els.searchModalShell.classList.add("hidden");
    els.commandModalShell.classList.add("hidden");
    els.quickSwitcherModalShell.classList.add("hidden");
    els.documentsModalShell.classList.add("hidden");
    els.helpModalShell.classList.add("hidden");
    els.settingsModalShell.classList.add("hidden");
    els.pageHistoryModalShell.classList.add("hidden");
    els.trashModalShell.classList.remove("hidden");
    window.requestAnimationFrame(function () {
      focusWithoutScroll(els.closeTrashModal);
    });
    return;
  }
  els.trashModalShell.classList.add("hidden");
}

export function renderTrash(
  state: HistoryTrashState,
  els: HistoryTrashElements,
  actions: {
    onRestore: (entry: TrashPageRecord) => void;
    onDelete: (entry: TrashPageRecord) => void;
  },
): void {
  clearNode(els.trashResults);
  if (!state.trashPages.length) {
    renderEmpty(els.trashResults, "Trash is empty.");
    return;
  }
  state.trashPages.forEach(function (entry) {
    const item = document.createElement("div");
    item.className = "history-item";

    const meta = document.createElement("div");
    meta.className = "history-item-meta";
    meta.textContent = pageTitleFromPath(entry.page) + " · deleted " + formatDateTimeValue(entry.deletedAt);

    const snippet = document.createElement("div");
    snippet.className = "history-item-snippet";
    snippet.textContent = firstContentLine(entry.rawMarkdown);

    const actionRow = document.createElement("div");
    actionRow.className = "history-item-actions";

    const restoreButton = document.createElement("button");
    restoreButton.type = "button";
    restoreButton.textContent = "Restore";
    restoreButton.addEventListener("click", function () {
      actions.onRestore(entry);
    });

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "danger-button";
    deleteButton.textContent = "Delete Permanently";
    deleteButton.addEventListener("click", function () {
      actions.onDelete(entry);
    });

    actionRow.appendChild(restoreButton);
    actionRow.appendChild(deleteButton);
    item.appendChild(meta);
    item.appendChild(snippet);
    item.appendChild(actionRow);
    els.trashResults.appendChild(item);
  });
}
