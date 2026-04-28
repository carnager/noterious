import { pageLeafName, renderPaletteSections, type PaletteItem, type PaletteSection } from "./palette";
import { normalizePageDraftPath } from "./commands";
import { buildPagePathFromTemplate, templateFieldSummary } from "./noteTemplates";
import type { NoteTemplate, PageSummary } from "./types";

export interface RenderQuickSwitcherOptions {
  container: HTMLElement;
  inputValue: string;
  pages: PageSummary[];
  templates: NoteTemplate[];
  selectedPage: string;
  onClose(): void;
  onOpenPage(pagePath: string): void;
  onCreatePage(pagePath: string): void;
  onCreateTemplatePage(template: NoteTemplate, pagePath: string): void;
}

function scorePage(page: PageSummary, query: string, selectedPage: string): number {
  const path = String(page.path || "").toLowerCase();
  const title = String(page.title || "").toLowerCase();
  const target = String(query || "").trim().toLowerCase();
  if (!target) {
    const selectedBoost = path === String(selectedPage || "").toLowerCase() ? 2000000000000 : 0;
    const updatedAt = page.updatedAt ? Date.parse(page.updatedAt) || 0 : 0;
    return selectedBoost + updatedAt;
  }
  const exactPath = path === target ? 5000 : 0;
  const exactLeaf = pageLeafName(page.path).toLowerCase() === target ? 4500 : 0;
  const prefixPath = path.startsWith(target) ? 3000 : 0;
  const prefixTitle = title.startsWith(target) ? 2500 : 0;
  const includesPath = path.indexOf(target) >= 0 ? 1200 : 0;
  const includesTitle = title.indexOf(target) >= 0 ? 1000 : 0;
  const selectedBoost = path === String(selectedPage || "").toLowerCase() ? 50 : 0;
  const freshness = page.updatedAt ? (Date.parse(page.updatedAt) || 0) / 1000000000000 : 0;
  return exactPath + exactLeaf + prefixPath + prefixTitle + includesPath + includesTitle + selectedBoost + freshness;
}

function matchesPage(page: PageSummary, query: string): boolean {
  const target = String(query || "").trim().toLowerCase();
  if (!target) {
    return true;
  }
  const haystack = [page.path, page.title || ""].join(" ").toLowerCase();
  return haystack.indexOf(target) >= 0;
}

function hasPageAtPath(pages: PageSummary[], pagePath: string): boolean {
  const normalizedPath = String(pagePath || "").trim().toLowerCase();
  if (!normalizedPath) {
    return false;
  }
  return pages.some(function (page) {
    return String(page.path || "").trim().toLowerCase() === normalizedPath;
  });
}

export function buildQuickSwitcherSections(
  options: Omit<RenderQuickSwitcherOptions, "container">
): PaletteSection[] {
  const query = String(options.inputValue || "").trim();
  const normalizedDraftPath = normalizePageDraftPath(query);
  const matchingPages = options.pages
    .filter(function (page) {
      return matchesPage(page, query);
    })
    .sort(function (left, right) {
      return scorePage(right, query, options.selectedPage) - scorePage(left, query, options.selectedPage);
    })
    .slice(0, query ? 20 : 15);

  const hasExactMatch = normalizedDraftPath
    ? matchingPages.some(function (page) {
        return String(page.path || "").toLowerCase() === normalizedDraftPath.toLowerCase();
      })
    : false;

  const createItems: PaletteItem[] = normalizedDraftPath && !hasExactMatch
    ? [{
        title: "Create note",
        meta: normalizedDraftPath,
        hint: "Enter",
        onSelect: function () {
          options.onClose();
          options.onCreatePage(normalizedDraftPath);
        },
      }]
    : [];

  const templateItems: PaletteItem[] = normalizedDraftPath
    ? (Array.isArray(options.templates) ? options.templates : []).reduce(function (items, template) {
      const targetPath = buildPagePathFromTemplate(template, normalizedDraftPath);
      if (!targetPath || hasPageAtPath(options.pages, targetPath)) {
        return items;
      }
      items.push({
        title: "Create " + (template.name || "templated note"),
        meta: targetPath,
        snippet: templateFieldSummary(template, 4),
        onSelect: function () {
          options.onClose();
          options.onCreateTemplatePage(template, targetPath);
        },
      });
      return items;
    }, [] as PaletteItem[])
    : [];

  const recentTitle = query ? "Notes" : "Recent Notes";
  const noteItems = matchingPages.map(function (page): PaletteItem {
    const leaf = pageLeafName(page.path);
    const title = page.title && page.title !== leaf ? page.title : "";
    return {
      title: leaf,
      meta: [page.path, title].filter(Boolean).join(" · "),
      onSelect: function () {
        options.onClose();
        options.onOpenPage(page.path);
      },
    };
  });

  return [
    {
      title: "Create",
      items: createItems.concat(templateItems),
    },
    {
      title: recentTitle,
      items: noteItems,
    },
  ];
}

export function renderQuickSwitcherResults(options: RenderQuickSwitcherOptions): number {
  return renderPaletteSections(options.container, buildQuickSwitcherSections(options), "No matching notes.");
}
