import { requireOK } from "./http";
import { inferMarkdownTitle, parseFrontmatter } from "./markdown";
import type { DerivedPage, PageRecord } from "./types";

export const SYSTEM_HELP_PATH = "_system/help";
export const SYSTEM_HELP_LABEL = "Help";

export function placeholderHelpMarkdown(status: string): string {
  return "# Noterious Help\n\n" + String(status || "Loading help…").trim();
}

export function buildSystemHelpPage(markdown: string): PageRecord {
  const rawMarkdown = String(markdown || "");
  const fallbackPage = {
    page: SYSTEM_HELP_PATH,
    path: SYSTEM_HELP_PATH,
    title: SYSTEM_HELP_LABEL,
  };
  return {
    page: SYSTEM_HELP_PATH,
    path: SYSTEM_HELP_PATH,
    title: inferMarkdownTitle(rawMarkdown, fallbackPage) || SYSTEM_HELP_LABEL,
    rawMarkdown,
    createdAt: "",
    updatedAt: "",
    frontmatter: parseFrontmatter(rawMarkdown),
    links: [],
    tasks: [],
  };
}

export function emptySystemDerivedPage(): DerivedPage {
  return {
    toc: [],
    backlinks: [],
    queryBlocks: [],
    linkCounts: {},
    taskCounts: {},
  };
}

export async function loadSystemHelpMarkdown(fetchImpl: typeof fetch = fetch): Promise<string> {
  const response = await fetchImpl("/help.md");
  await requireOK(response);
  return response.text();
}
