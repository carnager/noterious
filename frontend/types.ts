export type FrontmatterScalar = string | boolean;
export type FrontmatterValue = FrontmatterScalar | FrontmatterScalar[];
export type FrontmatterMap = Record<string, FrontmatterValue>;
export type QueryRow = Record<string, unknown>;
export type FrontmatterKind = "text" | "list" | "bool" | "date" | "datetime";

export interface PageIdentity {
  page?: string;
  path?: string;
  title?: string;
}

export interface QueryBlockRender {
  source: string;
  html: string;
}

export interface TaskRender {
  line: number;
  ref: string;
  text: string;
  done: boolean;
  due: string;
  remind: string;
  who: string[];
}

export interface LinkRecord {
  sourcePage: string;
  targetPage: string;
  linkText: string;
  kind: string;
  line: number;
}

export interface TaskRecord {
  ref: string;
  page: string;
  line: number;
  text: string;
  state: string;
  done: boolean;
  due?: string;
  remind?: string;
  who?: string[];
}

export interface HeadingRecord {
  level: number;
  text: string;
  anchor: string;
  line: number;
}

export interface QueryResult {
  columns: string[];
  rows: QueryRow[];
}

export interface QueryBlockRecord {
  source: string;
  line: number;
  id?: string;
  key: string;
  datasets?: string[];
  matchPage?: string;
  result?: QueryResult;
  error?: string;
  rowCount: number;
  renderHint?: string;
  updatedAt?: string;
  stale: boolean;
  stalePage?: string;
  staleSince?: string;
  staleReason?: string;
}

export interface BacklinkRecord {
  sourcePage: string;
  sourceTitle: string;
  linkText: string;
  kind: string;
  line: number;
}

export interface PageRecord extends PageIdentity {
  page: string;
  title: string;
  rawMarkdown: string;
  createdAt?: string;
  updatedAt?: string;
  frontmatter: FrontmatterMap;
  links: LinkRecord[];
  tasks: TaskRecord[];
}

export interface PageSummary {
  path: string;
  title: string;
  tags: string[];
  frontmatter?: FrontmatterMap;
  outgoingLinkCount: number;
  backlinkCount: number;
  taskCount: number;
  openTaskCount: number;
  doneTaskCount: number;
  queryBlockCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface DerivedPage {
  toc: HeadingRecord[];
  backlinks: BacklinkRecord[];
  queryBlocks: QueryBlockRecord[];
  linkCounts: Record<string, number>;
  taskCounts: Record<string, number>;
}

export interface SavedQueryRecord {
  name: string;
  title: string;
  description?: string;
  folder?: string;
  tags: string[];
  query: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface SavedQueryTreeFolder {
  folder: string;
  count: number;
  queries: SavedQueryRecord[];
}

export interface VaultHealth {
  healthy: boolean;
  reason?: string;
  message?: string;
}

export interface VaultRecord {
  id: number;
  key: string;
  name: string;
  vaultPath: string;
  homePage: string;
  createdAt: string;
  updatedAt: string;
}

export interface MetaResponse {
  name: string;
  listenAddr: string;
  runtimeVault: VaultSettings;
  currentVault?: VaultRecord;
  vaultHealth: VaultHealth;
  dataDir: string;
  database: string;
  serverTime: string;
  serverFirst: boolean;
  restartRequired?: boolean;
}

export interface AuthenticatedUser {
  id: number;
  username: string;
  createdAt: string;
  lastLoginAt?: string;
  mustChangePassword: boolean;
}

export interface AuthSessionResponse {
  authenticated: boolean;
  user?: AuthenticatedUser;
  vault?: VaultRecord;
  setupRequired?: boolean;
}

export interface AuthVaultsResponse {
  rootVault?: VaultRecord;
  vaults: VaultRecord[];
  count: number;
  currentVault?: VaultRecord;
}

export interface VaultListResponse {
  vaults: VaultRecord[];
  count: number;
}

export interface Hotkeys {
  quickSwitcher: string;
  globalSearch: string;
  commandPalette: string;
  quickNote: string;
  help: string;
  saveCurrentPage: string;
  toggleRawMode: string;
  toggleTaskDone: string;
}

export interface Preferences {
  hotkeys: Hotkeys;
  ui: UISettings;
  vaults: VaultPreferences;
}

export type ThemeSource = "builtin" | "custom";
export type ThemeKind = "dark" | "light";

export interface ThemeTokens {
  bg: string;
  bgGradientStart: string;
  bgGradientEnd: string;
  bgGlowA: string;
  bgGlowB: string;
  sidebar: string;
  sidebarSoft: string;
  panel: string;
  panelStrong: string;
  surface: string;
  surfaceSoft: string;
  overlay: string;
  overlaySoft: string;
  table: string;
  tableHeader: string;
  editorOverlay: string;
  ink: string;
  muted: string;
  accent: string;
  accentSoft: string;
  warn: string;
  line: string;
  lineStrong: string;
  focusRing: string;
  selection: string;
  shadow: string;
  themeColor: string;
}

export interface ThemeRecord {
  version: number;
  id: string;
  name: string;
  source: ThemeSource;
  kind: ThemeKind;
  description: string;
  tokens: ThemeTokens;
}

export interface ThemeListResponse {
  themes: ThemeRecord[];
  count: number;
}

export interface UISettings {
  fontFamily: "mono" | "sans" | "serif";
  fontSize: string;
  dateTimeFormat: "browser" | "iso" | "de";
  themeId: string;
}

export interface VaultPreferences {
  topLevelFoldersAsVaults: boolean;
}

export interface VaultSettings {
  vaultPath: string;
  homePage: string;
}

export interface ServerNotificationSettings {
  ntfyInterval: string;
}

export interface UserNotificationSettings {
  ntfyTopicUrl: string;
  ntfyToken: string;
}

export interface UserSettings {
  homePage: string;
  notifications: UserNotificationSettings;
}

export interface ServerSettings {
  vault: VaultSettings;
  notifications: ServerNotificationSettings;
}

export interface AppSettings extends ServerSettings {
  preferences: Preferences;
  userNotifications: UserNotificationSettings;
}

export interface SettingsResponse {
  settings: ServerSettings;
  appliedVault: VaultSettings;
  restartRequired: boolean;
}

export interface UserSettingsResponse {
  settings: UserSettings;
}

export interface PageListResponse {
  pages: PageSummary[];
  count: number;
  query?: string;
  tag?: string;
}

export interface SavedQueryTreeResponse {
  folders: SavedQueryTreeFolder[];
  count: number;
}

export interface SearchPageResult {
  path: string;
  title?: string;
  match?: string;
  snippet?: string;
  line?: number;
}

export interface SearchTaskResult {
  ref: string;
  page: string;
  line: number;
  text: string;
  snippet?: string;
}

export interface SearchSavedQueryResult {
  name: string;
  title?: string;
  folder?: string;
  match?: string;
  snippet?: string;
}

export interface SearchPayload {
  counts: {
    total: number;
    pages?: number;
    tasks?: number;
    queries?: number;
  };
  pages: SearchPageResult[];
  tasks: SearchTaskResult[];
  queries: SearchSavedQueryResult[];
}

export interface DocumentRecord {
  id: string;
  path: string;
  name: string;
  contentType: string;
  size: number;
  createdAt: string;
  downloadURL: string;
}

export interface DocumentListResponse {
  documents: DocumentRecord[];
  count: number;
  query?: string;
}

export interface PageRevisionRecord {
  id: string;
  page: string;
  savedAt: string;
  rawMarkdown: string;
}

export interface PageHistoryResponse {
  page: string;
  revisions: PageRevisionRecord[];
  count: number;
}

export interface TrashPageRecord {
  page: string;
  deletedAt: string;
  rawMarkdown: string;
}

export interface TrashListResponse {
  pages: TrashPageRecord[];
  count: number;
}

export interface QueryFenceOptions {
  [key: string]: string;
}

export interface FocusRestoreSpec {
  mode: "editor";
  offset?: number;
}

export interface SlashCommand {
  id: string;
  title: string;
  description: string;
  keywords?: string;
  hint?: string;
  apply(lineText: string): string;
  caret?(updatedLine: string): number;
}

export interface SlashMenuContext {
  editor?: HTMLElement;
  commands: SlashCommand[];
  left?: number;
  top?: number;
  type?: string;
  lineIndex?: number;
}

export interface PropertyDraft {
  key: string;
  text: string;
  list: string[];
  kind: FrontmatterKind;
  originalKey: string;
}

export interface NoteriousEditorApi {
  host: HTMLDivElement;
  view: unknown;
  getValue(): string;
  setValue(value: string): void;
  replaceRange(from: number, to: number, insert: string): void;
  focus(options?: FocusOptions): void;
  blur(): void;
  hasFocus(): boolean;
  getSelectionStart(): number;
  getSelectionEnd(): number;
  setSelectionRange(anchor: number, head?: number, reveal?: boolean): void;
  getScrollTop(): number;
  setScrollTop(value: number): void;
  getCaretRect(): DOMRect | null;
  setHighlightedLine(lineNumber: number | null): void;
  setPagePath(path: string): void;
  setDateTimeFormat(format: "browser" | "iso" | "de"): void;
  setRenderMode(enabled: boolean): void;
  setQueryBlocks(blocks: QueryBlockRender[]): void;
  setTasks(tasks: TaskRender[]): void;
  isRenderMode(): boolean;
  onKeydown(handler: EventListenerOrEventListenerObject): void;
}
