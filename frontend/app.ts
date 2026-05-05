import { normalizePageDraftPath, pageTitleFromPath } from "./commands";
import {
  backupManifestFilename,
  buildBackupManifest,
} from "./backupManifest";
import {
  parseBackupManifestJSON,
  validateBackupManifest,
  type BackupManifestValidationResult,
} from "./backupValidation";
import {
  backupScriptFilename,
  buildBackupScript,
} from "./backupScript";
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
  type LoadedPageDetail,
  resolvePageTask,
  savePageMarkdown,
  saveTask,
  toggleTaskDone as toggleTaskDoneRequest,
} from "./details";
import {
  buildPathDialogAssist,
  type PathDialogSuggestion,
} from "./pathAssist";
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
  markdownEditorSetEditable,
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
import { currentClientInstanceId, fetchJSON, HTTPError, requireOK, scopedEventSourceURL, scopedRequestInit, setActiveScopePrefix } from "./http";
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
import { canonicalizeHotkey, hotkeyDefinitions, hotkeyFromEvent, hotkeyLabel, hotkeyProducesText, matchesHotkey } from "./hotkeys";
import {
  historyDiffContent,
  renderPageHistory as renderPageHistoryUI,
  renderPageHistoryPreview as renderPageHistoryPreviewUI,
  renderTrash as renderTrashUI,
  selectedPageHistoryRevision as selectedPageHistoryRevisionUI,
  setPageHistoryOpen as setPageHistoryOpenUI,
  setTrashOpen as setTrashOpenUI,
} from "./historyTrashUi";
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
  documentUploadHint,
  documentUploadTargetLabel,
} from "./documents";
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
  filterPagesByScope,
  filterPagesByTag,
  type PageTreeMenuTarget,
  renderPageContext as renderPageContextUI,
  renderPageTags as renderPageTagsUI,
  renderPageTasks as renderPageTasksUI,
  type TaskPanelFilters,
} from "./pageViews";
import {
  resolveVisibleVaultSelection,
  scopePrefixForVaultSelection,
} from "./vaultScopes";
import {
  closeTreeContextMenu as closeTreeContextMenuUI,
  openTreeContextMenu as openTreeContextMenuUI,
  renderPagesSection,
} from "./pageTreeUi";
import { prepareSettingsSaveWithExtra } from "./settingsPersistence";
import { collectPropertyValueSuggestions } from "./propertySuggestions";
import {
  applyPropertyDraftKind,
  coercePropertyValue,
  makePropertyDraft,
  propertyDraftValue,
  renderPageProperties as renderPagePropertiesUI,
} from "./properties";
import {
  allNoteTemplatesFromPages,
  buildPropertyKindHintMetadataPatch,
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
import { closeSlashMenu, documentCommandsForText, maybeOpenSlashMenu, moveSlashSelection, openSlashMenuWithCommands, queryIntentForText, wikilinkCommandsForContext } from "./slashMenu";
import { hasUnsafeRemoteSyncUIState as hasUnsafeRemoteSyncUIStateHelper } from "./remoteSync";
import { createPageConflictDialogDraft, createPageConflictDraft, type PageConflictDraft, type PageConflictMode } from "./pageConflict";
import { savePageConflictResolutionFlow } from "./pageConflictSaveFlow";
import { bindPageEventStream } from "./pageEventStream";
import { runSelectedPageRemoteSync } from "./pageSyncIntegration";
import {
  buildSystemHelpPage,
  emptySystemDerivedPage,
  loadSystemHelpMarkdown,
  placeholderHelpMarkdown,
  SYSTEM_HELP_LABEL,
  SYSTEM_HELP_PATH,
} from "./systemHelp";
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
  AISettings,
  AISettingsResponse,
  AppSettings as SettingsModel,
  AppScreen,
  AuthSessionResponse,
  AuthenticatedUser,
  FolderListResponse,
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
  QueryCopilotResponse,
  Preferences as ClientPreferences,
  QueryBlockRecord,
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
  anchorTop?: number;
  anchorBottom?: number;
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

interface AppState {
  appScreen: AppScreen;
  selectedPage: string;
  pages: PageSummary[];
  folders: string[];
  documents: DocumentRecord[];
  tasks: TaskRecord[];
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
  railOpen: boolean;
  railTab: string;
  sourceOpen: boolean;
  settings: SettingsModel;
  appliedVault: VaultSettings;
  settingsRestartRequired: boolean;
  settingsRestartRequiredReasons: string[];
  settingsLoaded: boolean;
  aiSettingsLoaded: boolean;
  userSettingsLoaded: boolean;
  serverMeta: MetaResponse | null;
  backupManifestValidation: BackupManifestValidationResult | null;
  aiSettings: AISettings;
  aiAPIKeyConfigured: boolean;
  aiClearKeyPending: boolean;
  activeScopePrefix: string;
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
  remoteChangeSyncToken: number;
  expectedLocalChangePage: string;
  expectedLocalChangeCount: number;
  expectedLocalChangeUntil: number;
  pageConflict: PageConflictDraft | null;
  pageConflictRemoteLoaded: LoadedPageDetail | null;
  pageConflictStatus: string;
  helpMarkdown: string;
  helpLoaded: boolean;
  helpLoading: boolean;
  helpError: string;
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

interface ActionDialogFieldSpec {
  key: string;
  label: string;
  placeholder?: string;
  value?: string;
  autocapitalize?: string;
  spellcheck?: boolean;
  describe?: (value: string, values: Record<string, string>) => ActionDialogFieldState;
}

interface ActionDialogFieldSuggestion extends PathDialogSuggestion {}

interface ActionDialogFieldState {
  error?: string;
  helper?: string;
  helperTone?: "neutral" | "warn";
  suggestions?: ActionDialogFieldSuggestion[];
}

interface ActionDialogOptions {
  eyebrow?: string;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  fields?: ActionDialogFieldSpec[];
  validate?: (values: Record<string, string>) => string;
}

interface ActionDialogSession {
  options: ActionDialogOptions;
  values: Record<string, string>;
  status: string;
  resolve: (value: boolean | Record<string, string> | null) => void;
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
    appScreen: "notes",
    selectedPage: "",
    pages: [],
    folders: [],
    documents: [],
    tasks: [],
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
      documents: {
        uploadPlacement: "same-folder",
        uploadSubfolder: "_files",
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
    settingsRestartRequiredReasons: [],
    settingsLoaded: false,
    aiSettingsLoaded: false,
    userSettingsLoaded: false,
    serverMeta: null,
    backupManifestValidation: null,
    aiSettings: {
      enabled: false,
      provider: "openai-compatible",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-5-mini",
    },
    aiAPIKeyConfigured: false,
    aiClearKeyPending: false,
    activeScopePrefix: "",
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
    remoteChangeSyncToken: 0,
    expectedLocalChangePage: "",
    expectedLocalChangeCount: 0,
    expectedLocalChangeUntil: 0,
    pageConflict: null,
    pageConflictRemoteLoaded: null,
    pageConflictStatus: "",
    helpMarkdown: "",
    helpLoaded: false,
    helpLoading: false,
    helpError: "",
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
    notesScreen: requiredElement<HTMLElement>("notes-screen"),
    noteLayout: requiredElement<HTMLElement>("note-layout"),
    noteSurface: requiredElement<HTMLElement>("note-surface"),
    fileUploadInput: requiredElement<HTMLInputElement>("file-upload-input"),
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
    documentsUploadHint: requiredElement<HTMLElement>("documents-upload-hint"),
    documentsResults: requiredElement<HTMLDivElement>("documents-results"),
    conflictModalShell: requiredElement<HTMLElement>("conflict-modal-shell"),
    closeConflictModal: requiredElement<HTMLButtonElement>("close-conflict-modal"),
    conflictTitle: requiredElement<HTMLElement>("conflict-title"),
    conflictSummary: requiredElement<HTMLElement>("conflict-summary"),
    conflictCallout: requiredElement<HTMLElement>("conflict-callout"),
    conflictBaseMarkdown: requiredElement<HTMLTextAreaElement>("conflict-base-markdown"),
    conflictLocalMarkdown: requiredElement<HTMLTextAreaElement>("conflict-local-markdown"),
    conflictRemoteMarkdown: requiredElement<HTMLTextAreaElement>("conflict-remote-markdown"),
    conflictResolutionPanel: requiredElement<HTMLElement>("conflict-resolution-panel"),
    conflictResolutionMarkdown: requiredElement<HTMLTextAreaElement>("conflict-resolution-markdown"),
    conflictLoadBase: requiredElement<HTMLButtonElement>("conflict-load-base"),
    conflictLoadLocal: requiredElement<HTMLButtonElement>("conflict-load-local"),
    conflictLoadRemote: requiredElement<HTMLButtonElement>("conflict-load-remote"),
    conflictReloadRemote: requiredElement<HTMLButtonElement>("conflict-reload-remote"),
    conflictSaveResolution: requiredElement<HTMLButtonElement>("conflict-save-resolution"),
    conflictCancel: requiredElement<HTMLButtonElement>("conflict-cancel"),
    conflictStatus: requiredElement<HTMLElement>("conflict-status"),
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
    actionDialogShell: requiredElement<HTMLElement>("action-dialog-shell"),
    closeActionDialog: requiredElement<HTMLButtonElement>("close-action-dialog"),
    actionDialogEyebrow: requiredElement<HTMLElement>("action-dialog-eyebrow"),
    actionDialogTitle: requiredElement<HTMLElement>("action-dialog-title"),
    actionDialogMessage: requiredElement<HTMLElement>("action-dialog-message"),
    actionDialogForm: requiredElement<HTMLFormElement>("action-dialog-form"),
    actionDialogFields: requiredElement<HTMLDivElement>("action-dialog-fields"),
    actionDialogStatus: requiredElement<HTMLElement>("action-dialog-status"),
    actionDialogCancel: requiredElement<HTMLButtonElement>("action-dialog-cancel"),
    actionDialogConfirm: requiredElement<HTMLButtonElement>("action-dialog-confirm"),
    settingsModalShell: requiredElement<HTMLElement>("settings-modal-shell"),
    closeSettingsModal: requiredElement<HTMLButtonElement>("close-settings-modal"),
    settingsEyebrow: requiredElement<HTMLElement>("settings-eyebrow"),
    settingsTitle: requiredElement<HTMLElement>("settings-title"),
    settingsNavAppearance: requiredElement<HTMLButtonElement>("settings-nav-appearance"),
    settingsNavHotkeys: requiredElement<HTMLButtonElement>("settings-nav-hotkeys"),
    settingsNavTemplates: requiredElement<HTMLButtonElement>("settings-nav-templates"),
    settingsNavNotifications: requiredElement<HTMLButtonElement>("settings-nav-notifications"),
    settingsNavAI: requiredElement<HTMLButtonElement>("settings-nav-ai"),
    settingsNavVault: requiredElement<HTMLButtonElement>("settings-nav-vault"),
    settingsGroupServer: requiredElement<HTMLElement>("settings-group-server"),
    settingsGroupSession: requiredElement<HTMLElement>("settings-group-session"),
    settingsGroupHotkeys: requiredElement<HTMLElement>("settings-group-hotkeys"),
    settingsGroupTemplates: requiredElement<HTMLElement>("settings-group-templates"),
    settingsGroupUserNotifications: requiredElement<HTMLElement>("settings-group-user-notifications"),
    settingsGroupAI: requiredElement<HTMLElement>("settings-group-ai"),
    cancelSettings: requiredElement<HTMLButtonElement>("cancel-settings"),
    saveSettings: requiredElement<HTMLButtonElement>("save-settings"),
    settingsVaultPath: requiredElement<HTMLInputElement>("settings-vault-path"),
    settingsNtfyInterval: requiredElement<HTMLInputElement>("settings-ntfy-interval"),
    settingsDocumentsPlacement: requiredElement<HTMLSelectElement>("settings-documents-placement"),
    settingsDocumentsSubfolder: requiredElement<HTMLInputElement>("settings-documents-subfolder"),
    settingsDocumentsSubfolderField: requiredElement<HTMLElement>("settings-documents-subfolder-field"),
    settingsBackupVaultPath: requiredElement<HTMLElement>("settings-backup-vault-path"),
    settingsBackupDataDir: requiredElement<HTMLElement>("settings-backup-data-dir"),
    settingsBackupDatabase: requiredElement<HTMLElement>("settings-backup-database"),
    settingsBackupDownload: requiredElement<HTMLButtonElement>("settings-backup-download"),
    settingsBackupScript: requiredElement<HTMLButtonElement>("settings-backup-script"),
    settingsBackupValidate: requiredElement<HTMLButtonElement>("settings-backup-validate"),
    settingsBackupValidateInput: requiredElement<HTMLInputElement>("settings-backup-validate-input"),
    settingsBackupNote: requiredElement<HTMLElement>("settings-backup-note"),
    settingsBackupValidation: requiredElement<HTMLDivElement>("settings-backup-validation"),
    settingsRuntimeListenAddr: requiredElement<HTMLElement>("settings-runtime-listen-addr"),
    settingsRuntimeServerTime: requiredElement<HTMLElement>("settings-runtime-server-time"),
    settingsRuntimeCurrentVault: requiredElement<HTMLElement>("settings-runtime-current-vault"),
    settingsRuntimeWatcher: requiredElement<HTMLElement>("settings-runtime-watcher"),
    settingsRuntimeWatcherDetails: requiredElement<HTMLElement>("settings-runtime-watcher-details"),
    settingsRuntimeNotifications: requiredElement<HTMLElement>("settings-runtime-notifications"),
    settingsRuntimeIndex: requiredElement<HTMLElement>("settings-runtime-index"),
    settingsRuntimeRestartRequired: requiredElement<HTMLElement>("settings-runtime-restart-required"),
    settingsRuntimeRestartReasons: requiredElement<HTMLElement>("settings-runtime-restart-reasons"),
    settingsRuntimeHealth: requiredElement<HTMLElement>("settings-runtime-health"),
    settingsUserNtfyTopicUrl: requiredElement<HTMLInputElement>("settings-user-ntfy-topic-url"),
    settingsUserNtfyToken: requiredElement<HTMLInputElement>("settings-user-ntfy-token"),
    settingsAIEnabled: requiredElement<HTMLInputElement>("settings-ai-enabled"),
    settingsAIBaseURL: requiredElement<HTMLInputElement>("settings-ai-base-url"),
    settingsAIModel: requiredElement<HTMLInputElement>("settings-ai-model"),
    settingsAIAPIKey: requiredElement<HTMLInputElement>("settings-ai-api-key"),
    settingsAIClearKey: requiredElement<HTMLButtonElement>("settings-ai-clear-key"),
    settingsAIKeyStatus: requiredElement<HTMLElement>("settings-ai-key-status"),
    settingsAIHelp: requiredElement<HTMLElement>("settings-ai-help"),
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

  let actionDialogSession: ActionDialogSession | null = null;

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
    const confirmed = await confirmAction({
      title: "Delete Task",
      message: 'Delete "' + (task.text || task.ref) + '"?',
      confirmLabel: "Delete Task",
      danger: true,
    });
    if (!confirmed) {
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

  function openInlineTaskPicker(ref: string, mode: "due" | "remind", left: number, top: number, anchorTop?: number, anchorBottom?: number): void {
    openInlineTaskPickerUI(taskPickerState, {
      ref: ref,
      mode: mode,
      left: left,
      top: top,
      anchorTop: anchorTop,
      anchorBottom: anchorBottom,
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
    if (pagePath && state.selectedPage === pagePath) {
      refreshCurrentDetail(true);
    }
  }

  function applyLoadedPageDetailState(pagePath: string, loaded: LoadedPageDetail, nextMarkdown: string): boolean {
    const page = loaded.page;
    const derived = loaded.derived;

    state.currentPage = page;
    state.currentDerived = derived;
    state.currentMarkdown = nextMarkdown;
    state.originalMarkdown = page.rawMarkdown || "";
    if (state.remoteChangePage && state.remoteChangePage === (page.page || pagePath)) {
      clearRemoteChangeToast();
    }
    clearAutosaveTimer();
    clearPropertyDraft();
    const templateFillActive = openTemplateFillDraft(page);
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
      nextMarkdown
    );
    renderNoteStudio();
    renderPageTasks();
    renderPageTags();
    renderPageContext();
    renderPageProperties();
    return templateFillActive;
  }

  function restoreCurrentEditorViewport(selectionStart: number, selectionEnd: number, scrollTop: number, focusEditor: boolean): void {
    const clampedStart = Math.max(0, Math.min(selectionStart, state.currentMarkdown.length));
    const clampedEnd = Math.max(0, Math.min(selectionEnd, state.currentMarkdown.length));
    setMarkdownEditorSelection(state, els, clampedStart, clampedEnd);
    setMarkdownEditorScrollTop(state, els, scrollTop);
    if (focusEditor) {
      focusMarkdownEditor(state, els, {preventScroll: true});
      setMarkdownEditorSelection(state, els, clampedStart, clampedEnd);
    }
  }

  function propertyValueInputHasFocus(): boolean {
    const active = document.activeElement;
    return active instanceof HTMLElement &&
      els.pageProperties.contains(active) &&
      active.matches("[data-property-value-input='true']");
  }

  function hasUnsafeRemoteSyncUIState(): boolean {
    return hasUnsafeRemoteSyncUIStateHelper({
      propertyDraftOpen: Boolean(state.propertyDraft),
      propertyTypeMenuOpen: Boolean(state.propertyTypeMenuKey),
      propertyValueInputFocused: propertyValueInputHasFocus(),
      taskPickerOpen: taskPickerState.mode === "due" || taskPickerState.mode === "remind",
      inlineTableEditorOpen: inlineTableEditorOpen(),
      inlineTableEditorFocused: inlineTableEditorHasFocus(),
      noteTitleFocused: document.activeElement === els.noteHeading,
      noteTitleEditing: state.renamingPageTitle,
    });
  }

  async function syncSelectedRemotePage(pagePath: string): Promise<void> {
    if (!pagePath || state.selectedPage !== pagePath) {
      return;
    }

    state.remoteChangeSyncToken += 1;
    const syncToken = state.remoteChangeSyncToken;
    const selectionStart = markdownEditorSelectionStart(state, els);
    const selectionEnd = markdownEditorSelectionEnd(state, els);
    const scrollTop = markdownEditorScrollTop(state, els);
    const focusEditor = markdownEditorHasFocus(state, els);

    await runSelectedPageRemoteSync({
      pagePath,
      baseMarkdown: state.originalMarkdown,
      localMarkdown: state.currentMarkdown,
      unsafeUIState: hasUnsafeRemoteSyncUIState(),
      selectionStart,
      selectionEnd,
      scrollTop,
      focusEditor,
      loadRemoteDetail: function (targetPage: string) {
        return loadPageDetailData(targetPage, encodePath, "", null);
      },
      shouldContinue: function () {
        return state.remoteChangeSyncToken === syncToken && state.selectedPage === pagePath;
      },
      formatErrorMessage: errorMessage,
      applyLoadedPageDetailState: applyLoadedPageDetailState,
      restoreCurrentEditorViewport: restoreCurrentEditorViewport,
      showRemoteChangeToast: showRemoteChangeToast,
      openConflict: function (draft, loaded, status, noteStatus) {
        state.pageConflict = draft;
        state.pageConflictRemoteLoaded = loaded;
        state.pageConflictStatus = status;
        setPageConflictOpen(true);
        setNoteStatus(noteStatus);
      },
      setNoteStatus: setNoteStatus,
      refreshCollections: function () {
        void loadPages();
        void loadTasks();
      },
    });
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

  function helpScreenMarkdown(): string {
    if (state.helpLoaded && state.helpMarkdown) {
      return state.helpMarkdown;
    }
    if (state.helpLoading) {
      return placeholderHelpMarkdown("Loading built-in help…");
    }
    if (state.helpError) {
      return placeholderHelpMarkdown("Help could not be loaded.\n\n" + state.helpError);
    }
    return placeholderHelpMarkdown("Loading built-in help…");
  }

  function currentStudioPageView(): PageRecord | null {
    if (state.appScreen === "help") {
      return buildSystemHelpPage(helpScreenMarkdown());
    }
    return buildCurrentPageView(state.currentPage, state.currentMarkdown);
  }

  function currentStudioDerived(): DerivedPage | null {
    if (state.appScreen === "help") {
      return emptySystemDerivedPage();
    }
    return state.currentDerived;
  }

  function studioPageEditable(): boolean {
    return state.appScreen === "notes" && Boolean(state.selectedPage && state.currentPage);
  }

  function studioPageAvailable(): boolean {
    return state.appScreen === "help" || Boolean(state.selectedPage && state.currentPage);
  }

  function renderAppScreen(): void {
    if (els.appLayout) {
      els.appLayout.classList.toggle("rail-collapsed", !state.railOpen);
    }
    els.toggleRail.disabled = false;
    if (state.appScreen === "help") {
      els.detailPath.textContent = SYSTEM_HELP_LABEL;
      return;
    }
    if (state.selectedPage) {
      els.detailPath.textContent = state.selectedPage;
      return;
    }
    els.detailPath.textContent = "Select a page";
  }

  function setAppScreen(screen: AppScreen, replaceURL: boolean): void {
    state.appScreen = screen;
    renderAppScreen();
    syncURLState(replaceURL);
  }

  function openHelpScreen(replaceURL: boolean): void {
    setSessionMenuOpen(false);
    clearPropertyDraft();
    closeSlashMenu(state, els);
    closeTaskPickers();
    els.searchModalShell.classList.add("hidden");
    els.commandModalShell.classList.add("hidden");
    els.quickSwitcherModalShell.classList.add("hidden");
    els.documentsModalShell.classList.add("hidden");
    els.pageHistoryModalShell.classList.add("hidden");
    els.trashModalShell.classList.add("hidden");
    els.settingsModalShell.classList.add("hidden");
    setAppScreen("help", replaceURL);
    renderNoteStudio();
    renderPageContext();
    renderPageProperties();
    if (!state.helpLoaded && !state.helpLoading) {
      void loadHelpPage();
    }
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
      loadAISettings().catch(function (error) {
        setNoteStatus("AI settings failed: " + errorMessage(error));
      }),
      loadUserSettings().catch(function (error) {
        setNoteStatus("User settings failed: " + errorMessage(error));
      }),
      loadMeta(),
      loadPages(),
      loadTasks(),
      loadDocuments(),
    ]);
    applyURLState();
    connectEvents();
  }

  async function loadHelpPage(force?: boolean): Promise<void> {
    if (state.helpLoading) {
      return;
    }
    if (state.helpLoaded && !force) {
      if (state.appScreen === "help") {
        renderNoteStudio();
        renderPageContext();
        renderPageProperties();
      }
      return;
    }
    state.helpLoading = true;
    state.helpError = "";
    if (state.appScreen === "help") {
      renderNoteStudio();
    }
    try {
      state.helpMarkdown = await loadSystemHelpMarkdown();
      state.helpLoaded = true;
      if (state.appScreen === "help") {
        setNoteStatus("Viewing built-in help.");
      }
    } catch (error) {
      state.helpMarkdown = "";
      state.helpLoaded = false;
      state.helpError = errorMessage(error);
      if (state.appScreen === "help") {
        setNoteStatus("Help failed to load: " + state.helpError);
      }
    } finally {
      state.helpLoading = false;
      if (state.appScreen === "help") {
        renderNoteStudio();
        renderPageContext();
        renderPageProperties();
      }
    }
  }

  function setCurrentScopePrefix(prefix: string): void {
    state.activeScopePrefix = normalizePageDraftPath(prefix || "");
    setActiveScopePrefix(state.topLevelFoldersAsVaults ? state.activeScopePrefix : "");
  }

  function setVisibleVaultState(availableVaults: VaultRecord[], currentVault: VaultRecord | null, scopePrefix: string): void {
    state.availableVaults = Array.isArray(availableVaults) ? availableVaults.slice() : [];
    if (currentVault) {
      state.currentVault = currentVault;
    } else if (!state.availableVaults.some(function (vaultRecord) {
      return Boolean(state.currentVault && vaultRecord.id === state.currentVault.id);
    })) {
      state.currentVault = state.availableVaults[0] || null;
    }
    setCurrentScopePrefix(scopePrefix);
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
    const storedScopePrefix = loadStoredScopePrefix();
    if (!state.topLevelFoldersAsVaults) {
      storeScopePrefix("");
      setVisibleVaultState(rootVault ? [rootVault] : [], rootVault, "");
      return;
    }
    setCurrentScopePrefix(storedScopePrefix);

    const snapshot = await fetchJSON<VaultListResponse>("/api/user/vaults");
    const discoveredVaults = Array.isArray(snapshot.vaults) ? snapshot.vaults.slice() : [];
    const selection = resolveVisibleVaultSelection({
      rootVault: rootVault,
      discoveredVaults: discoveredVaults,
      storedScopePrefix: storedScopePrefix,
      topLevelFoldersAsVaults: state.topLevelFoldersAsVaults,
    });
    storeScopePrefix(selection.scopePrefix);
    setVisibleVaultState(selection.availableVaults, selection.currentVault, selection.scopePrefix);
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
      const nextScopePrefix = scopePrefixForVaultSelection(state.rootVault, nextVault);
      storeScopePrefix(nextScopePrefix);
      setCurrentScopePrefix(nextScopePrefix);
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
    const url = buildSelectionURL(window.location.href, state.selectedPage, state.appScreen);
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
      onOpenHelpScreen: function () {
        openHelpScreen(true);
      },
      onRenderIdle: function () {
        state.selectedPage = "";
        state.appScreen = "notes";
        renderPages();
        renderAppScreen();
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
        state.appScreen = "notes";
        state.selectedPage = path;
        renderAppScreen();
      },
      onSyncURL: syncURLState,
      onRenderPages: renderPages,
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

  function currentScopePrefix(): string {
    if (!state.topLevelFoldersAsVaults) {
      return "";
    }
    return normalizePageDraftPath(state.activeScopePrefix || "");
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
        state.appScreen = "notes";
        state.selectedPage = path;
        renderAppScreen();
      },
      onSyncURL: syncURLState,
      onRenderPages: renderPages,
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
        state.appScreen = "notes";
        state.selectedPage = path;
        renderAppScreen();
      },
      onSyncURL: syncURLState,
      onRenderPages: renderPages,
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

  function buildQueryFence(query: string): string {
    const trimmed = String(query || "").trim();
    return "```query\n" + trimmed + "\n```";
  }

  function transientSlashQueryPlaceholder(frame: number): string {
    const suffixes = [".", "..", "...", ".."];
    return "> Generating query" + suffixes[frame % suffixes.length];
  }

  function replaceTransientEditorLine(
    originalValue: string,
    lineStart: number,
    lineEnd: number,
    replacement: string,
    scrollTop: number
  ): string {
    const nextValue = originalValue.slice(0, lineStart) + replacement + originalValue.slice(lineEnd);
    setMarkdownEditorValue(state, els, nextValue);
    state.currentMarkdown = nextValue;
    els.rawView.textContent = nextValue;
    const caret = Math.max(0, Math.min(lineStart + replacement.length, nextValue.length));
    focusMarkdownEditor(state, els, {preventScroll: true});
    setMarkdownEditorSelection(state, els, caret, caret);
    setMarkdownEditorScrollTop(state, els, scrollTop);
    return nextValue;
  }

  async function runSlashQueryCommand(rawContext: ReturnType<typeof currentRawLineContext>): Promise<boolean> {
    const intent = queryIntentForText(rawContext.lineText);
    closeSlashMenu(state, els);
    if (!intent) {
      setNoteStatus("Add what the query should do after /query.");
      return false;
    }
    if (!state.aiSettingsLoaded) {
      setNoteStatus("AI settings are still loading.");
      return false;
    }
    if (!state.aiSettings.enabled) {
      setNoteStatus("Enable the AI query copilot in Settings > AI first.");
      return false;
    }
    if (!state.aiAPIKeyConfigured) {
      setNoteStatus("Add an AI API key in Settings > AI first.");
      return false;
    }

    clearAutosaveTimer();
    const scrollTop = markdownEditorScrollTop(state, els);
    const originalValue = rawContext.value;
    let placeholderValue = replaceTransientEditorLine(
      originalValue,
      rawContext.lineStart,
      rawContext.lineEnd,
      transientSlashQueryPlaceholder(0),
      scrollTop
    );
    let placeholderFrame = 1;
    const animation = window.setInterval(function () {
      if (markdownEditorValue(state, els) !== placeholderValue) {
        window.clearInterval(animation);
        return;
      }
      placeholderValue = replaceTransientEditorLine(
        originalValue,
        rawContext.lineStart,
        rawContext.lineEnd,
        transientSlashQueryPlaceholder(placeholderFrame),
        scrollTop
      );
      placeholderFrame += 1;
    }, 320);

    setNoteStatus('Generating query for "' + intent + '"…');
    try {
      const payload = await fetchJSON<QueryCopilotResponse>("/api/query/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intent: intent,
          previewLimit: 10,
        }),
      });
      const queryText = String(payload.formattedQuery || payload.query || "").trim();
      if (!queryText) {
        window.clearInterval(animation);
        if (markdownEditorValue(state, els) === placeholderValue) {
          replaceTransientEditorLine(originalValue, rawContext.lineStart, rawContext.lineEnd, rawContext.lineText, scrollTop);
          scheduleAutosave();
        }
        setNoteStatus(payload.error || "AI returned no query.");
        return false;
      }
      const block = buildQueryFence(queryText);
      window.clearInterval(animation);
      if (markdownEditorValue(state, els) !== placeholderValue) {
        setNoteStatus("Query generated, but the note changed before insertion.");
        return false;
      }
      replaceTransientEditorLine(originalValue, rawContext.lineStart, rawContext.lineEnd, block, scrollTop);
      scheduleAutosave();
      setNoteStatus(
        payload.valid
          ? "Inserted AI-generated query block."
          : "Inserted AI query draft with validation warnings."
      );
      return true;
    } catch (error) {
      window.clearInterval(animation);
      if (markdownEditorValue(state, els) === placeholderValue) {
        replaceTransientEditorLine(originalValue, rawContext.lineStart, rawContext.lineEnd, rawContext.lineText, scrollTop);
        scheduleAutosave();
      }
      setNoteStatus("AI query generation failed: " + errorMessage(error));
      return false;
    }
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
    if (command.id === "query") {
      void runSlashQueryCommand(rawContext);
      return true;
    }
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

    if (command.id === "file") {
      openFilePickerForEditor();
    } else if (command.id === "table") {
      openInlineTableEditor(insertedRawLineNumber, 1, 0);
    } else if (command.id === "due" || command.id === "remind") {
      openInsertedTaskPicker(insertedTaskLineNumber, command.id);
    }
    return true;
  }

  function insertTextAtEditorSelection(text: string): void {
    if (state.appScreen !== "notes" || !state.selectedPage || !state.currentPage) {
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

  function currentPageHeadingEditValue(): string {
    const page = currentPageView();
    return currentPagePath(page) || normalizePageDraftPath(state.selectedPage || "");
  }

  function setNoteHeadingValue(value: string, editable: boolean): void {
    els.noteHeading.value = value;
    els.noteHeading.disabled = !editable;
    els.noteHeading.readOnly = !editable;
    els.noteHeading.title = editable ? "Rename or move note" : "";
  }

  async function renameCurrentPageFromHeading(nextValue: string): Promise<void> {
    if (!state.selectedPage || !state.currentPage || state.renamingPageTitle) {
      return;
    }

    const normalizedDraftPath = normalizePageDraftPath(nextValue);
    const currentPath = normalizePageDraftPath(state.selectedPage);
    const currentLeaf = pageTitleFromPath(currentPath);
    if (!normalizedDraftPath) {
      setNoteHeadingValue(currentPageTitleValue() || currentLeaf, true);
      return;
    }

    const slash = currentPath.lastIndexOf("/");
    const parentFolder = slash >= 0 ? currentPath.slice(0, slash) : "";
    const targetPath = normalizedDraftPath.indexOf("/") >= 0
      ? normalizedDraftPath
      : (parentFolder ? (parentFolder + "/" + normalizedDraftPath) : normalizedDraftPath);

    if (targetPath === currentPath) {
      setNoteHeadingValue(currentPageTitleValue() || currentLeaf, true);
      return;
    }

    const targetLeaf = pageTitleFromPath(targetPath);
    const targetParent = targetPath.lastIndexOf("/") >= 0 ? targetPath.slice(0, targetPath.lastIndexOf("/")) : "";
    const movedFolders = targetParent !== parentFolder;

    state.renamingPageTitle = true;
    try {
      if (hasUnsavedPageChanges()) {
        await saveCurrentPage();
      }
      await renamePage(currentPath, normalizedDraftPath);
      setNoteStatus(
        movedFolders
          ? ("Moved " + currentPath + " to " + targetPath + ".")
          : ("Renamed " + currentLeaf + " to " + targetLeaf + ".")
      );
    } catch (error) {
      setNoteHeadingValue(currentPageTitleValue() || currentLeaf, true);
      setNoteStatus("Rename failed: " + errorMessage(error));
    } finally {
      state.renamingPageTitle = false;
    }
  }

  function refreshLivePageChrome() {
    if (state.appScreen !== "notes") {
      return;
    }
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
    const available = studioPageAvailable();
    els.toggleSourceMode.disabled = !available;
    els.toggleSourceMode.classList.toggle("active", state.sourceOpen);
    els.toggleSourceMode.setAttribute("aria-pressed", state.sourceOpen ? "true" : "false");
    els.toggleSourceMode.textContent = state.sourceOpen ? "Preview" : "Raw";
    els.toggleSourceMode.title = state.sourceOpen
      ? "Switch to rendered preview (" + hotkeyLabel(state.settings.preferences.hotkeys.toggleRawMode) + ")"
      : "Switch to raw markdown (" + hotkeyLabel(state.settings.preferences.hotkeys.toggleRawMode) + ")";
  }

  function renderPageHistoryButton(): void {
    const hasHistory = state.appScreen === "notes" && Boolean(state.selectedPage && state.currentPage);
    els.pageHistoryButton.disabled = !hasHistory;
    els.pageHistoryButton.title = hasHistory ? "Open page history" : "Open a note first";
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
    const helpActive = state.appScreen === "help";
    const page = currentStudioPageView();
    if (!page) {
      closeInlineTableEditor();
      setMarkdownEditorValue(state, els, "");
      markdownEditorSetEditable(state, els, false);
      markdownEditorSetPagePath(state, "");
      setNoteStatus("Select a page to edit and preview markdown.");
      renderSourceModeButton();
      renderPageHistoryButton();
      return;
    }

    const nextMarkdown = helpActive ? helpScreenMarkdown() : state.currentMarkdown;
    setMarkdownEditorValue(state, els, nextMarkdown);
    markdownEditorSetEditable(state, els, !helpActive);
    if (state.markdownEditorApi && state.markdownEditorApi.host) {
      state.markdownEditorApi.host.classList.remove("hidden");
      markdownEditorSetPagePath(state, helpActive ? SYSTEM_HELP_PATH : state.selectedPage);
      markdownEditorSetRenderMode(state, !state.sourceOpen);
      markdownEditorSetQueryBlocks(state, helpActive ? [] : renderedQueryBlocksForEditor(currentStudioDerived()));
      markdownEditorSetTasks(state, helpActive ? [] : renderedTasksForEditor(page));
    }
    if (els.pageProperties) {
      els.pageProperties.classList.toggle("hidden", helpActive || state.sourceOpen);
    }
    if (els.propertyActions) {
      els.propertyActions.classList.toggle("hidden", helpActive || state.sourceOpen);
    }
    els.rawView.textContent = nextMarkdown;
    if (helpActive) {
      setStructuredViews(
        "Guide",
        page.title || SYSTEM_HELP_LABEL,
        {
          page: SYSTEM_HELP_PATH,
          title: page.title || SYSTEM_HELP_LABEL,
          builtIn: true,
          readOnly: true,
        },
        emptySystemDerivedPage(),
        nextMarkdown
      );
      els.detailPath.textContent = SYSTEM_HELP_LABEL;
      setNoteHeadingValue(page.title || SYSTEM_HELP_LABEL, false);
      closeInlineTableEditor();
      renderSourceModeButton();
      renderPageHistoryButton();
      if (hasUnsavedPageChanges()) {
        scheduleAutosave();
      }
      setNoteStatus(
        state.helpLoading
          ? "Loading built-in help…"
          : state.helpError
            ? ("Viewing built-in help (load error: " + state.helpError + ").")
            : "Viewing built-in help."
      );
      return;
    }
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
    }, state.taskFilters, state.appScreen === "notes" && state.currentPage ? (state.currentPage.page || state.currentPage.path || "") : "");
  }

  function renderPageContext() {
    if (state.appScreen === "help") {
      renderEmpty(els.pageContext, "Built-in help is read-only and has no backlinks or embedded query state.");
      return;
    }
    renderPageContextUI(els.pageContext, state.currentPage, state.currentDerived);
  }

  async function refreshCurrentDerivedState(pagePath: string): Promise<void> {
    if (!pagePath || state.selectedPage !== pagePath) {
      return;
    }
    const derived = await fetchJSON<DerivedPage>("/api/pages/" + encodePath(pagePath) + "/derived");
    if (state.selectedPage !== pagePath) {
      return;
    }
    state.currentDerived = derived;
    renderPageContext();
    if (state.currentPage) {
      const page = currentPageView();
      if (state.markdownEditorApi && page) {
        markdownEditorSetQueryBlocks(state, renderedQueryBlocksForEditor(state.currentDerived));
        markdownEditorSetTasks(state, renderedTasksForEditor(page));
      }
    }
  }

  function visiblePagesForRail(): PageSummary[] {
    return filterPagesByTag(filterPagesByScope(state.pages, currentScopePrefix()), state.pageTagFilter);
  }

  function renderPageTags() {
    renderPageTagsUI(els.pageTags, filterPagesByScope(state.pages, currentScopePrefix()), state.pageTagFilter, function (tag) {
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

  function explicitPropertyKindHintsForCurrentPage(): Record<string, FrontmatterKind> {
    const page = currentPageView();
    const frontmatter = page ? page.frontmatter : null;
    const hints = currentTemplatePropertyKindHints();
    const result: Record<string, FrontmatterKind> = {};

    Object.keys(frontmatter || {}).forEach(function (key) {
      if (isTemplateMetadataKey(key)) {
        return;
      }
      const kind = hints[key];
      if (kind && kind !== "text") {
        result[key] = kind;
      }
    });

    return result;
  }

  function propertyKindMetadataPatch(nextKey: string, kind: FrontmatterKind, originalKey?: string): { set: Record<string, FrontmatterValue>; remove: string[] } {
    const hints = explicitPropertyKindHintsForCurrentPage();
    const normalizedOriginalKey = String(originalKey || "").trim();
    const normalizedNextKey = String(nextKey || "").trim();

    if (normalizedOriginalKey) {
      delete hints[normalizedOriginalKey];
    }
    if (normalizedNextKey && kind !== "text") {
      hints[normalizedNextKey] = kind;
    } else if (normalizedNextKey) {
      delete hints[normalizedNextKey];
    }

    return buildPropertyKindHintMetadataPatch(hints);
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
    const nextValue = coercePropertyValue(kind, row.rawValue, row.key);
    state.editingPropertyKey = row.key;
    state.propertyDraft = applyPropertyDraftKind(
      makePropertyDraft(row.key, nextValue, row.key, row.kindHint),
      kind
    );
    state.propertyDraftFocusTarget = "value";
    renderPageProperties();
    const metadata = propertyKindMetadataPatch(row.key, kind, row.key);
    patchCurrentPageFrontmatter({
      frontmatter: {
        set: {
          [row.key]: nextValue,
          ...metadata.set,
        },
        remove: metadata.remove,
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
    const metadata = propertyKindMetadataPatch("", "text", key);
    await patchCurrentPageFrontmatter({
      frontmatter: {
        set: metadata.set,
        remove: Array.from(new Set([key].concat(metadata.remove))),
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
    const metadata = propertyKindMetadataPatch(
      key,
      state.propertyDraft ? state.propertyDraft.kind : "text",
      state.editingPropertyKey && state.editingPropertyKey !== "__new__" ? state.editingPropertyKey : undefined
    );

    await patchCurrentPageFrontmatter({
      frontmatter: {
        set: {
          ...setPayload,
          ...metadata.set,
        },
        remove: Array.from(new Set(remove.concat(metadata.remove))),
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
    if (state.appScreen === "help") {
      if (els.propertyActions) {
        els.propertyActions.classList.add("hidden");
      }
      renderEmpty(els.pageProperties, "Built-in help is read-only.");
      return;
    }
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
      propertyValueSuggestions: scopedPropertyValueSuggestions,
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

  function clearLoadedPageState() {
    clearAutosaveTimer();
    state.selectedPage = "";
    state.currentPage = null;
    state.currentDerived = null;
    state.currentMarkdown = "";
    state.originalMarkdown = "";
    clearPropertyDraft();
    renderNoteStudio();
    renderSourceModeButton();
    renderPageHistoryButton();
    renderPageTasks();
    renderPageTags();
    renderPageContext();
    renderPageProperties();
  }

  function clearPageSelection() {
    clearLoadedPageState();
    els.detailPath.textContent = "Select a page";
    setNoteHeadingValue("Waiting for selection", false);
    syncURLState(true);
  }

  function setStructuredViews(kind: string, title: string, structured: unknown, derived: unknown, raw: string): void {
    els.detailKind.textContent = kind;
    els.detailTitle.textContent = title;
    els.structuredView.textContent = pretty(structured);
    els.derivedView.textContent = pretty(derived);
    els.rawView.textContent = raw || "";
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
    state.settings.documents = snapshot.settings.documents || {
      uploadPlacement: "same-folder",
      uploadSubfolder: "_files",
    };
    state.appliedVault = snapshot.appliedVault;
    state.settingsRestartRequired = snapshot.restartRequired;
    state.settingsRestartRequiredReasons = Array.isArray(snapshot.restartRequiredReasons)
      ? snapshot.restartRequiredReasons.map(function (reason) {
          return String(reason || "").trim();
        }).filter(Boolean)
      : [];
    state.settingsLoaded = true;
    renderHomeButton();
    renderSettingsForm();
    applyUIPreferences();
    renderSourceModeButton();
    renderPageHistoryButton();
    loadMeta();
    if (state.currentPage || state.appScreen === "help") {
      renderNoteStudio();
      renderPageTasks();
      renderPageContext();
      renderPageProperties();
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

  function setAISettingsSnapshot(snapshot: AISettingsResponse): void {
    state.aiSettings = {
      enabled: Boolean(snapshot.settings.enabled),
      provider: snapshot.settings.provider || "openai-compatible",
      baseUrl: snapshot.settings.baseUrl || "https://api.openai.com/v1",
      model: snapshot.settings.model || "gpt-5-mini",
    };
    state.aiAPIKeyConfigured = Boolean(snapshot.apiKeyConfigured);
    state.aiSettingsLoaded = true;
    state.aiClearKeyPending = false;
    els.settingsAIAPIKey.value = "";
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
    const confirmed = await confirmAction({
      title: "Delete Theme",
      message: 'Delete theme "' + selectedTheme.name + '"?',
      confirmLabel: "Delete Theme",
      danger: true,
    });
    if (!confirmed) {
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

  async function loadAISettings() {
    try {
      const snapshot = await fetchJSON<AISettingsResponse>("/api/ai/settings");
      setAISettingsSnapshot(snapshot);
    } catch (error) {
      state.aiSettingsLoaded = false;
      renderSettingsForm();
      throw error;
    }
  }

  async function loadMeta() {
    try {
      const meta = await fetchJSON<MetaResponse>("/api/meta");
      state.serverMeta = meta;
      refreshBackupManifestValidation();
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
      if (els.settingsModalShell && !els.settingsModalShell.classList.contains("hidden")) {
        renderSettingsForm();
      }
    } catch (error) {
      state.serverMeta = null;
      setMetaPills(["Meta error", errorMessage(error)]);
      renderVaultHealth(null);
      if (els.settingsModalShell && !els.settingsModalShell.classList.contains("hidden")) {
        renderSettingsForm();
      }
    }
  }

  async function loadPages() {
    const params = new URLSearchParams();
    const query = els.pageSearch.value.trim();
    if (query) {
      params.set("q", query);
    }

    try {
      const [pagePayload, folderPayload] = await Promise.all([
        fetchJSON<PageListResponse>("/api/pages" + (params.toString() ? "?" + params.toString() : "")),
        fetchJSON<FolderListResponse>("/api/folders"),
      ]);
      state.pages = pagePayload.pages || [];
      state.folders = folderPayload.folders || [];
      if (state.pageTagFilter && !visiblePagesForRail().length) {
        state.pageTagFilter = "";
      }
      renderPages();
      renderPageTags();
    } catch (error) {
      state.pages = [];
      state.folders = [];
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
      selectedPage: state.appScreen === "notes" ? state.selectedPage : "",
      pages: visiblePagesForRail(),
      folders: state.folders,
      expandedPageFolders: state.expandedPageFolders,
      scopePrefix: currentScopePrefix(),
    }, els, {
      navigateToPage: navigateToPage,
      requestCreatePage: requestCreatePageInFolder,
      requestCreateSubfolder: requestCreateSubfolderInFolder,
      requestRenameFolder: requestRenameFolderInTree,
      deleteFolder: deleteFolder,
      requestRenamePage: requestRenamePageInTree,
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
      requestCreatePage: requestCreatePageInFolder,
      requestCreateSubfolder: requestCreateSubfolderInFolder,
      requestRenameFolder: requestRenameFolderInTree,
      deleteFolder: deleteFolder,
      requestRenamePage: requestRenamePageInTree,
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
      const anchorTop = caretRect ? caretRect.top : 0;
      const anchorBottom = caretRect ? caretRect.bottom : 0;
      openInlineTaskPicker(task.ref, mode, left, top, anchorTop, anchorBottom);
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
      const templateFillActive = applyLoadedPageDetailState(pagePath, loaded, page.rawMarkdown || "");
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
    } catch (error) {
      clearPageSelection();
      els.detailKind.textContent = "Page";
      els.detailTitle.textContent = pagePath;
      els.structuredView.textContent = errorMessage(error);
      els.derivedView.textContent = "";
      els.rawView.textContent = "";
    }
  }

  function refreshCurrentDetail(force: boolean): void {
    if (state.selectedPage) {
      if (!force && (markdownEditorHasFocus(state, els) || inlineTableEditorHasFocus() || inlineTableEditorOpen())) {
        return;
      }
      loadPageDetail(state.selectedPage, force, false);
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

  function renderActionDialog(): void {
    const session = actionDialogSession;
    if (!session) {
      els.actionDialogShell.classList.add("hidden");
      els.actionDialogEyebrow.textContent = "";
      els.actionDialogTitle.textContent = "";
      els.actionDialogMessage.textContent = "";
      els.actionDialogFields.textContent = "";
      els.actionDialogStatus.textContent = "";
      els.actionDialogConfirm.classList.remove("danger-button");
      els.actionDialogConfirm.textContent = "Confirm";
      els.actionDialogCancel.textContent = "Cancel";
      els.actionDialogConfirm.disabled = false;
      return;
    }

    const activeSession = session;
    const options = activeSession.options;
    els.actionDialogEyebrow.textContent = options.eyebrow || (options.danger ? "Confirm" : "Action");
    els.actionDialogTitle.textContent = options.title;
    els.actionDialogMessage.textContent = String(options.message || "");
    els.actionDialogMessage.classList.toggle("hidden", !String(options.message || "").trim());
    els.actionDialogConfirm.textContent = options.confirmLabel || "Confirm";
    els.actionDialogCancel.textContent = options.cancelLabel || "Cancel";
    els.actionDialogConfirm.classList.toggle("danger-button", Boolean(options.danger));
    els.actionDialogStatus.textContent = activeSession.status;
    clearNode(els.actionDialogFields);

    const currentFieldStates: Record<string, ActionDialogFieldState> = {};
    const fieldRenderers: Array<() => void> = [];

    function updateActionDialogValidity(): void {
      const validationError = options.validate ? options.validate(activeSession.values) : "";
      const hasInlineFieldFeedback = Object.values(currentFieldStates).some(function (fieldState) {
        return Boolean(fieldState.error || fieldState.helper);
      });
      els.actionDialogConfirm.disabled = Boolean(validationError);
      if (activeSession.status) {
        els.actionDialogStatus.textContent = activeSession.status;
      } else if (validationError && !hasInlineFieldFeedback) {
        els.actionDialogStatus.textContent = validationError;
      } else {
        els.actionDialogStatus.textContent = "";
      }
    }

    (Array.isArray(options.fields) ? options.fields : []).forEach(function (field) {
      const row = document.createElement("label");
      row.className = "search";

      const label = document.createElement("span");
      label.textContent = field.label;
      row.appendChild(label);

      const input = document.createElement("input");
      input.type = "text";
      input.value = activeSession.values[field.key] || "";
      input.placeholder = field.placeholder || "";
      input.autocomplete = "off";
      input.setAttribute("autocorrect", "off");
      input.setAttribute("autocapitalize", field.autocapitalize || "none");
      input.spellcheck = field.spellcheck === true;
      input.setAttribute("data-action-dialog-field", field.key);
      row.appendChild(input);

      const help = document.createElement("p");
      help.className = "action-dialog-field-help hidden";
      row.appendChild(help);

      const suggestionMenu = document.createElement("div");
      suggestionMenu.className = "action-dialog-autocomplete slash-menu hidden";
      const suggestionResults = document.createElement("div");
      suggestionResults.className = "slash-menu-results";
      suggestionMenu.appendChild(suggestionResults);
      row.appendChild(suggestionMenu);

      let visibleSuggestions: ActionDialogFieldSuggestion[] = [];
      let selectedSuggestionIndex = -1;

      const closeSuggestionMenu = function () {
        visibleSuggestions = [];
        selectedSuggestionIndex = -1;
        suggestionMenu.classList.add("hidden");
        suggestionMenu.style.visibility = "";
        clearNode(suggestionResults);
      };

      const applySuggestion = function (suggestion: ActionDialogFieldSuggestion) {
        if (!actionDialogSession) {
          return;
        }
        actionDialogSession.values[field.key] = suggestion.value;
        input.value = suggestion.value;
        if (actionDialogSession.status) {
          actionDialogSession.status = "";
        }
        fieldRenderers.forEach(function (renderer) {
          renderer();
        });
        updateActionDialogValidity();
        focusWithoutScroll(input);
        input.setSelectionRange(input.value.length, input.value.length);
      };

      const renderFieldState = function () {
        const fieldState = typeof field.describe === "function"
          ? field.describe(activeSession.values[field.key] || "", activeSession.values)
          : {};
        currentFieldStates[field.key] = fieldState;
        const message = fieldState.error || fieldState.helper || "";
        help.textContent = message;
        help.className = "action-dialog-field-help";
        help.classList.toggle("hidden", !message);
        help.classList.toggle("warn", Boolean(fieldState.error || fieldState.helperTone === "warn"));
        visibleSuggestions = Array.isArray(fieldState.suggestions) ? fieldState.suggestions.slice() : [];
        if (document.activeElement !== input || !visibleSuggestions.length) {
          closeSuggestionMenu();
          return;
        }
        if (selectedSuggestionIndex < 0 || selectedSuggestionIndex >= visibleSuggestions.length) {
          selectedSuggestionIndex = 0;
        }
        clearNode(suggestionResults);
        visibleSuggestions.forEach(function (suggestion, index) {
          const button = document.createElement("button");
          button.type = "button";
          button.tabIndex = -1;
          button.className = "search-result-item slash-menu-item" + (index === selectedSuggestionIndex ? " active" : "");
          button.addEventListener("mousedown", function (event) {
            event.preventDefault();
          });
          button.addEventListener("click", function () {
            closeSuggestionMenu();
            applySuggestion(suggestion);
          });

          const head = document.createElement("div");
          head.className = "search-result-head";

          const title = document.createElement("strong");
          title.textContent = suggestion.label || suggestion.value;
          head.appendChild(title);

          if (suggestion.meta) {
            const meta = document.createElement("span");
            meta.className = "search-result-hint";
            meta.textContent = suggestion.meta;
            head.appendChild(meta);
          }
          button.appendChild(head);
          suggestionResults.appendChild(button);
        });

        const rect = input.getBoundingClientRect();
        const viewportWidth = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
        const viewportHeight = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
        const preferredWidth = Math.max(220, Math.round(rect.width));
        suggestionMenu.style.width = preferredWidth + "px";
        suggestionMenu.style.visibility = "hidden";
        suggestionMenu.classList.remove("hidden");
        const menuWidth = suggestionMenu.offsetWidth || preferredWidth;
        const menuHeight = suggestionMenu.offsetHeight || 0;
        const horizontalPadding = 12;
        const verticalPadding = 12;
        const clampedLeft = Math.max(
          horizontalPadding,
          Math.min(rect.left, viewportWidth - menuWidth - horizontalPadding)
        );
        let positionedTop = rect.bottom + 4;
        if (positionedTop + menuHeight > viewportHeight - verticalPadding) {
          positionedTop = Math.max(verticalPadding, rect.top - menuHeight - 4);
        }
        positionedTop = Math.max(
          verticalPadding,
          Math.min(positionedTop, viewportHeight - menuHeight - verticalPadding)
        );
        suggestionMenu.style.left = clampedLeft + "px";
        suggestionMenu.style.top = positionedTop + "px";
        suggestionMenu.style.visibility = "";
      };
      fieldRenderers.push(renderFieldState);

      const moveSuggestionSelection = function (delta: number) {
        if (!visibleSuggestions.length) {
          return;
        }
        if (selectedSuggestionIndex < 0) {
          selectedSuggestionIndex = delta > 0 ? 0 : visibleSuggestions.length - 1;
        } else {
          selectedSuggestionIndex = Math.max(0, Math.min(visibleSuggestions.length - 1, selectedSuggestionIndex + delta));
        }
        renderFieldState();
        const active = suggestionResults.querySelector<HTMLElement>(".slash-menu-item.active");
        if (active) {
          active.scrollIntoView({ block: "nearest" });
        }
      };

      input.addEventListener("focus", function () {
        renderFieldState();
      });
      input.addEventListener("input", function () {
        if (!actionDialogSession) {
          return;
        }
        actionDialogSession.values[field.key] = input.value;
        if (actionDialogSession.status) {
          actionDialogSession.status = "";
        }
        fieldRenderers.forEach(function (renderer) {
          renderer();
        });
        updateActionDialogValidity();
      });
      input.addEventListener("blur", function () {
        closeSuggestionMenu();
      });
      input.addEventListener("keydown", function (event) {
        if (suggestionMenu.classList.contains("hidden")) {
          return;
        }
        if (event.key === "ArrowDown") {
          event.preventDefault();
          event.stopPropagation();
          moveSuggestionSelection(1);
          return;
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          event.stopPropagation();
          moveSuggestionSelection(-1);
          return;
        }
        if ((event.key === "Enter" || event.key === "Tab") && selectedSuggestionIndex >= 0 && selectedSuggestionIndex < visibleSuggestions.length) {
          event.preventDefault();
          event.stopPropagation();
          const suggestion = visibleSuggestions[selectedSuggestionIndex];
          closeSuggestionMenu();
          applySuggestion(suggestion);
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          closeSuggestionMenu();
        }
      }, true);
      els.actionDialogFields.appendChild(row);
    });

    fieldRenderers.forEach(function (renderer) {
      renderer();
    });
    updateActionDialogValidity();
    els.actionDialogShell.classList.remove("hidden");
  }

  function dismissActionDialog(result: boolean | Record<string, string> | null): void {
    const session = actionDialogSession;
    actionDialogSession = null;
    renderActionDialog();
    if (session) {
      session.resolve(result);
    }
    restoreNoteFocus();
  }

  function openActionDialog(options: ActionDialogOptions): Promise<boolean | Record<string, string> | null> {
    if (actionDialogSession) {
      actionDialogSession.resolve(null);
      actionDialogSession = null;
    }
    rememberNoteFocus();
    const values = (Array.isArray(options.fields) ? options.fields : []).reduce(function (acc, field) {
      acc[field.key] = String(field.value || "");
      return acc;
    }, {} as Record<string, string>);
    return new Promise(function (resolve) {
      actionDialogSession = {
        options: options,
        values: values,
        status: "",
        resolve: resolve,
      };
      renderActionDialog();
      window.requestAnimationFrame(function () {
        const firstField = els.actionDialogFields.querySelector("input") as HTMLInputElement | null;
        if (firstField) {
          focusWithoutScroll(firstField);
          firstField.select();
          return;
        }
        focusWithoutScroll(els.actionDialogConfirm);
      });
    });
  }

  async function confirmAction(options: ActionDialogOptions): Promise<boolean> {
    const result = await openActionDialog({
      eyebrow: options.eyebrow || "Confirm",
      title: options.title,
      message: options.message || "",
      confirmLabel: options.confirmLabel || "Confirm",
      cancelLabel: options.cancelLabel || "Cancel",
      danger: options.danger,
      fields: [],
    });
    return result === true;
  }

  async function promptForActionInput(options: ActionDialogOptions): Promise<Record<string, string> | null> {
    const result = await openActionDialog(options);
    return result && typeof result === "object" ? result as Record<string, string> : null;
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
    if (open) {
      renderDocumentsUploadHint();
    }
  }

  function closeDocumentsModal() {
    setDocumentsOpen(false);
  }

  function renderDocumentsUploadHint(): void {
    els.documentsUploadHint.textContent = documentUploadHint(
      state.selectedPage || "",
      Boolean(state.selectedPage && state.currentPage),
      state.settings.documents
    );
  }

  function renderPageConflictModal(): void {
    const conflict = state.pageConflict;
    els.conflictStatus.textContent = state.pageConflictStatus;
    if (!conflict) {
      els.conflictTitle.textContent = "Resolve Conflict";
      els.conflictSummary.textContent = "Review the page versions and decide how to continue.";
      els.conflictCallout.textContent = "";
      els.conflictBaseMarkdown.value = "";
      els.conflictLocalMarkdown.value = "";
      els.conflictRemoteMarkdown.value = "";
      els.conflictResolutionMarkdown.value = "";
      els.conflictResolutionPanel.classList.add("hidden");
      els.conflictSaveResolution.classList.add("hidden");
      els.conflictReloadRemote.classList.add("hidden");
      els.conflictCancel.textContent = "Close";
      return;
    }

    els.conflictTitle.textContent = conflict.title;
    els.conflictSummary.textContent = conflict.summary;
    els.conflictCallout.textContent = conflict.callout;
    els.conflictBaseMarkdown.value = conflict.baseMarkdown;
    els.conflictLocalMarkdown.value = conflict.localMarkdown;
    els.conflictRemoteMarkdown.value = conflict.remoteMarkdown;
    els.conflictResolutionMarkdown.value = conflict.resolutionMarkdown;
    els.conflictResolutionPanel.classList.toggle("hidden", !conflict.editable);
    els.conflictSaveResolution.classList.toggle("hidden", !conflict.editable);
    els.conflictReloadRemote.classList.toggle("hidden", conflict.editable);
    els.conflictLoadBase.disabled = !conflict.editable;
    els.conflictLoadLocal.disabled = !conflict.editable;
    els.conflictLoadRemote.disabled = !conflict.editable;
    els.conflictCancel.textContent = conflict.editable ? "Cancel" : "Keep Editing";
  }

  function setPageConflictOpen(open: boolean): void {
    if (open) {
      if (!state.pageConflict) {
        return;
      }
      rememberNoteFocus();
      clearRemoteChangeToast();
      els.searchModalShell.classList.add("hidden");
      els.commandModalShell.classList.add("hidden");
      els.quickSwitcherModalShell.classList.add("hidden");
      els.documentsModalShell.classList.add("hidden");
      els.pageHistoryModalShell.classList.add("hidden");
      els.trashModalShell.classList.add("hidden");
      els.settingsModalShell.classList.add("hidden");
      els.conflictModalShell.classList.remove("hidden");
      renderPageConflictModal();
      window.requestAnimationFrame(function () {
        if (state.pageConflict && state.pageConflict.editable) {
          focusWithoutScroll(els.conflictResolutionMarkdown);
          els.conflictResolutionMarkdown.setSelectionRange(
            els.conflictResolutionMarkdown.value.length,
            els.conflictResolutionMarkdown.value.length
          );
          return;
        }
        focusWithoutScroll(els.closeConflictModal);
      });
      return;
    }
    state.pageConflictStatus = "";
    els.conflictModalShell.classList.add("hidden");
  }

  function closePageConflictModal(): void {
    state.pageConflict = null;
    state.pageConflictRemoteLoaded = null;
    setPageConflictOpen(false);
  }

  function dismissPageConflictModal(): void {
    const mode = state.pageConflict ? state.pageConflict.mode : "";
    closePageConflictModal();
    if (mode !== "unsafe-remote-review") {
      restoreNoteFocus();
    }
  }

  function updatePageConflictDraft(mutator: (draft: PageConflictDraft) => PageConflictDraft): void {
    if (!state.pageConflict) {
      return;
    }
    state.pageConflict = mutator(state.pageConflict);
    renderPageConflictModal();
  }

  function setPageConflictResolution(markdown: string): void {
    updatePageConflictDraft(function (draft) {
      return {
        ...draft,
        resolutionMarkdown: markdown,
      };
    });
  }

  async function loadLatestConflictDetail(pagePath: string): Promise<LoadedPageDetail> {
    return loadPageDetailData(pagePath, encodePath, "", null);
  }

  function openPageConflictDialog(
    mode: PageConflictMode,
    pagePath: string,
    loadedRemote: LoadedPageDetail,
    options?: {
      localMarkdown?: string;
      resolutionMarkdown?: string;
      statusMessage?: string;
    }
  ): void {
    const remoteMarkdown = loadedRemote.page.rawMarkdown || "";
    const draft = createPageConflictDialogDraft({
      mode,
      pagePath,
      baseMarkdown: state.originalMarkdown,
      localMarkdown: typeof options?.localMarkdown === "string" ? options.localMarkdown : state.currentMarkdown,
      remoteMarkdown,
      resolutionMarkdown: options?.resolutionMarkdown,
    });
    state.pageConflict = draft;
    state.pageConflictRemoteLoaded = loadedRemote;
    state.pageConflictStatus = options?.statusMessage || "";
    setPageConflictOpen(true);
  }

  async function applyConflictRemoteVersion(): Promise<void> {
    const conflict = state.pageConflict;
    const loadedRemote = state.pageConflictRemoteLoaded;
    if (!conflict || !loadedRemote || !conflict.pagePath || state.selectedPage !== conflict.pagePath) {
      return;
    }

    const templateFillActive = applyLoadedPageDetailState(
      conflict.pagePath,
      loadedRemote,
      loadedRemote.page.rawMarkdown || ""
    );
    closePageConflictModal();
    await Promise.all([loadPages(), loadTasks()]);
    if (state.selectedPage === conflict.pagePath && !templateFillActive) {
      restoreNoteFocus();
    }
    setNoteStatus("Loaded remote version of " + conflict.pagePath + ".");
  }

  async function savePageConflictResolution(): Promise<void> {
    const conflict = state.pageConflict;
    if (!conflict || !conflict.editable || !conflict.pagePath || state.selectedPage !== conflict.pagePath) {
      return;
    }

    const markdownToSave = els.conflictResolutionMarkdown.value;
    setPageConflictResolution(markdownToSave);
    state.pageConflictStatus = "Saving resolved markdown…";
    renderPageConflictModal();

    noteLocalPageChange(conflict.pagePath);
    const outcome = await savePageConflictResolutionFlow({
      mode: conflict.mode,
      pagePath: conflict.pagePath,
      baseMarkdown: conflict.baseMarkdown,
      remoteMarkdown: conflict.remoteMarkdown,
      resolutionMarkdown: markdownToSave,
      saveResolvedMarkdown: function (pagePath: string, nextMarkdown: string, baseMarkdown: string) {
        return savePageMarkdown(pagePath, nextMarkdown, baseMarkdown, encodePath);
      },
      loadLatestRemote: loadLatestConflictDetail,
      formatErrorMessage: errorMessage,
    });

    if (outcome.action === "saved") {
      const payload = outcome.payload;
      state.currentPage = payload;
      state.currentMarkdown = payload.rawMarkdown || markdownToSave;
      state.originalMarkdown = payload.rawMarkdown || markdownToSave;
      setMarkdownEditorValue(state, els, state.currentMarkdown);
      els.rawView.textContent = state.currentMarkdown;
      refreshLivePageChrome();
      closePageConflictModal();
      await Promise.all([loadPages(), loadTasks()]);
      if (state.selectedPage === conflict.pagePath) {
        await loadPageDetail(conflict.pagePath, true, false);
      }
      restoreNoteFocus();
      setNoteStatus(outcome.status);
      return;
    }

    if (outcome.action === "reopened") {
      if (state.selectedPage !== conflict.pagePath) {
        return;
      }
      state.pageConflict = outcome.draft;
      state.pageConflictRemoteLoaded = outcome.loadedRemote;
      state.pageConflictStatus = outcome.status;
      renderPageConflictModal();
      setNoteStatus(outcome.noteStatus);
      return;
    }

    state.pageConflictStatus = outcome.status;
    renderPageConflictModal();
  }

  async function openSaveConflictResolution(pagePath: string, markdownToSave: string): Promise<void> {
    const loadedRemote = await loadLatestConflictDetail(pagePath);
    if (state.selectedPage !== pagePath) {
      return;
    }
    openPageConflictDialog(
      "save-conflict",
      pagePath,
      loadedRemote,
      {
        localMarkdown: markdownToSave,
        resolutionMarkdown: markdownToSave,
        statusMessage: "Automatic merge found overlapping edits. Review both versions and save the final markdown you want to keep.",
      }
    );
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
    const confirmed = await confirmAction({
      title: "Purge Page History",
      message: "Permanently remove all saved revisions for " + state.selectedPage + "?",
      confirmLabel: "Purge History",
      danger: true,
    });
    if (!confirmed) {
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
        confirmAction({
          title: "Delete Trashed Note",
          message: 'Permanently delete "' + entry.page + '" and its history?',
          confirmLabel: "Delete Permanently",
          danger: true,
        }).then(function (confirmed) {
          if (!confirmed) {
            return;
          }
          return fetchJSON<unknown>("/api/trash/pages/" + encodePath(entry.page), {
            method: "DELETE",
          }).then(function () {
            state.trashPages = state.trashPages.filter(function (item) {
              return item.page !== entry.page;
            });
            renderTrash();
            setNoteStatus("Permanently deleted " + entry.page + ".");
          });
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
    const confirmed = await confirmAction({
      title: "Empty Trash",
      message: "Permanently delete all trashed pages and their history?",
      confirmLabel: "Empty Trash",
      danger: true,
    });
    if (!confirmed) {
      return;
    }
    await fetchJSON<unknown>("/api/trash/pages", {
      method: "DELETE",
    });
    state.trashPages = [];
    renderTrash();
    setNoteStatus("Trash emptied.");
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
      els.pageHistoryModalShell.classList.add("hidden");
      els.trashModalShell.classList.add("hidden");
      els.settingsModalShell.classList.remove("hidden");
      renderSettingsForm();
      if (!state.settingsLoaded) {
        loadSettings();
      }
      window.requestAnimationFrame(function () {
        if (state.settingsSection === "vault" && state.settingsLoaded) {
          focusWithoutScroll(els.settingsUserTopLevelVaults);
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
        if (state.settingsSection === "hotkeys") {
          focusWithoutScroll(els.settingsQuickSwitcher);
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

  function syncSettingsDocumentPlacementField(): void {
    const usesSubfolder = String(els.settingsDocumentsPlacement.value || "").trim() === "note-subfolder";
    els.settingsDocumentsSubfolderField.classList.toggle("hidden", !usesSubfolder);
    els.settingsDocumentsSubfolder.disabled = !usesSubfolder;
  }

  function collectServerSettingsForm(): ServerSettings {
    return {
      vault: {
        vaultPath: String(els.settingsVaultPath.value || "").trim(),
      },
      notifications: {
        ntfyInterval: String(els.settingsNtfyInterval.value || "1m").trim(),
      },
      documents: {
        uploadPlacement: String(els.settingsDocumentsPlacement.value || "same-folder").trim() as ServerSettings["documents"]["uploadPlacement"],
        uploadSubfolder: String(els.settingsDocumentsSubfolder.value || "_files").trim(),
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

  function collectAISettingsForm(): AISettingsResponse & { apiKey?: string; clearApiKey?: boolean } {
    const apiKey = String(els.settingsAIAPIKey.value || "").trim();
    return {
      settings: {
        enabled: Boolean(els.settingsAIEnabled.checked),
        provider: "openai-compatible",
        baseUrl: String(els.settingsAIBaseURL.value || "").trim(),
        model: String(els.settingsAIModel.value || "").trim(),
      },
      apiKeyConfigured: state.aiAPIKeyConfigured,
      apiKey: apiKey || undefined,
      clearApiKey: state.aiClearKeyPending && !apiKey,
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
    setCurrentScopePrefix(state.topLevelFoldersAsVaults ? state.activeScopePrefix : "");
    syncHomePageForCurrentScope();
    state.savedThemeId = currentThemeID();
    state.previewThemeId = currentThemeID();
    saveStoredClientPreferences(state.settings.preferences);
    renderSettingsForm();
    applyUIPreferences();
    renderSourceModeButton();
    renderPageHistoryButton();
    if (state.currentPage || state.appScreen === "help") {
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
    const nextSettings = prepareSettingsSaveWithExtra(
      collectClientPreferencesForm,
      collectUserSettingsForm,
      collectServerSettingsForm,
      collectAISettingsForm,
      applyClientPreferences,
    );
    const aiSettings = nextSettings.extra;
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
      const aiSnapshot = await fetchJSON<AISettingsResponse>("/api/ai/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(aiSettings),
      });
      setAISettingsSnapshot(aiSnapshot);
      await loadMeta();
      await loadAvailableVaults();
      if (state.selectedPage || state.appScreen === "help") {
        syncURLState(true);
      }
      if (previousTopLevelFoldersAsVaults !== state.topLevelFoldersAsVaults) {
        window.location.reload();
        return;
      }
      closeSettingsModal();
      restoreNoteFocus();
      setNoteStatus(settingsSnapshot.restartRequired
        ? ("Settings saved. Restart required to apply runtime changes."
          + (state.settingsRestartRequiredReasons.length
            ? " " + state.settingsRestartRequiredReasons.join(" ")
            : ""))
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
    });
  }

  async function runGlobalSearch() {
    if (!els.globalSearchInput || !els.globalSearchResults) {
      return;
    }
    const query = els.globalSearchInput.value.trim();
    if (!query) {
      renderSearchEmptyState(els, "Type to search pages and tasks.");
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

  function downloadTextFile(filename: string, content: string, contentType: string): void {
    const blob = new Blob([content], { type: contentType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 0);
  }

  function downloadBackupManifest(): void {
    if (!state.serverMeta) {
      setNoteStatus("Backup manifest unavailable until server metadata loads.");
      return;
    }
    const manifest = buildBackupManifest(state.serverMeta);
    downloadTextFile(
      backupManifestFilename(state.serverMeta),
      JSON.stringify(manifest, null, 2) + "\n",
      "application/json"
    );
    els.settingsStatus.textContent = "Backup manifest downloaded.";
  }

  function downloadBackupScript(): void {
    if (!state.serverMeta) {
      setNoteStatus("Backup script unavailable until server metadata loads.");
      return;
    }
    downloadTextFile(
      backupScriptFilename(state.serverMeta),
      buildBackupScript(state.serverMeta),
      "text/x-shellscript"
    );
    els.settingsStatus.textContent = "Backup script downloaded.";
  }

  function refreshBackupManifestValidation(): void {
    if (!state.serverMeta || !state.backupManifestValidation) {
      return;
    }
    state.backupManifestValidation = validateBackupManifest(
      state.serverMeta,
      state.backupManifestValidation.manifest,
      state.backupManifestValidation.sourceLabel
    );
  }

  async function validateBackupManifestFile(file: File | null): Promise<void> {
    if (!file) {
      return;
    }
    if (!state.serverMeta) {
      els.settingsStatus.textContent = "Backup validation unavailable until server metadata loads.";
      return;
    }
    const sourceLabel = String(file.name || "backup manifest").trim() || "backup manifest";
    const manifest = parseBackupManifestJSON(await file.text());
    state.backupManifestValidation = validateBackupManifest(state.serverMeta, manifest, sourceLabel);
    renderSettingsForm();
    els.settingsStatus.textContent = state.backupManifestValidation.matchesCurrentDeployment
      ? "Backup manifest matches the current deployment."
      : "Backup manifest loaded. Review the mismatched paths before restoring.";
  }

  function renderDocumentResults() {
    renderDocumentsUploadHint();
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
      const params = new URLSearchParams();
      if (query) {
        params.set("q", query);
      } else {
        params.set("withUsage", "1");
      }
      const payload = await fetchJSON<DocumentListResponse>("/api/documents" + (params.size ? ("?" + params.toString()) : ""));
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

  async function createFolder(folderPath: string): Promise<void> {
    const scopedFolderPath = applyCurrentScopePrefix(folderPath);
    if (!scopedFolderPath) {
      return;
    }
    await fetchJSON<{ folder: string }>("/api/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folder: scopedFolderPath }),
    });
    await loadPages();
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

  function currentPagePathInventory(): string[] {
    return state.pages.map(function (page) {
      return normalizePageDraftPath(page.path || "");
    }).filter(Boolean);
  }

  function currentFolderPathInventory(): string[] {
    return state.folders.map(function (folder) {
      return normalizePageDraftPath(folder || "");
    }).filter(Boolean);
  }

  function scopedPropertyValueSuggestions(key: string, kind: FrontmatterKind): string[] {
    return collectPropertyValueSuggestions(
      state.pages,
      currentScopePrefix(),
      state.selectedPage,
      key,
      kind,
    );
  }

  function pathFieldState(input: string, options: {
    kind: "note" | "folder";
    action: "create" | "rename";
    sourcePath?: string;
    baseFolder?: string;
  }): ActionDialogFieldState {
    const assist = buildPathDialogAssist({
      kind: options.kind,
      action: options.action,
      input: input,
      sourcePath: options.sourcePath,
      baseFolder: options.baseFolder,
      scopePrefix: currentScopePrefix(),
      pages: currentPagePathInventory(),
      folders: currentFolderPathInventory(),
    });
    return {
      error: assist.error || "",
      helper: assist.error ? "" : assist.helper,
      helperTone: assist.helperTone,
      suggestions: assist.suggestions,
    };
  }

  function pathFieldValidation(input: string, options: {
    kind: "note" | "folder";
    action: "create" | "rename";
    sourcePath?: string;
    baseFolder?: string;
  }): string {
    return buildPathDialogAssist({
      kind: options.kind,
      action: options.action,
      input: input,
      sourcePath: options.sourcePath,
      baseFolder: options.baseFolder,
      scopePrefix: currentScopePrefix(),
      pages: currentPagePathInventory(),
      folders: currentFolderPathInventory(),
    }).error;
  }

  async function requestCreatePageInFolder(folderKey: string): Promise<void> {
    const targetLabel = folderKey || currentScopePrefix() || "vault root";
    const values = await promptForActionInput({
      eyebrow: "Notes",
      title: "New Note",
      message: 'Create a note in "' + targetLabel + '".',
      confirmLabel: "Create Note",
      fields: [{
        key: "name",
        label: "Note name or path",
        placeholder: "meeting-notes",
        value: "",
        autocapitalize: "none",
        spellcheck: false,
        describe: function (value) {
          return pathFieldState(value, {
            kind: "note",
            action: "create",
            baseFolder: folderKey,
          });
        },
      }],
      validate: function (nextValues) {
        return pathFieldValidation(nextValues.name || "", {
          kind: "note",
          action: "create",
          baseFolder: folderKey,
        });
      },
    });
    if (!values) {
      return;
    }
    const normalizedName = normalizePageDraftPath(values.name || "");
    if (!normalizedName) {
      return;
    }
    const basePath = folderKey ? folderKey + "/" : "";
    await createPage(basePath + normalizedName);
  }

  async function requestCreateSubfolderInFolder(folderKey: string): Promise<void> {
    const targetLabel = folderKey || currentScopePrefix() || "vault root";
    const values = await promptForActionInput({
      eyebrow: "Folders",
      title: "New Folder",
      message: 'Create a folder in "' + targetLabel + '".',
      confirmLabel: "Create Folder",
      fields: [{
        key: "folder",
        label: "Folder name",
        placeholder: "contacts",
        value: "",
        autocapitalize: "none",
        spellcheck: false,
        describe: function (value) {
          return pathFieldState(value, {
            kind: "folder",
            action: "create",
            baseFolder: folderKey,
          });
        },
      }],
      validate: function (nextValues) {
        return pathFieldValidation(nextValues.folder || "", {
          kind: "folder",
          action: "create",
          baseFolder: folderKey,
        });
      },
    });
    if (!values) {
      return;
    }
    const subfolder = normalizePageDraftPath(values.folder || "");
    if (!subfolder) {
      return;
    }
    const basePath = folderKey ? folderKey + "/" : "";
    await createFolder(basePath + subfolder);
  }

  async function requestRenamePageInTree(pagePath: string): Promise<void> {
    const currentName = pageTitleFromPath(pagePath);
    const values = await promptForActionInput({
      eyebrow: "Notes",
      title: "Rename Note",
      message: 'Rename "' + currentName + '". You can also move it by entering a nested path.',
      confirmLabel: "Save Name",
      fields: [{
        key: "name",
        label: "Note name or path",
        value: currentName,
        placeholder: currentName,
        autocapitalize: "none",
        spellcheck: false,
        describe: function (value) {
          return pathFieldState(value, {
            kind: "note",
            action: "rename",
            sourcePath: pagePath,
          });
        },
      }],
      validate: function (nextValues) {
        return pathFieldValidation(nextValues.name || "", {
          kind: "note",
          action: "rename",
          sourcePath: pagePath,
        });
      },
    });
    if (!values) {
      return;
    }
    const nextName = normalizePageDraftPath(values.name || "");
    if (!nextName || nextName === currentName) {
      return;
    }
    await renamePage(pagePath, nextName);
  }

  async function requestRenameFolderInTree(folderKey: string): Promise<void> {
    const currentName = pageTitleFromPath(folderKey);
    const values = await promptForActionInput({
      eyebrow: "Folders",
      title: "Rename Folder",
      message: 'Rename "' + currentName + '". You can also move it by entering a nested path.',
      confirmLabel: "Save Name",
      fields: [{
        key: "name",
        label: "Folder name or path",
        value: currentName,
        placeholder: currentName,
        autocapitalize: "none",
        spellcheck: false,
        describe: function (value) {
          return pathFieldState(value, {
            kind: "folder",
            action: "rename",
            sourcePath: folderKey,
          });
        },
      }],
      validate: function (nextValues) {
        return pathFieldValidation(nextValues.name || "", {
          kind: "folder",
          action: "rename",
          sourcePath: folderKey,
        });
      },
    });
    if (!values) {
      return;
    }
    const nextName = normalizePageDraftPath(values.name || "");
    if (!nextName || nextName === currentName) {
      return;
    }
    await renameFolder(folderKey, nextName);
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
    const uploadTarget = documentUploadTargetLabel(state.selectedPage, state.settings.documents);
    setNoteStatus(
      "Uploading " + String(fileList.length) + " document" + (fileList.length === 1 ? "" : "s") + " to " + uploadTarget + "…"
    );
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
    setNoteStatus(
      "Uploaded " + String(documents.length) + " document" + (documents.length === 1 ? "" : "s") + " to " + uploadTarget + "."
    );
  }

  function openFilePickerForEditor(): void {
    if (!state.selectedPage || !state.currentPage) {
      setNoteStatus("Open a note before uploading documents.");
      return;
    }
    els.fileUploadInput.value = "";
    els.fileUploadInput.click();
  }

  async function deletePage(pagePath: string): Promise<void> {
    return deletePageRequest(pagePath, state, {
      encodePath: encodePath,
      fetchJSON: fetchJSON,
      confirmAction: confirmAction,
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
      confirmAction: confirmAction,
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
      selectedPage: state.appScreen === "notes" ? state.selectedPage : "",
      sourceOpen: state.sourceOpen,
      railOpen: state.railOpen,
      currentHomePage: currentHomePage(),
      hotkeys: state.settings.preferences.hotkeys,
      onToggleSource: function () {
        setSourceOpen(!state.sourceOpen);
      },
      onOpenHelp: function () {
        closeCommandPalette();
        openHelpScreen(false);
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
      els.pageProperties.classList.toggle("hidden", state.appScreen === "help" || state.sourceOpen);
    }
    if (els.propertyActions) {
      els.propertyActions.classList.toggle("hidden", state.appScreen === "help" || state.sourceOpen);
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
    const baseMarkdown = state.originalMarkdown;

    setNoteStatus("Saving " + state.selectedPage + "...");
    try {
      noteLocalPageChange(state.selectedPage);
      const payload = await savePageMarkdown(state.selectedPage, markdownToSave, baseMarkdown, encodePath);
      const mergedOnServer = (payload.rawMarkdown || markdownToSave) !== markdownToSave;
      state.currentPage = payload;
      state.originalMarkdown = payload.rawMarkdown || markdownToSave;
      if (state.currentMarkdown === markdownToSave) {
        state.currentMarkdown = payload.rawMarkdown || markdownToSave;
      }
      if (mergedOnServer) {
        const selectionStart = markdownEditorSelectionStart(state, els);
        const selectionEnd = markdownEditorSelectionEnd(state, els);
        const scrollTop = markdownEditorScrollTop(state, els);
        setMarkdownEditorValue(state, els, state.currentMarkdown);
        els.rawView.textContent = state.currentMarkdown;
        setMarkdownEditorSelection(
          state,
          els,
          Math.max(0, Math.min(selectionStart, state.currentMarkdown.length)),
          Math.max(0, Math.min(selectionEnd, state.currentMarkdown.length))
        );
        setMarkdownEditorScrollTop(state, els, scrollTop);
        setNoteStatus("Merged remote edits into " + state.selectedPage + ".");
      } else {
        setNoteStatus("Saved " + state.selectedPage + ".");
      }
      await loadPages();
      if (!markdownEditorHasFocus(state, els) && !inlineTableEditorHasFocus()) {
        await loadPageDetail(state.selectedPage, true, false);
      } else {
        await refreshCurrentDerivedState(state.selectedPage);
      }
    } catch (error) {
      if (error instanceof HTTPError && error.status === 409) {
        try {
          await openSaveConflictResolution(state.selectedPage, markdownToSave);
          setNoteStatus("Save conflict on " + state.selectedPage + ". Review opened.");
        } catch (reloadError) {
          setNoteStatus("Save conflict on " + state.selectedPage + ", and the latest remote version could not be loaded: " + errorMessage(reloadError));
        }
        return;
      }
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
    bindPageEventStream({
      source,
      currentClientId: currentClientInstanceId(),
      selectedPage: function () {
        return state.appScreen === "notes" ? (state.selectedPage || "") : "";
      },
      conflictPage: function () {
        return state.pageConflict ? state.pageConflict.pagePath : "";
      },
      consumeExpectedLocalChange: consumeExpectedLocalPageChange,
      setEventStatus: function (label, live) {
        els.eventStatus.textContent = label;
        els.eventStatus.classList.toggle("live", live);
      },
      addEventLine: addEventLine,
      syncSelectedRemotePage: function (selectedPage) {
        void syncSelectedRemotePage(selectedPage);
      },
      setConflictStatus: function (status) {
        state.pageConflictStatus = status;
      },
      renderConflictModal: renderPageConflictModal,
      debounceRefresh: debounceRefresh,
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
    on(els.closeConflictModal, "click", function () {
      dismissPageConflictModal();
    });
    on(els.conflictCancel, "click", function () {
      dismissPageConflictModal();
    });
    on(els.conflictResolutionMarkdown, "input", function () {
      if (!state.pageConflict || !state.pageConflict.editable) {
        return;
      }
      state.pageConflict.resolutionMarkdown = els.conflictResolutionMarkdown.value;
    });
    on(els.conflictResolutionMarkdown, "keydown", function (rawEvent) {
      const event = rawEvent as KeyboardEvent;
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && state.pageConflict && state.pageConflict.editable) {
        event.preventDefault();
        void savePageConflictResolution();
      }
    });
    on(els.conflictLoadBase, "click", function () {
      if (!state.pageConflict || !state.pageConflict.editable) {
        return;
      }
      setPageConflictResolution(state.pageConflict.baseMarkdown);
      focusWithoutScroll(els.conflictResolutionMarkdown);
    });
    on(els.conflictLoadLocal, "click", function () {
      if (!state.pageConflict || !state.pageConflict.editable) {
        return;
      }
      setPageConflictResolution(state.pageConflict.localMarkdown);
      focusWithoutScroll(els.conflictResolutionMarkdown);
    });
    on(els.conflictLoadRemote, "click", function () {
      if (!state.pageConflict || !state.pageConflict.editable) {
        return;
      }
      setPageConflictResolution(state.pageConflict.remoteMarkdown);
      focusWithoutScroll(els.conflictResolutionMarkdown);
    });
    on(els.conflictReloadRemote, "click", function () {
      applyConflictRemoteVersion().catch(function (error) {
        state.pageConflictStatus = "Remote reload failed: " + errorMessage(error);
        renderPageConflictModal();
      });
    });
    on(els.conflictSaveResolution, "click", function () {
      void savePageConflictResolution();
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
    on(els.reloadPages, "click", loadPages);
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
      openHelpScreen(false);
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
    on(els.settingsNavHotkeys, "click", function () {
      state.settingsSection = "hotkeys";
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
    on(els.settingsNavAI, "click", function () {
      state.settingsSection = "ai";
      renderSettingsForm();
    });
    on(els.settingsNavVault, "click", function () {
      state.settingsSection = "vault";
      renderSettingsForm();
    });
    on(els.settingsAIClearKey, "click", function () {
      state.aiClearKeyPending = !state.aiClearKeyPending;
      if (state.aiClearKeyPending) {
        els.settingsAIAPIKey.value = "";
      }
      renderSettingsForm();
    });
    on(els.settingsDocumentsPlacement, "change", function () {
      syncSettingsDocumentPlacementField();
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
      if (!studioPageAvailable()) {
        return;
      }
      setSourceOpen(!state.sourceOpen);
    });
    on(els.pageHistoryButton, "click", function () {
      if (state.appScreen !== "notes" || !state.selectedPage) {
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
    on(els.fileUploadInput, "change", function () {
      if (state.appScreen !== "notes" || !state.selectedPage || !state.currentPage) {
        els.fileUploadInput.value = "";
        return;
      }
      uploadDroppedFiles(els.fileUploadInput.files).catch(function (error) {
        setNoteStatus("Upload failed: " + errorMessage(error));
      }).finally(function () {
        els.fileUploadInput.value = "";
        focusMarkdownEditor(state, els, {preventScroll: true});
      });
    });
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
    on(els.noteSurface, "dragenter", function (event) {
      if (state.appScreen !== "notes" || !state.selectedPage || !state.currentPage) {
        return;
      }
      event.preventDefault();
      els.noteSurface.classList.add("drop-active");
    });
    on(els.noteSurface, "dragover", function (event) {
      if (state.appScreen !== "notes" || !state.selectedPage || !state.currentPage) {
        return;
      }
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
      if (state.appScreen !== "notes" || !state.selectedPage || !state.currentPage) {
        els.noteSurface.classList.remove("drop-active");
        return;
      }
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
    on(els.conflictModalShell, "click", function (event) {
      if (event.target === els.conflictModalShell) {
        dismissPageConflictModal();
      }
    });
    on(els.noteHeading, "focus", function () {
      if (!state.selectedPage || !state.currentPage || els.noteHeading.disabled) {
        return;
      }
      els.noteHeading.value = currentPageHeadingEditValue() || state.selectedPage || "";
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
      renameCurrentPageFromHeading(els.noteHeading.value).catch(function (error) {
        setNoteStatus("Rename failed: " + errorMessage(error));
      });
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
    on(els.settingsBackupDownload, "click", function () {
      downloadBackupManifest();
    });
    on(els.settingsBackupScript, "click", function () {
      downloadBackupScript();
    });
    on(els.settingsBackupValidate, "click", function () {
      els.settingsBackupValidateInput.value = "";
      els.settingsBackupValidateInput.click();
    });
    on(els.settingsBackupValidateInput, "change", function () {
      const file = els.settingsBackupValidateInput.files && els.settingsBackupValidateInput.files[0]
        ? els.settingsBackupValidateInput.files[0]
        : null;
      validateBackupManifestFile(file).catch(function (error) {
        els.settingsStatus.textContent = "Backup validation failed: " + errorMessage(error);
      }).finally(function () {
        els.settingsBackupValidateInput.value = "";
      });
    });
    on(els.closeActionDialog, "click", function () {
      dismissActionDialog(null);
    });
    on(els.actionDialogCancel, "click", function () {
      dismissActionDialog(null);
    });
    on(els.actionDialogForm, "submit", function (event) {
      event.preventDefault();
      if (!actionDialogSession) {
        return;
      }
      const session = actionDialogSession;
      const fields = Array.isArray(session.options.fields) ? session.options.fields : [];
      if (!fields.length) {
        dismissActionDialog(true);
        return;
      }
      const values = { ...session.values };
      const validationError = session.options.validate ? session.options.validate(values) : "";
      if (validationError) {
        actionDialogSession.status = validationError;
        els.actionDialogStatus.textContent = validationError;
        return;
      }
      dismissActionDialog(values);
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
    on(els.actionDialogShell, "click", function (event) {
      if (event.target === els.actionDialogShell) {
        dismissActionDialog(null);
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
      if (event.key === "Escape" && els.conflictModalShell && !els.conflictModalShell.classList.contains("hidden")) {
        dismissPageConflictModal();
        return;
      }
      if (els.conflictModalShell && !els.conflictModalShell.classList.contains("hidden")) {
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
      if (event.key === "Escape" && els.actionDialogShell && !els.actionDialogShell.classList.contains("hidden")) {
        dismissActionDialog(null);
        return;
      }
      if (els.actionDialogShell && !els.actionDialogShell.classList.contains("hidden")) {
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
      if (matchesHotkey(state.settings.preferences.hotkeys.saveCurrentPage, event) && state.appScreen === "notes" && state.selectedPage) {
        event.preventDefault();
        saveCurrentPage();
        return;
      }
      if (matchesHotkey(state.settings.preferences.hotkeys.toggleRawMode, event) && studioPageAvailable()) {
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
      const helpHotkey = state.settings.preferences.hotkeys.help;
      if (
        matchesHotkey(helpHotkey, event)
        && (!isTypingTarget(event.target) || !hotkeyProducesText(helpHotkey))
      ) {
        event.preventDefault();
        openHelpScreen(false);
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
        const anchorTop = Number(detail.anchorTop) || 0;
        const anchorBottom = Number(detail.anchorBottom) || 0;
        openInlineTaskPicker(ref, field, left, top, anchorTop, anchorBottom);
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
    setRailTab("files");
    setRailOpen(!window.matchMedia("(max-width: 1180px)").matches);
    setPageSearchOpen(false);
    setSourceOpen(false);
    state.themeCache = loadStoredThemeCache();
    state.settings.preferences = loadStoredClientPreferences();
    state.topLevelFoldersAsVaults = Boolean(state.settings.preferences.vaults.topLevelFoldersAsVaults);
    state.activeScopePrefix = loadStoredScopePrefix();
    setActiveScopePrefix(state.topLevelFoldersAsVaults ? state.activeScopePrefix : "");
    state.savedThemeId = currentThemeID();
    state.previewThemeId = currentThemeID();
    applyUIPreferences();
    renderNoteStudio();
    renderAppScreen();
    renderPageTasks();
    renderPageContext();
    renderPageProperties();
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
