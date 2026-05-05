import type { AppScreen, PageSummary } from "./types";

export interface URLState {
  page: string;
  screen: AppScreen;
}

export interface ApplyURLStateOptions {
  href: string;
  currentHomePage: string;
  pages: PageSummary[];
  onNavigateToPage(pagePath: string, replace: boolean): void;
  onOpenHelpScreen(): void;
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
  onLoadPageDetail(pagePath: string): void;
}

export function parseURLState(href: string): URLState {
  const url = new URL(href);
  const screenParam = url.searchParams.get("screen");
  return {
    page: url.searchParams.get("page") || "",
    screen: screenParam === "help"
        ? "help"
        : "notes",
  };
}

export function buildSelectionURL(href: string, selectedPage: string, screen: AppScreen): URL {
  const url = new URL(href);
  if (screen === "notes" && selectedPage) {
    url.searchParams.set("page", selectedPage);
  } else {
    url.searchParams.delete("page");
  }
  url.searchParams.delete("query");
  if (screen === "help") {
    url.searchParams.set("screen", "help");
  } else {
    url.searchParams.delete("screen");
  }
  return url;
}

export function applyURLState(options: ApplyURLStateOptions): void {
  const urlState = parseURLState(options.href);
  if (urlState.screen === "help") {
    options.onOpenHelpScreen();
    return;
  }
  if (urlState.page && options.pages.some(function (page) {
    return String(page.path || "").toLowerCase() === urlState.page.toLowerCase();
  })) {
    options.onNavigateToPage(urlState.page, true);
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
  options.onLoadPageDetail(options.pagePath);
}
