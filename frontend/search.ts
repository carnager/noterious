import { pageLeafName, renderPaletteSections, type PaletteItem, type PaletteSection } from "./palette";
import type { SearchPayload } from "./types";

export interface RenderGlobalSearchResultsOptions {
  container: HTMLElement;
  payload: SearchPayload;
  onClose(): void;
  onOpenPage(pagePath: string): void;
  onOpenPageAtLine(pagePath: string, lineNumber: number | string): void;
  onOpenPageAtTask(pagePath: string, taskRef: string, lineNumber: number | string): void;
  onOpenSavedQuery(name: string): void;
}

export function buildGlobalSearchSections(options: Omit<RenderGlobalSearchResultsOptions, "container">): PaletteSection[] {
  const counts = options.payload && options.payload.counts ? options.payload.counts : { total: 0 };
  if (!counts.total) {
    return [];
  }

  const pageItems = options.payload.pages || [];
  const taskItems = options.payload.tasks || [];
  const queryItems = options.payload.queries || [];
  return [
    {
      title: "Pages",
      items: pageItems.map(function (item): PaletteItem {
        const leaf = pageLeafName(item.path);
        const title = item.title && item.title !== leaf ? item.title : "";
        return {
          title: leaf,
          meta: [item.path, title, item.match].filter(Boolean).join(" · "),
          snippet: item.snippet || "",
          onSelect: function () {
            options.onClose();
            if (item.line) {
              options.onOpenPageAtLine(item.path, item.line);
              return;
            }
            options.onOpenPage(item.path);
          },
        };
      }),
    },
    {
      title: "Tasks",
      items: taskItems.map(function (item): PaletteItem {
        return {
          title: item.text || item.ref,
          meta: [item.page, item.line ? ("line " + item.line) : ""].filter(Boolean).join(" · "),
          snippet: item.snippet || "",
          onSelect: function () {
            options.onClose();
            options.onOpenPageAtTask(item.page, item.ref, item.line);
          },
        };
      }),
    },
    {
      title: "Saved Queries",
      items: queryItems.map(function (item): PaletteItem {
        return {
          title: item.title || item.name,
          meta: [item.name, item.folder, item.match].filter(Boolean).join(" · "),
          snippet: item.snippet || "",
          onSelect: function () {
            options.onClose();
            options.onOpenSavedQuery(item.name);
          },
        };
      }),
    },
  ];
}

export function renderGlobalSearchResults(options: RenderGlobalSearchResultsOptions): number {
  return renderPaletteSections(options.container, buildGlobalSearchSections(options), "No results.");
}
