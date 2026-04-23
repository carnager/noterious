import { normalizePageDraftPath, pageTitleFromPath, renderCommandPaletteResults as renderCommandPaletteResultsUI } from "./commands";
import {
  buildTaskSavePayload,
  loadPageDetailData,
  loadSavedQueryDetailData,
  savePageMarkdown,
  saveTask,
  toggleTaskDone as toggleTaskDoneRequest,
} from "./details";
import { clearNode, optionalElement, optionalQuery, renderEmpty, requiredElement } from "./dom";
import {
  blockingOverlayOpen,
  captureEditorFocusSpec,
  currentRawLineContext,
  focusMarkdownEditor,
  markdownEditorCaretRect,
  markdownEditorHasFocus,
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
import { applyURLState as applyURLStateUI, buildSelectionURL, navigateToPageSelection } from "./routing";
import { renderGlobalSearchResults as renderGlobalSearchResultsUI } from "./search";
import { closeSlashMenu, maybeOpenSlashMenu, moveSlashSelection } from "./slashMenu";
import type {
  BacklinkRecord,
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
  SearchPayload,
  SlashMenuContext,
  TaskRecord,
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
  tasks: TaskRecord[];
  queryTree: SavedQueryTreeFolder[];
  selectedSavedQueryPayload: SavedQueryRecord | null;
  eventSource: EventSource | null;
  refreshTimer: number | null;
  autosaveTimer: number | null;
  searchTimer: number | null;
  commandTimer: number | null;
  searchSelectionIndex: number;
  commandSelectionIndex: number;
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
  const HOME_PAGE_STORAGE_KEY = "noterious.homePage";

  const state: AppState = {
    selectedPage: "",
    selectedSavedQuery: "",
    pages: [],
    tasks: [],
    queryTree: [],
    selectedSavedQueryPayload: null,
    eventSource: null,
    refreshTimer: null,
    autosaveTimer: null,
    searchTimer: null,
    commandTimer: null,
    searchSelectionIndex: -1,
    commandSelectionIndex: -1,
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
    noteStatus: requiredElement<HTMLElement>("note-status"),
    markdownEditor: requiredElement<HTMLTextAreaElement>("markdown-editor"),
    structuredView: requiredElement<HTMLElement>("structured-view"),
    derivedView: requiredElement<HTMLElement>("derived-view"),
    rawView: requiredElement<HTMLElement>("raw-view"),
    queryEditor: requiredElement<HTMLTextAreaElement>("query-editor"),
    queryOutput: requiredElement<HTMLElement>("query-output"),
    eventStatus: requiredElement<HTMLElement>("event-status"),
    eventLog: requiredElement<HTMLDivElement>("event-log"),
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
    toggleRail: requiredElement<HTMLButtonElement>("toggle-rail"),
    openSearch: requiredElement<HTMLButtonElement>("open-search"),
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

  function getStoredHomePage() {
    try {
      return normalizePageDraftPath(window.localStorage.getItem(HOME_PAGE_STORAGE_KEY) || "");
    } catch (_error) {
      return "";
    }
  }

  function writeStoredHomePage(pagePath: string): void {
    const normalized = normalizePageDraftPath(pagePath);
    try {
      if (normalized) {
        window.localStorage.setItem(HOME_PAGE_STORAGE_KEY, normalized);
      } else {
        window.localStorage.removeItem(HOME_PAGE_STORAGE_KEY);
      }
    } catch (_error) {
      // ignore storage failures
    }
  }

  function setHomePage(pagePath: string): void {
    const normalized = normalizePageDraftPath(pagePath);
    state.homePage = normalized;
    writeStoredHomePage(normalized);
  }

  function clearHomePage() {
    state.homePage = normalizePageDraftPath(state.configHomePage || "");
    writeStoredHomePage("");
  }

  function currentHomePage() {
    return normalizePageDraftPath(state.homePage || state.configHomePage || "");
  }

  function syncURLState(replace: boolean) {
    const url = buildSelectionURL(window.location.href, state.selectedPage, state.selectedSavedQuery);
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
    const caret = rawContext.lineStart + updated.length;
    focusMarkdownEditor(state, els, {preventScroll: true});
    setMarkdownEditorSelection(state, els, caret, caret);
    setMarkdownEditorScrollTop(state, els, scrollTop);

    closeSlashMenu(state, els);
    return true;
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
      setNoteStatus("Select a page to edit and preview markdown.");
      return;
    }

    setMarkdownEditorValue(state, els, state.currentMarkdown);
    if (state.markdownEditorApi && state.markdownEditorApi.host) {
      state.markdownEditorApi.host.classList.remove("hidden");
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

  async function loadMeta() {
    try {
      const meta = await fetchJSON<MetaResponse>("/api/meta");
      state.configHomePage = normalizePageDraftPath(meta.homePage || "");
      state.homePage = getStoredHomePage() || state.configHomePage;
      setMetaPills([
        "Listening " + meta.listenAddr,
        "Vault " + meta.vaultPath,
        "DB " + meta.database,
        "Time " + meta.serverTime,
      ]);
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
    }
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
      }
    );
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

  function updateSearchSelection() {
    updatePaletteSelection(els.globalSearchResults, state.searchSelectionIndex);
  }

  function updateCommandSelection() {
    updatePaletteSelection(els.commandPaletteResults, state.commandSelectionIndex);
  }

  function moveSearchSelection(delta: number): void {
    state.searchSelectionIndex = movePaletteSelection(els.globalSearchResults, state.searchSelectionIndex, delta);
  }

  function moveCommandSelection(delta: number): void {
    state.commandSelectionIndex = movePaletteSelection(els.commandPaletteResults, state.commandSelectionIndex, delta);
  }

  function triggerSearchSelection() {
    triggerPaletteSelection(els.globalSearchResults, state.searchSelectionIndex);
  }

  function triggerCommandSelection() {
    triggerPaletteSelection(els.commandPaletteResults, state.commandSelectionIndex);
  }

  function setCommandPaletteOpen(open: boolean): void {
    setPaletteOpen(els.commandModalShell, els.commandPaletteInput, open);
  }

  function closeCommandPalette() {
    setCommandPaletteOpen(false);
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

  function renderCommandPaletteResults() {
    state.commandSelectionIndex = renderCommandPaletteResultsUI({
      container: els.commandPaletteResults,
      inputValue: els.commandPaletteInput ? els.commandPaletteInput.value : "",
      pages: state.pages,
      selectedPage: state.selectedPage,
      sourceOpen: state.sourceOpen,
      railOpen: state.railOpen,
      currentHomePage: currentHomePage(),
      onToggleSource: function () {
        setSourceOpen(!state.sourceOpen);
      },
      onOpenSearch: function () {
        setSearchOpen(true);
        scheduleGlobalSearch();
      },
      onFocusRail: function (tab) {
        setRailTab(tab);
        if (window.matchMedia("(max-width: 1180px)").matches) {
          setRailOpen(true);
        }
      },
      onToggleRail: function () {
        setRailOpen(!state.railOpen);
      },
      onOpenHomePage: function (pagePath) {
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
        setNoteStatus(state.configHomePage ? "Home page reset to configured default." : "Home page cleared.");
      },
      onMovePage: function (pagePath, targetPage) {
        closeCommandPalette();
        movePage(pagePath, targetPage).catch(function (error) {
          setNoteStatus("Move page failed: " + errorMessage(error));
        });
      },
      onCreatePage: function (pagePath) {
        closeCommandPalette();
        createPage(pagePath).catch(function (error) {
          setNoteStatus("Create page failed: " + errorMessage(error));
        });
      },
      onOpenPage: function (pagePath) {
        closeCommandPalette();
        navigateToPage(pagePath, false);
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
    if (els.rail) {
      els.rail.classList.toggle("open", state.railOpen);
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
    on(els.pageSearch, "input", loadPages);
    on(els.querySearch, "input", loadSavedQueryTree);
    on(els.reloadPages, "click", loadPages);
    on(els.reloadQueries, "click", loadSavedQueryTree);
    on(els.addProperty, "click", startAddProperty);
    on(els.toggleRail, "click", function () {
      if (window.matchMedia("(max-width: 1180px)").matches) {
        setRailOpen(!state.railOpen);
      }
    });
    on(els.openSearch, "click", function () {
      setSearchOpen(true);
      scheduleGlobalSearch();
    });
    on(els.closeCommandModal, "click", closeCommandPalette);
    on(els.commandPaletteInput, "input", scheduleCommandPaletteRefresh);
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
    on(els.markdownEditor, "input", function () {
      state.currentMarkdown = els.markdownEditor.value;
      const rawContext = currentRawLineContext(state, els);
      const slashAnchor = state.markdownEditorApi && state.markdownEditorApi.host ? state.markdownEditorApi.host : els.markdownEditor;
      const caretRect = markdownEditorCaretRect(state);
      const noteRect = els.noteLayout ? els.noteLayout.getBoundingClientRect() : { left: 0, top: 0 };
      maybeOpenSlashMenu(state, els, slashAnchor, rawContext.lineText, {
        type: "raw",
        left: caretRect ? Math.max(0, caretRect.left - noteRect.left) : undefined,
        top: caretRect ? Math.max(0, caretRect.bottom - noteRect.top + 6) : undefined,
      }, applySlashSelection);
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
          navigateToPage(link.target, false);
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
      if (event.key === "Enter" && state.slashOpen) {
        event.preventDefault();
        applySlashSelection();
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
    document.addEventListener("mousedown", function (event) {
      const target = event.target instanceof Element ? event.target : null;
      const withinProperties = target ? target.closest("#page-properties") || target.closest("#add-property") : null;
      if (!withinProperties) {
        dismissPropertyUI();
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
      if (event.key === "Escape" && (state.propertyDraft || state.propertyTypeMenuKey)) {
        dismissPropertyUI();
        const active = document.activeElement as HTMLElement | null;
        if (active && typeof active.blur === "function") {
          active.blur();
        }
        event.preventDefault();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s" && state.selectedPage) {
        event.preventDefault();
        saveCurrentPage();
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "e" && state.selectedPage) {
        event.preventDefault();
        setSourceOpen(!state.sourceOpen);
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
        scheduleGlobalSearch();
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "/") {
        event.preventDefault();
        setCommandPaletteOpen(true);
        renderCommandPaletteResults();
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
        const target = eventTarget
          ? eventTarget.closest("[data-page-link]")
          : null;
        if (!target) {
          return;
        }
        event.preventDefault();
        const page = String(target.getAttribute("data-page-link") || "").trim();
        const line = String(target.getAttribute("data-page-line") || "").trim();
        const taskRef = String(target.getAttribute("data-task-ref") || "").trim();
        if (!page) {
          return;
        }
        if (taskRef) {
          navigateToPageAtTask(page, taskRef, Number(line), false);
          return;
        }
        if (line) {
          navigateToPageAtLine(page, Number(line), false);
          return;
        }
        navigateToPage(page, false);
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
          navigateToPage(page, false);
        }
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
    setRailOpen(false);
    setSourceOpen(false);
    renderNoteStudio();
    renderPageTasks([]);
    renderPageContext();
    renderPageProperties();
    wireEvents();
    await Promise.all([loadMeta(), loadPages(), loadSavedQueryTree()]);
    applyURLState();
    connectEvents();
  }

  boot();
})();
