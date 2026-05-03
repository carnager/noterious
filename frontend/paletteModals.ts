import { renderCommandPaletteResults as renderCommandPaletteResultsUI } from "./commands";
import { markdownLinkForDocument, renderDocumentsResults as renderDocumentsResultsUI } from "./documents";
import { renderEmpty } from "./dom";
import {
  moveSelection as movePaletteSelection,
  resultButtons as paletteResultButtons,
  setPaletteOpen,
  triggerSelection as triggerPaletteSelection,
  updateSelection as updatePaletteSelection,
} from "./palette";
import { renderQuickSwitcherResults as renderQuickSwitcherResultsUI } from "./quickSwitcher";
import { renderGlobalSearchResults as renderGlobalSearchResultsUI } from "./search";
import type { DocumentRecord, NoteTemplate, PageSummary, SearchPayload } from "./types";

export interface PaletteModalElements {
  searchModalShell: HTMLElement;
  globalSearchInput: HTMLInputElement;
  globalSearchResults: HTMLDivElement;
  commandModalShell: HTMLElement;
  commandPaletteInput: HTMLInputElement;
  commandPaletteResults: HTMLDivElement;
  quickSwitcherModalShell: HTMLElement;
  quickSwitcherInput: HTMLInputElement;
  quickSwitcherResults: HTMLDivElement;
  documentsModalShell: HTMLElement;
  documentsInput: HTMLInputElement;
  documentsResults: HTMLDivElement;
  helpModalShell: HTMLElement;
  pageHistoryModalShell: HTMLElement;
  trashModalShell: HTMLElement;
}

function hideOtherPalettes(els: PaletteModalElements, active: "search" | "command" | "quick" | "documents"): void {
  if (active !== "search") {
    els.searchModalShell.classList.add("hidden");
  }
  if (active !== "command") {
    els.commandModalShell.classList.add("hidden");
  }
  if (active !== "quick") {
    els.quickSwitcherModalShell.classList.add("hidden");
  }
  if (active !== "documents") {
    els.documentsModalShell.classList.add("hidden");
  }
  els.helpModalShell.classList.add("hidden");
  els.pageHistoryModalShell.classList.add("hidden");
  els.trashModalShell.classList.add("hidden");
}

function focusWhenOpen(shell: HTMLElement, input: HTMLInputElement): void {
  if (shell.classList.contains("hidden")) {
    return;
  }
  window.requestAnimationFrame(function () {
    if (document.activeElement !== input) {
      input.focus({ preventScroll: true });
    }
  });
}

export function setSearchOpen(els: PaletteModalElements, open: boolean, onBeforeOpen: () => void): void {
  if (open) {
    onBeforeOpen();
    hideOtherPalettes(els, "search");
  }
  setPaletteOpen(els.searchModalShell, els.globalSearchInput, open);
}

export function setCommandPaletteOpen(els: PaletteModalElements, open: boolean, onBeforeOpen: () => void): void {
  if (open) {
    onBeforeOpen();
    hideOtherPalettes(els, "command");
  }
  setPaletteOpen(els.commandModalShell, els.commandPaletteInput, open);
}

export function setQuickSwitcherOpen(els: PaletteModalElements, open: boolean, onBeforeOpen: () => void): void {
  if (open) {
    onBeforeOpen();
    hideOtherPalettes(els, "quick");
  }
  setPaletteOpen(els.quickSwitcherModalShell, els.quickSwitcherInput, open);
}

export function setDocumentsOpen(els: PaletteModalElements, open: boolean, onBeforeOpen: () => void): void {
  if (open) {
    onBeforeOpen();
    hideOtherPalettes(els, "documents");
  }
  setPaletteOpen(els.documentsModalShell, els.documentsInput, open);
}

export function updatePaletteModalSelection(container: HTMLDivElement, index: number): void {
  updatePaletteSelection(container, index);
}

export function movePaletteModalSelection(container: HTMLDivElement, index: number, delta: number): number {
  return movePaletteSelection(container, index, delta);
}

export function triggerPaletteModalSelection(container: HTMLDivElement, index: number): void {
  triggerPaletteSelection(container, index);
}

export function paletteModalButtons(container: HTMLDivElement): HTMLButtonElement[] {
  return paletteResultButtons(container);
}

export function renderSearchResults(options: {
  els: PaletteModalElements;
  payload: SearchPayload;
  onClose: () => void;
  onOpenPage: (pagePath: string) => void;
  onOpenPageAtLine: (pagePath: string, lineNumber: number | string) => void;
  onOpenPageAtTask: (pagePath: string, taskRef: string, lineNumber: number | string) => void;
  onOpenSavedQuery: (name: string) => void;
}): number {
  const selectionIndex = renderGlobalSearchResultsUI({
    container: options.els.globalSearchResults,
    payload: options.payload,
    onClose: options.onClose,
    onOpenPage: options.onOpenPage,
    onOpenPageAtLine: options.onOpenPageAtLine,
    onOpenPageAtTask: options.onOpenPageAtTask,
    onOpenSavedQuery: options.onOpenSavedQuery,
  });
  if (selectionIndex >= 0) {
    updatePaletteSelection(options.els.globalSearchResults, selectionIndex);
  }
  focusWhenOpen(options.els.searchModalShell, options.els.globalSearchInput);
  return selectionIndex;
}

export function renderSearchEmptyState(els: PaletteModalElements, message: string): void {
  renderEmpty(els.globalSearchResults, message);
}

export function renderCommandResults(options: {
  els: PaletteModalElements;
  inputValue: string;
  selectedPage: string;
  sourceOpen: boolean;
  railOpen: boolean;
  currentHomePage: string;
  hotkeys: {
    quickSwitcher: string;
    globalSearch: string;
    commandPalette: string;
    quickNote: string;
    help: string;
    saveCurrentPage: string;
    toggleRawMode: string;
    toggleTaskDone: string;
  };
  onToggleSource: () => void;
  onOpenHelp: () => void;
  onOpenSettings: () => void;
  onOpenDocuments: () => void;
  onOpenQueries: () => void;
  onOpenQuickSwitcher: () => void;
  onQuickNote: () => void;
  onOpenSearch: () => void;
  onFocusRail: (tab: string) => void;
  onToggleRail: () => void;
  onOpenHomePage: (pagePath: string) => void;
  onSetHomePage: (pagePath: string) => void;
  onDeletePage: (pagePath: string) => void;
  onClearHomePage: () => void;
}): number {
  const selectionIndex = renderCommandPaletteResultsUI({
    container: options.els.commandPaletteResults,
    inputValue: options.inputValue,
    selectedPage: options.selectedPage,
    sourceOpen: options.sourceOpen,
    railOpen: options.railOpen,
    currentHomePage: options.currentHomePage,
    hotkeys: options.hotkeys,
    onToggleSource: options.onToggleSource,
    onOpenHelp: options.onOpenHelp,
    onOpenSettings: options.onOpenSettings,
    onOpenDocuments: options.onOpenDocuments,
    onOpenQueries: options.onOpenQueries,
    onOpenQuickSwitcher: options.onOpenQuickSwitcher,
    onQuickNote: options.onQuickNote,
    onOpenSearch: options.onOpenSearch,
    onFocusRail: options.onFocusRail,
    onToggleRail: options.onToggleRail,
    onOpenHomePage: options.onOpenHomePage,
    onSetHomePage: options.onSetHomePage,
    onDeletePage: options.onDeletePage,
    onClearHomePage: options.onClearHomePage,
  });
  if (selectionIndex >= 0) {
    updatePaletteSelection(options.els.commandPaletteResults, selectionIndex);
  }
  focusWhenOpen(options.els.commandModalShell, options.els.commandPaletteInput);
  return selectionIndex;
}

export function renderQuickSwitcherResults(options: {
  els: PaletteModalElements;
  inputValue: string;
  pages: PageSummary[];
  templates: NoteTemplate[];
  selectedPage: string;
  onClose: () => void;
  onOpenPage: (pagePath: string) => void;
  onCreatePage: (pagePath: string) => void;
  onCreateTemplatePage: (template: NoteTemplate, pagePath: string) => void;
}): number {
  const selectionIndex = renderQuickSwitcherResultsUI({
    container: options.els.quickSwitcherResults,
    inputValue: options.inputValue,
    pages: options.pages,
    templates: options.templates,
    selectedPage: options.selectedPage,
    onClose: options.onClose,
    onOpenPage: options.onOpenPage,
    onCreatePage: options.onCreatePage,
    onCreateTemplatePage: options.onCreateTemplatePage,
  });
  if (selectionIndex >= 0) {
    updatePaletteSelection(options.els.quickSwitcherResults, selectionIndex);
  }
  focusWhenOpen(options.els.quickSwitcherModalShell, options.els.quickSwitcherInput);
  return selectionIndex;
}

export function renderDocumentResults(options: {
  els: PaletteModalElements;
  inputValue: string;
  documents: DocumentRecord[];
  onSelectDocument: (document: DocumentRecord) => void;
}): number {
  const selectionIndex = renderDocumentsResultsUI({
    container: options.els.documentsResults,
    inputValue: options.inputValue,
    documents: options.documents,
    onSelectDocument: options.onSelectDocument,
  });
  if (selectionIndex >= 0) {
    updatePaletteSelection(options.els.documentsResults, selectionIndex);
  }
  focusWhenOpen(options.els.documentsModalShell, options.els.documentsInput);
  return selectionIndex;
}

export function documentLinkForSelection(document: DocumentRecord, selectedPage: string): string {
  return markdownLinkForDocument(document, selectedPage);
}
