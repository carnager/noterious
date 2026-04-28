import { normalizePageDraftPath, pageTitleFromPath } from "./commands";
import {
  cloneClientPreferences,
  defaultClientPreferences,
  loadStoredClientPreferences,
  normalizeClientPreferences,
  saveStoredClientPreferences,
} from "./clientPreferences";
import {
  deleteTask as deleteTaskRequest,
  loadPageDetailData,
  resolvePageTask,
  loadSavedQueryDetailData,
  savePageMarkdown,
  saveTask,
  toggleTaskDone as toggleTaskDoneRequest,
} from "./details";
import {
  formatDateTimeValue,
  formatTimeValue,
  setDateTimeDisplayFormat,
} from "./datetime";
import { clearNode, focusWithoutScroll, optionalElement, optionalQuery, renderEmpty, requiredElement } from "./dom";
import {
  blockingOverlayOpen,
  captureEditorFocusSpec,
  currentRawLineContext,
  focusMarkdownEditor,
  markdownEditorCaretRect,
  markdownEditorHasFocus,
  markdownEditorSetPagePath,
  markdownEditorSetDateTimeFormat,
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
import { fetchJSON, requireOK, scopedEventSourceURL, scopedRequestInit, setActiveScopePrefix } from "./http";
import {
  applyInlineTableEditor as applyInlineTableEditorUI,
  anchorInlineTableEditorToRenderedTable as anchorInlineTableEditorToRenderedTableUI,
  closeInlineTableEditor as closeInlineTableEditorUI,
  closeTaskPickers as closeTaskPickersUI,
  defaultTaskPickerState,
  inlineTableEditorHasFocus as inlineTableEditorHasFocusUI,
  inlineTableEditorOpen as inlineTableEditorOpenUI,
  openInlineTableEditor as openInlineTableEditorUI,
  openInlineTaskPicker as openInlineTaskPickerUI,
  positionInlineTableEditorPanel as positionInlineTableEditorPanelUI,
  renderInlineTableEditor as renderInlineTableEditorUI,
  renderTaskPicker as renderTaskPickerUI,
  restoreInlineTableEditorFocus as restoreInlineTableEditorFocusUI,
  setTaskDateApplySuppressed as setTaskDateApplySuppressedUI,
  type TableEditorState,
  type TaskPickerState,
} from "./inlineEditors";
import {
  bodyPositionFromRawOffset,
  editableBody,
  escapeHTML,
  findDerivedQueryBlock,
  findMarkdownTableBlockForLine,
  parseQueryFenceOptions,
  rawOffsetForBodyPosition,
  rawOffsetForLineNumber,
  renderInline,
  splitFrontmatter,
  wikiLinkAtCaret,
} from "./markdown";
import { canonicalizeHotkey, hotkeyDefinitions, hotkeyFromEvent, hotkeyLabel, matchesHotkey } from "./hotkeys";
import {
  historyDiffContent,
  renderPageHistory as renderPageHistoryUI,
  renderPageHistoryPreview as renderPageHistoryPreviewUI,
  renderTrash as renderTrashUI,
  selectedPageHistoryRevision as selectedPageHistoryRevisionUI,
  setPageHistoryOpen as setPageHistoryOpenUI,
  setTrashOpen as setTrashOpenUI,
} from "./historyTrashUi";
import { renderHelpShortcuts as renderHelpShortcutsUI } from "./helpUi";
import { currentPageView as buildCurrentPageView, renderedQueryBlocksForEditor, renderedTasksForEditor } from "./noteView";
import {
  createPage as createPageRequest,
  deleteFolder as deleteFolderRequest,
  deletePage as deletePageRequest,
  moveFolder as moveFolderRequest,
  movePage as movePageRequest,
  movePageToFolder as movePageToFolderRequest,
  renameFolder as renameFolderRequest,
  renamePage as renamePageRequest,
} from "./pageOperations";
import {
  documentLinkForSelection,
  movePaletteModalSelection,
  paletteModalButtons,
  renderCommandResults,
  renderDocumentResults as renderDocumentResultsUI,
  renderQuickSwitcherResults as renderQuickSwitcherResultsUI2,
  renderSearchEmptyState,
  renderSearchResults as renderSearchResultsUI2,
  setCommandPaletteOpen as setCommandPaletteOpenUI,
  setDocumentsOpen as setDocumentsOpenUI,
  setQuickSwitcherOpen as setQuickSwitcherOpenUI,
  setSearchOpen as setSearchOpenUI,
  triggerPaletteModalSelection,
  updatePaletteModalSelection,
} from "./paletteModals";
import {
  moveSelection as movePaletteSelection,
  resultButtons as paletteResultButtons,
  setPaletteOpen,
  triggerSelection as triggerPaletteSelection,
  updateSelection as updatePaletteSelection,
} from "./palette";
import {
  ensureExpandedPageAncestors,
  filterPagesByTag,
  type PageTreeMenuTarget,
  renderPageContext as renderPageContextUI,
  renderPageTags as renderPageTagsUI,
  renderPageTasks as renderPageTasksUI,
  type TaskPanelFilters,
} from "./pageViews";
import {
  closeTreeContextMenu as closeTreeContextMenuUI,
  openTreeContextMenu as openTreeContextMenuUI,
  renderPagesSection,
} from "./pageTreeUi";
import { prepareSettingsSave } from "./settingsPersistence";
import {
  applyPropertyDraftKind,
  coercePropertyValue,
  makePropertyDraft,
  propertyDraftValue,
  renderPageProperties as renderPagePropertiesUI,
} from "./properties";
import {
  allNoteTemplatesFromPages,
  buildMarkdownFromTemplate,
  buildPagePathFromTemplate,
  cloneNoteTemplates,
  coerceTemplateFieldDefaultValue,
  createBlankNoteTemplate,
  createBlankTemplateField,
  isTemplateMetadataKey,
  noteTemplatesFromPages,
  remainingTemplateFields,
  templateFieldKindHints,
  templateFieldsNeedingInput,
  templatePropertyKindHints,
} from "./noteTemplates";
import { renderSavedQueryTree as renderSavedQueryTreeUI } from "./queryTree";
import { applyURLState as applyURLStateUI, buildSelectionURL, navigateToPageSelection } from "./routing";
import {
  applyAuthSessionResponse,
  renderAuthGate as renderAuthGateUI,
  renderSessionState as renderSessionStateUI,
  setAuthGateOpen as setAuthGateOpenUI,
  setSessionMenuOpen as setSessionMenuOpenUI,
  setVaultSwitcherOpen as setVaultSwitcherOpenUI,
} from "./sessionUi";
import {
  defaultSettingsSection,
  renderSettingsForm as renderSettingsFormUI,
  renderSettingsHotkeyHints as renderSettingsHotkeyHintsUI,
} from "./settingsUi";
import { closeSlashMenu, documentCommandsForText, maybeOpenSlashMenu, moveSlashSelection, openSlashMenuWithCommands, wikilinkCommandsForContext } from "./slashMenu";
import {
  applyTheme,
  builtinThemeLibrary,
  defaultThemeId,
  loadStoredThemeCache,
  mergeThemeCache,
  mergedThemeLibrary,
  removeThemeFromCache,
  resolveTheme,
  saveStoredThemeCache,
  normalizeThemeListResponse,
} from "./themes";
import type {
  AppSettings as SettingsModel,
  AuthSessionResponse,
  AuthenticatedUser,
  BacklinkRecord,
  DocumentListResponse,
  DocumentRecord,
  DerivedPage,
  FrontmatterKind,
  FrontmatterValue,
  FocusRestoreSpec,
  MetaResponse,
  NoteriousEditorApi,
  NoteTemplate,
  NoteTemplateField,
  PageHistoryResponse,
  PageListResponse,
  PageRecord,
  PageRevisionRecord,
  PageSummary,
  PropertyDraft,
  QueryBlockRecord,
  QueryRow,
  Preferences as ClientPreferences,
  SavedQueryRecord,
  SavedQueryTreeFolder,
  SavedQueryTreeResponse,
  ServerSettings,
  SettingsResponse,
  SearchPayload,
  SlashMenuContext,
  TaskRecord,
  TaskListResponse,
  ThemeListResponse,
  ThemeRecord,
  TrashListResponse,
  TrashPageRecord,
  UserSettingsResponse,
  VaultListResponse,
  VaultRecord,
  VaultSettings,
} from "./types";
import type { PropertyRow } from "./properties";
import type { AuthGateMode } from "./sessionUi";
import type { SettingsSection } from "./settingsUi";

interface PageLinkDetail {
  page?: string;
  line?: number | string;
  taskRef?: string;
}

interface TaskToggleDetail {
  lineNumber?: number | string;
  ref?: string;
}

interface TaskDateEditDetail {
  ref?: string;
  field?: string;
  left?: number;
  top?: number;
}

interface TaskDeleteDetail {
  ref?: string;
}

interface TableCellChangeDetail {
  line?: number | string;
  col?: number | string;
  value?: string;
}

interface TableCommandDetail {
  startLine?: number | string;
}

interface TableCellTabDetail extends TableCellChangeDetail {
  backward?: boolean;
}

interface TableOpenDetail {
  startLine?: number | string;
  row?: number | string;
  col?: number | string;
  left?: number | string;
  top?: number | string;
  width?: number | string;
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
  pageTagFilter: string;
  editingPropertyKey: string;
  propertyTypeMenuKey: string;
  propertyDraft: PropertyDraft | null;
  propertyDraftFocusTarget: "key" | "value";
  templateFillSession: TemplateFillSession | null;
  editingBlockKey: string;
  pendingBlockFocusKey: string;
  pendingEditSeed: string;
  debugOpen: boolean;
  railOpen: boolean;
  railTab: string;
  sourceOpen: boolean;
  settings: SettingsModel;
  appliedVault: VaultSettings;
  settingsRestartRequired: boolean;
  settingsLoaded: boolean;
  userSettingsLoaded: boolean;
  homePage: string;
  topLevelFoldersAsVaults: boolean;
  themeLibraryLoaded: boolean;
  themeLibrary: ThemeRecord[];
  savedThemeId: string;
  previewThemeId: string;
  themeCache: Record<string, ThemeRecord>;
  settingsTemplateDrafts: NoteTemplate[];
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
  renamingPageTitle: boolean;
  taskFilters: TaskPanelFilters;
  tableEditor: TableEditorState | null;
  pageHistory: PageRevisionRecord[];
  selectedHistoryRevisionId: string;
  historyShowChanges: boolean;
  trashPages: TrashPageRecord[];
  authenticated: boolean;
  currentUser: AuthenticatedUser | null;
  rootVault: VaultRecord | null;
  currentVault: VaultRecord | null;
  availableVaults: VaultRecord[];
  vaultSwitchPending: boolean;
  vaultSwitcherOpen: boolean;
  mustChangePassword: boolean;
  setupRequired: boolean;
  authGateMode: AuthGateMode;
  settingsSection: SettingsSection;
  remoteChangePage: string;
  remoteChangeHasLocalEdits: boolean;
  expectedLocalChangePage: string;
  expectedLocalChangeCount: number;
  expectedLocalChangeUntil: number;
}

interface TemplateFillSession {
  pagePath: string;
  fields: NoteTemplateField[];
}

interface TreeContextMenuState {
  target: PageTreeMenuTarget | null;
  left: number;
  top: number;
}

(function () {
  let pwaRegistrationPromise: Promise<void> | null = null;

  function registerPWA(): Promise<void> {
    if (pwaRegistrationPromise) {
      return pwaRegistrationPromise;
    }
    const localHost =
      window.location.hostname === "localhost"
      || window.location.hostname === "127.0.0.1"
      || window.location.hostname === "[::1]";
    if (!("serviceWorker" in navigator) || (window.location.protocol !== "https:" && !localHost)) {
      pwaRegistrationPromise = Promise.resolve();
      return pwaRegistrationPromise;
    }
    pwaRegistrationPromise = navigator.serviceWorker.register("/sw.js").then(function () {
      return;
    }).catch(function (error) {
      console.warn("PWA registration failed", error);
    });
    return pwaRegistrationPromise;
  }

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
    pageTagFilter: "",
    editingPropertyKey: "",
    propertyTypeMenuKey: "",
    propertyDraft: null,
    propertyDraftFocusTarget: "value",
    templateFillSession: null,
    editingBlockKey: "",
    pendingBlockFocusKey: "",
    pendingEditSeed: "",
    debugOpen: false,
    railOpen: false,
    railTab: "files",
    sourceOpen: false,
    settings: {
      preferences: cloneClientPreferences(defaultClientPreferences()),
      vault: {
        vaultPath: "./vault",
      },
      notifications: {
        ntfyInterval: "1m",
      },
      userNotifications: {
        ntfyTopicUrl: "",
        ntfyToken: "",
      },
    },
    appliedVault: {
      vaultPath: "./vault",
    },
    settingsRestartRequired: false,
    settingsLoaded: false,
    userSettingsLoaded: false,
    homePage: "",
    topLevelFoldersAsVaults: false,
    themeLibraryLoaded: false,
    themeLibrary: builtinThemeLibrary(),
    savedThemeId: defaultThemeId,
    previewThemeId: defaultThemeId,
    themeCache: {},
    settingsTemplateDrafts: cloneNoteTemplates(defaultClientPreferences().templates),
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
    renamingPageTitle: false,
    taskFilters: {
      currentPage: false,
      notDone: false,
      hasDue: false,
      hasReminder: false,
    } as TaskPanelFilters,
    tableEditor: null,
    pageHistory: [],
    selectedHistoryRevisionId: "",
    historyShowChanges: false,
    trashPages: [],
    authenticated: false,
    currentUser: null,
    rootVault: null,
    currentVault: null,
    availableVaults: [],
    vaultSwitchPending: false,
    vaultSwitcherOpen: false,
    mustChangePassword: false,
    setupRequired: false,
    authGateMode: "login",
    settingsSection: "appearance",
    remoteChangePage: "",
    remoteChangeHasLocalEdits: false,
    expectedLocalChangePage: "",
    expectedLocalChangeCount: 0,
    expectedLocalChangeUntil: 0,
  };

  const els = {
    appShell: optionalQuery<HTMLElement>(".shell"),
    authShell: requiredElement<HTMLElement>("auth-shell"),
    authForm: requiredElement<HTMLFormElement>("auth-form"),
    authEyebrow: requiredElement<HTMLElement>("auth-eyebrow"),
    authTitle: requiredElement<HTMLElement>("auth-title"),
    authCopy: requiredElement<HTMLElement>("auth-copy"),
    authIdentity: requiredElement<HTMLElement>("auth-identity"),
    authUsernameRow: requiredElement<HTMLElement>("auth-username-row"),
    authUsername: requiredElement<HTMLInputElement>("auth-username"),
    authPasswordRow: requiredElement<HTMLElement>("auth-password-row"),
    authPassword: requiredElement<HTMLInputElement>("auth-password"),
    authSetupConfirmRow: requiredElement<HTMLElement>("auth-setup-confirm-row"),
    authSetupConfirm: requiredElement<HTMLInputElement>("auth-setup-confirm"),
    authChangeFields: requiredElement<HTMLElement>("auth-change-fields"),
    authCurrentPassword: requiredElement<HTMLInputElement>("auth-current-password"),
    authNewPassword: requiredElement<HTMLInputElement>("auth-new-password"),
    authConfirmPassword: requiredElement<HTMLInputElement>("auth-confirm-password"),
    authSubmit: requiredElement<HTMLButtonElement>("auth-submit"),
    authStatus: requiredElement<HTMLElement>("auth-status"),
    vaultHealthBanner: requiredElement<HTMLElement>("vault-health-banner"),
    vaultHealthTitle: requiredElement<HTMLElement>("vault-health-title"),
    vaultHealthMessage: requiredElement<HTMLElement>("vault-health-message"),
    metaStrip: optionalElement<HTMLDivElement>("meta-strip"),
    pageSearch: requiredElement<HTMLInputElement>("page-search"),
    pageSearchShell: requiredElement<HTMLElement>("page-search-shell"),
    togglePageSearch: requiredElement<HTMLButtonElement>("toggle-page-search"),
    pageList: requiredElement<HTMLDivElement>("page-list"),
    pageTaskList: requiredElement<HTMLDivElement>("page-task-list"),
    taskFilters: requiredElement<HTMLDivElement>("task-filters"),
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
    noteHeading: requiredElement<HTMLInputElement>("note-heading"),
    toggleSourceMode: requiredElement<HTMLButtonElement>("toggle-source-mode"),
    noteStatus: requiredElement<HTMLElement>("note-status"),
    remoteChangeToast: requiredElement<HTMLElement>("remote-change-toast"),
    remoteChangeMessage: requiredElement<HTMLElement>("remote-change-message"),
    remoteChangeReload: requiredElement<HTMLButtonElement>("remote-change-reload"),
    remoteChangeDismiss: requiredElement<HTMLButtonElement>("remote-change-dismiss"),
    treeContextMenu: requiredElement<HTMLDivElement>("tree-context-menu"),
    markdownEditor: requiredElement<HTMLTextAreaElement>("markdown-editor"),
    structuredView: requiredElement<HTMLElement>("structured-view"),
    derivedView: requiredElement<HTMLElement>("derived-view"),
    rawView: requiredElement<HTMLElement>("raw-view"),
    queryEditor: requiredElement<HTMLTextAreaElement>("query-editor"),
    queryOutput: requiredElement<HTMLElement>("query-output"),
    eventStatus: requiredElement<HTMLElement>("event-status"),
    eventLog: requiredElement<HTMLDivElement>("event-log"),
    appLayout: optionalQuery<HTMLElement>(".app-layout"),
    rail: requiredElement<HTMLElement>("rail"),
    railTabFiles: requiredElement<HTMLButtonElement>("rail-tab-files"),
    railTabContext: requiredElement<HTMLButtonElement>("rail-tab-context"),
    railTabTasks: requiredElement<HTMLButtonElement>("rail-tab-tasks"),
    railPanelFiles: requiredElement<HTMLElement>("rail-panel-files"),
    railPanelContext: requiredElement<HTMLElement>("rail-panel-context"),
    railPanelTasks: requiredElement<HTMLElement>("rail-panel-tasks"),
    noteLayout: requiredElement<HTMLElement>("note-layout"),
    noteSurface: requiredElement<HTMLElement>("note-surface"),
    inlineTablePanel: requiredElement<HTMLDivElement>("inline-table-panel"),
    toggleRail: requiredElement<HTMLButtonElement>("toggle-rail"),
    historyBack: requiredElement<HTMLButtonElement>("history-back"),
    historyForward: requiredElement<HTMLButtonElement>("history-forward"),
    openHomePage: requiredElement<HTMLButtonElement>("open-home-page"),
    openQuickSwitcher: requiredElement<HTMLButtonElement>("open-quick-switcher"),
    openDocuments: requiredElement<HTMLButtonElement>("open-documents"),
    openSearch: requiredElement<HTMLButtonElement>("open-search"),
    sessionMenu: requiredElement<HTMLElement>("session-menu"),
    sessionMenuPanel: requiredElement<HTMLElement>("session-menu-panel"),
    openSessionMenu: requiredElement<HTMLButtonElement>("open-session-menu"),
    sessionUser: requiredElement<HTMLElement>("session-user"),
    openTrash: requiredElement<HTMLButtonElement>("open-trash"),
    openHelp: requiredElement<HTMLButtonElement>("open-help"),
    openSettings: requiredElement<HTMLButtonElement>("open-settings"),
    logoutSession: requiredElement<HTMLButtonElement>("logout-session"),
    vaultSwitcher: requiredElement<HTMLElement>("vault-switcher"),
    openVaultSwitcher: requiredElement<HTMLButtonElement>("open-vault-switcher"),
    currentVaultName: requiredElement<HTMLElement>("current-vault-name"),
    vaultSwitcherPanel: requiredElement<HTMLElement>("vault-switcher-panel"),
    vaultSwitcherList: requiredElement<HTMLDivElement>("vault-switcher-list"),
    reloadPages: optionalElement<HTMLButtonElement>("reload-pages"),
    reloadQueries: optionalElement<HTMLButtonElement>("reload-queries"),
    toggleDebug: optionalElement<HTMLButtonElement>("toggle-debug"),
    debugDrawer: requiredElement<HTMLElement>("debug-drawer"),
    loadSelectedQuery: requiredElement<HTMLButtonElement>("load-selected-query"),
    formatQuery: requiredElement<HTMLButtonElement>("format-query"),
    runQuery: requiredElement<HTMLButtonElement>("run-query"),
    inlineTaskPicker: requiredElement<HTMLDivElement>("inline-task-picker"),
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
    pageHistoryButton: requiredElement<HTMLButtonElement>("open-page-history"),
    pageHistoryModalShell: requiredElement<HTMLElement>("page-history-modal-shell"),
    purgePageHistory: requiredElement<HTMLButtonElement>("purge-page-history"),
    closePageHistoryModal: requiredElement<HTMLButtonElement>("close-page-history-modal"),
    pageHistoryTitle: requiredElement<HTMLElement>("page-history-title"),
    pageHistoryResults: requiredElement<HTMLDivElement>("page-history-results"),
    pageHistoryPreview: requiredElement<HTMLElement>("page-history-preview"),
    pageHistoryShowChanges: requiredElement<HTMLInputElement>("page-history-show-changes"),
    copyPageHistory: requiredElement<HTMLButtonElement>("copy-page-history"),
    restorePageHistory: requiredElement<HTMLButtonElement>("restore-page-history"),
    trashModalShell: requiredElement<HTMLElement>("trash-modal-shell"),
    emptyTrash: requiredElement<HTMLButtonElement>("empty-trash"),
    closeTrashModal: requiredElement<HTMLButtonElement>("close-trash-modal"),
    trashResults: requiredElement<HTMLDivElement>("trash-results"),
    helpModalShell: requiredElement<HTMLElement>("help-modal-shell"),
    closeHelpModal: requiredElement<HTMLButtonElement>("close-help-modal"),
    helpShortcutCore: requiredElement<HTMLDivElement>("help-shortcuts-core"),
    helpShortcutEditor: requiredElement<HTMLDivElement>("help-shortcuts-editor"),
    settingsModalShell: requiredElement<HTMLElement>("settings-modal-shell"),
    closeSettingsModal: requiredElement<HTMLButtonElement>("close-settings-modal"),
    settingsEyebrow: requiredElement<HTMLElement>("settings-eyebrow"),
    settingsTitle: requiredElement<HTMLElement>("settings-title"),
    settingsNavAppearance: requiredElement<HTMLButtonElement>("settings-nav-appearance"),
    settingsNavTemplates: requiredElement<HTMLButtonElement>("settings-nav-templates"),
    settingsNavNotifications: requiredElement<HTMLButtonElement>("settings-nav-notifications"),
    settingsNavVault: requiredElement<HTMLButtonElement>("settings-nav-vault"),
    settingsGroupServer: requiredElement<HTMLElement>("settings-group-server"),
    settingsGroupSession: requiredElement<HTMLElement>("settings-group-session"),
    settingsGroupTemplates: requiredElement<HTMLElement>("settings-group-templates"),
    settingsGroupUserNotifications: requiredElement<HTMLElement>("settings-group-user-notifications"),
    cancelSettings: requiredElement<HTMLButtonElement>("cancel-settings"),
    saveSettings: requiredElement<HTMLButtonElement>("save-settings"),
    settingsVaultPath: requiredElement<HTMLInputElement>("settings-vault-path"),
    settingsNtfyInterval: requiredElement<HTMLInputElement>("settings-ntfy-interval"),
    settingsUserNtfyTopicUrl: requiredElement<HTMLInputElement>("settings-user-ntfy-topic-url"),
    settingsUserNtfyToken: requiredElement<HTMLInputElement>("settings-user-ntfy-token"),
    settingsUserTopLevelVaults: requiredElement<HTMLInputElement>("settings-user-top-level-vaults"),
    settingsTheme: requiredElement<HTMLSelectElement>("settings-ui-theme"),
    settingsThemeUpload: requiredElement<HTMLButtonElement>("settings-theme-upload"),
    settingsThemeDelete: requiredElement<HTMLButtonElement>("settings-theme-delete"),
    settingsThemeUploadInput: requiredElement<HTMLInputElement>("settings-theme-upload-input"),
    settingsThemeHelp: requiredElement<HTMLElement>("settings-theme-help"),
    settingsFontFamily: requiredElement<HTMLSelectElement>("settings-ui-font-family"),
    settingsFontSize: requiredElement<HTMLSelectElement>("settings-ui-font-size"),
    settingsDateTimeFormat: requiredElement<HTMLSelectElement>("settings-ui-date-time-format"),
    settingsQuickSwitcher: requiredElement<HTMLInputElement>("settings-hotkey-quick-switcher"),
    settingsGlobalSearch: requiredElement<HTMLInputElement>("settings-hotkey-global-search"),
    settingsCommandPalette: requiredElement<HTMLInputElement>("settings-hotkey-command-palette"),
    settingsQuickNote: requiredElement<HTMLInputElement>("settings-hotkey-quick-note"),
    settingsHelp: requiredElement<HTMLInputElement>("settings-hotkey-help"),
    settingsSaveCurrentPage: requiredElement<HTMLInputElement>("settings-hotkey-save-current-page"),
    settingsToggleRawMode: requiredElement<HTMLInputElement>("settings-hotkey-toggle-raw-mode"),
    settingsToggleTaskDone: requiredElement<HTMLInputElement>("settings-hotkey-toggle-task-done"),
    settingsTemplateList: requiredElement<HTMLDivElement>("settings-template-list"),
    settingsTemplateAdd: requiredElement<HTMLButtonElement>("settings-template-add"),
    settingsTemplateHelp: requiredElement<HTMLElement>("settings-template-help"),
    settingsStatus: requiredElement<HTMLElement>("settings-status"),
    slashMenu: requiredElement<HTMLElement>("slash-menu"),
    slashMenuResults: requiredElement<HTMLDivElement>("slash-menu-results"),
  };

  const taskPickerState: TaskPickerState = defaultTaskPickerState();

  const treeContextMenuState: TreeContextMenuState = {
    target: null,
    left: 0,
    top: 0,
  };

  function currentPickerTask(): TaskRecord | null {
    return taskPickerState.ref ? findCurrentTask(taskPickerState.ref) : null;
  }

  function setTaskDateApplySuppressed(active: boolean): void {
    setTaskDateApplySuppressedUI(state.markdownEditorApi, active);
  }

  async function saveTaskDateField(task: TaskRecord, field: "due" | "remind", value: string): Promise<void> {
    setTaskDateApplySuppressed(true);
    noteLocalPageChange(task.page || state.selectedPage || "");
    await saveTask(task.ref, {
      text: task.text || "",
      state: task.done ? "done" : "todo",
      due: field === "due" ? value : (task.due || ""),
      remind: field === "remind" ? value : (task.remind || ""),
      who: Array.isArray(task.who) ? task.who.slice() : [],
    });
    closeTaskPickers();
    await Promise.all([loadTasks(), state.selectedPage ? loadPageDetail(state.selectedPage, true, false) : Promise.resolve()]);
    restoreNoteFocus();
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(function () {
        setTaskDateApplySuppressed(false);
      });
    });
  }

  async function deleteTaskInline(ref: string): Promise<void> {
    const task = ref ? findCurrentTask(ref) : null;
    if (!task) {
      return;
    }
    if (!window.confirm('Delete task "' + (task.text || task.ref) + '"?')) {
      return;
    }
    noteLocalPageChange(task.page || state.selectedPage || "");
    await deleteTaskRequest(ref);
    closeTaskPickers();
    await Promise.all([loadTasks(), state.selectedPage ? loadPageDetail(state.selectedPage, true) : Promise.resolve()]);
  }

  function closeTaskPickers(): void {
    closeTaskPickersUI(taskPickerState, els);
  }

  function closeInlineTableEditor(): void {
    closeInlineTableEditorUI(state, els);
  }

  function inlineTableEditorHasFocus(): boolean {
    return inlineTableEditorHasFocusUI(els);
  }

  function inlineTableEditorOpen(): boolean {
    return inlineTableEditorOpenUI(state, els);
  }

  function positionInlineTableEditorPanel(): void {
    positionInlineTableEditorPanelUI(state, els);
  }

  function applyInlineTableEditor(closeAfter: boolean): void {
    applyInlineTableEditorUI(state, els, {
      closeAfter: closeAfter,
      refreshLivePageChrome: refreshLivePageChrome,
      scheduleAutosave: scheduleAutosave,
    });
    if (!closeAfter && state.tableEditor) {
      renderInlineTableEditor();
    }
  }

  function renderInlineTableEditor(): void {
    renderInlineTableEditorUI(state, els, {
      applyInlineTableEditor: applyInlineTableEditor,
      closeInlineTableEditor: closeInlineTableEditor,
    });
  }

  function openInlineTableEditor(startLineNumber: number, rowIndex: number, colIndex: number, anchor?: { left: number; top: number; width: number }): void {
    openInlineTableEditorUI(state, els, {
      startLineNumber: startLineNumber,
      rowIndex: rowIndex,
      colIndex: colIndex,
      anchor: anchor,
      renderInlineTableEditor: renderInlineTableEditor,
    });
  }

  function renderTaskPicker(): void {
    renderTaskPickerUI(taskPickerState, els, {
      currentPickerTask: currentPickerTask,
      saveTaskDateField: saveTaskDateField,
      closeTaskPickers: closeTaskPickers,
      setNoteStatus: setNoteStatus,
      errorMessage: errorMessage,
    });
  }

  function openInlineTaskPicker(ref: string, mode: "due" | "remind", left: number, top: number): void {
    openInlineTaskPickerUI(taskPickerState, {
      ref: ref,
      mode: mode,
      left: left,
      top: top,
      task: ref ? findCurrentTask(ref) : null,
      rememberNoteFocus: rememberNoteFocus,
      closeTaskPickers: closeTaskPickers,
      renderTaskPicker: renderTaskPicker,
    });
  }

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

  function renderVaultHealth(meta: MetaResponse | null): void {
    if (!meta || !meta.vaultHealth || meta.vaultHealth.healthy) {
      els.vaultHealthBanner.classList.add("hidden");
      els.vaultHealthTitle.textContent = "Vault Warning";
      els.vaultHealthMessage.textContent = "";
      return;
    }

    const reason = String(meta.vaultHealth.reason || "").toLowerCase();
    els.vaultHealthTitle.textContent = reason === "missing" ? "Vault Missing" : "Vault Unavailable";
    els.vaultHealthMessage.textContent = (meta.vaultHealth.message || "The configured vault is currently unavailable.")
      + " The app may only be showing previously indexed data until the vault becomes readable again.";
    els.vaultHealthBanner.classList.remove("hidden");
  }

  function nextDailyNotePath(): string {
    const now = new Date();
    return normalizePageDraftPath(
      "Inbox/" +
        [
          now.getFullYear(),
          String(now.getMonth() + 1).padStart(2, "0"),
          String(now.getDate()).padStart(2, "0"),
        ].join("-")
    );
  }

  function createDailyNote(): void {
    const pagePath = nextDailyNotePath();
    if (hasPage(pagePath)) {
      navigateToPage(pagePath, false);
      return;
    }
    createPage(pagePath).catch(function (error) {
      setNoteStatus("Daily note failed: " + errorMessage(error));
    });
  }

  function debounceRefresh() {
    window.clearTimeout(state.refreshTimer ?? undefined);
    state.refreshTimer = window.setTimeout(function () {
      loadPages();
      loadTasks();
      loadSavedQueryTree();
      if (!markdownEditorHasFocus(state, els)) {
        refreshCurrentDetail(false);
      }
    }, 250);
  }

  function clearRemoteChangeToast(): void {
    state.remoteChangePage = "";
    state.remoteChangeHasLocalEdits = false;
    els.remoteChangeToast.classList.add("hidden");
  }

  function noteLocalPageChange(pagePath: string): void {
    if (!pagePath) {
      return;
    }
    if (state.expectedLocalChangePage !== pagePath || Date.now() > state.expectedLocalChangeUntil) {
      state.expectedLocalChangePage = pagePath;
      state.expectedLocalChangeCount = 0;
    }
    state.expectedLocalChangeCount += 1;
    state.expectedLocalChangeUntil = Date.now() + 5000;
  }

  function consumeExpectedLocalPageChange(pagePath: string): boolean {
    if (!pagePath || state.expectedLocalChangePage !== pagePath || Date.now() > state.expectedLocalChangeUntil) {
      return false;
    }
    if (state.expectedLocalChangeCount <= 0) {
      return false;
    }
    state.expectedLocalChangeCount -= 1;
    if (state.expectedLocalChangeCount <= 0) {
      state.expectedLocalChangePage = "";
      state.expectedLocalChangeUntil = 0;
    }
    return true;
  }

  function showRemoteChangeToast(pagePath: string): void {
    state.remoteChangePage = pagePath;
    state.remoteChangeHasLocalEdits = hasUnsavedPageChanges();
    els.remoteChangeMessage.textContent = state.remoteChangeHasLocalEdits
      ? pagePath + " changed on another device. Reload will discard local edits."
      : pagePath + " changed on another device.";
    els.remoteChangeToast.classList.remove("hidden");
    setNoteStatus("Remote change detected for " + pagePath + ".");
  }

  function reloadRemoteChangedPage(): void {
    const pagePath = state.remoteChangePage || state.selectedPage;
    clearRemoteChangeToast();
    loadPages();
    loadTasks();
    loadSavedQueryTree();
    if (pagePath && state.selectedPage === pagePath) {
      refreshCurrentDetail(true);
    }
  }

  function shouldPromptForRemoteReload(eventName: string, payload: Record<string, unknown>): boolean {
    if (eventName !== "page.changed" || !state.selectedPage) {
      return false;
    }
    const eventPage = typeof payload.page === "string" ? payload.page : "";
    if (!eventPage || eventPage !== state.selectedPage) {
      return false;
    }
    if (consumeExpectedLocalPageChange(eventPage)) {
      return false;
    }
    return markdownEditorHasFocus(state, els) || inlineTableEditorHasFocus() || inlineTableEditorOpen();
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
    const scopePrefix = currentScopePrefix();
    state.homePage = normalized;
    if (scopePrefix) {
      state.settings.preferences.vaults.scopeHomePages[scopePrefix] = normalized;
    } else {
      state.settings.preferences.vaults.rootHomePage = normalized;
    }
    saveStoredClientPreferences(state.settings.preferences);
    renderHomeButton();
    if (!els.settingsModalShell.classList.contains("hidden")) {
      renderSettingsForm();
    }
  }

  function clearHomePage() {
    const scopePrefix = currentScopePrefix();
    state.homePage = "";
    if (scopePrefix) {
      delete state.settings.preferences.vaults.scopeHomePages[scopePrefix];
    } else {
      state.settings.preferences.vaults.rootHomePage = "";
    }
    saveStoredClientPreferences(state.settings.preferences);
    renderHomeButton();
    if (!els.settingsModalShell.classList.contains("hidden")) {
      renderSettingsForm();
    }
  }

  function currentHomePage() {
    return normalizePageDraftPath(state.homePage || "");
  }

  function syncHomePageForCurrentScope(): void {
    const scopePrefix = currentScopePrefix();
    if (scopePrefix) {
      state.homePage = normalizePageDraftPath(state.settings.preferences.vaults.scopeHomePages[scopePrefix] || "");
      return;
    }
    state.homePage = normalizePageDraftPath(state.settings.preferences.vaults.rootHomePage || "");
  }

  function renderHomeButton(): void {
    const homePage = currentHomePage();
    els.openHomePage.disabled = !homePage;
    els.openHomePage.title = homePage
      ? "Open home page: " + homePage
      : "No home page configured";
  }

  function setSessionMenuOpen(open: boolean): void {
    setSessionMenuOpenUI(state, els, open);
  }

  function renderSessionState(): void {
    renderSessionStateUI(state, els, function (vaultID) {
      switchVault(vaultID).catch(function (error) {
        setNoteStatus("Vault switch failed: " + errorMessage(error));
      });
    });
  }

  function setVaultSwitcherOpen(open: boolean): void {
    setVaultSwitcherOpenUI(state, els, open);
  }

  function renderAuthGate(): void {
    renderAuthGateUI(state, els);
  }

  function setAuthSession(session: AuthSessionResponse): void {
    applyAuthSessionResponse(state, session);
    state.rootVault = state.authenticated && session.vault
      ? session.vault
      : null;
    renderSessionState();
    renderAuthGate();
  }

  function setAuthGateOpen(open: boolean, status?: string): void {
    setAuthGateOpenUI(state, els, open, status);
  }

  async function loadSession() {
    return fetchJSON<AuthSessionResponse>("/api/auth/me", undefined, true);
  }

  async function login() {
    els.authStatus.textContent = "Signing in…";
    try {
      const loginPassword = els.authPassword.value;
      const session = await fetchJSON<AuthSessionResponse>("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: els.authUsername.value.trim(),
          password: els.authPassword.value,
        }),
      }, true);
      setAuthSession(session);
      els.authPassword.value = "";
      if (state.mustChangePassword) {
        els.authCurrentPassword.value = loginPassword;
        els.authNewPassword.value = "";
        els.authConfirmPassword.value = "";
        setAuthGateOpen(true, "Change your password to continue.");
        return;
      }
      setAuthGateOpen(false);
      window.location.reload();
    } catch (error) {
      els.authStatus.textContent = errorMessage(error);
    }
  }

  async function setupInitialAdmin() {
    const username = els.authUsername.value.trim();
    const password = els.authPassword.value;
    const confirmPassword = els.authSetupConfirm.value;

    if (!username) {
      els.authStatus.textContent = "Username is required.";
      return;
    }
    if (!password.trim()) {
      els.authStatus.textContent = "Password is required.";
      return;
    }
    if (password !== confirmPassword) {
      els.authStatus.textContent = "Passwords do not match.";
      return;
    }

    els.authStatus.textContent = "Setting up account…";
    try {
      const session = await fetchJSON<AuthSessionResponse>("/api/auth/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username,
          password: password,
        }),
      }, true);
      setAuthSession(session);
      els.authPassword.value = "";
      els.authSetupConfirm.value = "";
      setAuthGateOpen(false);
      window.location.reload();
    } catch (error) {
      els.authStatus.textContent = errorMessage(error);
    }
  }

  async function changePassword() {
    const currentPassword = els.authCurrentPassword.value;
    const newPassword = els.authNewPassword.value;
    const confirmPassword = els.authConfirmPassword.value;
    if (!currentPassword.trim()) {
      els.authStatus.textContent = "Current password is required.";
      return;
    }
    if (!newPassword.trim()) {
      els.authStatus.textContent = "New password is required.";
      return;
    }
    if (newPassword !== confirmPassword) {
      els.authStatus.textContent = "New passwords do not match.";
      return;
    }

    els.authStatus.textContent = "Updating password…";
    try {
      const session = await fetchJSON<AuthSessionResponse>("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: currentPassword,
          newPassword: newPassword,
        }),
      }, true);
      setAuthSession(session);
      els.authCurrentPassword.value = "";
      els.authNewPassword.value = "";
      els.authConfirmPassword.value = "";
      setAuthGateOpen(false);
      window.location.reload();
    } catch (error) {
      els.authStatus.textContent = errorMessage(error);
    }
  }

  async function logout() {
    try {
      await fetchJSON<unknown>("/api/auth/logout", { method: "POST" }, true);
    } catch (error) {
      setNoteStatus("Logout failed: " + errorMessage(error));
    }
    window.location.reload();
  }

  async function loadAuthenticatedApp() {
    await loadAvailableVaults().catch(function (error) {
      setNoteStatus("Vault list failed: " + errorMessage(error));
    });
    await Promise.all([
      loadThemes().catch(function (error) {
        state.themeLibraryLoaded = false;
        renderSettingsForm();
        setNoteStatus("Theme library failed: " + errorMessage(error));
      }),
      loadSettings(),
      loadUserSettings().catch(function (error) {
        setNoteStatus("User settings failed: " + errorMessage(error));
      }),
      loadMeta(),
      loadPages(),
      loadTasks(),
      loadSavedQueryTree(),
      loadDocuments(),
    ]);
    applyURLState();
    connectEvents();
  }

  function setVisibleVaultState(availableVaults: VaultRecord[], currentVault: VaultRecord | null): void {
    state.availableVaults = Array.isArray(availableVaults) ? availableVaults.slice() : [];
    if (currentVault) {
      state.currentVault = currentVault;
    } else if (!state.availableVaults.some(function (vaultRecord) {
      return Boolean(state.currentVault && vaultRecord.id === state.currentVault.id);
    })) {
      state.currentVault = state.availableVaults[0] || null;
    }
    setActiveScopePrefix(currentScopePrefix());
    syncHomePageForCurrentScope();
    state.vaultSwitchPending = false;
    state.vaultSwitcherOpen = false;
    renderSessionState();
    renderHomeButton();
    if (!els.settingsModalShell.classList.contains("hidden")) {
      renderSettingsForm();
    }
  }

  const scopeStorageKey = "noterious.scope-prefix";

  function loadStoredScopePrefix(): string {
    try {
      return normalizePageDraftPath(window.localStorage.getItem(scopeStorageKey) || "");
    } catch (_error) {
      return "";
    }
  }

  function storeScopePrefix(prefix: string): void {
    const normalized = normalizePageDraftPath(prefix);
    try {
      if (normalized) {
        window.localStorage.setItem(scopeStorageKey, normalized);
      } else {
        window.localStorage.removeItem(scopeStorageKey);
      }
    } catch (_error) {
      // Ignore storage failures and keep working with in-memory state.
    }
  }

  async function loadAvailableVaults(): Promise<void> {
    const rootVault = state.rootVault;
    const snapshot = await fetchJSON<VaultListResponse>("/api/user/vaults");
    const discoveredVaults = Array.isArray(snapshot.vaults) ? snapshot.vaults.slice() : [];
    const storedScopePrefix = loadStoredScopePrefix();
    if (!state.topLevelFoldersAsVaults) {
      storeScopePrefix("");
      setVisibleVaultState(rootVault ? [rootVault] : [], rootVault);
      return;
    }

    const desiredVault = discoveredVaults.find(function (vault: VaultRecord) {
      const relativePath = rootVault
        ? normalizePageDraftPath(normalizeVaultPath(vault.vaultPath).slice(normalizeVaultPath(rootVault.vaultPath).length + 1))
        : "";
      return relativePath === storedScopePrefix;
    }) || discoveredVaults[0] || rootVault;
    const visibleVaults = discoveredVaults.length > 0
      ? discoveredVaults
      : (rootVault ? [rootVault] : []);
    storeScopePrefix(rootVault && desiredVault ? scopePrefixForVaultSelection(rootVault, desiredVault) : "");
    setVisibleVaultState(visibleVaults, desiredVault);
  }

  async function switchVault(vaultID: number): Promise<void> {
    if (!Number.isFinite(vaultID) || vaultID <= 0) {
      return;
    }
    if (state.currentVault && vaultID === state.currentVault.id) {
      return;
    }
    state.vaultSwitchPending = true;
    renderSessionState();
    try {
      const nextVault = state.availableVaults.find(function (vault) {
        return vault.id === vaultID;
      }) || null;
      if (!nextVault) {
        throw new Error("Selected vault is unavailable.");
      }
      storeScopePrefix(state.rootVault ? scopePrefixForVaultSelection(state.rootVault, nextVault) : "");
      setActiveScopePrefix(state.rootVault ? scopePrefixForVaultSelection(state.rootVault, nextVault) : "");
      setVaultSwitcherOpen(false);
      setSessionMenuOpen(false);
      window.location.reload();
    } catch (error) {
      state.vaultSwitchPending = false;
      renderSessionState();
      setNoteStatus("Vault switch failed: " + errorMessage(error));
    }
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
        state.selectedPage = "";
        state.selectedSavedQuery = "";
        renderPages();
        renderSavedQueryTree();
        syncURLState(true);
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
        clearRemoteChangeToast();
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

  function normalizeVaultPath(path: string): string {
    return String(path || "").replace(/\\/g, "/").replace(/\/+$/, "").trim();
  }

  function scopePrefixForVaultSelection(rootVault: VaultRecord, selectedVault: VaultRecord): string {
    const rootPath = normalizeVaultPath(rootVault.vaultPath || "");
    const currentPath = normalizeVaultPath(selectedVault.vaultPath || "");
    if (!rootPath || !currentPath || rootPath === currentPath) {
      return "";
    }
    if (!currentPath.startsWith(rootPath + "/")) {
      return "";
    }
    return normalizePageDraftPath(currentPath.slice(rootPath.length + 1)) || "";
  }

  function currentScopePrefix(): string {
    if (!state.topLevelFoldersAsVaults || !state.rootVault || !state.currentVault) {
      return "";
    }
    const rootPath = normalizeVaultPath(state.rootVault.vaultPath || "");
    const currentPath = normalizeVaultPath(state.currentVault.vaultPath || "");
    if (!rootPath || !currentPath || rootPath === currentPath) {
      return "";
    }
    if (!currentPath.startsWith(rootPath + "/")) {
      return "";
    }
    return normalizePageDraftPath(currentPath.slice(rootPath.length + 1)) || "";
  }

  function applyCurrentScopePrefix(pagePath: string): string {
    const normalized = normalizePageDraftPath(pagePath);
    if (!normalized) {
      return "";
    }
    const scopePrefix = currentScopePrefix();
    if (!scopePrefix || normalized === scopePrefix || normalized.startsWith(scopePrefix + "/")) {
      return normalized;
    }
    return scopePrefix + "/" + normalized;
  }

  function openOrCreatePage(pagePath: string, replace: boolean): void {
    const normalized = normalizePageDraftPath(pagePath);
    if (!normalized) {
      return;
    }
    const scopedPath = applyCurrentScopePrefix(normalized);
    if (hasPage(scopedPath)) {
      navigateToPage(scopedPath, replace);
      return;
    }
    if (hasPage(normalized)) {
      navigateToPage(normalized, replace);
      return;
    }
    createPage(scopedPath || normalized).catch(function (error) {
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
        clearRemoteChangeToast();
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
        clearRemoteChangeToast();
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

  function taskLineIndent(line: string): number | null {
    const match = String(line || "").match(/^(\s*)-\s+\[[ xX]\]\s+/);
    return match ? match[1].length : null;
  }

  function taskBlockEnd(lines: string[], startIndex: number): number {
    const startIndent = taskLineIndent(lines[startIndex]);
    if (startIndent === null) {
      return startIndex + 1;
    }
    let index = startIndex + 1;
    while (index < lines.length) {
      const indent = taskLineIndent(lines[index]);
      if (indent !== null && indent <= startIndent) {
        break;
      }
      index += 1;
    }
    return index;
  }

  function previousSiblingTaskStart(lines: string[], startIndex: number, indent: number): number {
    for (let index = startIndex - 1; index >= 0; index -= 1) {
      const candidateIndent = taskLineIndent(lines[index]);
      if (candidateIndent === null) {
        continue;
      }
      if (candidateIndent < indent) {
        return -1;
      }
      if (candidateIndent === indent) {
        return index;
      }
    }
    return -1;
  }

  function nextSiblingTaskStart(lines: string[], endIndex: number, indent: number): number {
    for (let index = endIndex; index < lines.length; index += 1) {
      const candidateIndent = taskLineIndent(lines[index]);
      if (candidateIndent === null) {
        continue;
      }
      if (candidateIndent < indent) {
        return -1;
      }
      if (candidateIndent === indent) {
        return index;
      }
    }
    return -1;
  }

  function currentRawLineIndex(value: string, lineStart: number): number {
    return String(value || "").slice(0, Math.max(0, lineStart)).split("\n").length - 1;
  }

  function replaceMarkdownAndKeepEditor(nextMarkdown: string, nextOffset: number, scrollTop: number): void {
    setMarkdownEditorValue(state, els, nextMarkdown);
    state.currentMarkdown = nextMarkdown;
    els.rawView.textContent = nextMarkdown;
    refreshLivePageChrome();
    scheduleAutosave();
    focusMarkdownEditor(state, els, {preventScroll: true});
    setMarkdownEditorSelection(state, els, nextOffset, nextOffset);
    setMarkdownEditorScrollTop(state, els, scrollTop);
  }

  function moveCurrentTaskBlock(direction: -1 | 1): boolean {
    if (!state.selectedPage || !state.currentPage) {
      return false;
    }
    const rawContext = currentRawLineContext(state, els);
    const lines = String(rawContext.value || "").replace(/\r\n/g, "\n").split("\n");
    const currentLineIndex = currentRawLineIndex(rawContext.value, rawContext.lineStart);
    const startIndex = currentLineIndex;
    const indent = taskLineIndent(lines[currentLineIndex] || "");
    if (indent === null) {
      return false;
    }
    const currentEnd = taskBlockEnd(lines, startIndex);
    const currentLength = currentEnd - startIndex;
    const relativeLineIndex = currentLineIndex - startIndex;
    const scrollTop = markdownEditorScrollTop(state, els);
    if (direction < 0) {
      const prevStart = previousSiblingTaskStart(lines, startIndex, indent);
      if (prevStart < 0) {
        return false;
      }
      const nextLines = lines.slice();
      const movedBlock = nextLines.splice(startIndex, currentLength);
      nextLines.splice(prevStart, 0, ...movedBlock);
      const nextMarkdown = nextLines.join("\n");
      const nextLineIndex = prevStart + relativeLineIndex;
      const nextLineText = nextLines[nextLineIndex] || "";
      const nextOffset = rawOffsetForLineNumber(nextMarkdown, nextLineIndex + 1) + Math.min(rawContext.caretInLine, nextLineText.length);
      replaceMarkdownAndKeepEditor(nextMarkdown, nextOffset, scrollTop);
      return true;
    }
    const nextStart = nextSiblingTaskStart(lines, currentEnd, indent);
    if (nextStart < 0) {
      return false;
    }
    const nextEnd = taskBlockEnd(lines, nextStart);
    const nextLines = lines.slice();
    const movedBlock = nextLines.splice(startIndex, currentLength);
    const insertedAt = nextEnd - currentLength;
    nextLines.splice(insertedAt, 0, ...movedBlock);
    const nextMarkdown = nextLines.join("\n");
    const nextLineIndex = insertedAt + relativeLineIndex;
    const nextLineText = nextLines[nextLineIndex] || "";
    const nextOffset = rawOffsetForLineNumber(nextMarkdown, nextLineIndex + 1) + Math.min(rawContext.caretInLine, nextLineText.length);
    replaceMarkdownAndKeepEditor(nextMarkdown, nextOffset, scrollTop);
    return true;
  }

  function indentCurrentTaskBlock(delta: -1 | 1): boolean {
    if (!state.selectedPage || !state.currentPage) {
      return false;
    }
    const rawContext = currentRawLineContext(state, els);
    const lines = String(rawContext.value || "").replace(/\r\n/g, "\n").split("\n");
    const currentLineIndex = currentRawLineIndex(rawContext.value, rawContext.lineStart);
    const startIndex = currentLineIndex;
    const indent = taskLineIndent(lines[currentLineIndex] || "");
    if (indent === null) {
      return false;
    }
    if (delta < 0 && indent < 2) {
      return false;
    }
    const endIndex = taskBlockEnd(lines, startIndex);
    const scrollTop = markdownEditorScrollTop(state, els);
    const nextLines = lines.slice();
    for (let index = startIndex; index < endIndex; index += 1) {
      const line = nextLines[index];
      if (!String(line || "").length) {
        continue;
      }
      nextLines[index] = delta > 0
        ? ("  " + line)
        : String(line).replace(/^ {1,2}/, "");
    }
    const nextMarkdown = nextLines.join("\n");
    const nextLineText = nextLines[currentLineIndex] || "";
    const nextCaretInLine = Math.max(0, Math.min(rawContext.caretInLine + (delta > 0 ? 2 : -2), nextLineText.length));
    const nextOffset = rawOffsetForLineNumber(nextMarkdown, currentLineIndex + 1) + nextCaretInLine;
    replaceMarkdownAndKeepEditor(nextMarkdown, nextOffset, scrollTop);
    return true;
  }

  function selectionOnTaskLine(): boolean {
    const rawContext = currentRawLineContext(state, els);
    const lines = String(rawContext.value || "").replace(/\r\n/g, "\n").split("\n");
    const currentLineIndex = currentRawLineIndex(rawContext.value, rawContext.lineStart);
    return taskLineIndent(lines[currentLineIndex] || "") !== null;
  }

  function toggleTaskDoneAtSelection(): boolean {
    const rawContext = currentRawLineContext(state, els);
    const currentLineIndex = currentRawLineIndex(rawContext.value, rawContext.lineStart);
    const task = findCurrentTaskByLine(currentLineIndex + 1);
    if (!task) {
      return false;
    }
    toggleTaskDone(task).catch(function (error) {
      setNoteStatus("Task toggle failed: " + errorMessage(error));
    });
    return true;
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
    const insertedRawLineNumber = rawContext.value.slice(0, rawContext.lineStart).split("\n").length;
    const insertedTaskLineNumber = insertedRawLineNumber;
    setMarkdownEditorValue(state, els, nextValue);
    state.currentMarkdown = nextValue;
    els.rawView.textContent = state.currentMarkdown;
    scheduleAutosave();
    if (command.id === "table") {
      const safeCaret = Math.max(0, Math.min(rawContext.lineStart + updated.length, nextValue.length));
      setMarkdownEditorSelection(state, els, safeCaret, safeCaret);
      setMarkdownEditorScrollTop(state, els, scrollTop);
      if (state.markdownEditorApi) {
        state.markdownEditorApi.blur();
      }
    } else {
      const caret = rawContext.lineStart + (typeof command.caret === "function" ? command.caret(updated) : updated.length);
      focusMarkdownEditor(state, els, {preventScroll: true});
      setMarkdownEditorSelection(state, els, caret, caret);
      setMarkdownEditorScrollTop(state, els, scrollTop);
    }

    closeSlashMenu(state, els);

    if (command.id === "table") {
      openInlineTableEditor(insertedRawLineNumber, 1, 0);
    } else if (command.id === "due" || command.id === "remind") {
      openInsertedTaskPicker(insertedTaskLineNumber, command.id);
    }
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

  function currentPageTitleValue(): string {
    const page = currentPageView();
    if (!page) {
      return "";
    }
    return page.title || pageTitleFromPath(page.page || page.path || state.selectedPage || "");
  }

  function setNoteHeadingValue(value: string, editable: boolean): void {
    els.noteHeading.value = value;
    els.noteHeading.disabled = !editable;
    els.noteHeading.readOnly = !editable;
    els.noteHeading.title = editable ? "Rename note file" : "";
  }

  function normalizePageTitleDraft(value: string): string {
    return String(value || "")
      .trim()
      .replace(/\\/g, " ")
      .replace(/\//g, " ")
      .replace(/\.md$/i, "")
      .replace(/\s+/g, " ");
  }

  async function renameCurrentPageFromTitle(nextTitle: string): Promise<void> {
    if (!state.selectedPage || !state.currentPage || state.renamingPageTitle) {
      return;
    }

    const normalizedTitle = normalizePageTitleDraft(nextTitle);
    const currentPath = state.selectedPage;
    const currentLeaf = pageTitleFromPath(currentPath);
    if (!normalizedTitle) {
      setNoteHeadingValue(currentPageTitleValue() || currentLeaf, true);
      return;
    }
    if (normalizedTitle === currentLeaf) {
      setNoteHeadingValue(normalizedTitle, true);
      return;
    }

    let targetPath: string;
    if (normalizedTitle.indexOf("/") >= 0) {
      targetPath = normalizedTitle;
    } else {
      const slash = currentPath.lastIndexOf("/");
      const parentFolder = slash >= 0 ? currentPath.slice(0, slash) : "";
      targetPath = parentFolder ? (parentFolder + "/" + normalizedTitle) : normalizedTitle;
    }

    state.renamingPageTitle = true;
    try {
      if (hasUnsavedPageChanges()) {
        await saveCurrentPage();
      }
      await movePage(currentPath, targetPath);
      setNoteStatus("Renamed " + currentLeaf + " to " + normalizedTitle + ".");
    } catch (error) {
      setNoteHeadingValue(currentPageTitleValue() || currentLeaf, true);
      setNoteStatus("Rename failed: " + errorMessage(error));
    } finally {
      state.renamingPageTitle = false;
    }
  }

  function refreshLivePageChrome() {
    const page = currentPageView();
    if (!page) {
      return;
    }

    const fallbackPath = page.page || page.path || state.selectedPage || "";
    els.detailPath.textContent = fallbackPath;
    els.detailTitle.textContent = page.title || fallbackPath;
    setNoteHeadingValue(page.title || fallbackPath, true);
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

  function renderPageHistoryButton(): void {
    const hasPage = Boolean(state.selectedPage && state.currentPage);
    els.pageHistoryButton.disabled = !hasPage;
    els.pageHistoryButton.title = hasPage ? "Open page history" : "Open a note first";
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
      closeInlineTableEditor();
      setMarkdownEditorValue(state, els, "");
      markdownEditorSetPagePath(state, "");
      setNoteStatus("Select a page to edit and preview markdown.");
      renderSourceModeButton();
      renderPageHistoryButton();
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
    if (state.sourceOpen) {
      closeInlineTableEditor();
    } else if (state.tableEditor) {
      const lines = String(state.currentMarkdown || "").replace(/\r\n/g, "\n").split("\n");
      if (!findMarkdownTableBlockForLine(lines, state.tableEditor.startLine)) {
        closeInlineTableEditor();
      } else {
        renderInlineTableEditor();
      }
    }
    renderSourceModeButton();
    renderPageHistoryButton();

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

  function renderPageTasks(): void {
    renderPageTasksUI(els.pageTaskList, Array.isArray(state.tasks) ? state.tasks : [], function (task) {
      if (!task || !task.page) {
        return;
      }
      navigateToPageAtTask(task.page, task.ref || "", task.line || 0, false);
    }, function (task) {
      toggleTaskDone(task).catch(function (error) {
        setNoteStatus("Task toggle failed: " + errorMessage(error));
      });
    }, state.taskFilters, state.currentPage ? (state.currentPage.page || state.currentPage.path || "") : "");
  }

  function renderPageContext() {
    renderPageContextUI(els.pageContext, state.currentPage, state.currentDerived);
  }

  function visiblePagesForRail(): PageSummary[] {
    return filterPagesByTag(state.pages, state.pageTagFilter);
  }

  function renderPageTags() {
    renderPageTagsUI(els.pageTags, state.pages, state.pageTagFilter, function (tag) {
      const nextTag = String(tag || "").trim();
      state.pageTagFilter = state.pageTagFilter.toLowerCase() === nextTag.toLowerCase() ? "" : nextTag;
      renderPages();
      renderPageTags();
      setNoteStatus(
        state.pageTagFilter
          ? ('Filtering pages by tag "' + state.pageTagFilter + '".')
          : "Tag filter cleared."
      );
    });
  }

  function vaultTemplates(): NoteTemplate[] {
    return allNoteTemplatesFromPages(state.pages);
  }

  function quickSwitcherTemplates(): NoteTemplate[] {
    return noteTemplatesFromPages(state.pages, currentScopePrefix());
  }

  function currentPagePath(page: PageRecord | null): string {
    return normalizePageDraftPath(page ? (page.page || page.path || "") : (state.selectedPage || ""));
  }

  function reconcileTemplateFillSession(page: PageRecord | null): TemplateFillSession | null {
    const session = state.templateFillSession;
    if (!session) {
      return null;
    }

    const sessionPath = normalizePageDraftPath(session.pagePath);
    if (!sessionPath) {
      state.templateFillSession = null;
      return null;
    }

    if (sessionPath !== currentPagePath(page)) {
      return null;
    }

    const remaining = remainingTemplateFields(session.fields, page ? page.frontmatter : null);
    state.templateFillSession = remaining.length ? {
      pagePath: sessionPath,
      fields: remaining,
    } : null;
    return state.templateFillSession;
  }

  function beginTemplateFillSession(pagePath: string, template: NoteTemplate): void {
    const normalizedPath = normalizePageDraftPath(pagePath);
    if (!normalizedPath) {
      state.templateFillSession = null;
      return;
    }
    const fields = templateFieldsNeedingInput(template, normalizedPath);
    state.templateFillSession = fields.length ? {
      pagePath: normalizedPath,
      fields: fields,
    } : null;
  }

  function openTemplateFillDraft(page: PageRecord | null): boolean {
    const field = currentTemplateFillField(page);
    if (!field) {
      return false;
    }
    const key = String(field.key || "").trim();
    if (!key) {
      state.templateFillSession = null;
      return false;
    }

    const frontmatter = page ? page.frontmatter : null;
    if (frontmatter && Object.prototype.hasOwnProperty.call(frontmatter, key)) {
      setPropertyDraft(key, frontmatter[key] as FrontmatterValue, key, "value");
    } else {
      setPropertyDraft(key, "", "__new__", "value");
    }
    state.propertyTypeMenuKey = "";
    setNoteStatus("Fill in " + key + ".");
    return true;
  }

  function currentTemplateFillField(page: PageRecord | null): NoteTemplateField | null {
    const session = reconcileTemplateFillSession(page);
    return session && session.fields.length ? session.fields[0] : null;
  }

  function skipCurrentTemplateFillField(): boolean {
    const page = state.currentPage;
    const session = reconcileTemplateFillSession(page);
    if (!session || !session.fields.length) {
      return false;
    }

    const skipped = session.fields[0];
    const remaining = session.fields.slice(1);
    state.templateFillSession = remaining.length ? {
      pagePath: session.pagePath,
      fields: remaining,
    } : null;
    clearPropertyDraft();
    if (page && openTemplateFillDraft(page)) {
      renderPageProperties();
      return true;
    }
    renderPageProperties();
    setNoteStatus("Template fields complete.");
    return Boolean(skipped);
  }

  function currentTemplatePropertyKindHints(): Record<string, FrontmatterKind> {
    const page = currentPageView();
    const hints = templatePropertyKindHints(page ? page.frontmatter : null, vaultTemplates());
    const session = reconcileTemplateFillSession(page);
    if (!session) {
      return hints;
    }
    return {
      ...hints,
      ...templateFieldKindHints(session.fields),
    };
  }

  function currentPropertyKindHint(key: string): FrontmatterKind | undefined {
    const normalizedKey = String(key || "").trim();
    if (!normalizedKey) {
      return undefined;
    }
    const hints = currentTemplatePropertyKindHints();
    return hints[normalizedKey];
  }

  function clearPropertyDraft() {
    state.editingPropertyKey = "";
    state.propertyTypeMenuKey = "";
    state.propertyDraft = null;
    state.propertyDraftFocusTarget = "value";
  }

  function setPropertyDraft(
    key: string,
    value: FrontmatterValue,
    originalKey: string,
    focusTarget: "key" | "value" = "value"
  ): void {
    state.editingPropertyKey = originalKey || key || "__new__";
    state.propertyDraft = makePropertyDraft(key, value, originalKey, currentPropertyKindHint(key));
    state.propertyDraftFocusTarget = focusTarget;
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
        setPropertyDraft("", "", "__new__", "key");
      }

      const draft = state.propertyDraft;
      if (!draft) {
        return;
      }
      const nextDraft = applyPropertyDraftKind(draft, kind);
      state.propertyDraft = !String(nextDraft.key || "").trim()
        ? (kind === "tags"
          ? { ...nextDraft, key: "tags" }
          : (kind === "notification" ? { ...nextDraft, key: "notification" } : nextDraft))
        : nextDraft;
      state.propertyTypeMenuKey = "";
      renderPageProperties();
      return;
    }

    state.propertyTypeMenuKey = "";
    patchCurrentPageFrontmatter({
      frontmatter: {
        set: {
          [row.key]: coercePropertyValue(kind, row.rawValue, row.key),
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

    noteLocalPageChange(state.selectedPage);
    await fetchJSON<unknown>("/api/pages/" + encodePath(state.selectedPage), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    await Promise.all([loadPages(), loadTasks(), loadPageDetail(state.selectedPage, true, false)]);
  }

  function startAddProperty() {
    state.propertyTypeMenuKey = "";
    setPropertyDraft("", "", "__new__", "key");
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
  }

  function startRenameProperty(row: PropertyRow | null): void {
    if (!row) {
      return;
    }
    setPropertyDraft(row.key, row.rawValue, row.key, "key");
    state.propertyTypeMenuKey = "";
    renderPageProperties();
  }

  async function savePropertyEdit() {
    const key = state.propertyDraft ? String(state.propertyDraft.key || "").trim() : "";

    if (!key) {
      setNoteStatus("Frontmatter key is required.");
      return;
    }
    if (isTemplateMetadataKey(key)) {
      setNoteStatus("Template metadata keys are reserved.");
      return;
    }

    const value = propertyDraftValue(state.propertyDraft);
    const guidedField = currentTemplateFillField(state.currentPage);
    if (
      guidedField &&
      String(guidedField.key || "").trim() === key &&
      (value === "" || (Array.isArray(value) && value.length === 0))
    ) {
      skipCurrentTemplateFillField();
      return;
    }
    const setPayload: Record<string, FrontmatterValue> = {};
    setPayload[key] = value;

    const remove = state.editingPropertyKey && state.editingPropertyKey !== key && state.editingPropertyKey !== "__new__"
      ? [state.editingPropertyKey]
      : [];

    await patchCurrentPageFrontmatter({
      frontmatter: {
        set: setPayload,
        remove: remove,
      },
    });
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
    if (els.propertyActions) {
      els.propertyActions.classList.toggle("hidden", state.sourceOpen || state.editingPropertyKey === "__new__");
    }
    renderPagePropertiesUI({
      container: els.pageProperties,
      pageFrontmatter: page ? page.frontmatter : null,
      propertyKindHints: currentTemplatePropertyKindHints(),
      editingPropertyKey: state.editingPropertyKey,
      propertyTypeMenuKey: state.propertyTypeMenuKey,
      propertyDraft: state.propertyDraft,
      propertyDraftFocusTarget: state.propertyDraftFocusTarget,
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
    clearPropertyDraft();
    syncURLState(true);
    els.detailPath.textContent = "Select a page";
    setNoteHeadingValue("Waiting for selection", false);
    renderNoteStudio();
    renderSourceModeButton();
    renderPageHistoryButton();
    renderPageTasks();
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

  function renderHelpShortcuts() {
    renderHelpShortcutsUI(els, state.settings.preferences);
  }

  function currentHotkeyPreferencesFromInputs(): ClientPreferences["hotkeys"] {
    return {
      quickSwitcher: canonicalizeHotkey(String(els.settingsQuickSwitcher.value || "").trim()),
      globalSearch: canonicalizeHotkey(String(els.settingsGlobalSearch.value || "").trim()),
      commandPalette: canonicalizeHotkey(String(els.settingsCommandPalette.value || "").trim()),
      quickNote: canonicalizeHotkey(String(els.settingsQuickNote.value || "").trim()),
      help: canonicalizeHotkey(String(els.settingsHelp.value || "").trim()),
      saveCurrentPage: canonicalizeHotkey(String(els.settingsSaveCurrentPage.value || "").trim()),
      toggleRawMode: canonicalizeHotkey(String(els.settingsToggleRawMode.value || "").trim()),
      toggleTaskDone: canonicalizeHotkey(String(els.settingsToggleTaskDone.value || "").trim()),
    };
  }

  function renderSettingsHotkeyHints(): void {
    renderSettingsHotkeyHintsUI(els, currentHotkeyPreferencesFromInputs());
  }

  function renderSettingsForm() {
    renderSettingsFormUI(state, els);
    renderSettingsHotkeyHints();
    els.settingsStatus.textContent = "";
  }

  function settingsHotkeyInput(hotkeyID: keyof ClientPreferences["hotkeys"]): HTMLInputElement {
    switch (hotkeyID) {
      case "quickSwitcher":
        return els.settingsQuickSwitcher;
      case "globalSearch":
        return els.settingsGlobalSearch;
      case "commandPalette":
        return els.settingsCommandPalette;
      case "quickNote":
        return els.settingsQuickNote;
      case "help":
        return els.settingsHelp;
      case "saveCurrentPage":
        return els.settingsSaveCurrentPage;
      case "toggleRawMode":
        return els.settingsToggleRawMode;
      case "toggleTaskDone":
        return els.settingsToggleTaskDone;
    }
  }

  function bindSettingsHotkeyInputs(): void {
    hotkeyDefinitions().forEach(function (definition) {
      const input = settingsHotkeyInput(definition.id);
      input.setAttribute("aria-label", definition.label + " hotkey");
      on(input, "focus", function () {
        input.dataset.recording = "true";
        renderSettingsHotkeyHints();
      });
      on(input, "blur", function () {
        input.value = canonicalizeHotkey(input.value);
        delete input.dataset.recording;
        renderSettingsHotkeyHints();
      });
      on(input, "input", function () {
        renderSettingsHotkeyHints();
      });
      on(input, "keydown", function (rawEvent) {
        const event = rawEvent as KeyboardEvent;
        if (event.key === "Tab") {
          return;
        }
        const key = String(event.key || "");
        const shouldCapture = Boolean(
          event.ctrlKey ||
          event.metaKey ||
          event.altKey ||
          key === "Enter" ||
          key === "Escape" ||
          (/^F\d+$/i).test(key) ||
          (event.shiftKey && key.length === 1 && /[^a-z0-9]/i.test(key))
        );
        if (!shouldCapture) {
          return;
        }
        event.stopPropagation();
        const binding = hotkeyFromEvent(event);
        if (!binding) {
          event.preventDefault();
          return;
        }
        event.preventDefault();
        input.value = binding;
        renderSettingsHotkeyHints();
      });
    });
  }

  function setSettingsSnapshot(snapshot: SettingsResponse): void {
    state.settings.vault = snapshot.settings.vault;
    state.settings.notifications = snapshot.settings.notifications;
    state.appliedVault = snapshot.appliedVault;
    state.settingsRestartRequired = snapshot.restartRequired;
    state.settingsLoaded = true;
    renderHomeButton();
    renderHelpShortcuts();
    renderSettingsForm();
    applyUIPreferences();
    renderSourceModeButton();
    renderPageHistoryButton();
    loadMeta();
    if (state.currentPage) {
      renderNoteStudio();
      renderPageTasks();
      renderPageContext();
      renderPageProperties();
    } else if (state.selectedSavedQuery) {
      loadSavedQueryDetail(state.selectedSavedQuery);
    }
  }

  function setUserSettingsSnapshot(snapshot: UserSettingsResponse): void {
    state.settings.userNotifications = {
      ntfyTopicUrl: snapshot.settings.notifications.ntfyTopicUrl || "",
      ntfyToken: snapshot.settings.notifications.ntfyToken || "",
    };
    state.userSettingsLoaded = true;
    renderSettingsForm();
  }

  function currentThemeID(): string {
    return String(state.settings.preferences.ui.themeId || defaultThemeId).trim() || defaultThemeId;
  }

  function refreshThemeCache(themes: ThemeRecord[]): void {
    state.themeCache = mergeThemeCache(themes);
    saveStoredThemeCache(state.themeCache);
  }

  function syncThemeSelection(themeID: string): void {
    const normalizedID = String(themeID || "").trim() || defaultThemeId;
    state.settings.preferences.ui.themeId = normalizedID;
    state.previewThemeId = normalizedID;
  }

  function applyCurrentTheme(themeID?: string): ThemeRecord {
    const resolved = resolveTheme(themeID || currentThemeID(), state.themeLibrary, state.themeCache);
    applyTheme(resolved);
    return resolved;
  }

  function restoreSavedThemePreview(): void {
    const savedThemeID = state.savedThemeId || defaultThemeId;
    syncThemeSelection(savedThemeID);
    applyCurrentTheme(savedThemeID);
    renderSettingsForm();
  }

  function applyUIPreferences(): void {
    const root = document.documentElement;
    const fontFamily = state.settings.preferences.ui.fontFamily || "mono";
    const fontSize = state.settings.preferences.ui.fontSize || "16";
    const dateTimeFormat = state.settings.preferences.ui.dateTimeFormat || "browser";
    const fontMap: Record<string, string> = {
      mono: '"IBM Plex Mono", "SFMono-Regular", Consolas, "Liberation Mono", monospace',
      sans: '"IBM Plex Sans", "Segoe UI", system-ui, sans-serif',
      serif: '"Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif',
    };
    root.style.setProperty("--app-font-family", fontMap[fontFamily] || fontMap.mono);
    root.style.setProperty("--editor-font-family", fontMap[fontFamily] || fontMap.mono);
    root.style.setProperty("--app-font-size", fontSize + "px");
    setDateTimeDisplayFormat(dateTimeFormat);
    markdownEditorSetDateTimeFormat(state, dateTimeFormat);
    applyCurrentTheme(currentThemeID());
  }

  async function loadThemes() {
    const payload = normalizeThemeListResponse(await fetchJSON<ThemeListResponse>("/api/themes"));
    state.themeLibrary = mergedThemeLibrary(payload.themes);
    state.themeLibraryLoaded = true;
    refreshThemeCache(state.themeLibrary);
    const currentThemeIDValue = currentThemeID();
    const resolved = resolveTheme(currentThemeIDValue, state.themeLibrary, state.themeCache);
    const savedThemeStillExists = resolved.id === currentThemeIDValue;
    if (!savedThemeStillExists) {
      syncThemeSelection(defaultThemeId);
      saveStoredClientPreferences(state.settings.preferences);
      state.savedThemeId = defaultThemeId;
    }
    applyCurrentTheme(currentThemeID());
    renderSettingsForm();
  }

  function currentSelectedTheme(): ThemeRecord | null {
    const selectedID = String(els.settingsTheme.value || currentThemeID()).trim();
    return state.themeLibrary.find(function (theme) {
      return theme.id === selectedID;
    }) || null;
  }

  function previewTheme(themeID: string, persistSelection: boolean): void {
    syncThemeSelection(themeID);
    applyCurrentTheme(themeID);
    if (persistSelection) {
      state.savedThemeId = currentThemeID();
      saveStoredClientPreferences(state.settings.preferences);
    }
    renderSettingsForm();
  }

  async function uploadThemeFile(file: File): Promise<void> {
    const body = new FormData();
    body.append("file", file);
    const created = await fetchJSON<ThemeRecord>("/api/themes", {
      method: "POST",
      body: body,
    });
    state.themeLibrary = builtinThemeLibrary().concat(
      state.themeLibrary.filter(function (theme) {
        return theme.source === "custom" && theme.id !== created.id;
      }),
      [created],
    );
    refreshThemeCache(state.themeLibrary);
    previewTheme(created.id, false);
    els.settingsStatus.textContent = 'Theme "' + created.name + '" uploaded.';
  }

  async function deleteCurrentTheme(): Promise<void> {
    const selectedTheme = currentSelectedTheme();
    if (!selectedTheme || selectedTheme.source !== "custom") {
      return;
    }
    if (!window.confirm('Delete theme "' + selectedTheme.name + '"?')) {
      return;
    }
    await fetchJSON<{ ok: boolean }>("/api/themes/" + encodeURIComponent(selectedTheme.id), {
      method: "DELETE",
    });
    state.themeLibrary = state.themeLibrary.filter(function (theme) {
      return theme.id !== selectedTheme.id;
    });
    state.themeCache = removeThemeFromCache(state.themeCache, selectedTheme.id);
    saveStoredThemeCache(state.themeCache);
    const removedActiveTheme = state.savedThemeId === selectedTheme.id || state.previewThemeId === selectedTheme.id;
    if (removedActiveTheme) {
      syncThemeSelection(defaultThemeId);
      state.savedThemeId = defaultThemeId;
      saveStoredClientPreferences(state.settings.preferences);
      applyCurrentTheme(defaultThemeId);
    }
    renderSettingsForm();
    els.settingsStatus.textContent = 'Theme "' + selectedTheme.name + '" deleted.';
  }

  async function loadSettings() {
    try {
      const snapshot = await fetchJSON<SettingsResponse>("/api/settings");
      setSettingsSnapshot(snapshot);
    } catch (error) {
      state.settingsLoaded = false;
      renderSettingsForm();
      els.settingsStatus.textContent = errorMessage(error);
    }
  }

  async function loadUserSettings() {
    try {
      const snapshot = await fetchJSON<UserSettingsResponse>("/api/user/settings");
      setUserSettingsSnapshot(snapshot);
    } catch (error) {
      state.userSettingsLoaded = false;
      renderSettingsForm();
      throw error;
    }
  }

  async function loadMeta() {
    try {
      const meta = await fetchJSON<MetaResponse>("/api/meta");
      const runtimeVaultPath = meta.runtimeVault && meta.runtimeVault.vaultPath
        ? meta.runtimeVault.vaultPath
        : "(none)";
      const pills = [
        "Listening " + meta.listenAddr,
        "Runtime vault " + runtimeVaultPath,
        "DB " + meta.database,
        "Time " + formatDateTimeValue(meta.serverTime),
      ];
      if (meta.currentVault && meta.currentVault.vaultPath && meta.currentVault.vaultPath !== runtimeVaultPath) {
        pills.splice(2, 0, "Current vault " + meta.currentVault.vaultPath);
      }
      if (meta.restartRequired) {
        pills.splice(2, 0, "Restart required");
      }
      setMetaPills(pills);
      renderVaultHealth(meta);
    } catch (error) {
      setMetaPills(["Meta error", errorMessage(error)]);
      renderVaultHealth(null);
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
      if (state.pageTagFilter && !visiblePagesForRail().length) {
        state.pageTagFilter = "";
      }
      renderPages();
      renderPageTags();
    } catch (error) {
      renderEmpty(els.pageList, errorMessage(error));
      els.pageList.classList.add("no-scroll");
    }
  }

  async function loadTasks() {
    try {
      const payload = await fetchJSON<TaskListResponse>("/api/tasks");
      state.tasks = Array.isArray(payload.tasks) ? payload.tasks : [];
      renderPageTasks();
    } catch (error) {
      state.tasks = [];
      renderEmpty(els.pageTaskList, errorMessage(error));
    }
  }

  function renderPages() {
    renderPagesSection({
      selectedPage: state.selectedPage,
      pages: visiblePagesForRail(),
      expandedPageFolders: state.expandedPageFolders,
      scopePrefix: currentScopePrefix(),
    }, els, {
      navigateToPage: navigateToPage,
      createPage: createPage,
      renameFolder: renameFolder,
      deleteFolder: deleteFolder,
      renamePage: renamePage,
      deletePage: deletePage,
      movePageToFolder: movePageToFolder,
      moveFolder: moveFolder,
      openPageHistory: openPageHistoryFor,
      currentHomePage: currentHomePage,
      setHomePage: setHomePage,
      setNoteStatus: setNoteStatus,
      errorMessage: errorMessage,
    }, openTreeContextMenu);
  }

  function closeTreeContextMenu(): void {
    treeContextMenuState.target = null;
    closeTreeContextMenuUI(els.treeContextMenu);
  }

  function openPageHistoryFor(pagePath: string): void {
    if (!pagePath) {
      return;
    }
    closeTreeContextMenu();
    navigateToPage(pagePath, false);
    window.setTimeout(function () {
      setPageHistoryOpen(true);
      loadPageHistory().catch(function (error) {
        setNoteStatus("History failed: " + errorMessage(error));
      });
    }, 0);
  }

  function openTreeContextMenu(target: PageTreeMenuTarget, left: number, top: number): void {
    treeContextMenuState.target = target;
    treeContextMenuState.left = left;
    treeContextMenuState.top = top;
    openTreeContextMenuUI(els.treeContextMenu, target, left, top, {
      navigateToPage: navigateToPage,
      createPage: createPage,
      renameFolder: renameFolder,
      deleteFolder: deleteFolder,
      renamePage: renamePage,
      deletePage: deletePage,
      movePageToFolder: movePageToFolder,
      moveFolder: moveFolder,
      openPageHistory: openPageHistoryFor,
      currentHomePage: currentHomePage,
      setHomePage: setHomePage,
      setNoteStatus: setNoteStatus,
      errorMessage: errorMessage,
    });
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

  function findCurrentTaskByLine(lineNumber: number): TaskRecord | null {
    if (!state.currentPage || !state.currentPage.tasks || !lineNumber) {
      return null;
    }
    return state.currentPage.tasks.find(function (task) {
      return Number(task.line) === lineNumber;
    }) || null;
  }

  function openInsertedTaskPicker(lineNumber: number, mode: "due" | "remind"): void {
    const task = findCurrentTaskByLine(lineNumber);
    if (!task || !task.ref) {
      return;
    }
    window.requestAnimationFrame(function () {
      const caretRect = state.markdownEditorApi ? state.markdownEditorApi.getCaretRect() : null;
      const left = caretRect ? caretRect.left : 0;
      const top = caretRect ? (caretRect.bottom + 10) : 0;
      openInlineTaskPicker(task.ref, mode, left, top);
    });
  }

  async function toggleTaskDone(task: TaskRecord | null): Promise<void> {
    if (!task || !task.ref) {
      return;
    }

    try {
      setTaskDateApplySuppressed(true);
      rememberNoteFocus();
      noteLocalPageChange(task.page || state.selectedPage || "");
      await toggleTaskDoneRequest(task);
      await Promise.all([loadTasks(), state.selectedPage ? loadPageDetail(state.selectedPage, true, false) : Promise.resolve()]);
      restoreNoteFocus();
      window.requestAnimationFrame(function () {
        window.requestAnimationFrame(function () {
          setTaskDateApplySuppressed(false);
        });
      });
    } catch (error) {
      setTaskDateApplySuppressed(false);
      setNoteStatus("Task toggle failed: " + errorMessage(error));
    }
  }

  async function loadPageDetail(pagePath: string, force: boolean, allowEditorFocus?: boolean): Promise<void> {
    if (!force && hasUnsavedPageChanges()) {
      setNoteStatus("Unsaved local edits on " + state.selectedPage + ". Autosave pending.");
      return;
    }
    const shouldFocusEditor = allowEditorFocus !== false;

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
      if (state.remoteChangePage && state.remoteChangePage === (page.page || pagePath)) {
        clearRemoteChangeToast();
      }
      clearAutosaveTimer();
      clearPropertyDraft();
      const templateFillActive = openTemplateFillDraft(page);
      state.selectedSavedQueryPayload = null;
      els.detailPath.textContent = page.page || page.path || pagePath;
      setNoteHeadingValue(page.title || page.page || pagePath, true);

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
      if (shouldFocusEditor && !templateFillActive && state.markdownEditorApi && !blockingOverlayOpen(els) && !inlineTableEditorOpen()) {
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
      } else if (shouldFocusEditor && !templateFillActive && state.sourceOpen && !blockingOverlayOpen(els) && !inlineTableEditorOpen()) {
        window.setTimeout(function () {
          if (els.markdownEditor) {
            focusMarkdownEditor(state, els, {preventScroll: true});
            const caret = rawOffsetForBodyPosition(state.currentMarkdown, firstEditableLineIndex(state.currentMarkdown), 0);
            setMarkdownEditorSelection(state, els, caret, caret);
          }
        }, 0);
      }
      renderPageTasks();
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
      setNoteHeadingValue(savedQuery.title || savedQuery.name || name, false);
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
      if (!force && (markdownEditorHasFocus(state, els) || inlineTableEditorHasFocus() || inlineTableEditorOpen())) {
        return;
      }
      loadPageDetail(state.selectedPage, force, false);
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
    small.textContent = formatTimeValue(new Date());
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

  function setSearchOpen(open: boolean): void {
    setSearchOpenUI(els, open, rememberNoteFocus);
  }

  function closeSearchModal() {
    setSearchOpen(false);
  }

  function rememberNoteFocus(): void {
    if (!state.selectedPage) {
      return;
    }
    state.restoreFocusSpec = {
      mode: "editor",
      offset: markdownEditorSelectionStart(state, els),
    };
  }

  function restoreNoteFocus(): void {
    if (!state.selectedPage) {
      return;
    }
    restoreEditorFocus(state, els, state.selectedPage);
    window.requestAnimationFrame(function () {
      if (state.selectedPage && !state.restoreFocusSpec && !blockingOverlayOpen(els) && !inlineTableEditorOpen()) {
        focusMarkdownEditor(state, els, {preventScroll: true});
      }
    });
  }

  function searchResultButtons(): HTMLButtonElement[] {
    return paletteModalButtons(els.globalSearchResults);
  }

  function commandResultButtons(): HTMLButtonElement[] {
    return paletteResultButtons(els.commandPaletteResults);
  }

  function quickSwitcherResultButtons(): HTMLButtonElement[] {
    return paletteModalButtons(els.quickSwitcherResults);
  }

  function documentResultButtons(): HTMLButtonElement[] {
    return paletteModalButtons(els.documentsResults);
  }

  function updateSearchSelection() {
    updatePaletteModalSelection(els.globalSearchResults, state.searchSelectionIndex);
  }

  function updateCommandSelection() {
    updatePaletteSelection(els.commandPaletteResults, state.commandSelectionIndex);
  }

  function updateQuickSwitcherSelection() {
    updatePaletteModalSelection(els.quickSwitcherResults, state.quickSwitcherSelectionIndex);
  }

  function updateDocumentSelection() {
    updatePaletteModalSelection(els.documentsResults, state.documentSelectionIndex);
  }

  function moveSearchSelection(delta: number): void {
    state.searchSelectionIndex = movePaletteModalSelection(els.globalSearchResults, state.searchSelectionIndex, delta);
  }

  function moveCommandSelection(delta: number): void {
    state.commandSelectionIndex = movePaletteSelection(els.commandPaletteResults, state.commandSelectionIndex, delta);
  }

  function moveQuickSwitcherSelection(delta: number): void {
    state.quickSwitcherSelectionIndex = movePaletteModalSelection(
      els.quickSwitcherResults,
      state.quickSwitcherSelectionIndex,
      delta
    );
  }

  function moveDocumentSelection(delta: number): void {
    state.documentSelectionIndex = movePaletteModalSelection(els.documentsResults, state.documentSelectionIndex, delta);
  }

  function triggerSearchSelection() {
    triggerPaletteModalSelection(els.globalSearchResults, state.searchSelectionIndex);
  }

  function triggerCommandSelection() {
    triggerPaletteSelection(els.commandPaletteResults, state.commandSelectionIndex);
  }

  function triggerQuickSwitcherSelection() {
    triggerPaletteModalSelection(els.quickSwitcherResults, state.quickSwitcherSelectionIndex);
  }

  function triggerDocumentSelection() {
    triggerPaletteModalSelection(els.documentsResults, state.documentSelectionIndex);
  }

  function setCommandPaletteOpen(open: boolean): void {
    setCommandPaletteOpenUI(els, open, rememberNoteFocus);
  }

  function closeCommandPalette() {
    setCommandPaletteOpen(false);
  }

  function setQuickSwitcherOpen(open: boolean): void {
    setQuickSwitcherOpenUI(els, open, rememberNoteFocus);
  }

  function closeQuickSwitcher() {
    setQuickSwitcherOpen(false);
  }

  function setDocumentsOpen(open: boolean): void {
    setDocumentsOpenUI(els, open, rememberNoteFocus);
  }

  function closeDocumentsModal() {
    setDocumentsOpen(false);
  }

  function selectedPageHistoryRevision(): PageRevisionRecord | null {
    return selectedPageHistoryRevisionUI(state);
  }

  function renderPageHistoryPreview(): void {
    renderPageHistoryPreviewUI(state, els);
  }

  function restorePageHistoryRevision(revision: PageRevisionRecord): void {
    if (!state.selectedPage) {
      return;
    }
    fetchJSON<PageRecord>("/api/page-history/" + encodePath(state.selectedPage) + "/restore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ revisionId: revision.id }),
    }).then(function () {
      closePageHistoryModal();
      return Promise.all([loadPages(), loadTasks(), loadPageDetail(state.selectedPage, true)]);
    }).then(function () {
      setNoteStatus("Restored revision for " + state.selectedPage + ".");
    }).catch(function (error) {
      setNoteStatus("Restore failed: " + errorMessage(error));
    });
  }

  function setPageHistoryOpen(open: boolean): void {
    setPageHistoryOpenUI(state, els, open, rememberNoteFocus);
  }

  function closePageHistoryModal(): void {
    setPageHistoryOpen(false);
  }

  function renderPageHistory(): void {
    renderPageHistoryUI(state, els, renderPageHistory);
  }

  async function loadPageHistory(): Promise<void> {
    if (!state.selectedPage) {
      state.pageHistory = [];
      state.selectedHistoryRevisionId = "";
      renderPageHistory();
      return;
    }
    els.pageHistoryTitle.textContent = "Revision History · " + pageTitleFromPath(state.selectedPage);
    const payload = await fetchJSON<PageHistoryResponse>("/api/page-history/" + encodePath(state.selectedPage));
    state.pageHistory = Array.isArray(payload.revisions) ? payload.revisions : [];
    state.selectedHistoryRevisionId = state.pageHistory[0] ? state.pageHistory[0].id : "";
    renderPageHistory();
  }

  async function purgeCurrentPageHistory(): Promise<void> {
    if (!state.selectedPage) {
      return;
    }
    if (!window.confirm("Permanently remove all saved revisions for " + state.selectedPage + "?")) {
      return;
    }
    await fetchJSON<unknown>("/api/page-history/" + encodePath(state.selectedPage), {
      method: "DELETE",
    });
    state.pageHistory = [];
    renderPageHistory();
    setNoteStatus("Purged history for " + state.selectedPage + ".");
  }

  function setTrashOpen(open: boolean): void {
    setTrashOpenUI(els, open, rememberNoteFocus);
  }

  function closeTrashModal(): void {
    setTrashOpen(false);
  }

  function renderTrash(): void {
    renderTrashUI(state, els, {
      onRestore: function (entry) {
        fetchJSON<PageRecord>("/api/trash/pages/" + encodePath(entry.page) + "/restore", {
          method: "POST",
        }).then(function (payload) {
          return loadPages().then(function () {
            state.trashPages = state.trashPages.filter(function (item) {
              return item.page !== entry.page;
            });
            renderTrash();
            navigateToPage(payload.page || entry.page, false);
            setNoteStatus("Restored " + entry.page + " from trash.");
          });
        }).catch(function (error) {
          setNoteStatus("Restore failed: " + errorMessage(error));
        });
      },
      onDelete: function (entry) {
        if (!window.confirm('Permanently delete "' + entry.page + '" and its history?')) {
          return;
        }
        fetchJSON<unknown>("/api/trash/pages/" + encodePath(entry.page), {
          method: "DELETE",
        }).then(function () {
          state.trashPages = state.trashPages.filter(function (item) {
            return item.page !== entry.page;
          });
          renderTrash();
          setNoteStatus("Permanently deleted " + entry.page + ".");
        }).catch(function (error) {
          setNoteStatus("Permanent delete failed: " + errorMessage(error));
        });
      },
    });
  }

  async function loadTrash(): Promise<void> {
    const payload = await fetchJSON<TrashListResponse>("/api/trash/pages");
    state.trashPages = Array.isArray(payload.pages) ? payload.pages : [];
    renderTrash();
  }

  async function emptyTrash(): Promise<void> {
    if (!state.trashPages.length) {
      return;
    }
    if (!window.confirm("Permanently delete all trashed pages and their history?")) {
      return;
    }
    await fetchJSON<unknown>("/api/trash/pages", {
      method: "DELETE",
    });
    state.trashPages = [];
    renderTrash();
    setNoteStatus("Trash emptied.");
  }

  function setHelpOpen(open: boolean): void {
    if (open) {
      rememberNoteFocus();
      els.searchModalShell.classList.add("hidden");
      els.commandModalShell.classList.add("hidden");
      els.quickSwitcherModalShell.classList.add("hidden");
      els.documentsModalShell.classList.add("hidden");
      els.pageHistoryModalShell.classList.add("hidden");
      els.trashModalShell.classList.add("hidden");
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

  function resetSettingsTemplateDrafts(): void {
    state.settingsTemplateDrafts = cloneNoteTemplates(state.settings.preferences.templates);
  }

  function updateSettingsTemplateDrafts(updater: (templates: NoteTemplate[]) => NoteTemplate[]): void {
    state.settingsTemplateDrafts = cloneNoteTemplates(updater(cloneNoteTemplates(state.settingsTemplateDrafts)));
  }

  function templateDraftIndex(templateID: string): number {
    return state.settingsTemplateDrafts.findIndex(function (template) {
      return template.id === templateID;
    });
  }

  function updateTemplateDraft(templateID: string, updater: (template: NoteTemplate) => NoteTemplate): void {
    updateSettingsTemplateDrafts(function (templates) {
      const index = templates.findIndex(function (template) {
        return template.id === templateID;
      });
      if (index < 0) {
        return templates;
      }
      const next = templates.slice();
      next[index] = updater(next[index]);
      return next;
    });
  }

  function updateTemplateFieldDraft(
    templateID: string,
    fieldIndex: number,
    updater: (field: NoteTemplate["fields"][number]) => NoteTemplate["fields"][number]
  ): void {
    updateTemplateDraft(templateID, function (template) {
      if (fieldIndex < 0 || fieldIndex >= template.fields.length) {
        return template;
      }
      const fields = template.fields.slice();
      fields[fieldIndex] = updater(fields[fieldIndex]);
      return {
        ...template,
        fields,
      };
    });
  }

  function setSettingsOpen(open: boolean): void {
    if (open) {
      state.savedThemeId = currentThemeID();
      state.previewThemeId = currentThemeID();
      resetSettingsTemplateDrafts();
      rememberNoteFocus();
      els.searchModalShell.classList.add("hidden");
      els.commandModalShell.classList.add("hidden");
      els.quickSwitcherModalShell.classList.add("hidden");
      els.documentsModalShell.classList.add("hidden");
      els.helpModalShell.classList.add("hidden");
      els.pageHistoryModalShell.classList.add("hidden");
      els.trashModalShell.classList.add("hidden");
      els.settingsModalShell.classList.remove("hidden");
      renderSettingsForm();
      if (!state.settingsLoaded) {
        loadSettings();
      }
      window.requestAnimationFrame(function () {
        if (state.settingsSection === "vault" && state.settingsLoaded) {
          focusWithoutScroll(els.settingsVaultPath);
          return;
        }
        if (state.settingsSection === "notifications") {
          focusWithoutScroll(els.settingsUserNtfyTopicUrl);
          return;
        }
        if (state.settingsSection === "templates") {
          focusWithoutScroll(els.settingsTemplateAdd);
          return;
        }
        if (state.settingsSection === "appearance") {
          focusWithoutScroll(els.settingsTheme);
          return;
        }
        focusWithoutScroll(els.closeSettingsModal);
      });
      return;
    }
    resetSettingsTemplateDrafts();
    els.settingsModalShell.classList.add("hidden");
  }

  function closeSettingsModal() {
    if (state.previewThemeId !== state.savedThemeId) {
      restoreSavedThemePreview();
    }
    setSettingsOpen(false);
  }

  function collectServerSettingsForm(): ServerSettings {
    return {
      vault: {
        vaultPath: String(els.settingsVaultPath.value || "").trim(),
      },
      notifications: {
        ntfyInterval: String(els.settingsNtfyInterval.value || "1m").trim(),
      },
    };
  }

  function collectUserSettingsForm(): UserSettingsResponse {
    return {
      settings: {
        notifications: {
          ntfyTopicUrl: String(els.settingsUserNtfyTopicUrl.value || "").trim(),
          ntfyToken: String(els.settingsUserNtfyToken.value || "").trim(),
        },
      },
    };
  }

  function currentUserSettingsPayload(): UserSettingsResponse {
    return {
      settings: {
        notifications: {
          ntfyTopicUrl: state.settings.userNotifications.ntfyTopicUrl || "",
          ntfyToken: state.settings.userNotifications.ntfyToken || "",
        },
      },
    };
  }

  function collectClientPreferencesForm(): ClientPreferences {
    return normalizeClientPreferences({
      ui: {
        themeId: String(els.settingsTheme.value || defaultThemeId).trim(),
        fontFamily: String(els.settingsFontFamily.value || "mono").trim(),
        fontSize: String(els.settingsFontSize.value || "16").trim(),
        dateTimeFormat: String(els.settingsDateTimeFormat.value || "browser").trim(),
      },
      vaults: {
        topLevelFoldersAsVaults: Boolean(els.settingsUserTopLevelVaults.checked),
        rootHomePage: state.settings.preferences.vaults.rootHomePage,
        scopeHomePages: state.settings.preferences.vaults.scopeHomePages,
      },
      hotkeys: {
        quickSwitcher: String(els.settingsQuickSwitcher.value || "").trim(),
        globalSearch: String(els.settingsGlobalSearch.value || "").trim(),
        commandPalette: String(els.settingsCommandPalette.value || "").trim(),
        quickNote: String(els.settingsQuickNote.value || "").trim(),
        help: String(els.settingsHelp.value || "").trim(),
        saveCurrentPage: String(els.settingsSaveCurrentPage.value || "").trim(),
        toggleRawMode: String(els.settingsToggleRawMode.value || "").trim(),
        toggleTaskDone: String(els.settingsToggleTaskDone.value || "").trim(),
      },
      templates: cloneNoteTemplates(state.settingsTemplateDrafts),
    });
  }

  function applyClientPreferences(preferences: ClientPreferences): void {
    state.settings.preferences = cloneClientPreferences(preferences);
    state.settingsTemplateDrafts = cloneNoteTemplates(state.settings.preferences.templates);
    state.topLevelFoldersAsVaults = Boolean(state.settings.preferences.vaults.topLevelFoldersAsVaults);
    syncHomePageForCurrentScope();
    state.savedThemeId = currentThemeID();
    state.previewThemeId = currentThemeID();
    saveStoredClientPreferences(state.settings.preferences);
    renderHelpShortcuts();
    renderSettingsForm();
    applyUIPreferences();
    renderSourceModeButton();
    renderPageHistoryButton();
    if (state.currentPage) {
      renderNoteStudio();
      renderPageTasks();
      renderPageContext();
      renderPageProperties();
    }
  }

  async function persistSettings() {
    if (!state.settingsLoaded) {
      els.settingsStatus.textContent = "Settings are still loading. Try again in a moment.";
      return;
    }
    const previousTopLevelFoldersAsVaults = state.topLevelFoldersAsVaults;
    const nextSettings = prepareSettingsSave(
      collectClientPreferencesForm,
      collectUserSettingsForm,
      collectServerSettingsForm,
      applyClientPreferences,
    );
    els.settingsStatus.textContent = "Saving settings…";
    try {
      const userSnapshot = await fetchJSON<UserSettingsResponse>("/api/user/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextSettings.userSettings),
      });
      setUserSettingsSnapshot(userSnapshot);
      const settingsSnapshot = await fetchJSON<SettingsResponse>("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextSettings.serverSettings),
      });
      setSettingsSnapshot(settingsSnapshot);
      await loadMeta();
      await loadAvailableVaults();
      if (state.selectedPage || state.selectedSavedQuery) {
        syncURLState(true);
      }
      if (previousTopLevelFoldersAsVaults !== state.topLevelFoldersAsVaults) {
        window.location.reload();
        return;
      }
      closeSettingsModal();
      restoreNoteFocus();
      setNoteStatus(settingsSnapshot.restartRequired
        ? "Settings saved. Restart required to apply runtime changes."
        : "Settings saved.");
    } catch (error) {
      els.settingsStatus.textContent = "Settings save failed: " + errorMessage(error);
    }
  }

  function renderGlobalSearchResults(payload: SearchPayload): void {
    state.searchSelectionIndex = renderSearchResultsUI2({
      els: els,
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
  }

  async function runGlobalSearch() {
    if (!els.globalSearchInput || !els.globalSearchResults) {
      return;
    }
    const query = els.globalSearchInput.value.trim();
    if (!query) {
      renderSearchEmptyState(els, "Type to search pages, tasks, and saved queries.");
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
    state.quickSwitcherSelectionIndex = renderQuickSwitcherResultsUI2({
      els: els,
      inputValue: els.quickSwitcherInput ? els.quickSwitcherInput.value : "",
      pages: state.pages,
      templates: quickSwitcherTemplates(),
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
      onCreateTemplatePage: function (template, pagePath) {
        createPageFromTemplate(pagePath, template).catch(function (error) {
          setNoteStatus("Template create failed: " + errorMessage(error));
        });
      },
    });
  }

  function handleDocumentSelection(document: DocumentRecord): void {
    closeDocumentsModal();
    if (state.selectedPage && state.currentPage) {
      insertTextAtEditorSelection(documentLinkForSelection(document, state.selectedPage));
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
    state.documentSelectionIndex = renderDocumentResultsUI({
      els: els,
      inputValue: els.documentsInput ? els.documentsInput.value : "",
      documents: state.documents,
      onSelectDocument: handleDocumentSelection,
    });
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

  async function createPage(pagePath: string, initialMarkdown?: string): Promise<void> {
    return createPageRequest(applyCurrentScopePrefix(pagePath), {
      encodePath: encodePath,
      fetchJSON: fetchJSON,
      loadPages: loadPages,
      navigateToPage: navigateToPage,
    }, initialMarkdown ? { rawMarkdown: initialMarkdown } : undefined);
  }

  async function createPageFromTemplate(pagePath: string, template: NoteTemplate): Promise<void> {
    const targetPath = buildPagePathFromTemplate(template, pagePath);
    if (!targetPath) {
      return;
    }
    const scopedTargetPath = applyCurrentScopePrefix(targetPath);
    if (hasPage(scopedTargetPath)) {
      navigateToPage(scopedTargetPath, false);
      return;
    }
    const templatePage = await fetchJSON<PageRecord>("/api/pages/" + encodePath(template.id));
    const previousTemplateFillSession = state.templateFillSession;
    beginTemplateFillSession(scopedTargetPath, template);
    try {
      await createPage(targetPath, buildMarkdownFromTemplate(scopedTargetPath, template, templatePage.rawMarkdown));
    } catch (error) {
      state.templateFillSession = previousTemplateFillSession;
      throw error;
    }
  }

  async function uploadDocument(file: File): Promise<DocumentRecord> {
    const formData = new FormData();
    formData.append("file", file);
    if (state.selectedPage) {
      formData.append("page", state.selectedPage);
    }
    const response = await fetch("/api/documents", scopedRequestInit({
      method: "POST",
      body: formData,
    }));
    await requireOK(response);
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
      return documentLinkForSelection(document, state.selectedPage);
    }).join("\n"));
    setNoteStatus("Uploaded " + String(documents.length) + " document" + (documents.length === 1 ? "" : "s") + ".");
  }

  async function deletePage(pagePath: string): Promise<void> {
    return deletePageRequest(pagePath, state, {
      encodePath: encodePath,
      fetchJSON: fetchJSON,
      loadPages: loadPages,
      currentHomePage: currentHomePage,
      clearHomePage: clearHomePage,
      clearPageSelection: clearPageSelection,
      navigateToPage: navigateToPage,
      setNoteStatus: setNoteStatus,
    });
  }

  async function deleteFolder(folderKey: string): Promise<void> {
    return deleteFolderRequest(folderKey, state, {
      encodePath: encodePath,
      fetchJSON: fetchJSON,
      loadPages: loadPages,
      currentHomePage: currentHomePage,
      clearHomePage: clearHomePage,
      clearPageSelection: clearPageSelection,
    });
  }

  async function movePage(pagePath: string, targetPage: string): Promise<void> {
    return movePageRequest(pagePath, targetPage, {
      encodePath: encodePath,
      fetchJSON: fetchJSON,
      loadPages: loadPages,
      currentHomePage: currentHomePage,
      setHomePage: setHomePage,
      navigateToPage: navigateToPage,
    });
  }

  async function renamePage(pagePath: string, nextLeafName: string): Promise<void> {
    return renamePageRequest(pagePath, nextLeafName, {
      encodePath: encodePath,
      fetchJSON: fetchJSON,
      loadPages: loadPages,
      currentHomePage: currentHomePage,
      setHomePage: setHomePage,
      navigateToPage: navigateToPage,
    });
  }

  async function movePageToFolder(pagePath: string, folderKey: string): Promise<void> {
    return movePageToFolderRequest(pagePath, folderKey, {
      encodePath: encodePath,
      fetchJSON: fetchJSON,
      loadPages: loadPages,
      currentHomePage: currentHomePage,
      setHomePage: setHomePage,
      navigateToPage: navigateToPage,
    });
  }

  async function moveFolder(folderKey: string, targetFolder: string): Promise<void> {
    return moveFolderRequest(folderKey, targetFolder, state, {
      encodePath: encodePath,
      fetchJSON: fetchJSON,
      loadPages: loadPages,
      currentHomePage: currentHomePage,
      setHomePage: setHomePage,
      navigateToPage: navigateToPage,
      renderPages: renderPages,
    });
  }

  async function renameFolder(folderKey: string, nextLeafName: string): Promise<void> {
    return renameFolderRequest(folderKey, nextLeafName, state, {
      encodePath: encodePath,
      fetchJSON: fetchJSON,
      loadPages: loadPages,
      currentHomePage: currentHomePage,
      setHomePage: setHomePage,
      navigateToPage: navigateToPage,
      renderPages: renderPages,
    });
  }

  function renderCommandPaletteResults() {
    state.commandSelectionIndex = renderCommandResults({
      els: els,
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
      onQuickNote: function () {
        closeCommandPalette();
        createDailyNote();
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
    renderPageHistoryButton();
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
    if (els.appLayout) {
      els.appLayout.classList.toggle("rail-collapsed", !mobileLayout && !state.railOpen);
    }
    if (els.toggleRail) {
      els.toggleRail.classList.toggle("active", state.railOpen);
    }
  }

  function setRailTab(tab: string): void {
    state.railTab = ["files", "context", "tasks"].indexOf(tab) >= 0 ? tab : "files";
    if (els.railTabFiles) {
      els.railTabFiles.classList.toggle("active", state.railTab === "files");
    }
    if (els.railTabContext) {
      els.railTabContext.classList.toggle("active", state.railTab === "context");
    }
    if (els.railTabTasks) {
      els.railTabTasks.classList.toggle("active", state.railTab === "tasks");
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
      noteLocalPageChange(state.selectedPage);
      const payload = await savePageMarkdown(state.selectedPage, markdownToSave, encodePath);
      state.currentPage = payload;
      state.originalMarkdown = payload.rawMarkdown || markdownToSave;
      if (state.currentMarkdown === markdownToSave) {
        state.currentMarkdown = payload.rawMarkdown || markdownToSave;
      }
      setNoteStatus("Saved " + state.selectedPage + ".");
      await loadPages();
      if (!markdownEditorHasFocus(state, els) && !inlineTableEditorHasFocus()) {
        await loadPageDetail(state.selectedPage, true, false);
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

    const source = new EventSource(scopedEventSourceURL("/api/events"));
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
        if (shouldPromptForRemoteReload(eventName, payload)) {
          loadPages();
          loadTasks();
          loadSavedQueryTree();
          showRemoteChangeToast(String(payload.page || state.selectedPage || ""));
          return;
        }
        debounceRefresh();
      });
    });
  }

  function wireEvents() {
    on(window, "noterious:auth-required", function () {
      if (state.authenticated) {
        window.location.reload();
      }
    });
    on(els.authForm, "submit", function (event) {
      event.preventDefault();
      if (state.authGateMode === "changePassword") {
        changePassword();
        return;
      }
      if (state.authGateMode === "setup") {
        setupInitialAdmin();
        return;
      }
      login();
    });
    on(els.remoteChangeReload, "click", function () {
      reloadRemoteChangedPage();
    });
    on(els.remoteChangeDismiss, "click", function () {
      clearRemoteChangeToast();
    });
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
      if (!state.authenticated) {
        setAuthGateOpen(true, "Sign in to continue.");
        return;
      }
      const nextOpen = els.sessionMenuPanel.classList.contains("hidden");
      setSessionMenuOpen(nextOpen);
    });
    on(els.openVaultSwitcher, "click", function () {
      if (els.openVaultSwitcher.disabled) {
        return;
      }
      setVaultSwitcherOpen(!state.vaultSwitcherOpen);
    });
    on(els.logoutSession, "click", function () {
      setSessionMenuOpen(false);
      logout();
    });
    on(els.openHelp, "click", function () {
      setSessionMenuOpen(false);
      setHelpOpen(true);
    });
    on(els.openTrash, "click", function () {
      setSessionMenuOpen(false);
      setTrashOpen(true);
      loadTrash().catch(function (error) {
        setNoteStatus("Trash failed: " + errorMessage(error));
      });
    });
    on(els.openSettings, "click", function () {
      setSessionMenuOpen(false);
      setSettingsOpen(true);
    });
    on(els.settingsNavAppearance, "click", function () {
      state.settingsSection = "appearance";
      renderSettingsForm();
    });
    on(els.settingsNavTemplates, "click", function () {
      state.settingsSection = "templates";
      renderSettingsForm();
    });
    on(els.settingsNavNotifications, "click", function () {
      state.settingsSection = "notifications";
      renderSettingsForm();
    });
    on(els.settingsNavVault, "click", function () {
      state.settingsSection = "vault";
      renderSettingsForm();
    });
    on(els.settingsTemplateAdd, "click", function () {
      const nextIndex = state.settingsTemplateDrafts.length + 1;
      updateSettingsTemplateDrafts(function (templates) {
        return templates.concat([createBlankNoteTemplate("New Template " + String(nextIndex))]);
      });
      renderSettingsForm();
    });
    on(els.settingsTemplateList, "click", function (event) {
      const target = event.target instanceof HTMLElement ? event.target : null;
      const actionTarget = target ? target.closest<HTMLElement>("[data-template-action]") : null;
      if (!actionTarget) {
        return;
      }
      const templateID = String(actionTarget.getAttribute("data-template-id") || "").trim();
      const fieldIndex = Number(actionTarget.getAttribute("data-template-field-index"));
      const action = String(actionTarget.getAttribute("data-template-action") || "").trim();
      if (!templateID) {
        return;
      }

      if (action === "remove-template") {
        updateSettingsTemplateDrafts(function (templates) {
          return templates.filter(function (template) {
            return template.id !== templateID;
          });
        });
        renderSettingsForm();
        return;
      }

      if (action === "add-field") {
        updateTemplateDraft(templateID, function (template) {
          return {
            ...template,
            fields: template.fields.concat([createBlankTemplateField()]),
          };
        });
        renderSettingsForm();
        return;
      }

      if (action === "remove-field" && Number.isFinite(fieldIndex)) {
        updateTemplateDraft(templateID, function (template) {
          return {
            ...template,
            fields: template.fields.filter(function (_field, index) {
              return index !== fieldIndex;
            }),
          };
        });
        renderSettingsForm();
      }
    });
    on(els.settingsTemplateList, "input", function (event) {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (!target) {
        return;
      }
      const templateID = String(target.getAttribute("data-template-id") || "").trim();
      if (!templateID) {
        return;
      }

      const templateInput = String(target.getAttribute("data-template-input") || "").trim();
      if (templateInput === "name" && target instanceof HTMLInputElement) {
        updateTemplateDraft(templateID, function (template) {
          return {
            ...template,
            name: target.value,
          };
        });
        return;
      }
      if (templateInput === "folder" && target instanceof HTMLInputElement) {
        updateTemplateDraft(templateID, function (template) {
          return {
            ...template,
            folder: target.value,
          };
        });
        return;
      }

      const fieldInput = String(target.getAttribute("data-template-field-input") || "").trim();
      const fieldIndex = Number(target.getAttribute("data-template-field-index"));
      if (!Number.isFinite(fieldIndex)) {
        return;
      }

      if (fieldInput === "key" && target instanceof HTMLInputElement) {
        updateTemplateFieldDraft(templateID, fieldIndex, function (field) {
          return {
            ...field,
            key: target.value,
          };
        });
        return;
      }

      if (fieldInput === "default" && target instanceof HTMLInputElement) {
        updateTemplateFieldDraft(templateID, fieldIndex, function (field) {
          return {
            ...field,
            defaultValue: coerceTemplateFieldDefaultValue(field.kind, target.value),
          };
        });
      }
    });
    on(els.settingsTemplateList, "change", function (event) {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (!target) {
        return;
      }
      const templateID = String(target.getAttribute("data-template-id") || "").trim();
      const fieldIndex = Number(target.getAttribute("data-template-field-index"));
      if (!templateID || !Number.isFinite(fieldIndex)) {
        return;
      }

      const fieldInput = String(target.getAttribute("data-template-field-input") || "").trim();
      if (fieldInput === "kind" && target instanceof HTMLSelectElement) {
        updateTemplateFieldDraft(templateID, fieldIndex, function (field) {
          const nextKind = target.value as FrontmatterKind;
          return {
            ...field,
            kind: nextKind,
            defaultValue: coerceTemplateFieldDefaultValue(nextKind, field.defaultValue),
          };
        });
        renderSettingsForm();
        return;
      }

      if (fieldInput === "default-bool" && target instanceof HTMLInputElement) {
        updateTemplateFieldDraft(templateID, fieldIndex, function (field) {
          return {
            ...field,
            defaultValue: target.checked,
          };
        });
      }
    });
    on(els.openQuickSwitcher, "click", function () {
      setSessionMenuOpen(false);
      setQuickSwitcherOpen(true);
      renderQuickSwitcherResults();
    });
    on(els.openHomePage, "click", function () {
      setSessionMenuOpen(false);
      const homePage = currentHomePage();
      if (!homePage) {
        setNoteStatus("No home page configured.");
        return;
      }
      navigateToPage(homePage, false);
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
    on(els.pageHistoryButton, "click", function () {
      if (!state.selectedPage) {
        return;
      }
      setPageHistoryOpen(true);
      loadPageHistory().catch(function (error) {
        setNoteStatus("History failed: " + errorMessage(error));
      });
    });
    on(els.purgePageHistory, "click", function () {
      purgeCurrentPageHistory().catch(function (error) {
        setNoteStatus("Purge history failed: " + errorMessage(error));
      });
    });
    on(els.closeCommandModal, "click", function () {
      closeCommandPalette();
      restoreNoteFocus();
    });
    on(els.commandPaletteInput, "input", scheduleCommandPaletteRefresh);
    on(els.closeQuickSwitcherModal, "click", function () {
      closeQuickSwitcher();
      restoreNoteFocus();
    });
    on(els.quickSwitcherInput, "input", scheduleQuickSwitcherRefresh);
    on(els.closeDocumentsModal, "click", function () {
      closeDocumentsModal();
      restoreNoteFocus();
    });
    on(els.closePageHistoryModal, "click", function () {
      closePageHistoryModal();
      restoreNoteFocus();
    });
    on(els.pageHistoryShowChanges, "change", function () {
      state.historyShowChanges = Boolean(els.pageHistoryShowChanges.checked);
      renderPageHistoryPreview();
    });
    on(els.copyPageHistory, "click", function () {
      const revision = selectedPageHistoryRevision();
      if (!revision) {
        return;
      }
      const index = state.pageHistory.findIndex(function (entry) {
        return entry.id === revision.id;
      });
      const previousMarkdown = index >= 0 && index + 1 < state.pageHistory.length
        ? state.pageHistory[index + 1].rawMarkdown
        : "";
      copyCodeBlock(
        state.historyShowChanges
          ? historyDiffContent(revision.rawMarkdown, previousMarkdown)
          : revision.rawMarkdown
      ).catch(function (error) {
        setNoteStatus("Copy history failed: " + errorMessage(error));
      });
    });
    on(els.restorePageHistory, "click", function () {
      const revision = selectedPageHistoryRevision();
      if (!revision) {
        return;
      }
      restorePageHistoryRevision(revision);
    });
    on(els.emptyTrash, "click", function () {
      emptyTrash().catch(function (error) {
        setNoteStatus("Empty trash failed: " + errorMessage(error));
      });
    });
    on(els.closeTrashModal, "click", function () {
      closeTrashModal();
      restoreNoteFocus();
    });
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
    on(els.taskFilters, "click", function (rawEvent) {
      const target = (rawEvent as Event).target instanceof HTMLElement ? (rawEvent as Event).target as HTMLElement : null;
      const button = target ? target.closest("[data-task-filter]") : null;
      if (!button) {
        return;
      }
      const filter = button.getAttribute("data-task-filter") || "";
      if (filter === "current-page") {
        state.taskFilters.currentPage = !state.taskFilters.currentPage;
      } else if (filter === "not-done") {
        state.taskFilters.notDone = !state.taskFilters.notDone;
      } else if (filter === "has-due") {
        state.taskFilters.hasDue = !state.taskFilters.hasDue;
      } else if (filter === "has-reminder") {
        state.taskFilters.hasReminder = !state.taskFilters.hasReminder;
      }
      els.taskFilters.querySelectorAll(".task-filter").forEach(function (btn) {
        const key = btn.getAttribute("data-task-filter") || "";
        btn.classList.toggle("active",
          (key === "current-page" && state.taskFilters.currentPage)
          || (key === "not-done" && state.taskFilters.notDone)
          || (key === "has-due" && state.taskFilters.hasDue)
          || (key === "has-reminder" && state.taskFilters.hasReminder)
        );
      });
      renderPageTasks();
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
      if (matchesHotkey(state.settings.preferences.hotkeys.toggleTaskDone, event) && selectionOnTaskLine()) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        toggleTaskDoneAtSelection();
        return;
      }
      if (event.altKey && event.shiftKey && !event.ctrlKey && !event.metaKey) {
        if (event.key === "ArrowUp") {
          if (selectionOnTaskLine()) {
            event.preventDefault();
          }
          if (moveCurrentTaskBlock(-1)) {
            return;
          }
          return;
        }
        if (event.key === "ArrowDown") {
          if (selectionOnTaskLine()) {
            event.preventDefault();
          }
          if (moveCurrentTaskBlock(1)) {
            return;
          }
          return;
        }
        if (event.key === "ArrowRight") {
          if (selectionOnTaskLine()) {
            event.preventDefault();
          }
          if (indentCurrentTaskBlock(1)) {
            return;
          }
          return;
        }
        if (event.key === "ArrowLeft") {
          if (selectionOnTaskLine()) {
            event.preventDefault();
          }
          if (indentCurrentTaskBlock(-1)) {
            return;
          }
          return;
        }
      }
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
    on(els.closeSearchModal, "click", function () {
      closeSearchModal();
      restoreNoteFocus();
    });
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
    on(els.searchModalShell, "click", function (event) {
      if (event.target === els.searchModalShell) {
        closeSearchModal();
        restoreNoteFocus();
      }
    });
    on(els.commandModalShell, "click", function (event) {
      if (event.target === els.commandModalShell) {
        closeCommandPalette();
        restoreNoteFocus();
      }
    });
    on(els.quickSwitcherModalShell, "click", function (event) {
      if (event.target === els.quickSwitcherModalShell) {
        closeQuickSwitcher();
        restoreNoteFocus();
      }
    });
    on(els.documentsModalShell, "click", function (event) {
      if (event.target === els.documentsModalShell) {
        closeDocumentsModal();
        restoreNoteFocus();
      }
    });
    on(els.noteHeading, "focus", function () {
      if (!state.selectedPage || !state.currentPage || els.noteHeading.disabled) {
        return;
      }
      window.setTimeout(function () {
        els.noteHeading.select();
      }, 0);
    });
    on(els.noteHeading, "keydown", function (rawEvent) {
      const event = rawEvent as KeyboardEvent;
      if (event.key === "Enter") {
        event.preventDefault();
        els.noteHeading.blur();
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setNoteHeadingValue(currentPageTitleValue() || state.selectedPage || "", Boolean(state.selectedPage && state.currentPage));
        els.noteHeading.blur();
      }
    });
    on(els.noteHeading, "blur", function () {
      if (!state.selectedPage || !state.currentPage || els.noteHeading.disabled) {
        return;
      }
      renameCurrentPageFromTitle(els.noteHeading.value).catch(function (error) {
        setNoteStatus("Rename failed: " + errorMessage(error));
      });
    });
    on(els.closeHelpModal, "click", function () {
      closeHelpModal();
      restoreNoteFocus();
    });
    on(els.helpModalShell, "click", function (event) {
      if (event.target === els.helpModalShell) {
        closeHelpModal();
        restoreNoteFocus();
      }
    });
    on(els.closeSettingsModal, "click", function () {
      closeSettingsModal();
      restoreNoteFocus();
    });
    on(els.cancelSettings, "click", function () {
      closeSettingsModal();
      restoreNoteFocus();
    });
    on(els.settingsTheme, "change", function () {
      previewTheme(String(els.settingsTheme.value || defaultThemeId).trim() || defaultThemeId, false);
    });
    on(els.settingsThemeUpload, "click", function () {
      els.settingsThemeUploadInput.value = "";
      els.settingsThemeUploadInput.click();
    });
    on(els.settingsThemeUploadInput, "change", function () {
      const file = els.settingsThemeUploadInput.files && els.settingsThemeUploadInput.files[0]
        ? els.settingsThemeUploadInput.files[0]
        : null;
      if (!file) {
        return;
      }
      els.settingsStatus.textContent = "Uploading theme…";
      uploadThemeFile(file).catch(function (error) {
        els.settingsStatus.textContent = "Theme upload failed: " + errorMessage(error);
      }).finally(function () {
        els.settingsThemeUploadInput.value = "";
      });
    });
    on(els.settingsThemeDelete, "click", function () {
      deleteCurrentTheme().catch(function (error) {
        els.settingsStatus.textContent = "Theme delete failed: " + errorMessage(error);
      });
    });
    bindSettingsHotkeyInputs();
    on(els.saveSettings, "click", function () {
      persistSettings().catch(function (error) {
        els.settingsStatus.textContent = errorMessage(error);
      });
    });
    on(els.settingsModalShell, "click", function (event) {
      if (event.target === els.settingsModalShell) {
        closeSettingsModal();
        restoreNoteFocus();
      }
    });
    on(els.pageHistoryModalShell, "click", function (event) {
      if (event.target === els.pageHistoryModalShell) {
        closePageHistoryModal();
        restoreNoteFocus();
      }
    });
    on(els.trashModalShell, "click", function (event) {
      if (event.target === els.trashModalShell) {
        closeTrashModal();
        restoreNoteFocus();
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
      if (!target || !target.closest("#vault-switcher")) {
        setVaultSwitcherOpen(false);
      }
      if (!target || !target.closest("#tree-context-menu")) {
        closeTreeContextMenu();
      }
      if (!target || (!target.closest("#inline-task-picker") && !target.closest("[data-task-date-edit]"))) {
        closeTaskPickers();
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
      if (event.key === "Escape" && !els.treeContextMenu.classList.contains("hidden")) {
        closeTreeContextMenu();
        return;
      }
      if (event.key === "Escape" && !els.sessionMenuPanel.classList.contains("hidden")) {
        setSessionMenuOpen(false);
        return;
      }
      if (event.key === "Escape" && state.vaultSwitcherOpen) {
        setVaultSwitcherOpen(false);
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
      if (event.key === "Escape" && taskPickerState.mode) {
        closeTaskPickers();
        return;
      }
      if (event.key === "Escape" && els.searchModalShell && !els.searchModalShell.classList.contains("hidden")) {
        closeSearchModal();
        restoreNoteFocus();
        return;
      }
      if (event.key === "Escape" && els.commandModalShell && !els.commandModalShell.classList.contains("hidden")) {
        closeCommandPalette();
        restoreNoteFocus();
        return;
      }
      if (event.key === "Escape" && els.quickSwitcherModalShell && !els.quickSwitcherModalShell.classList.contains("hidden")) {
        closeQuickSwitcher();
        restoreNoteFocus();
        return;
      }
      if (event.key === "Escape" && els.documentsModalShell && !els.documentsModalShell.classList.contains("hidden")) {
        closeDocumentsModal();
        restoreNoteFocus();
        return;
      }
      if (event.key === "Escape" && els.pageHistoryModalShell && !els.pageHistoryModalShell.classList.contains("hidden")) {
        closePageHistoryModal();
        restoreNoteFocus();
        return;
      }
      if (event.key === "Escape" && els.trashModalShell && !els.trashModalShell.classList.contains("hidden")) {
        closeTrashModal();
        restoreNoteFocus();
        return;
      }
      if (event.key === "Escape" && els.helpModalShell && !els.helpModalShell.classList.contains("hidden")) {
        closeHelpModal();
        restoreNoteFocus();
        return;
      }
      if (event.key === "Escape" && els.settingsModalShell && !els.settingsModalShell.classList.contains("hidden")) {
        closeSettingsModal();
        restoreNoteFocus();
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
      if (matchesHotkey(state.settings.preferences.hotkeys.quickNote, event)) {
        event.preventDefault();
        createDailyNote();
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
      closeTreeContextMenu();
    });
    window.addEventListener("focus", function () {
      state.windowBlurred = false;
      if (state.tableEditor && !els.inlineTablePanel.classList.contains("hidden")) {
        restoreInlineTableEditorFocusUI(state, els);
        return;
      }
      restoreNoteFocus();
    });
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) {
        state.windowBlurred = true;
        captureEditorFocusSpec(state, els);
        return;
      }
      state.windowBlurred = false;
      if (state.tableEditor && !els.inlineTablePanel.classList.contains("hidden")) {
        restoreInlineTableEditorFocusUI(state, els);
        return;
      }
      restoreNoteFocus();
    });
    window.addEventListener("popstate", function () {
      closeTreeContextMenu();
      applyURLState();
    });
    on(window, "resize", closeTreeContextMenu);
    on(window, "scroll", closeTreeContextMenu);
  }

  async function boot() {
    registerPWA();
    renderSessionState();
    renderHomeButton();
    renderPageHistoryButton();
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
        const task = resolvePageTask(
          state.currentPage,
          detail.ref ? String(detail.ref) : "",
          Number(detail.lineNumber) || 0
        );
        if (task) {
          toggleTaskDone(task);
        }
      });
      on(markdownEditorApi.host, "noterious:task-date-edit", function (event) {
        const detail = (event as CustomEvent<TaskDateEditDetail>).detail || {};
        const ref = detail.ref ? String(detail.ref) : "";
        const field = detail.field === "remind" ? "remind" : "due";
        const left = Number(detail.left) || 0;
        const top = Number(detail.top) || 0;
        openInlineTaskPicker(ref, field, left, top);
      });
      on(markdownEditorApi.host, "noterious:task-delete", function (event) {
        const detail = (event as CustomEvent<TaskDeleteDetail>).detail || {};
        const ref = detail.ref ? String(detail.ref) : "";
        deleteTaskInline(ref).catch(function (error) {
          setNoteStatus("Delete task failed: " + errorMessage(error));
        });
      });
      on(markdownEditorApi.host, "noterious:table-open", function (event) {
        const detail = (event as CustomEvent<TableOpenDetail>).detail || {};
        const startLine = Number(detail.startLine) || 0;
        const row = Math.max(0, Number(detail.row) || 0);
        const col = Math.max(0, Number(detail.col) || 0);
        const left = Number(detail.left);
        const top = Number(detail.top);
        const width = Number(detail.width);
        const anchor = Number.isFinite(left) && Number.isFinite(top)
          ? {
              left: left,
              top: top,
              width: Number.isFinite(width) ? width : 520,
            }
          : undefined;
        openInlineTableEditor(startLine, row, col, anchor);
      });
    }
    on(window, "resize", function () {
      positionInlineTableEditorPanel();
    });
    on(window, "scroll", function () {
      if (state.tableEditor) {
        anchorInlineTableEditorToRenderedTableUI(state, els, state.tableEditor.startLine);
      }
    });
    setDebugOpen(false);
    setRailTab("files");
    setRailOpen(!window.matchMedia("(max-width: 1180px)").matches);
    setPageSearchOpen(false);
    setSourceOpen(false);
    state.themeCache = loadStoredThemeCache();
    state.settings.preferences = loadStoredClientPreferences();
    state.topLevelFoldersAsVaults = Boolean(state.settings.preferences.vaults.topLevelFoldersAsVaults);
    state.savedThemeId = currentThemeID();
    state.previewThemeId = currentThemeID();
    applyUIPreferences();
    renderNoteStudio();
    renderPageTasks();
    renderPageContext();
    renderPageProperties();
    renderHelpShortcuts();
    renderSettingsForm();
    wireEvents();
    try {
      const session = await loadSession();
      setAuthSession(session);
      if (session.setupRequired) {
        setAuthGateOpen(true, "Set up your account to continue.");
        return;
      }
      if (!session.authenticated) {
        setAuthGateOpen(true, "Sign in to continue.");
        return;
      }
      if (session.user && session.user.mustChangePassword) {
        setAuthGateOpen(true, "Change your password to continue.");
        return;
      }
      await loadAuthenticatedApp();
    } catch (error) {
      setAuthGateOpen(true, errorMessage(error));
    }
  }

  boot();
})();
