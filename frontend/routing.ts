import type { AppScreen, PageSummary } from "./types";

export interface URLState {
  page: string;
  query: string;
  screen: AppScreen;
}

export interface ApplyURLStateOptions {
  href: string;
  currentHomePage: string;
  pages: PageSummary[];
  onNavigateToPage(pagePath: string, replace: boolean): void;
  onSelectSavedQuery(name: string): void;
  onOpenQueriesScreen(): void;
  onRenderIdle(): void;
}

export interface NavigateToPageOptions {
  pagePath: string;
  lineNumber?: number | string;
  taskRef?: string;
  replace: boolean;
  onExpandAncestors(pagePath: string): void;
  onSetPendingFocus(lineNumber: number | null, taskRef: string): void;
  onSelectPage(pagePath: string): void;
  onSyncURL(replace: boolean): void;
  onRenderPages(): void;
  onRenderSavedQueryTree(): void;
  onLoadPageDetail(pagePath: string): void;
}

export function parseURLState(href: string): URLState {
  const url = new URL(href);
  return {
    page: url.searchParams.get("page") || "",
    query: url.searchParams.get("query") || "",
    screen: url.searchParams.get("screen") === "queries" ? "queries" : "notes",
  };
}

export function buildSelectionURL(href: string, selectedPage: string, selectedSavedQuery: string, screen: AppScreen): URL {
  const url = new URL(href);
  if (selectedPage) {
    url.searchParams.set("page", selectedPage);
  } else {
    url.searchParams.delete("page");
  }
  if (screen === "queries" && selectedSavedQuery) {
    url.searchParams.set("query", selectedSavedQuery);
  } else {
    url.searchParams.delete("query");
  }
  if (screen === "queries") {
    url.searchParams.set("screen", "queries");
  } else {
    url.searchParams.delete("screen");
  }
  return url;
}

export function applyURLState(options: ApplyURLStateOptions): void {
  const urlState = parseURLState(options.href);
  if (urlState.page && options.pages.some(function (page) {
    return String(page.path || "").toLowerCase() === urlState.page.toLowerCase();
  })) {
    options.onNavigateToPage(urlState.page, true);
    return;
  }
  if (urlState.query) {
    options.onOpenQueriesScreen();
    options.onSelectSavedQuery(urlState.query);
    return;
  }
  if (urlState.screen === "queries") {
    options.onOpenQueriesScreen();
    return;
  }
  const homePage = String(options.currentHomePage || "").trim();
  if (homePage && options.pages.some(function (page) {
    return String(page.path || "").toLowerCase() === homePage.toLowerCase();
  })) {
    options.onNavigateToPage(homePage, true);
    return;
  }
  options.onRenderIdle();
}

export function navigateToPageSelection(options: NavigateToPageOptions): void {
  if (!options.pagePath) {
    return;
  }
  const parsedLine = Number(options.lineNumber);
  const pendingLine = Number.isFinite(parsedLine) && parsedLine > 0 ? parsedLine : null;
  options.onSetPendingFocus(pendingLine, String(options.taskRef || "").trim());
  options.onSelectPage(options.pagePath);
  options.onExpandAncestors(options.pagePath);
  options.onSyncURL(Boolean(options.replace));
  options.onRenderPages();
  options.onRenderSavedQueryTree();
  options.onLoadPageDetail(options.pagePath);
}
