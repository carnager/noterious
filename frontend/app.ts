import { normalizePageDraftPath, pageTitleFromPath, renderCommandPaletteResults as renderCommandPaletteResultsUI } from "./commands";
import {
  buildTaskSavePayload,
  loadPageDetailData,
  loadSavedQueryDetailData,
  savePageMarkdown,
  saveTask,
  toggleTaskDone as toggleTaskDoneRequest,
} from "./details";
import { markdownLinkForDocument, renderDocumentsResults as renderDocumentsResultsUI } from "./documents";
import { clearNode, focusWithoutScroll, optionalElement, optionalQuery, renderEmpty, requiredElement } from "./dom";
import {
  blockingOverlayOpen,
  captureEditorFocusSpec,
  currentRawLineContext,
  focusMarkdownEditor,
  markdownEditorCaretRect,
  markdownEditorHasFocus,
  markdownEditorSetPagePath,
  markdownEditorScrollTop,
  markdownEditorSelectionEnd,
  markdownEditorSelectionStart,
  markdownEditorSetQueryBlocks,
  markdownEditorSetRenderMode,
  markdownEditorSetTasks,
  markdownEditorValue,
  restoreEditorFocus,
  setMarkdownEditorScrollTop,
  setMarkdownEditorSelection,
  setMarkdownEditorValue,
} from "./editorState";
import { fetchJSON } from "./http";
import {
  bodyPositionFromRawOffset,
  editableBody,
  escapeHTML,
  findDerivedQueryBlock,
  parseQueryFenceOptions,
  rawOffsetForBodyPosition,
  renderInline,
  splitFrontmatter,
  wikiLinkAtCaret,
} from "./markdown";
import { hotkeyLabel, matchesHotkey } from "./hotkeys";
import { currentPageView as buildCurrentPageView, renderedQueryBlocksForEditor, renderedTasksForEditor } from "./noteView";
import {
  moveSelection as movePaletteSelection,
  resultButtons as paletteResultButtons,
  setPaletteOpen,
  triggerSelection as triggerPaletteSelection,
  updateSelection as updatePaletteSelection,
} from "./palette";
import {
  ensureExpandedPageAncestors,
  renderPageContext as renderPageContextUI,
  renderPageTags as renderPageTagsUI,
  renderPageTasks as renderPageTasksUI,
  renderPagesTree,
} from "./pageViews";
import {
  coercePropertyValue,
  makePropertyDraft,
  normalizeDateTimeValue,
  propertyDraftValue,
  renderPageProperties as renderPagePropertiesUI,
  serializeDateTimeValue,
} from "./properties";
import { renderSavedQueryTree as renderSavedQueryTreeUI } from "./queryTree";
import { renderQuickSwitcherResults as renderQuickSwitcherResultsUI } from "./quickSwitcher";
import { applyURLState as applyURLStateUI, buildSelectionURL, navigateToPageSelection } from "./routing";
import { renderGlobalSearchResults as renderGlobalSearchResultsUI } from "./search";
import { closeSlashMenu, documentCommandsForText, maybeOpenSlashMenu, moveSlashSelection, openSlashMenuWithCommands, wikilinkCommandsForContext } from "./slashMenu";
import type {
  AppSettings as SettingsModel,
  BacklinkRecord,
  DocumentListResponse,
  DocumentRecord,
  DerivedPage,
  FrontmatterKind,
  FrontmatterValue,
  FocusRestoreSpec,
  MetaResponse,
  NoteriousEditorApi,
  PageListResponse,
  PageRecord,
  PageSummary,
  PropertyDraft,
  QueryBlockRecord,
  QueryRow,
  SavedQueryRecord,
  SavedQueryTreeFolder,
  SavedQueryTreeResponse,
  SettingsResponse,
  SearchPayload,
  SlashMenuContext,
  TaskRecord,
  WorkspaceSettings,
} from "./types";
import type { PropertyRow } from "./properties";

interface PageLinkDetail {
  page?: string;
  line?: number | string;
  taskRef?: string;
}

interface TaskToggleDetail {
  lineNumber?: number | string;
}

interface TaskOpenDetail {
  ref?: string;
}

interface DocumentDownloadDetail {
  href?: string;
}

interface CodeCopyDetail {
  code?: string;
}

interface QueryFormatResponse {
  valid: boolean;
  formatted?: string;
}

interface QueryWorkbenchPayload {
  analyze?: unknown;
  plan?: unknown;
  lint?: unknown;
  preview?: unknown;
  count?: unknown;
}

interface AppState {
  selectedPage: string;
  selectedSavedQuery: string;
  pages: PageSummary[];
  documents: DocumentRecord[];
  tasks: TaskRecord[];
  queryTree: SavedQueryTreeFolder[];
  selectedSavedQueryPayload: SavedQueryRecord | null;
  eventSource: EventSource | null;
  refreshTimer: number | null;
  autosaveTimer: number | null;
  searchTimer: number | null;
  commandTimer: number | null;
  quickSwitcherTimer: number | null;
  documentTimer: number | null;
  searchSelectionIndex: number;
  commandSelectionIndex: number;
  quickSwitcherSelectionIndex: number;
  documentSelectionIndex: number;
  currentPage: PageRecord | null;
  currentDerived: DerivedPage | null;
  currentMarkdown: string;
  originalMarkdown: string;
  currentTask: TaskRecord | null;
  editingPropertyKey: string;
  propertyTypeMenuKey: string;
  propertyDraft: PropertyDraft | null;
  editingBlockKey: string;
  pendingBlockFocusKey: string;
  pendingEditSeed: string;
  debugOpen: boolean;
  railOpen: boolean;
  railTab: string;
  sourceOpen: boolean;
  settings: SettingsModel;
  appliedWorkspace: WorkspaceSettings;
  settingsRestartRequired: boolean;
  configHomePage: string;
  homePage: string;
  markdownEditorApi: NoteriousEditorApi | null;
  windowBlurred: boolean;
  restoreFocusSpec: FocusRestoreSpec | null;
  expandedPageFolders: Record<string, boolean>;
  suppressActiveBlur: boolean;
  slashOpen: boolean;
  slashSelectionIndex: number;
  slashContext: SlashMenuContext | null;
  pendingPageLineFocus: number | null;
  pendingPageTaskRef: string;
}

(function () {
  const state: AppState = {
    selectedPage: "",
    selectedSavedQuery: "",
    pages: [],
    documents: [],
    tasks: [],
    queryTree: [],
    selectedSavedQueryPayload: null,
    eventSource: null,
    refreshTimer: null,
    autosaveTimer: null,
    searchTimer: null,
    commandTimer: null,
    quickSwitcherTimer: null,
    documentTimer: null,
    searchSelectionIndex: -1,
    commandSelectionIndex: -1,
    quickSwitcherSelectionIndex: -1,
    documentSelectionIndex: -1,
    currentPage: null,
    currentDerived: null,
    currentMarkdown: "",
    originalMarkdown: "",
    currentTask: null,
    editingPropertyKey: "",
    propertyTypeMenuKey: "",
    propertyDraft: null,
    editingBlockKey: "",
    pendingBlockFocusKey: "",
    pendingEditSeed: "",
    debugOpen: false,
    railOpen: false,
    railTab: "files",
    sourceOpen: false,
    settings: {
      preferences: {
        hotkeys: {
          quickSwitcher: "Mod+K",
          globalSearch: "Mod+Shift+K",
          commandPalette: "Mod+Shift+P",
          help: "?",
          saveCurrentPage: "Mod+S",
          toggleRawMode: "Mod+E",
        },
        ui: {
          fontFamily: "mono",
          fontSize: "16",
        },
      },
      workspace: {
        vaultPath: "./vault",
        homePage: "",
      },
    },
    appliedWorkspace: {
      vaultPath: "./vault",
      homePage: "",
    },
    settingsRestartRequired: false,
    configHomePage: "",
    homePage: "",
    markdownEditorApi: null,
    windowBlurred: false,
    restoreFocusSpec: null,
    expandedPageFolders: {},
    suppressActiveBlur: false,
    slashOpen: false,
    slashSelectionIndex: -1,
    slashContext: null,
    pendingPageLineFocus: null,
    pendingPageTaskRef: "",
  };

  const els = {
    metaStrip: optionalElement<HTMLDivElement>("meta-strip"),
    pageSearch: requiredElement<HTMLInputElement>("page-search"),
    pageSearchShell: requiredElement<HTMLElement>("page-search-shell"),
    togglePageSearch: requiredElement<HTMLButtonElement>("toggle-page-search"),
    pageList: requiredElement<HTMLDivElement>("page-list"),
    pageTaskList: requiredElement<HTMLDivElement>("page-task-list"),
    pageTags: requiredElement<HTMLDivElement>("page-tags"),
    pageContext: requiredElement<HTMLDivElement>("page-context"),
    pageProperties: requiredElement<HTMLDivElement>("page-properties"),
    addProperty: requiredElement<HTMLButtonElement>("add-property"),
    propertyActions: optionalQuery<HTMLDivElement>(".property-actions"),
    querySearch: requiredElement<HTMLInputElement>("query-search"),
    queryTree: requiredElement<HTMLDivElement>("query-tree"),
    detailKind: requiredElement<HTMLElement>("detail-kind"),
    detailTitle: requiredElement<HTMLElement>("detail-title"),
    detailPath: requiredElement<HTMLElement>("detail-path"),
    noteHeading: requiredElement<HTMLElement>("note-heading"),
    toggleSourceMode: requiredElement<HTMLButtonElement>("toggle-source-mode"),
    noteStatus: requiredElement<HTMLElement>("note-status"),
    markdownEditor: requiredElement<HTMLTextAreaElement>("markdown-editor"),
    structuredView: requiredElement<HTMLElement>("structured-view"),
    derivedView: requiredElement<HTMLElement>("derived-view"),
    rawView: requiredElement<HTMLElement>("raw-view"),
    queryEditor: requiredElement<HTMLTextAreaElement>("query-editor"),
    queryOutput: requiredElement<HTMLElement>("query-output"),
    eventStatus: requiredElement<HTMLElement>("event-status"),
    eventLog: requiredElement<HTMLDivElement>("event-log"),
    workspace: optionalQuery<HTMLElement>(".workspace"),
    rail: requiredElement<HTMLElement>("rail"),
    railTabFiles: requiredElement<HTMLButtonElement>("rail-tab-files"),
    railTabContext: requiredElement<HTMLButtonElement>("rail-tab-context"),
    railTabTasks: requiredElement<HTMLButtonElement>("rail-tab-tasks"),
    railTabTags: requiredElement<HTMLButtonElement>("rail-tab-tags"),
    railPanelFiles: requiredElement<HTMLElement>("rail-panel-files"),
    railPanelContext: requiredElement<HTMLElement>("rail-panel-context"),
    railPanelTasks: requiredElement<HTMLElement>("rail-panel-tasks"),
    railPanelTags: requiredElement<HTMLElement>("rail-panel-tags"),
    noteLayout: requiredElement<HTMLElement>("note-layout"),
    noteSurface: requiredElement<HTMLElement>("note-surface"),
    toggleRail: requiredElement<HTMLButtonElement>("toggle-rail"),
    historyBack: requiredElement<HTMLButtonElement>("history-back"),
    historyForward: requiredElement<HTMLButtonElement>("history-forward"),
    openQuickSwitcher: requiredElement<HTMLButtonElement>("open-quick-switcher"),
    openDocuments: requiredElement<HTMLButtonElement>("open-documents"),
    openSearch: requiredElement<HTMLButtonElement>("open-search"),
    sessionMenu: requiredElement<HTMLElement>("session-menu"),
    sessionMenuPanel: requiredElement<HTMLElement>("session-menu-panel"),
    openSessionMenu: requiredElement<HTMLButtonElement>("open-session-menu"),
    openHelp: requiredElement<HTMLButtonElement>("open-help"),
    openSettings: requiredElement<HTMLButtonElement>("open-settings"),
    reloadPages: optionalElement<HTMLButtonElement>("reload-pages"),
    reloadQueries: optionalElement<HTMLButtonElement>("reload-queries"),
    toggleDebug: optionalElement<HTMLButtonElement>("toggle-debug"),
    debugDrawer: requiredElement<HTMLElement>("debug-drawer"),
    loadSelectedQuery: requiredElement<HTMLButtonElement>("load-selected-query"),
    formatQuery: requiredElement<HTMLButtonElement>("format-query"),
    runQuery: requiredElement<HTMLButtonElement>("run-query"),
    taskModalShell: requiredElement<HTMLElement>("task-modal-shell"),
    taskModalTitle: requiredElement<HTMLElement>("task-modal-title"),
    taskText: requiredElement<HTMLTextAreaElement>("task-text"),
    taskState: requiredElement<HTMLSelectElement>("task-state"),
    taskDue: requiredElement<HTMLInputElement>("task-due"),
    taskRemind: requiredElement<HTMLInputElement>("task-remind"),
    taskWho: requiredElement<HTMLInputElement>("task-who"),
    taskModalMeta: requiredElement<HTMLElement>("task-modal-meta"),
    closeTaskModal: requiredElement<HTMLButtonElement>("close-task-modal"),
    cancelTask: requiredElement<HTMLButtonElement>("cancel-task"),
    saveTask: requiredElement<HTMLButtonElement>("save-task"),
    searchModalShell: requiredElement<HTMLElement>("search-modal-shell"),
    closeSearchModal: requiredElement<HTMLButtonElement>("close-search-modal"),
    globalSearchInput: requiredElement<HTMLInputElement>("global-search-input"),
    globalSearchResults: requiredElement<HTMLDivElement>("global-search-results"),
    commandModalShell: requiredElement<HTMLElement>("command-modal-shell"),
    closeCommandModal: requiredElement<HTMLButtonElement>("close-command-modal"),
    commandPaletteInput: requiredElement<HTMLInputElement>("command-palette-input"),
    commandPaletteResults: requiredElement<HTMLDivElement>("command-palette-results"),
    quickSwitcherModalShell: requiredElement<HTMLElement>("quick-switcher-modal-shell"),
    closeQuickSwitcherModal: requiredElement<HTMLButtonElement>("close-quick-switcher-modal"),
    quickSwitcherInput: requiredElement<HTMLInputElement>("quick-switcher-input"),
    quickSwitcherResults: requiredElement<HTMLDivElement>("quick-switcher-results"),
    documentsModalShell: requiredElement<HTMLElement>("documents-modal-shell"),
    closeDocumentsModal: requiredElement<HTMLButtonElement>("close-documents-modal"),
    documentsInput: requiredElement<HTMLInputElement>("documents-input"),
    documentsResults: requiredElement<HTMLDivElement>("documents-results"),
    helpModalShell: requiredElement<HTMLElement>("help-modal-shell"),
    closeHelpModal: requiredElement<HTMLButtonElement>("close-help-modal"),
    helpShortcutCore: requiredElement<HTMLDivElement>("help-shortcuts-core"),
    helpShortcutEditor: requiredElement<HTMLDivElement>("help-shortcuts-editor"),
    settingsModalShell: requiredElement<HTMLElement>("settings-modal-shell"),
    closeSettingsModal: requiredElement<HTMLButtonElement>("close-settings-modal"),
    cancelSettings: requiredElement<HTMLButtonElement>("cancel-settings"),
    saveSettings: requiredElement<HTMLButtonElement>("save-settings"),
    settingsVaultPath: requiredElement<HTMLInputElement>("settings-vault-path"),
    settingsHomePage: requiredElement<HTMLInputElement>("settings-home-page"),
    settingsFontFamily: requiredElement<HTMLSelectElement>("settings-ui-font-family"),
    settingsFontSize: requiredElement<HTMLSelectElement>("settings-ui-font-size"),
    settingsQuickSwitcher: requiredElement<HTMLInputElement>("settings-hotkey-quick-switcher"),
    settingsGlobalSearch: requiredElement<HTMLInputElement>("settings-hotkey-global-search"),
    settingsCommandPalette: requiredElement<HTMLInputElement>("settings-hotkey-command-palette"),
    settingsHelp: requiredElement<HTMLInputElement>("settings-hotkey-help"),
    settingsSaveCurrentPage: requiredElement<HTMLInputElement>("settings-hotkey-save-current-page"),
    settingsToggleRawMode: requiredElement<HTMLInputElement>("settings-hotkey-toggle-raw-mode"),
    settingsStatus: requiredElement<HTMLElement>("settings-status"),
    slashMenu: requiredElement<HTMLElement>("slash-menu"),
    slashMenuResults: requiredElement<HTMLDivElement>("slash-menu-results"),
  };

  function setMetaPills(values: string[]): void {
    const metaStrip = els.metaStrip;
    if (!metaStrip) {
      return;
    }
    metaStrip.textContent = "";
    values.forEach(function (value: string) {
      const pill = document.createElement("div");
      pill.className = "pill";
      pill.textContent = value;
      metaStrip.appendChild(pill);
    });
  }

  function debounceRefresh() {
    window.clearTimeout(state.refreshTimer ?? undefined);
    state.refreshTimer = window.setTimeout(function () {
      loadPages();
      loadSavedQueryTree();
      if (!markdownEditorHasFocus(state, els)) {
        refreshCurrentDetail(false);
      }
    }, 250);
  }

  function clearAutosaveTimer() {
    if (!state.autosaveTimer) {
      return;
    }
    window.clearTimeout(state.autosaveTimer);
    state.autosaveTimer = null;
  }

  function pretty(value: unknown): string {
    return JSON.stringify(value, null, 2);
  }

  function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  function encodePath(path: string): string {
    return path.split("/").map(encodeURIComponent).join("/");
  }

  function setHomePage(pagePath: string): void {
    const normalized = normalizePageDraftPath(pagePath);
    state.homePage = normalized;
    state.settings.workspace.homePage = normalized;
  }

  function clearHomePage() {
    state.homePage = "";
    state.settings.workspace.homePage = "";
  }

  function currentHomePage() {
    return normalizePageDraftPath(state.homePage || state.settings.workspace.homePage || "");
  }

  function setSessionMenuOpen(open: boolean): void {
    els.sessionMenuPanel.classList.toggle("hidden", !open);
    els.openSessionMenu.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function setPageSearchOpen(open: boolean): void {
    const keepOpen = open || Boolean(els.pageSearch.value.trim());
    els.pageSearchShell.classList.toggle("hidden", !keepOpen);
    els.togglePageSearch.classList.toggle("active", keepOpen);
    els.togglePageSearch.setAttribute("aria-expanded", keepOpen ? "true" : "false");
    if (keepOpen) {
      window.requestAnimationFrame(function () {
        if (document.activeElement !== els.pageSearch) {
          els.pageSearch.focus({preventScroll: true});
        }
      });
    }
  }

  function syncURLState(replace: boolean) {
    const url = buildSelectionURL(window.location.href, state.selectedPage, state.selectedSavedQuery);
    if (url.href === window.location.href) {
      return;
    }
    if (replace) {
      window.history.replaceState({}, "", url);
    } else {
      window.history.pushState({}, "", url);
    }
  }

  function applyURLState() {
    applyURLStateUI({
      href: window.location.href,
      currentHomePage: currentHomePage(),
      pages: state.pages,
      onNavigateToPage: navigateToPage,
      onSelectSavedQuery: function (name) {
        state.selectedSavedQuery = name;
        state.selectedPage = "";
        renderPages();
        renderSavedQueryTree();
        loadSavedQueryDetail(name);
      },
      onRenderIdle: function () {
        renderPages();
        renderSavedQueryTree();
      },
    });
  }

  function navigateToPage(pagePath: string, replace: boolean) {
    navigateToPageSelection({
      pagePath: pagePath,
      replace: replace,
      onExpandAncestors: function (path) {
        ensureExpandedPageAncestors(path, state.expandedPageFolders);
      },
      onSetPendingFocus: function (lineNumber, taskRef) {
        state.pendingPageLineFocus = lineNumber;
        state.pendingPageTaskRef = taskRef;
      },
      onSelectPage: function (path) {
        state.selectedPage = path;
        state.selectedSavedQuery = "";
      },
      onSyncURL: syncURLState,
      onRenderPages: renderPages,
      onRenderSavedQueryTree: renderSavedQueryTree,
      onLoadPageDetail: function (path) {
        loadPageDetail(path, true);
      },
    });
  }

  function hasPage(pagePath: string): boolean {
    const normalized = normalizePageDraftPath(pagePath).toLowerCase();
    if (!normalized) {
      return false;
    }
    return state.pages.some(function (page) {
      return String(page.path || "").toLowerCase() === normalized;
    });
  }

  function openOrCreatePage(pagePath: string, replace: boolean): void {
    const normalized = normalizePageDraftPath(pagePath);
    if (!normalized) {
      return;
    }
    if (hasPage(normalized)) {
      navigateToPage(normalized, replace);
      return;
    }
    createPage(normalized).catch(function (error) {
      setNoteStatus("Create page failed: " + errorMessage(error));
    });
  }

  function navigateToPageAtLine(pagePath: string, lineNumber: number | string, replace: boolean) {
    navigateToPageSelection({
      pagePath: pagePath,
      lineNumber: lineNumber,
      replace: replace,
      onExpandAncestors: function (path) {
        ensureExpandedPageAncestors(path, state.expandedPageFolders);
      },
      onSetPendingFocus: function (nextLineNumber, taskRef) {
        state.pendingPageLineFocus = nextLineNumber;
        state.pendingPageTaskRef = taskRef;
      },
      onSelectPage: function (path) {
        state.selectedPage = path;
        state.selectedSavedQuery = "";
      },
      onSyncURL: syncURLState,
      onRenderPages: renderPages,
      onRenderSavedQueryTree: renderSavedQueryTree,
      onLoadPageDetail: function (path) {
        loadPageDetail(path, true);
      },
    });
  }

  function navigateToPageAtTask(pagePath: string, taskRef: string, lineNumber: number | string, replace: boolean) {
    navigateToPageSelection({
      pagePath: pagePath,
      lineNumber: lineNumber,
      taskRef: taskRef,
      replace: replace,
      onExpandAncestors: function (path) {
        ensureExpandedPageAncestors(path, state.expandedPageFolders);
      },
      onSetPendingFocus: function (nextLineNumber, nextTaskRef) {
        state.pendingPageLineFocus = nextLineNumber;
        state.pendingPageTaskRef = nextTaskRef;
      },
      onSelectPage: function (path) {
        state.selectedPage = path;
        state.selectedSavedQuery = "";
      },
      onSyncURL: syncURLState,
      onRenderPages: renderPages,
      onRenderSavedQueryTree: renderSavedQueryTree,
      onLoadPageDetail: function (path) {
        loadPageDetail(path, true);
      },
    });
  }

  function on(node: EventTarget | null | undefined, eventName: string, handler: EventListener): void {
    if (!node) {
      return;
    }
    node.addEventListener(eventName, handler);
  }

  function applySlashSelection() {
    if (!state.slashOpen || !state.slashContext) {
      closeSlashMenu(state, els);
      return false;
    }
    const commands = state.slashContext.commands || [];
    const command = commands[state.slashSelectionIndex] || commands[0];
    if (!command) {
      closeSlashMenu(state, els);
      return false;
    }

    const rawContext = currentRawLineContext(state, els);
    const updated = command.apply(rawContext.lineText);
    const nextValue = rawContext.value.slice(0, rawContext.lineStart) + updated + rawContext.value.slice(rawContext.lineEnd);
    const scrollTop = markdownEditorScrollTop(state, els);
    setMarkdownEditorValue(state, els, nextValue);
    state.currentMarkdown = nextValue;
    els.rawView.textContent = state.currentMarkdown;
    scheduleAutosave();
    const caret = rawContext.lineStart + (typeof command.caret === "function" ? command.caret(updated) : updated.length);
    focusMarkdownEditor(state, els, {preventScroll: true});
    setMarkdownEditorSelection(state, els, caret, caret);
    setMarkdownEditorScrollTop(state, els, scrollTop);

    closeSlashMenu(state, els);
    return true;
  }

  function insertTextAtEditorSelection(text: string): void {
    if (!state.selectedPage || !state.currentPage) {
      return;
    }
    const value = markdownEditorValue(state, els);
    const selectionStart = markdownEditorSelectionStart(state, els);
    const selectionEnd = markdownEditorSelectionEnd(state, els);
    const scrollTop = markdownEditorScrollTop(state, els);
    const nextValue = value.slice(0, selectionStart) + text + value.slice(selectionEnd);
    const nextCaret = selectionStart + text.length;

    setMarkdownEditorValue(state, els, nextValue);
    state.currentMarkdown = nextValue;
    els.rawView.textContent = nextValue;
    refreshLivePageChrome();
    scheduleAutosave();
    focusMarkdownEditor(state, els, {preventScroll: true});
    setMarkdownEditorSelection(state, els, nextCaret, nextCaret);
    setMarkdownEditorScrollTop(state, els, scrollTop);
  }

  function currentPageView(): PageRecord | null {
    return buildCurrentPageView(state.currentPage, state.currentMarkdown);
  }

  function refreshLivePageChrome() {
    const page = currentPageView();
    if (!page) {
      return;
    }

    const fallbackPath = page.page || page.path || state.selectedPage || "";
    els.detailPath.textContent = fallbackPath;
    els.detailTitle.textContent = page.title || fallbackPath;
    els.noteHeading.textContent = page.title || fallbackPath;
    renderPageTags();
    renderPageProperties();
  }

  function renderSourceModeButton(): void {
    const hasPage = Boolean(state.selectedPage && state.currentPage);
    els.toggleSourceMode.disabled = !hasPage;
    els.toggleSourceMode.classList.toggle("active", state.sourceOpen);
    els.toggleSourceMode.setAttribute("aria-pressed", state.sourceOpen ? "true" : "false");
    els.toggleSourceMode.textContent = state.sourceOpen ? "Preview" : "Raw";
    els.toggleSourceMode.title = state.sourceOpen
      ? "Switch to rendered preview (" + hotkeyLabel(state.settings.preferences.hotkeys.toggleRawMode) + ")"
      : "Switch to raw markdown (" + hotkeyLabel(state.settings.preferences.hotkeys.toggleRawMode) + ")";
  }

  function updateMarkdownBodyRange(start: number, end: number, replacement: string): void {
    const split = splitFrontmatter(state.currentMarkdown);
    const bodyLines = split.body.split("\n");
    const replacementLines = String(replacement || "").replace(/\r\n/g, "\n").split("\n");
    bodyLines.splice(start, end - start, ...replacementLines);
    state.currentMarkdown = split.frontmatter + bodyLines.join("\n");
  }

  function firstEditableLineIndex(markdown: string): number {
    const lines = editableBody(markdown).split("\n");
    if (!lines.length) {
      return 0;
    }
    for (let index = 0; index < lines.length; index += 1) {
      if (String(lines[index] || "").trim() !== "") {
        return index;
      }
    }
    return 0;
  }

  function replaceEditableBody(body: string): void {
    const split = splitFrontmatter(state.currentMarkdown);
    state.currentMarkdown = split.frontmatter + String(body || "").replace(/\r\n/g, "\n");
  }

  function focusEditorAtBodyPosition(lineIndex: number, caret: number): void {
    const offset = rawOffsetForBodyPosition(state.currentMarkdown, lineIndex, caret);
    window.setTimeout(function () {
      focusMarkdownEditor(state, els, {preventScroll: true});
      setMarkdownEditorSelection(state, els, offset, offset);
    }, 0);
  }

  function isQueryFenceBlock(markdown: string): boolean {
    const lines = String(markdown || "").split("\n");
    return lines.length > 0 && /^```query(?:\s|$)/i.test(lines[0].trim());
  }

  function hasUnsavedPageChanges() {
    return Boolean(state.selectedPage && state.currentPage && state.currentMarkdown !== state.originalMarkdown);
  }

  function setNoteStatus(message: string): void {
    els.noteStatus.textContent = message;
  }

  function renderNoteStudio() {
    const page = currentPageView();
    if (!page) {
      setMarkdownEditorValue(state, els, "");
      markdownEditorSetPagePath(state, "");
      setNoteStatus("Select a page to edit and preview markdown.");
      renderSourceModeButton();
      return;
    }

    setMarkdownEditorValue(state, els, state.currentMarkdown);
    if (state.markdownEditorApi && state.markdownEditorApi.host) {
      state.markdownEditorApi.host.classList.remove("hidden");
      markdownEditorSetPagePath(state, state.selectedPage);
      markdownEditorSetRenderMode(state, !state.sourceOpen);
      markdownEditorSetQueryBlocks(state, renderedQueryBlocksForEditor(state.currentDerived));
      markdownEditorSetTasks(state, renderedTasksForEditor(page));
    }
    if (els.pageProperties) {
      els.pageProperties.classList.toggle("hidden", state.sourceOpen);
    }
    if (els.propertyActions) {
      els.propertyActions.classList.toggle("hidden", state.sourceOpen);
    }
    els.rawView.textContent = state.currentMarkdown;
    refreshLivePageChrome();
    renderSourceModeButton();

    if (hasUnsavedPageChanges()) {
      setNoteStatus("Unsaved local edits on " + state.selectedPage + ".");
      scheduleAutosave();
    } else {
      clearAutosaveTimer();
      setNoteStatus("Editing " + state.selectedPage + " directly.");
    }
  }

  function scheduleAutosave() {
    if (!state.selectedPage || !state.currentPage || !hasUnsavedPageChanges()) {
      clearAutosaveTimer();
      return;
    }
    clearAutosaveTimer();
    state.autosaveTimer = window.setTimeout(function () {
      saveCurrentPage();
    }, 700);
  }

  function renderPageTasks(tasks: TaskRecord[]): void {
    renderPageTasksUI(els.pageTaskList, Array.isArray(tasks) ? tasks : [], openTaskModal);
  }

  function renderPageContext() {
    renderPageContextUI(els.pageContext, state.currentPage, state.currentDerived);
  }

  function renderPageTags() {
    const page = currentPageView();
    renderPageTagsUI(els.pageTags, page ? page.frontmatter : null);
  }

  function clearPropertyDraft() {
    state.editingPropertyKey = "";
    state.propertyTypeMenuKey = "";
    state.propertyDraft = null;
  }

  function setPropertyDraft(key: string, value: FrontmatterValue, originalKey: string): void {
    state.editingPropertyKey = originalKey || key || "__new__";
    state.propertyDraft = makePropertyDraft(key, value, originalKey);
  }

  function propertyMenuKey(row: PropertyRow | null): string {
    return row ? row.key : "__new__";
  }

  function togglePropertyTypeMenu(menuKey: string): void {
    state.propertyTypeMenuKey = state.propertyTypeMenuKey === menuKey ? "" : menuKey;
    renderPageProperties();
  }

  function applyPropertyKind(kind: FrontmatterKind, row: PropertyRow | null): void {
    const menuKey = propertyMenuKey(row);
    if (!row) {
      if (!state.propertyDraft || state.editingPropertyKey !== menuKey) {
        setPropertyDraft("", "", "__new__");
      }

      const draft = state.propertyDraft;
      if (!draft) {
        return;
      }
      draft.kind = kind;
      if (kind === "list" && !Array.isArray(draft.list)) {
        draft.list = [];
      }
      if (kind === "bool") {
        draft.text = draft.text === "true" ? "true" : "false";
      }
      state.propertyTypeMenuKey = "";
      renderPageProperties();
      return;
    }

    state.propertyTypeMenuKey = "";
    patchCurrentPageFrontmatter({
      frontmatter: {
        set: {
          [row.key]: coercePropertyValue(kind, row.rawValue),
        },
      },
    }).catch(function (error) {
      setNoteStatus("Property type change failed: " + error.message);
    });
  }

  function dismissPropertyUI() {
    if (!state.propertyDraft && !state.propertyTypeMenuKey) {
      return;
    }
    clearPropertyDraft();
    renderPageProperties();
  }

  async function patchCurrentPageFrontmatter(payload: unknown): Promise<void> {
    if (!state.selectedPage || !state.currentPage) {
      return;
    }

    await fetchJSON<unknown>("/api/pages/" + encodePath(state.selectedPage), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    await Promise.all([loadPages(), loadPageDetail(state.selectedPage, true)]);
  }

  function startAddProperty() {
    setPropertyDraft("", "", "__new__");
    renderPageProperties();
  }

  async function removeProperty(key: string): Promise<void> {
    if (!key) {
      return;
    }
    await patchCurrentPageFrontmatter({
      frontmatter: {
        remove: [key],
      },
    });
    clearPropertyDraft();
  }

  function startRenameProperty(row: PropertyRow | null): void {
    if (!row) {
      return;
    }
    setPropertyDraft(row.key, row.rawValue, row.key);
    state.propertyTypeMenuKey = "";
    renderPageProperties();
  }

  async function savePropertyEdit() {
    const key = state.propertyDraft ? String(state.propertyDraft.key || "").trim() : "";

    if (!key) {
      setNoteStatus("Frontmatter key is required.");
      return;
    }

    const value = propertyDraftValue(state.propertyDraft);
    const setPayload: Record<string, FrontmatterValue> = {};
    setPayload[key] = value;

    const remove = state.editingPropertyKey && state.editingPropertyKey !== key ? [state.editingPropertyKey] : [];

    await patchCurrentPageFrontmatter({
      frontmatter: {
        set: setPayload,
        remove: remove,
      },
    });

    clearPropertyDraft();
  }

  function saveExistingPropertyValue(key: string, value: FrontmatterValue): Promise<void> {
    return patchCurrentPageFrontmatter({
      frontmatter: {
        set: {
          [key]: value,
        },
      },
    });
  }
  function renderPageProperties() {
    const page = currentPageView();
    renderPagePropertiesUI({
      container: els.pageProperties,
      pageFrontmatter: page ? page.frontmatter : null,
      editingPropertyKey: state.editingPropertyKey,
      propertyTypeMenuKey: state.propertyTypeMenuKey,
      propertyDraft: state.propertyDraft,
      onToggleTypeMenu: togglePropertyTypeMenu,
      onApplyKind: applyPropertyKind,
      onRemoveProperty: function (key) {
        removeProperty(key).catch(function (error) {
          setNoteStatus("Property delete failed: " + error.message);
        });
      },
      onStartRenameProperty: startRenameProperty,
      onSaveExistingProperty: saveExistingPropertyValue,
      onSetDraft: function (draft) {
        state.propertyDraft = draft;
      },
      onRefresh: renderPageProperties,
      onSaveDraft: savePropertyEdit,
      onCancelDraft: function () {
        clearPropertyDraft();
        renderPageProperties();
      },
      onSetNoteStatus: setNoteStatus,
    });
  }

  function clearPageSelection() {
    clearAutosaveTimer();
    state.selectedPage = "";
    state.selectedSavedQuery = "";
    state.currentPage = null;
    state.currentDerived = null;
    state.currentMarkdown = "";
    state.originalMarkdown = "";
    state.currentTask = null;
    clearPropertyDraft();
    syncURLState(true);
    els.detailPath.textContent = "Select a page";
    els.noteHeading.textContent = "Waiting for selection";
    closeTaskModal();
    renderNoteStudio();
    renderSourceModeButton();
    renderPageTasks([]);
    renderPageTags();
    renderPageContext();
    renderPageProperties();
  }

  function setStructuredViews(kind: string, title: string, structured: unknown, derived: unknown, raw: string): void {
    els.detailKind.textContent = kind;
    els.detailTitle.textContent = title;
    els.structuredView.textContent = pretty(structured);
    els.derivedView.textContent = pretty(derived);
    els.rawView.textContent = raw || "";
  }

  function shortcutRow(label: string, hotkey: string): HTMLDivElement {
    const row = document.createElement("div");
    row.className = "shortcut-row";

    const title = document.createElement("span");
    title.textContent = label;
    row.appendChild(title);

    const keys = document.createElement("span");
    keys.className = "shortcut-keys";
    hotkeyLabel(hotkey).split("+").forEach(function (part) {
      const key = document.createElement("kbd");
      key.textContent = part;
      keys.appendChild(key);
    });
    row.appendChild(keys);
    return row;
  }

  function renderHelpShortcuts() {
    clearNode(els.helpShortcutCore);
    clearNode(els.helpShortcutEditor);

    [
      ["Quick Switcher", state.settings.preferences.hotkeys.quickSwitcher],
      ["Full Search", state.settings.preferences.hotkeys.globalSearch],
      ["Command Palette", state.settings.preferences.hotkeys.commandPalette],
      ["Back", "Alt+Left"],
      ["Forward", "Alt+Right"],
      ["Save Current Note", state.settings.preferences.hotkeys.saveCurrentPage],
      ["Toggle Raw Mode", state.settings.preferences.hotkeys.toggleRawMode],
      ["Open Help", state.settings.preferences.hotkeys.help],
    ].forEach(function (entry) {
      els.helpShortcutCore.appendChild(shortcutRow(entry[0], entry[1]));
    });

    [
      ["Slash Commands", "/"],
      ["Open Link Under Caret", "Shift+Enter"],
      ["Close Menus or Modals", "Esc"],
    ].forEach(function (entry) {
      els.helpShortcutEditor.appendChild(shortcutRow(entry[0], entry[1]));
    });
  }

  function renderSettingsForm() {
    els.settingsVaultPath.value = state.settings.workspace.vaultPath || "";
    els.settingsHomePage.value = state.settings.workspace.homePage || "";
    els.settingsFontFamily.value = state.settings.preferences.ui.fontFamily || "mono";
    els.settingsFontSize.value = state.settings.preferences.ui.fontSize || "16";
    els.settingsQuickSwitcher.value = state.settings.preferences.hotkeys.quickSwitcher || "";
    els.settingsGlobalSearch.value = state.settings.preferences.hotkeys.globalSearch || "";
    els.settingsCommandPalette.value = state.settings.preferences.hotkeys.commandPalette || "";
    els.settingsHelp.value = state.settings.preferences.hotkeys.help || "";
    els.settingsSaveCurrentPage.value = state.settings.preferences.hotkeys.saveCurrentPage || "";
    els.settingsToggleRawMode.value = state.settings.preferences.hotkeys.toggleRawMode || "";
    if (state.settingsRestartRequired) {
      els.settingsStatus.textContent = "Vault path changed. Restart the server to apply the new workspace root.";
      return;
    }
    els.settingsStatus.textContent = "Settings are stored in the server data directory.";
  }

  function setSettingsSnapshot(snapshot: SettingsResponse): void {
    state.settings = snapshot.settings;
    state.appliedWorkspace = snapshot.appliedWorkspace;
    state.settingsRestartRequired = snapshot.restartRequired;
    state.homePage = normalizePageDraftPath(snapshot.settings.workspace.homePage || "");
    renderHelpShortcuts();
    renderSettingsForm();
    applyUIPreferences();
    renderSourceModeButton();
  }

  function applyUIPreferences(): void {
    const root = document.documentElement;
    const fontFamily = state.settings.preferences.ui.fontFamily || "mono";
    const fontSize = state.settings.preferences.ui.fontSize || "16";
    const fontMap: Record<string, string> = {
      mono: '"IBM Plex Mono", "SFMono-Regular", Consolas, "Liberation Mono", monospace',
      sans: '"IBM Plex Sans", "Segoe UI", system-ui, sans-serif',
      serif: '"Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif',
    };
    root.style.setProperty("--app-font-family", fontMap[fontFamily] || fontMap.mono);
    root.style.setProperty("--editor-font-family", fontMap[fontFamily] || fontMap.mono);
    root.style.setProperty("--app-font-size", fontSize + "px");
  }

  async function loadSettings() {
    try {
      const snapshot = await fetchJSON<SettingsResponse>("/api/settings");
      setSettingsSnapshot(snapshot);
    } catch (error) {
      els.settingsStatus.textContent = errorMessage(error);
    }
  }

  async function loadMeta() {
    try {
      const meta = await fetchJSON<MetaResponse>("/api/meta");
      const pills = [
        "Listening " + meta.listenAddr,
        "Vault " + meta.vaultPath,
        "DB " + meta.database,
        "Time " + meta.serverTime,
      ];
      if (meta.restartRequired) {
        pills.splice(2, 0, "Restart required");
      }
      setMetaPills(pills);
    } catch (error) {
      setMetaPills(["Meta error", errorMessage(error)]);
    }
  }

  async function loadPages() {
    const params = new URLSearchParams();
    const query = els.pageSearch.value.trim();
    if (query) {
      params.set("q", query);
    }

    try {
      const payload = await fetchJSON<PageListResponse>("/api/pages" + (params.toString() ? "?" + params.toString() : ""));
      state.pages = payload.pages || [];
      renderPages();
    } catch (error) {
      renderEmpty(els.pageList, errorMessage(error));
      els.pageList.classList.add("no-scroll");
    }
  }

  function updatePageListScrollState(): void {
    window.requestAnimationFrame(function () {
      const overflow = els.pageList.scrollHeight - els.pageList.clientHeight;
      els.pageList.classList.toggle("no-scroll", overflow <= 8);
    });
  }

  function renderPages() {
    if (state.selectedPage) {
      ensureExpandedPageAncestors(state.selectedPage, state.expandedPageFolders);
    }

    renderPagesTree(
      els.pageList,
      state.pages,
      state.selectedPage,
      state.expandedPageFolders,
      els.pageSearch.value.trim(),
      function (folderKey) {
        state.expandedPageFolders[folderKey] = !state.expandedPageFolders[folderKey];
        renderPages();
      },
      function (pagePath) {
        navigateToPage(pagePath, false);
      },
      function (folderKey) {
        const name = window.prompt('New note in "' + folderKey + '"', "");
        const normalizedName = normalizePageDraftPath(name || "");
        if (!normalizedName) {
          return;
        }
        createPage(folderKey + "/" + normalizedName).catch(function (error) {
          setNoteStatus("Create page failed: " + errorMessage(error));
        });
      },
      function (folderKey) {
        const subfolder = normalizePageDraftPath(window.prompt('New subfolder in "' + folderKey + '"', "") || "");
        if (!subfolder) {
          return;
        }
        const initialNote = normalizePageDraftPath(window.prompt('Initial note inside "' + subfolder + '"', "index") || "");
        if (!initialNote) {
          return;
        }
        createPage(folderKey + "/" + subfolder + "/" + initialNote).catch(function (error) {
          setNoteStatus("Create folder failed: " + errorMessage(error));
        });
      },
      function (folderKey) {
        deleteFolder(folderKey).catch(function (error) {
          setNoteStatus("Delete folder failed: " + errorMessage(error));
        });
      },
      function (pagePath) {
        deletePage(pagePath).catch(function (error) {
          setNoteStatus("Delete page failed: " + errorMessage(error));
        });
      },
      function (pagePath, folderKey) {
        movePageToFolder(pagePath, folderKey).catch(function (error) {
          setNoteStatus("Move page failed: " + errorMessage(error));
        });
      },
      function (folderKey, targetFolder) {
        moveFolder(folderKey, targetFolder).catch(function (error) {
          setNoteStatus("Move folder failed: " + errorMessage(error));
        });
      }
    );
    updatePageListScrollState();
  }

  async function loadSavedQueryTree() {
    const params = new URLSearchParams();
    const query = els.querySearch.value.trim();
    if (query) {
      params.set("q", query);
    }

    try {
      const payload = await fetchJSON<SavedQueryTreeResponse>("/api/queries/tree" + (params.toString() ? "?" + params.toString() : ""));
      state.queryTree = payload.folders || [];
      renderSavedQueryTree();
    } catch (error) {
      renderEmpty(els.queryTree, errorMessage(error));
    }
  }

  function renderSavedQueryTree() {
    renderSavedQueryTreeUI(els.queryTree, state.queryTree, state.selectedSavedQuery, function (name) {
      state.selectedSavedQuery = name;
      state.selectedPage = "";
      syncURLState(false);
      renderPages();
      renderSavedQueryTree();
      loadSavedQueryDetail(name);
    });
  }

  function findCurrentTask(ref: string): TaskRecord | null {
    if (!state.currentPage || !state.currentPage.tasks) {
      return null;
    }
    return state.currentPage.tasks.find(function (task) {
      return task.ref === ref;
    }) || null;
  }

  async function toggleTaskDone(task: TaskRecord | null): Promise<void> {
    if (!task || !task.ref) {
      return;
    }

    try {
      await toggleTaskDoneRequest(task);
      await Promise.all([state.selectedPage ? loadPageDetail(state.selectedPage, true) : Promise.resolve()]);
    } catch (error) {
      setNoteStatus("Task toggle failed: " + errorMessage(error));
    }
  }

  async function loadPageDetail(pagePath: string, force: boolean): Promise<void> {
    if (!force && hasUnsavedPageChanges()) {
      setNoteStatus("Unsaved local edits on " + state.selectedPage + ". Autosave pending.");
      return;
    }

    try {
      const pendingLineFocus = state.pendingPageLineFocus;
      const loaded = await loadPageDetailData(
        pagePath,
        encodePath,
        state.pendingPageTaskRef,
        state.pendingPageLineFocus
      );
      const page = loaded.page;
      const derived = loaded.derived;

      state.currentPage = page;
      state.currentDerived = derived;
      state.currentMarkdown = page.rawMarkdown || "";
      state.originalMarkdown = page.rawMarkdown || "";
      clearAutosaveTimer();
      state.currentTask = null;
      clearPropertyDraft();
      state.selectedSavedQueryPayload = null;
      els.detailPath.textContent = page.page || page.path || pagePath;
      els.noteHeading.textContent = page.title || page.page || pagePath;

      setStructuredViews(
        "Page",
        page.title || page.page,
        {
          page: page.page,
          title: page.title,
          frontmatter: page.frontmatter,
          links: page.links,
          tasks: page.tasks,
        },
        {
          toc: derived.toc,
          backlinks: derived.backlinks,
          linkCounts: derived.linkCounts,
          taskCounts: derived.taskCounts,
          queryBlocks: derived.queryBlocks,
        },
        page.rawMarkdown || ""
      );
      renderNoteStudio();
      if (state.markdownEditorApi && !blockingOverlayOpen(els)) {
        state.markdownEditorApi.setHighlightedLine(
          typeof pendingLineFocus === "number" && pendingLineFocus > 0 ? pendingLineFocus : null
        );
        if (loaded.focusOffset !== null) {
          state.pendingPageLineFocus = null;
          state.pendingPageTaskRef = "";
          window.requestAnimationFrame(function () {
            focusMarkdownEditor(state, els, {preventScroll: true});
            setMarkdownEditorSelection(state, els, loaded.focusOffset as number, loaded.focusOffset as number, true);
            window.requestAnimationFrame(function () {
              focusMarkdownEditor(state, els, {preventScroll: true});
              setMarkdownEditorSelection(state, els, loaded.focusOffset as number, loaded.focusOffset as number, true);
            });
          });
        } else {
          state.markdownEditorApi.setHighlightedLine(null);
          focusEditorAtBodyPosition(firstEditableLineIndex(state.currentMarkdown), 0);
        }
      } else if (state.sourceOpen && !blockingOverlayOpen(els)) {
        window.setTimeout(function () {
          if (els.markdownEditor) {
            focusMarkdownEditor(state, els, {preventScroll: true});
            const caret = rawOffsetForBodyPosition(state.currentMarkdown, firstEditableLineIndex(state.currentMarkdown), 0);
            setMarkdownEditorSelection(state, els, caret, caret);
          }
        }, 0);
      }
      renderPageTasks(page.tasks || []);
      renderPageTags();
      renderPageContext();
      renderPageProperties();
    } catch (error) {
      clearPageSelection();
      els.detailKind.textContent = "Page";
      els.detailTitle.textContent = pagePath;
      els.structuredView.textContent = errorMessage(error);
      els.derivedView.textContent = "";
      els.rawView.textContent = "";
    }
  }

  async function loadSavedQueryDetail(name: string): Promise<void> {
    clearPageSelection();
    try {
      const detail = await loadSavedQueryDetailData(name);
      const savedQuery = detail.savedQuery;
      state.selectedSavedQueryPayload = savedQuery;
      els.detailPath.textContent = savedQuery.name || name;
      els.noteHeading.textContent = savedQuery.title || savedQuery.name || name;
      setStructuredViews("Saved Query", savedQuery.title || savedQuery.name, savedQuery, detail.workbench, savedQuery.query || "");
      setNoteStatus("Viewing saved query details. Select a page to edit notes.");
      renderPageContext();
      renderPageProperties();
    } catch (error) {
      state.selectedSavedQueryPayload = null;
      els.detailKind.textContent = "Saved Query";
      els.detailTitle.textContent = name;
      els.structuredView.textContent = errorMessage(error);
      els.derivedView.textContent = "";
      els.rawView.textContent = "";
      setNoteStatus("Select a page to edit and preview markdown.");
      renderPageContext();
    }
  }

  function refreshCurrentDetail(force: boolean): void {
    if (state.selectedPage) {
      if (!force && markdownEditorHasFocus(state, els)) {
        return;
      }
      loadPageDetail(state.selectedPage, force);
      return;
    }
    if (state.selectedSavedQuery) {
      loadSavedQueryDetail(state.selectedSavedQuery);
    }
  }

  function addEventLine(type: string, data: unknown, warn: boolean): void {
    const item = document.createElement("div");
    item.className = "event-item";
    if (warn) {
      item.classList.add("warn");
    }

    const strong = document.createElement("strong");
    strong.textContent = type;
    const small = document.createElement("small");
    small.textContent = new Date().toLocaleTimeString();
    const pre = document.createElement("pre");
    pre.className = "code-block";
    pre.textContent = typeof data === "string" ? data : pretty(data);

    item.appendChild(strong);
    item.appendChild(small);
    item.appendChild(pre);
    els.eventLog.prepend(item);

    while (els.eventLog.childNodes.length > 12) {
      const lastChild = els.eventLog.lastChild;
      if (!lastChild) {
        break;
      }
      els.eventLog.removeChild(lastChild);
    }
  }

  async function runQueryWorkbench() {
    const query = els.queryEditor.value.trim();
    if (!query) {
      els.queryOutput.textContent = "Enter a query first.";
      return;
    }

    els.queryOutput.textContent = "Running query workbench...";
    try {
      const payload = await fetchJSON<QueryWorkbenchPayload>("/api/query/workbench", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: query,
          previewLimit: 10,
        }),
      });
      els.queryOutput.textContent = pretty(payload);
    } catch (error) {
      els.queryOutput.textContent = errorMessage(error);
    }
  }

  async function formatQueryText() {
    const query = els.queryEditor.value.trim();
    if (!query) {
      els.queryOutput.textContent = "Enter a query first.";
      return;
    }

    els.queryOutput.textContent = "Formatting query...";
    try {
      const payload = await fetchJSON<QueryFormatResponse>("/api/query/format", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query }),
      });
      els.queryOutput.textContent = pretty(payload);
      if (payload.valid && payload.formatted) {
        els.queryEditor.value = payload.formatted;
      }
    } catch (error) {
      els.queryOutput.textContent = errorMessage(error);
    }
  }

  function loadSelectedQueryIntoEditor() {
    if (state.selectedSavedQueryPayload && state.selectedSavedQueryPayload.query) {
      els.queryEditor.value = state.selectedSavedQueryPayload.query;
      els.queryOutput.textContent = "Loaded selected saved query into the editor.";
      return;
    }
    if (els.rawView.textContent && els.detailKind.textContent === "Saved Query") {
      els.queryEditor.value = els.rawView.textContent;
      els.queryOutput.textContent = "Loaded visible saved query text into the editor.";
      return;
    }
    els.queryOutput.textContent = "Select a saved query first, or type directly into the editor.";
  }

  function openTaskModal(task: TaskRecord): void {
    state.currentTask = task;
    els.taskModalTitle.textContent = task.text || task.ref;
    els.taskText.value = task.text || "";
    els.taskState.value = task.done ? "done" : "todo";
    els.taskDue.value = task.due || "";
    els.taskRemind.value = normalizeDateTimeValue(task.remind || "");
    els.taskWho.value = task.who && task.who.length ? task.who.join(", ") : "";
    const meta = [
      task.page || "",
      task.ref || "",
      task.line ? ("line " + task.line) : "",
      task.done ? "done" : "open",
    ].filter(Boolean);
    els.taskModalMeta.textContent = meta.join(" · ");
    els.taskModalShell.classList.remove("hidden");
  }

  function closeTaskModal() {
    state.currentTask = null;
    els.taskModalShell.classList.add("hidden");
  }

  function setSearchOpen(open: boolean): void {
    if (open) {
      els.commandModalShell.classList.add("hidden");
      els.quickSwitcherModalShell.classList.add("hidden");
      els.documentsModalShell.classList.add("hidden");
      els.helpModalShell.classList.add("hidden");
    }
    setPaletteOpen(els.searchModalShell, els.globalSearchInput, open);
  }

  function closeSearchModal() {
    setSearchOpen(false);
  }

  function searchResultButtons(): HTMLButtonElement[] {
    return paletteResultButtons(els.globalSearchResults);
  }

  function commandResultButtons(): HTMLButtonElement[] {
    return paletteResultButtons(els.commandPaletteResults);
  }

  function quickSwitcherResultButtons(): HTMLButtonElement[] {
    return paletteResultButtons(els.quickSwitcherResults);
  }

  function documentResultButtons(): HTMLButtonElement[] {
    return paletteResultButtons(els.documentsResults);
  }

  function updateSearchSelection() {
    updatePaletteSelection(els.globalSearchResults, state.searchSelectionIndex);
  }

  function updateCommandSelection() {
    updatePaletteSelection(els.commandPaletteResults, state.commandSelectionIndex);
  }

  function updateQuickSwitcherSelection() {
    updatePaletteSelection(els.quickSwitcherResults, state.quickSwitcherSelectionIndex);
  }

  function updateDocumentSelection() {
    updatePaletteSelection(els.documentsResults, state.documentSelectionIndex);
  }

  function moveSearchSelection(delta: number): void {
    state.searchSelectionIndex = movePaletteSelection(els.globalSearchResults, state.searchSelectionIndex, delta);
  }

  function moveCommandSelection(delta: number): void {
    state.commandSelectionIndex = movePaletteSelection(els.commandPaletteResults, state.commandSelectionIndex, delta);
  }

  function moveQuickSwitcherSelection(delta: number): void {
    state.quickSwitcherSelectionIndex = movePaletteSelection(
      els.quickSwitcherResults,
      state.quickSwitcherSelectionIndex,
      delta
    );
  }

  function moveDocumentSelection(delta: number): void {
    state.documentSelectionIndex = movePaletteSelection(els.documentsResults, state.documentSelectionIndex, delta);
  }

  function triggerSearchSelection() {
    triggerPaletteSelection(els.globalSearchResults, state.searchSelectionIndex);
  }

  function triggerCommandSelection() {
    triggerPaletteSelection(els.commandPaletteResults, state.commandSelectionIndex);
  }

  function triggerQuickSwitcherSelection() {
    triggerPaletteSelection(els.quickSwitcherResults, state.quickSwitcherSelectionIndex);
  }

  function triggerDocumentSelection() {
    triggerPaletteSelection(els.documentsResults, state.documentSelectionIndex);
  }

  function setCommandPaletteOpen(open: boolean): void {
    if (open) {
      els.searchModalShell.classList.add("hidden");
      els.quickSwitcherModalShell.classList.add("hidden");
      els.documentsModalShell.classList.add("hidden");
      els.helpModalShell.classList.add("hidden");
    }
    setPaletteOpen(els.commandModalShell, els.commandPaletteInput, open);
  }

  function closeCommandPalette() {
    setCommandPaletteOpen(false);
  }

  function setQuickSwitcherOpen(open: boolean): void {
    if (open) {
      els.searchModalShell.classList.add("hidden");
      els.commandModalShell.classList.add("hidden");
      els.documentsModalShell.classList.add("hidden");
      els.helpModalShell.classList.add("hidden");
    }
    setPaletteOpen(els.quickSwitcherModalShell, els.quickSwitcherInput, open);
  }

  function closeQuickSwitcher() {
    setQuickSwitcherOpen(false);
  }

  function setDocumentsOpen(open: boolean): void {
    if (open) {
      els.searchModalShell.classList.add("hidden");
      els.commandModalShell.classList.add("hidden");
      els.quickSwitcherModalShell.classList.add("hidden");
      els.helpModalShell.classList.add("hidden");
    }
    setPaletteOpen(els.documentsModalShell, els.documentsInput, open);
  }

  function closeDocumentsModal() {
    setDocumentsOpen(false);
  }

  function setHelpOpen(open: boolean): void {
    if (open) {
      els.searchModalShell.classList.add("hidden");
      els.commandModalShell.classList.add("hidden");
      els.quickSwitcherModalShell.classList.add("hidden");
      els.documentsModalShell.classList.add("hidden");
      els.helpModalShell.classList.remove("hidden");
      window.requestAnimationFrame(function () {
        focusWithoutScroll(els.closeHelpModal);
      });
      return;
    }
    els.helpModalShell.classList.add("hidden");
  }

  function closeHelpModal() {
    setHelpOpen(false);
  }

  function setSettingsOpen(open: boolean): void {
    if (open) {
      els.searchModalShell.classList.add("hidden");
      els.commandModalShell.classList.add("hidden");
      els.quickSwitcherModalShell.classList.add("hidden");
      els.documentsModalShell.classList.add("hidden");
      els.helpModalShell.classList.add("hidden");
      els.settingsModalShell.classList.remove("hidden");
      renderSettingsForm();
      window.requestAnimationFrame(function () {
        focusWithoutScroll(els.settingsVaultPath);
      });
      return;
    }
    els.settingsModalShell.classList.add("hidden");
  }

  function closeSettingsModal() {
    setSettingsOpen(false);
  }

  function collectSettingsForm(): SettingsModel {
    return {
      workspace: {
        vaultPath: String(els.settingsVaultPath.value || "").trim(),
        homePage: normalizePageDraftPath(els.settingsHomePage.value || ""),
      },
      preferences: {
        ui: {
          fontFamily: String(els.settingsFontFamily.value || "mono").trim() as "mono" | "sans" | "serif",
          fontSize: String(els.settingsFontSize.value || "16").trim(),
        },
        hotkeys: {
          quickSwitcher: String(els.settingsQuickSwitcher.value || "").trim(),
          globalSearch: String(els.settingsGlobalSearch.value || "").trim(),
          commandPalette: String(els.settingsCommandPalette.value || "").trim(),
          help: String(els.settingsHelp.value || "").trim(),
          saveCurrentPage: String(els.settingsSaveCurrentPage.value || "").trim(),
          toggleRawMode: String(els.settingsToggleRawMode.value || "").trim(),
        },
      },
    };
  }

  async function persistSettings() {
    els.settingsStatus.textContent = "Saving settings…";
    try {
      const snapshot = await fetchJSON<SettingsResponse>("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(collectSettingsForm()),
      });
      setSettingsSnapshot(snapshot);
      await loadMeta();
      if (state.selectedPage || state.selectedSavedQuery) {
        syncURLState(true);
      }
      els.settingsStatus.textContent = snapshot.restartRequired
        ? "Saved. Restart the server to apply the new vault path."
        : "Settings saved.";
    } catch (error) {
      els.settingsStatus.textContent = errorMessage(error);
    }
  }

  function renderGlobalSearchResults(payload: SearchPayload): void {
    state.searchSelectionIndex = renderGlobalSearchResultsUI({
      container: els.globalSearchResults,
      payload: payload,
      onClose: closeSearchModal,
      onOpenPage: function (pagePath) {
        navigateToPage(pagePath, false);
      },
      onOpenPageAtLine: function (pagePath, lineNumber) {
        navigateToPageAtLine(pagePath, lineNumber, false);
      },
      onOpenPageAtTask: function (pagePath, taskRef, lineNumber) {
        navigateToPageAtTask(pagePath, taskRef, lineNumber, false);
      },
      onOpenSavedQuery: function (name) {
        state.selectedSavedQuery = name;
        state.selectedPage = "";
        syncURLState(false);
        renderPages();
        renderSavedQueryTree();
        loadSavedQueryDetail(name);
      },
    });
    if (state.searchSelectionIndex >= 0) {
      updateSearchSelection();
    }

    if (els.searchModalShell && !els.searchModalShell.classList.contains("hidden") && els.globalSearchInput) {
      window.requestAnimationFrame(function () {
        if (document.activeElement !== els.globalSearchInput) {
          els.globalSearchInput.focus({preventScroll: true});
        }
      });
    }
  }

  async function runGlobalSearch() {
    if (!els.globalSearchInput || !els.globalSearchResults) {
      return;
    }
    const query = els.globalSearchInput.value.trim();
    if (!query) {
      renderEmpty(els.globalSearchResults, "Type to search pages, tasks, and saved queries.");
      return;
    }
    els.globalSearchResults.textContent = "Searching…";
    try {
      const payload = await fetchJSON<SearchPayload>("/api/search?q=" + encodeURIComponent(query));
      renderGlobalSearchResults(payload);
    } catch (error) {
      els.globalSearchResults.textContent = errorMessage(error);
    }
  }

  function renderQuickSwitcherResults() {
    state.quickSwitcherSelectionIndex = renderQuickSwitcherResultsUI({
      container: els.quickSwitcherResults,
      inputValue: els.quickSwitcherInput ? els.quickSwitcherInput.value : "",
      pages: state.pages,
      selectedPage: state.selectedPage,
      onClose: closeQuickSwitcher,
      onOpenPage: function (pagePath) {
        navigateToPage(pagePath, false);
      },
      onCreatePage: function (pagePath) {
        createPage(pagePath).catch(function (error) {
          setNoteStatus("Create page failed: " + errorMessage(error));
        });
      },
    });
    if (state.quickSwitcherSelectionIndex >= 0) {
      updateQuickSwitcherSelection();
    }

    if (els.quickSwitcherModalShell && !els.quickSwitcherModalShell.classList.contains("hidden") && els.quickSwitcherInput) {
      window.requestAnimationFrame(function () {
        if (document.activeElement !== els.quickSwitcherInput) {
          els.quickSwitcherInput.focus({preventScroll: true});
        }
      });
    }
  }

  function handleDocumentSelection(document: DocumentRecord): void {
    closeDocumentsModal();
    if (state.selectedPage && state.currentPage) {
      insertTextAtEditorSelection(markdownLinkForDocument(document, state.selectedPage));
      setNoteStatus("Inserted document link for " + document.name + ".");
      return;
    }
    window.open(document.downloadURL, "_blank", "noopener");
  }

  async function copyCodeBlock(code: string): Promise<void> {
    const value = String(code || "");
    if (!value) {
      setNoteStatus("Code block is empty.");
      return;
    }
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
      setNoteStatus("Copied code block.");
      return;
    }
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    textarea.style.pointerEvents = "none";
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand("copy");
      setNoteStatus("Copied code block.");
    } finally {
      document.body.removeChild(textarea);
    }
  }

  function renderDocumentResults() {
    state.documentSelectionIndex = renderDocumentsResultsUI({
      container: els.documentsResults,
      inputValue: els.documentsInput ? els.documentsInput.value : "",
      documents: state.documents,
      onSelectDocument: handleDocumentSelection,
    });
    if (state.documentSelectionIndex >= 0) {
      updateDocumentSelection();
    }

    if (els.documentsModalShell && !els.documentsModalShell.classList.contains("hidden") && els.documentsInput) {
      window.requestAnimationFrame(function () {
        if (document.activeElement !== els.documentsInput) {
          els.documentsInput.focus({preventScroll: true});
        }
      });
    }
  }

  async function loadDocuments() {
    const query = String(els.documentsInput ? els.documentsInput.value : "").trim();
    if (els.documentsResults) {
      els.documentsResults.textContent = "Loading…";
    }
    try {
      const payload = await fetchJSON<DocumentListResponse>("/api/documents" + (query ? ("?q=" + encodeURIComponent(query)) : ""));
      state.documents = Array.isArray(payload.documents) ? payload.documents : [];
      renderDocumentResults();
    } catch (error) {
      if (els.documentsResults) {
        els.documentsResults.textContent = errorMessage(error);
      }
    }
  }

  function scheduleQuickSwitcherRefresh() {
    window.clearTimeout(state.quickSwitcherTimer ?? undefined);
    state.quickSwitcherTimer = window.setTimeout(renderQuickSwitcherResults, 50);
  }

  function scheduleDocumentsRefresh() {
    window.clearTimeout(state.documentTimer ?? undefined);
    state.documentTimer = window.setTimeout(loadDocuments, 80);
  }

  function scheduleGlobalSearch() {
    window.clearTimeout(state.searchTimer ?? undefined);
    state.searchTimer = window.setTimeout(runGlobalSearch, 120);
  }

  async function createPage(pagePath: string): Promise<void> {
    const normalized = normalizePageDraftPath(pagePath);
    if (!normalized) {
      return;
    }

    const leaf = pageTitleFromPath(normalized);
    const initialMarkdown = leaf ? "# " + leaf + "\n" : "";

    await fetchJSON<unknown>("/api/pages/" + encodePath(normalized), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rawMarkdown: initialMarkdown }),
    });

    await loadPages();
    navigateToPage(normalized, false);
  }

  async function uploadDocument(file: File): Promise<DocumentRecord> {
    const formData = new FormData();
    formData.append("file", file);
    if (state.selectedPage) {
      formData.append("page", state.selectedPage);
    }
    const response = await fetch("/api/documents", {
      method: "POST",
      body: formData,
    });
    if (!response.ok) {
      throw new Error(await response.text() || "Upload failed");
    }
    const document = await response.json() as DocumentRecord;
    state.documents = [document].concat(state.documents.filter(function (item) {
      return item.id !== document.id;
    }));
    return document;
  }

  async function uploadDroppedFiles(fileList: FileList | null): Promise<void> {
    if (!fileList || !fileList.length) {
      return;
    }
    if (!state.selectedPage || !state.currentPage) {
      setNoteStatus("Open a note before uploading documents.");
      return;
    }

    const documents: DocumentRecord[] = [];
    setNoteStatus("Uploading " + String(fileList.length) + " document" + (fileList.length === 1 ? "" : "s") + "…");
    for (let index = 0; index < fileList.length; index += 1) {
      const file = fileList[index];
      if (!file) {
        continue;
      }
      // eslint-disable-next-line no-await-in-loop
      const document = await uploadDocument(file);
      documents.push(document);
    }
    if (!documents.length) {
      return;
    }
    insertTextAtEditorSelection(documents.map(function (document) {
      return markdownLinkForDocument(document, state.selectedPage);
    }).join("\n"));
    setNoteStatus("Uploaded " + String(documents.length) + " document" + (documents.length === 1 ? "" : "s") + ".");
  }

  async function deletePage(pagePath: string): Promise<void> {
    const normalized = normalizePageDraftPath(pagePath);
    if (!normalized) {
      return;
    }

    if (!window.confirm('Delete page "' + normalized + '"?')) {
      return;
    }

    await fetchJSON<unknown>("/api/pages/" + encodePath(normalized), {
      method: "DELETE",
    });

    if (currentHomePage().toLowerCase() === normalized.toLowerCase()) {
      clearHomePage();
    }
    if (state.selectedPage === normalized) {
      clearPageSelection();
    }
    await loadPages();
  }

  async function deleteFolder(folderKey: string): Promise<void> {
    const normalized = normalizePageDraftPath(folderKey);
    if (!normalized) {
      return;
    }
    const pageCount = state.pages.filter(function (page) {
      const path = String(page.path || "");
      return path === normalized || path.startsWith(normalized + "/");
    }).length;
    if (!window.confirm('Delete folder "' + normalized + '" and everything inside it?\n\n' + String(pageCount) + " note(s) will be removed.")) {
      return;
    }
    await fetchJSON<unknown>("/api/folders/" + encodePath(normalized), {
      method: "DELETE",
    });
    if (state.selectedPage && (state.selectedPage === normalized || state.selectedPage.startsWith(normalized + "/"))) {
      clearPageSelection();
    }
    if (currentHomePage().toLowerCase() === normalized.toLowerCase() || currentHomePage().startsWith(normalized.toLowerCase() + "/")) {
      clearHomePage();
    }
    await loadPages();
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

  function remapExpandedFolderKeys(fromPrefix: string, toPrefix: string): void {
    const next: Record<string, boolean> = {};
    Object.keys(state.expandedPageFolders).forEach(function (key) {
      if (!state.expandedPageFolders[key]) {
        return;
      }
      const remapped = remapPathPrefix(key, fromPrefix, toPrefix);
      next[remapped || key] = true;
    });
    state.expandedPageFolders = next;
  }

  async function movePage(pagePath: string, targetPage: string): Promise<void> {
    const fromPath = normalizePageDraftPath(pagePath);
    const toPath = normalizePageDraftPath(targetPage);
    if (!fromPath || !toPath || fromPath === toPath) {
      return;
    }

    const payload = await fetchJSON<{ page: string }>("/api/pages/" + encodePath(fromPath) + "/move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetPage: toPath }),
    });

    if (currentHomePage().toLowerCase() === fromPath.toLowerCase()) {
      setHomePage(toPath);
    }
    await loadPages();
    navigateToPage(payload.page || toPath, false);
  }

  async function movePageToFolder(pagePath: string, folderKey: string): Promise<void> {
    const fromPath = normalizePageDraftPath(pagePath);
    if (!fromPath) {
      return;
    }
    const leaf = pageTitleFromPath(fromPath);
    const targetFolder = normalizePageDraftPath(folderKey);
    const toPath = targetFolder ? (targetFolder + "/" + leaf) : leaf;
    await movePage(fromPath, toPath);
  }

  async function moveFolder(folderKey: string, targetFolder: string): Promise<void> {
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

    const payload = await fetchJSON<{ folder?: string }>("/api/folders/" + encodePath(sourceFolder) + "/move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetFolder: destinationParent }),
    });
    const movedFolder = normalizePageDraftPath(payload.folder || destinationFolder);
    const movedSelectedPage = state.selectedPage ? remapPathPrefix(state.selectedPage, sourceFolder, movedFolder) : "";
    const movedHomePage = currentHomePage() ? remapPathPrefix(currentHomePage(), sourceFolder, movedFolder) : "";

    remapExpandedFolderKeys(sourceFolder, movedFolder);
    if (movedHomePage) {
      setHomePage(movedHomePage);
    }

    await loadPages();
    if (movedSelectedPage && movedSelectedPage !== state.selectedPage) {
      navigateToPage(movedSelectedPage, false);
      return;
    }
    renderPages();
  }

  function renderCommandPaletteResults() {
    state.commandSelectionIndex = renderCommandPaletteResultsUI({
      container: els.commandPaletteResults,
      inputValue: els.commandPaletteInput ? els.commandPaletteInput.value : "",
      selectedPage: state.selectedPage,
      sourceOpen: state.sourceOpen,
      railOpen: state.railOpen,
      currentHomePage: currentHomePage(),
      hotkeys: state.settings.preferences.hotkeys,
      onToggleSource: function () {
        setSourceOpen(!state.sourceOpen);
      },
      onOpenHelp: function () {
        closeCommandPalette();
        setHelpOpen(true);
      },
      onOpenSettings: function () {
        closeCommandPalette();
        setSettingsOpen(true);
      },
      onOpenDocuments: function () {
        closeCommandPalette();
        setDocumentsOpen(true);
        scheduleDocumentsRefresh();
      },
      onOpenQuickSwitcher: function () {
        closeCommandPalette();
        setQuickSwitcherOpen(true);
        renderQuickSwitcherResults();
      },
      onOpenSearch: function () {
        closeCommandPalette();
        setSearchOpen(true);
        scheduleGlobalSearch();
      },
      onFocusRail: function (tab) {
        closeCommandPalette();
        setRailTab(tab);
        if (window.matchMedia("(max-width: 1180px)").matches) {
          setRailOpen(true);
        }
      },
      onToggleRail: function () {
        closeCommandPalette();
        setRailOpen(!state.railOpen);
      },
      onOpenHomePage: function (pagePath) {
        closeCommandPalette();
        navigateToPage(pagePath, false);
      },
      onSetHomePage: function (pagePath) {
        setHomePage(pagePath);
        closeCommandPalette();
        renderCommandPaletteResults();
        setNoteStatus("Home page set to " + pagePath + ".");
      },
      onDeletePage: function (pagePath) {
        closeCommandPalette();
        deletePage(pagePath).catch(function (error) {
          setNoteStatus("Delete page failed: " + errorMessage(error));
        });
      },
      onClearHomePage: function () {
        clearHomePage();
        closeCommandPalette();
        renderCommandPaletteResults();
        setNoteStatus("Home page cleared.");
      },
    });
    if (state.commandSelectionIndex >= 0) {
      updateCommandSelection();
    }

    if (els.commandModalShell && !els.commandModalShell.classList.contains("hidden") && els.commandPaletteInput) {
      window.requestAnimationFrame(function () {
        if (document.activeElement !== els.commandPaletteInput) {
          els.commandPaletteInput.focus({preventScroll: true});
        }
      });
    }
  }

  function scheduleCommandPaletteRefresh() {
    window.clearTimeout(state.commandTimer ?? undefined);
    state.commandTimer = window.setTimeout(renderCommandPaletteResults, 50);
  }

  function setSourceOpen(open: boolean): void {
    const nextOpen = Boolean(open);
    if (state.sourceOpen === nextOpen) {
      return;
    }
    const scrollTop = markdownEditorScrollTop(state, els);
    const selectionStart = markdownEditorSelectionStart(state, els);
    const selectionEnd = markdownEditorSelectionEnd(state, els);
    state.sourceOpen = nextOpen;
    markdownEditorSetRenderMode(state, !state.sourceOpen);
    if (els.pageProperties) {
      els.pageProperties.classList.toggle("hidden", state.sourceOpen);
    }
    if (els.propertyActions) {
      els.propertyActions.classList.toggle("hidden", state.sourceOpen);
    }
    if (els.markdownEditor) {
      els.markdownEditor.classList.add("hidden");
    }
    if (state.markdownEditorApi && state.markdownEditorApi.host) {
      state.markdownEditorApi.host.classList.remove("hidden");
    }
    renderSourceModeButton();
    window.setTimeout(function () {
      focusMarkdownEditor(state, els, {preventScroll: true});
      setMarkdownEditorSelection(state, els, selectionStart, selectionEnd);
      setMarkdownEditorScrollTop(state, els, scrollTop);
    }, 0);
  }

  function setDebugOpen(open: boolean): void {
    state.debugOpen = Boolean(open);
    els.debugDrawer.classList.toggle("hidden", !state.debugOpen);
    if (els.toggleDebug) {
      els.toggleDebug.classList.toggle("active", state.debugOpen);
    }
  }

  function setRailOpen(open: boolean): void {
    state.railOpen = Boolean(open);
    const mobileLayout = window.matchMedia("(max-width: 1180px)").matches;
    if (els.rail) {
      els.rail.classList.toggle("open", state.railOpen);
    }
    if (els.workspace) {
      els.workspace.classList.toggle("rail-collapsed", !mobileLayout && !state.railOpen);
    }
    if (els.toggleRail) {
      els.toggleRail.classList.toggle("active", state.railOpen);
    }
  }

  function setRailTab(tab: string): void {
    state.railTab = ["files", "context", "tasks", "tags"].indexOf(tab) >= 0 ? tab : "files";
    if (els.railTabFiles) {
      els.railTabFiles.classList.toggle("active", state.railTab === "files");
    }
    if (els.railTabContext) {
      els.railTabContext.classList.toggle("active", state.railTab === "context");
    }
    if (els.railTabTasks) {
      els.railTabTasks.classList.toggle("active", state.railTab === "tasks");
    }
    if (els.railTabTags) {
      els.railTabTags.classList.toggle("active", state.railTab === "tags");
    }
    if (els.railPanelFiles) {
      els.railPanelFiles.classList.toggle("hidden", state.railTab !== "files");
    }
    if (els.railPanelContext) {
      els.railPanelContext.classList.toggle("hidden", state.railTab !== "context");
    }
    if (els.railPanelTasks) {
      els.railPanelTasks.classList.toggle("hidden", state.railTab !== "tasks");
    }
    if (els.railPanelTags) {
      els.railPanelTags.classList.toggle("hidden", state.railTab !== "tags");
    }
  }

  async function saveCurrentTask() {
    if (!state.currentTask) {
      return;
    }

    const payload = buildTaskSavePayload(
      els.taskText.value,
      els.taskState.value,
      els.taskDue.value,
      els.taskRemind.value,
      els.taskWho.value,
      serializeDateTimeValue
    );

    els.taskModalMeta.textContent = "Saving task…";
    try {
      await saveTask(state.currentTask.ref, payload);
      closeTaskModal();
      await Promise.all([state.selectedPage ? loadPageDetail(state.selectedPage, true) : Promise.resolve()]);
    } catch (error) {
      els.taskModalMeta.textContent = "Save failed: " + errorMessage(error);
    }
  }

  async function saveCurrentPage() {
    if (!state.selectedPage || !state.currentPage) {
      return;
    }
    if (!hasUnsavedPageChanges()) {
      clearAutosaveTimer();
      return;
    }

    clearAutosaveTimer();
    const markdownToSave = state.currentMarkdown;

    setNoteStatus("Saving " + state.selectedPage + "...");
    try {
      const payload = await savePageMarkdown(state.selectedPage, markdownToSave, encodePath);
      state.currentPage = payload;
      state.originalMarkdown = payload.rawMarkdown || markdownToSave;
      if (state.currentMarkdown === markdownToSave) {
        state.currentMarkdown = payload.rawMarkdown || markdownToSave;
      }
      setNoteStatus("Saved " + state.selectedPage + ".");
      await loadPages();
      if (!markdownEditorHasFocus(state, els)) {
        await loadPageDetail(state.selectedPage, true);
      }
    } catch (error) {
      setNoteStatus("Save failed: " + errorMessage(error));
      if (hasUnsavedPageChanges()) {
        scheduleAutosave();
      }
    }
  }

  function connectEvents() {
    if (state.eventSource) {
      state.eventSource.close();
    }

    const source = new EventSource("/api/events");
    state.eventSource = source;

    const markLive = function (label: string, live: boolean): void {
      els.eventStatus.textContent = label;
      els.eventStatus.classList.toggle("live", live);
    };

    source.onopen = function () {
      markLive("live", true);
      addEventLine("sse.open", { ok: true }, false);
    };

    source.onerror = function () {
      markLive("reconnecting", false);
      addEventLine("sse.error", { reconnecting: true }, true);
    };

    [
      "page.changed",
      "page.deleted",
      "derived.changed",
      "task.changed",
      "query.changed",
      "query-block.changed",
    ].forEach(function (eventName) {
      source.addEventListener(eventName, function (event: Event) {
        let payload: Record<string, unknown> = {};
        const messageEvent = event as MessageEvent<string>;
        try {
          payload = JSON.parse(messageEvent.data);
        } catch (error) {
          payload = { raw: messageEvent.data };
        }
        addEventLine(eventName, payload, false);
        debounceRefresh();
      });
    });
  }

  function wireEvents() {
    function isTypingTarget(target: EventTarget | null): boolean {
      const element = target instanceof Element ? target : null;
      if (!element) {
        return false;
      }
      return Boolean(element.closest("input, textarea, select, [contenteditable='true'], .cm-editor, .cm-content"));
    }

    on(els.pageSearch, "input", loadPages);
    on(els.pageSearch, "blur", function () {
      if (!els.pageSearch.value.trim()) {
        setPageSearchOpen(false);
      }
    });
    on(els.querySearch, "input", loadSavedQueryTree);
    on(els.reloadPages, "click", loadPages);
    on(els.reloadQueries, "click", loadSavedQueryTree);
    on(els.addProperty, "click", startAddProperty);
    on(els.toggleRail, "click", function () {
      setRailOpen(!state.railOpen);
    });
    on(els.togglePageSearch, "click", function () {
      setPageSearchOpen(els.pageSearchShell.classList.contains("hidden"));
    });
    on(els.openSessionMenu, "click", function () {
      const nextOpen = els.sessionMenuPanel.classList.contains("hidden");
      setSessionMenuOpen(nextOpen);
    });
    on(els.openHelp, "click", function () {
      setSessionMenuOpen(false);
      setHelpOpen(true);
    });
    on(els.openSettings, "click", function () {
      setSessionMenuOpen(false);
      setSettingsOpen(true);
    });
    on(els.openQuickSwitcher, "click", function () {
      setSessionMenuOpen(false);
      setQuickSwitcherOpen(true);
      renderQuickSwitcherResults();
    });
    on(els.openDocuments, "click", function () {
      setSessionMenuOpen(false);
      setDocumentsOpen(true);
      scheduleDocumentsRefresh();
    });
    on(els.openSearch, "click", function () {
      setSessionMenuOpen(false);
      setSearchOpen(true);
      scheduleGlobalSearch();
    });
    on(els.historyBack, "click", function () {
      window.history.back();
    });
    on(els.historyForward, "click", function () {
      window.history.forward();
    });
    on(els.toggleSourceMode, "click", function () {
      if (!state.selectedPage) {
        return;
      }
      setSourceOpen(!state.sourceOpen);
    });
    on(els.closeCommandModal, "click", closeCommandPalette);
    on(els.commandPaletteInput, "input", scheduleCommandPaletteRefresh);
    on(els.closeQuickSwitcherModal, "click", closeQuickSwitcher);
    on(els.quickSwitcherInput, "input", scheduleQuickSwitcherRefresh);
    on(els.closeDocumentsModal, "click", closeDocumentsModal);
    on(els.documentsInput, "input", scheduleDocumentsRefresh);
    on(els.railTabFiles, "click", function () {
      setRailTab("files");
    });
    on(els.railTabContext, "click", function () {
      setRailTab("context");
    });
    on(els.railTabTasks, "click", function () {
      setRailTab("tasks");
    });
    on(els.railTabTags, "click", function () {
      setRailTab("tags");
    });
    on(els.toggleDebug, "click", function () {
      setDebugOpen(!state.debugOpen);
    });
    on(els.loadSelectedQuery, "click", loadSelectedQueryIntoEditor);
    on(els.formatQuery, "click", formatQueryText);
    on(els.runQuery, "click", runQueryWorkbench);
    on(els.noteSurface, "dragenter", function (event) {
      event.preventDefault();
      els.noteSurface.classList.add("drop-active");
    });
    on(els.noteSurface, "dragover", function (event) {
      event.preventDefault();
      els.noteSurface.classList.add("drop-active");
    });
    on(els.noteSurface, "dragleave", function (event) {
      const dragEvent = event as DragEvent;
      const related = dragEvent.relatedTarget instanceof Node ? dragEvent.relatedTarget : null;
      if (related && els.noteSurface.contains(related)) {
        return;
      }
      els.noteSurface.classList.remove("drop-active");
    });
    on(els.noteSurface, "drop", function (event) {
      const dragEvent = event as DragEvent;
      dragEvent.preventDefault();
      els.noteSurface.classList.remove("drop-active");
      uploadDroppedFiles(dragEvent.dataTransfer ? dragEvent.dataTransfer.files : null).catch(function (error) {
        setNoteStatus("Upload failed: " + errorMessage(error));
      });
    });
    on(els.markdownEditor, "input", function () {
      state.currentMarkdown = els.markdownEditor.value;
      window.requestAnimationFrame(function () {
        const rawContext = currentRawLineContext(state, els);
        const slashAnchor = state.markdownEditorApi && state.markdownEditorApi.host ? state.markdownEditorApi.host : els.markdownEditor;
        const caretRect = markdownEditorCaretRect(state);
        const menuContext = {
          type: "raw",
          left: caretRect ? Math.max(0, caretRect.left) : undefined,
          top: caretRect ? Math.max(0, caretRect.bottom + 6) : undefined,
        };
        const wikilinkCommands = wikilinkCommandsForContext(rawContext.lineText, rawContext.caretInLine, state.pages);
        const documentCommands = documentCommandsForText(rawContext.lineText, state.documents, state.selectedPage);
        if (wikilinkCommands.length) {
          openSlashMenuWithCommands(state, els, slashAnchor, wikilinkCommands, menuContext, applySlashSelection);
        } else if (documentCommands.length) {
          openSlashMenuWithCommands(state, els, slashAnchor, documentCommands, menuContext, applySlashSelection);
        } else {
          maybeOpenSlashMenu(state, els, slashAnchor, rawContext.lineText, menuContext, applySlashSelection);
        }
      });
      if (state.currentPage) {
        els.rawView.textContent = state.currentMarkdown;
        refreshLivePageChrome();
      }
      if (state.currentPage) {
        setNoteStatus("Unsaved local edits on " + state.selectedPage + ".");
        scheduleAutosave();
      }
    });
    const handleMarkdownEditorKeydown: EventListener = function (rawEvent): void {
      const event = rawEvent as KeyboardEvent;
      if (event.key === "Enter" && event.shiftKey) {
        const rawContext = currentRawLineContext(state, els);
        const link = wikiLinkAtCaret(rawContext.lineText, rawContext.caretInLine);
        if (link && link.target) {
          event.preventDefault();
          closeSlashMenu(state, els);
          openOrCreatePage(link.target, false);
          return;
        }
      }
      if (event.key === "Escape" && state.slashOpen) {
        closeSlashMenu(state, els);
        event.preventDefault();
        return;
      }
      if (event.key === "ArrowUp" && state.slashOpen) {
        event.preventDefault();
        moveSlashSelection(state, els, -1);
        return;
      }
      if (event.key === "ArrowDown" && state.slashOpen) {
        event.preventDefault();
        moveSlashSelection(state, els, 1);
        return;
      }
      if ((event.key === "Enter" || event.key === "Tab") && state.slashOpen) {
        event.preventDefault();
        applySlashSelection();
        return;
      }
    };
    on(els.markdownEditor, "keydown", handleMarkdownEditorKeydown);
    if (state.markdownEditorApi) {
      state.markdownEditorApi.onKeydown(handleMarkdownEditorKeydown);
    }
    on(els.closeTaskModal, "click", closeTaskModal);
    on(els.cancelTask, "click", closeTaskModal);
    on(els.saveTask, "click", saveCurrentTask);
    on(els.closeSearchModal, "click", closeSearchModal);
    on(els.globalSearchInput, "input", scheduleGlobalSearch);
    on(els.globalSearchInput, "keydown", function (rawEvent) {
      const event = rawEvent as KeyboardEvent;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        moveSearchSelection(1);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        moveSearchSelection(-1);
        return;
      }
      if (event.key === "Enter") {
        const buttons = searchResultButtons();
        if (buttons.length && state.searchSelectionIndex >= 0) {
          event.preventDefault();
          triggerSearchSelection();
        }
      }
    });
    on(els.commandPaletteInput, "keydown", function (rawEvent) {
      const event = rawEvent as KeyboardEvent;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        moveCommandSelection(1);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        moveCommandSelection(-1);
        return;
      }
      if (event.key === "Enter") {
        const buttons = commandResultButtons();
        if (buttons.length && state.commandSelectionIndex >= 0) {
          event.preventDefault();
          triggerCommandSelection();
        }
      }
    });
    on(els.quickSwitcherInput, "keydown", function (rawEvent) {
      const event = rawEvent as KeyboardEvent;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        moveQuickSwitcherSelection(1);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        moveQuickSwitcherSelection(-1);
        return;
      }
      if (event.key === "Enter") {
        const buttons = quickSwitcherResultButtons();
        if (buttons.length && state.quickSwitcherSelectionIndex >= 0) {
          event.preventDefault();
          triggerQuickSwitcherSelection();
        }
      }
    });
    on(els.documentsInput, "keydown", function (rawEvent) {
      const event = rawEvent as KeyboardEvent;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        moveDocumentSelection(1);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        moveDocumentSelection(-1);
        return;
      }
      if (event.key === "Enter") {
        const buttons = documentResultButtons();
        if (buttons.length && state.documentSelectionIndex >= 0) {
          event.preventDefault();
          triggerDocumentSelection();
        }
      }
    });
    on(els.taskModalShell, "click", function (event) {
      if (event.target === els.taskModalShell) {
        closeTaskModal();
      }
    });
    on(els.searchModalShell, "click", function (event) {
      if (event.target === els.searchModalShell) {
        closeSearchModal();
      }
    });
    on(els.commandModalShell, "click", function (event) {
      if (event.target === els.commandModalShell) {
        closeCommandPalette();
      }
    });
    on(els.quickSwitcherModalShell, "click", function (event) {
      if (event.target === els.quickSwitcherModalShell) {
        closeQuickSwitcher();
      }
    });
    on(els.documentsModalShell, "click", function (event) {
      if (event.target === els.documentsModalShell) {
        closeDocumentsModal();
      }
    });
    on(els.closeHelpModal, "click", closeHelpModal);
    on(els.helpModalShell, "click", function (event) {
      if (event.target === els.helpModalShell) {
        closeHelpModal();
      }
    });
    on(els.closeSettingsModal, "click", closeSettingsModal);
    on(els.cancelSettings, "click", closeSettingsModal);
    on(els.saveSettings, "click", function () {
      persistSettings().catch(function (error) {
        els.settingsStatus.textContent = errorMessage(error);
      });
    });
    on(els.settingsModalShell, "click", function (event) {
      if (event.target === els.settingsModalShell) {
        closeSettingsModal();
      }
    });
    document.addEventListener("mousedown", function (event) {
      const target = event.target instanceof Element ? event.target : null;
      const withinProperties = target ? target.closest("#page-properties") || target.closest("#add-property") : null;
      if (!withinProperties) {
        dismissPropertyUI();
      }
      if (!target || !target.closest("#session-menu")) {
        setSessionMenuOpen(false);
      }
      if (!target || !target.closest("#slash-menu")) {
        closeSlashMenu(state, els);
      }
      if (state.railOpen && els.rail && els.toggleRail) {
        const withinRail = target ? target.closest("#rail") || target.closest("#toggle-rail") : null;
        if (!withinRail && window.matchMedia("(max-width: 1180px)").matches) {
          setRailOpen(false);
        }
      }
    });
    window.addEventListener("keydown", function (event: KeyboardEvent) {
      if (event.key === "Escape" && !els.sessionMenuPanel.classList.contains("hidden")) {
        setSessionMenuOpen(false);
        return;
      }
      if (!event.ctrlKey && !event.metaKey && !event.shiftKey && event.altKey && event.key === "ArrowLeft") {
        event.preventDefault();
        window.history.back();
        return;
      }
      if (!event.ctrlKey && !event.metaKey && !event.shiftKey && event.altKey && event.key === "ArrowRight") {
        event.preventDefault();
        window.history.forward();
        return;
      }
      if (event.key === "Escape" && !els.taskModalShell.classList.contains("hidden")) {
        closeTaskModal();
        return;
      }
      if (event.key === "Escape" && els.searchModalShell && !els.searchModalShell.classList.contains("hidden")) {
        closeSearchModal();
        return;
      }
      if (event.key === "Escape" && els.commandModalShell && !els.commandModalShell.classList.contains("hidden")) {
        closeCommandPalette();
        return;
      }
      if (event.key === "Escape" && els.quickSwitcherModalShell && !els.quickSwitcherModalShell.classList.contains("hidden")) {
        closeQuickSwitcher();
        return;
      }
      if (event.key === "Escape" && els.documentsModalShell && !els.documentsModalShell.classList.contains("hidden")) {
        closeDocumentsModal();
        return;
      }
      if (event.key === "Escape" && els.helpModalShell && !els.helpModalShell.classList.contains("hidden")) {
        closeHelpModal();
        return;
      }
      if (event.key === "Escape" && els.settingsModalShell && !els.settingsModalShell.classList.contains("hidden")) {
        closeSettingsModal();
        return;
      }
      if (event.key === "Escape" && (state.propertyDraft || state.propertyTypeMenuKey)) {
        dismissPropertyUI();
        const active = document.activeElement as HTMLElement | null;
        if (active && typeof active.blur === "function") {
          active.blur();
        }
        event.preventDefault();
        return;
      }
      if (matchesHotkey(state.settings.preferences.hotkeys.saveCurrentPage, event) && state.selectedPage) {
        event.preventDefault();
        saveCurrentPage();
        return;
      }
      if (matchesHotkey(state.settings.preferences.hotkeys.toggleRawMode, event) && state.selectedPage) {
        event.preventDefault();
        setSourceOpen(!state.sourceOpen);
        return;
      }
      if (matchesHotkey(state.settings.preferences.hotkeys.quickSwitcher, event)) {
        event.preventDefault();
        setQuickSwitcherOpen(true);
        renderQuickSwitcherResults();
        return;
      }
      if (matchesHotkey(state.settings.preferences.hotkeys.globalSearch, event)) {
        event.preventDefault();
        setSearchOpen(true);
        scheduleGlobalSearch();
        return;
      }
      if (matchesHotkey(state.settings.preferences.hotkeys.commandPalette, event)) {
        event.preventDefault();
        setCommandPaletteOpen(true);
        renderCommandPaletteResults();
        return;
      }
      if (matchesHotkey(state.settings.preferences.hotkeys.help, event) && !isTypingTarget(event.target)) {
        event.preventDefault();
        setHelpOpen(true);
        return;
      }
    });
    window.addEventListener("blur", function () {
      state.windowBlurred = true;
      captureEditorFocusSpec(state, els);
    });
    window.addEventListener("focus", function () {
      state.windowBlurred = false;
      restoreEditorFocus(state, els, state.selectedPage);
    });
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) {
        state.windowBlurred = true;
        captureEditorFocusSpec(state, els);
        return;
      }
      state.windowBlurred = false;
      restoreEditorFocus(state, els, state.selectedPage);
    });
    window.addEventListener("popstate", function () {
      applyURLState();
    });
  }

  async function boot() {
    if (window.NoteriousCodeEditor && els.markdownEditor) {
      state.markdownEditorApi = window.NoteriousCodeEditor.create(els.markdownEditor);
      const markdownEditorApi = state.markdownEditorApi;
      if (!markdownEditorApi) {
        return;
      }
      on(markdownEditorApi.host, "click", function (event) {
        const eventTarget = event.target instanceof Element ? event.target : null;
        if (eventTarget && eventTarget.closest("[data-page-link]")) {
          event.preventDefault();
          return;
        }
      });
      on(markdownEditorApi.host, "noterious:page-link", function (event) {
        const detail = (event as CustomEvent<PageLinkDetail>).detail || {};
        const page = detail.page ? String(detail.page) : "";
        const line = detail.line ? Number(detail.line) : 0;
        const taskRef = detail.taskRef ? String(detail.taskRef) : "";
        if (page) {
          if (taskRef) {
            navigateToPageAtTask(page, taskRef, line, false);
            return;
          }
          if (line > 0) {
            navigateToPageAtLine(page, line, false);
            return;
          }
          openOrCreatePage(page, false);
        }
      });
      on(markdownEditorApi.host, "noterious:document-download", function (event) {
        const detail = (event as CustomEvent<DocumentDownloadDetail>).detail || {};
        const href = detail.href ? String(detail.href) : "";
        if (!href) {
          return;
        }
        window.location.href = href;
      });
      on(markdownEditorApi.host, "noterious:code-copy", function (event) {
        const detail = (event as CustomEvent<CodeCopyDetail>).detail || {};
        copyCodeBlock(detail.code ? String(detail.code) : "").catch(function (error) {
          setNoteStatus("Copy failed: " + errorMessage(error));
        });
      });
      on(markdownEditorApi.host, "noterious:task-toggle", function (event) {
        const detail = (event as CustomEvent<TaskToggleDetail>).detail || {};
        const bodyLineNumber = Number(detail.lineNumber) || 0;
        if (!state.currentPage || !state.currentPage.tasks || !bodyLineNumber) {
          return;
        }
        const split = splitFrontmatter(state.currentMarkdown);
        const frontmatterLineCount = split.frontmatter ? split.frontmatter.split("\n").length - 1 : 0;
        const rawLineNumber = frontmatterLineCount + bodyLineNumber;
        const task = state.currentPage.tasks.find(function (item) {
          return Number(item.line) === rawLineNumber;
        });
        if (task) {
          toggleTaskDone(task);
        }
      });
      on(markdownEditorApi.host, "noterious:task-open", function (event) {
        const detail = (event as CustomEvent<TaskOpenDetail>).detail || {};
        const ref = detail.ref ? String(detail.ref) : "";
        const task = ref ? findCurrentTask(ref) : null;
        if (task) {
          openTaskModal(task);
        }
      });
    }
    setDebugOpen(false);
    setRailTab("files");
    setRailOpen(!window.matchMedia("(max-width: 1180px)").matches);
    setPageSearchOpen(false);
    setSourceOpen(false);
    applyUIPreferences();
    renderNoteStudio();
    renderPageTasks([]);
    renderPageContext();
    renderPageProperties();
    renderHelpShortcuts();
    renderSettingsForm();
    wireEvents();
    await Promise.all([loadSettings(), loadMeta(), loadPages(), loadSavedQueryTree(), loadDocuments()]);
    applyURLState();
    connectEvents();
  }

  boot();
})();
