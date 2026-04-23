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

export interface MetaResponse {
  name: string;
  listenAddr: string;
  vaultPath: string;
  dataDir: string;
  homePage: string;
  database: string;
  serverTime: string;
  serverFirst: boolean;
  restartRequired?: boolean;
}

export interface Hotkeys {
  quickSwitcher: string;
  globalSearch: string;
  commandPalette: string;
  help: string;
  saveCurrentPage: string;
  toggleRawMode: string;
}

export interface Preferences {
  hotkeys: Hotkeys;
}

export interface WorkspaceSettings {
  vaultPath: string;
  homePage: string;
}

export interface AppSettings {
  preferences: Preferences;
  workspace: WorkspaceSettings;
}

export interface SettingsResponse {
  settings: AppSettings;
  appliedWorkspace: WorkspaceSettings;
  restartRequired: boolean;
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

export interface QueryFenceOptions {
  [key: string]: string;
}

export interface FocusRestoreSpec {
  mode: "editor";
  offset: number;
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
  focus(options?: FocusOptions): void;
  hasFocus(): boolean;
  getSelectionStart(): number;
  getSelectionEnd(): number;
  setSelectionRange(anchor: number, head?: number, reveal?: boolean): void;
  getScrollTop(): number;
  setScrollTop(value: number): void;
  getCaretRect(): DOMRect | null;
  setPagePath(path: string): void;
  setRenderMode(enabled: boolean): void;
  setQueryBlocks(blocks: QueryBlockRender[]): void;
  setTasks(tasks: TaskRender[]): void;
  isRenderMode(): boolean;
  onKeydown(handler: EventListenerOrEventListenerObject): void;
}
