import { pageLeafName, renderPaletteSections, type PaletteItem, type PaletteSection } from "./palette";
import type { PageSummary } from "./types";

export interface CommandEntry {
  title: string;
  meta: string;
  keywords: string;
  hint?: string;
  run(): void;
}

export interface RenderCommandPaletteOptions {
  container: HTMLElement;
  inputValue: string;
  pages: PageSummary[];
  selectedPage: string;
  sourceOpen: boolean;
  railOpen: boolean;
  currentHomePage: string;
  onToggleSource(): void;
  onOpenSearch(): void;
  onFocusRail(tab: string): void;
  onToggleRail(): void;
  onOpenHomePage(pagePath: string): void;
  onSetHomePage(pagePath: string): void;
  onDeletePage(pagePath: string): void;
  onClearHomePage(): void;
  onMovePage(pagePath: string, targetPage: string): void;
  onCreatePage(pagePath: string): void;
  onOpenPage(pagePath: string): void;
}

export function normalizePageDraftPath(value: string): string {
  return String(value || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/\.md$/i, "")
    .replace(/^\/+/, "")
    .replace(/\/+/g, "/");
}

export function pageTitleFromPath(pagePath: string): string {
  return pageLeafName(pagePath);
}

function buildCommandEntries(options: RenderCommandPaletteOptions): CommandEntry[] {
  const commands: CommandEntry[] = [
    {
      title: options.sourceOpen ? "Close Raw Mode" : "Open Raw Mode",
      meta: "Editor",
      keywords: "raw mode markdown source editor",
      hint: "Ctrl+E",
      run: options.onToggleSource,
    },
    {
      title: "Global Search",
      meta: "Search",
      keywords: "search find global",
      hint: "Ctrl+K",
      run: options.onOpenSearch,
    },
    {
      title: "Focus Files",
      meta: "Rail",
      keywords: "files pages rail sidebar",
      run: function () {
        options.onFocusRail("files");
      },
    },
    {
      title: "Focus Context",
      meta: "Rail",
      keywords: "context backlinks links queries rail",
      run: function () {
        options.onFocusRail("context");
      },
    },
    {
      title: "Focus Tasks",
      meta: "Rail",
      keywords: "tasks rail",
      run: function () {
        options.onFocusRail("tasks");
      },
    },
    {
      title: "Focus Tags",
      meta: "Rail",
      keywords: "tags rail",
      run: function () {
        options.onFocusRail("tags");
      },
    },
    {
      title: options.railOpen ? "Close Sidebar" : "Open Sidebar",
      meta: "Layout",
      keywords: "sidebar rail drawer",
      run: options.onToggleRail,
    },
  ];

  if (options.currentHomePage) {
    commands.push({
      title: "Open Home Page",
      meta: options.currentHomePage,
      keywords: "home start page default landing",
      run: function () {
        options.onOpenHomePage(options.currentHomePage);
      },
    });
  }

  if (options.selectedPage) {
    const selectedIsHomePage = Boolean(
      options.currentHomePage && options.currentHomePage.toLowerCase() === String(options.selectedPage).toLowerCase()
    );
    commands.push({
      title: selectedIsHomePage ? "Home Page Already Set" : "Set Home Page",
      meta: options.selectedPage,
      keywords: "home start page default landing",
      hint: selectedIsHomePage ? "Current" : "",
      run: function () {
        if (!selectedIsHomePage) {
          options.onSetHomePage(options.selectedPage);
        }
      },
    });

    commands.push({
      title: "Delete Page",
      meta: options.selectedPage,
      keywords: "delete remove page note file",
      hint: "Del",
      run: function () {
        options.onDeletePage(options.selectedPage);
      },
    });
  }

  if (options.currentHomePage) {
    commands.push({
      title: "Clear Home Page",
      meta: options.currentHomePage,
      keywords: "home start page default landing reset clear",
      run: options.onClearHomePage,
    });
  }

  return commands;
}

export function buildCommandPaletteSections(options: RenderCommandPaletteOptions): PaletteSection[] {
  const query = String(options.inputValue || "").trim().toLowerCase();
  const rawQuery = String(options.inputValue || "").trim();
  const normalizedDraftPath = normalizePageDraftPath(rawQuery);
  const commands = buildCommandEntries(options).filter(function (command) {
    if (!query) {
      return true;
    }
    return [command.title, command.meta, command.keywords].join(" ").toLowerCase().indexOf(query) >= 0;
  });

  const pageExists = normalizedDraftPath
    ? options.pages.some(function (page) {
        return String(page.path || "").toLowerCase() === normalizedDraftPath.toLowerCase();
      })
    : false;

  const moveCommands: CommandEntry[] = options.selectedPage && normalizedDraftPath && !pageExists &&
    normalizedDraftPath.toLowerCase() !== String(options.selectedPage).toLowerCase()
    ? [{
        title: "Move Page",
        meta: options.selectedPage + " → " + normalizedDraftPath,
        keywords: "move rename page note file",
        hint: "Enter",
        run: function () {
          options.onMovePage(options.selectedPage, normalizedDraftPath);
        },
      }]
    : [];

  const createCommands: CommandEntry[] = normalizedDraftPath && !pageExists
    ? [{
        title: "Create Page",
        meta: normalizedDraftPath,
        keywords: "new page create note file",
        hint: "Enter",
        run: function () {
          options.onCreatePage(normalizedDraftPath);
        },
      }]
    : [];

  const pages = options.pages.filter(function (page) {
    if (!query) {
      return true;
    }
    return [page.path, page.title || "", (page.tags || []).join(" ")].join(" ").toLowerCase().indexOf(query) >= 0;
  }).slice(0, 20);

  return [
    {
      title: "Move",
      items: moveCommands.map(function (command): PaletteItem {
        return {
          title: command.title,
          meta: command.meta,
          hint: command.hint || "",
          onSelect: command.run,
        };
      }),
    },
    {
      title: "Create",
      items: createCommands.map(function (command): PaletteItem {
        return {
          title: command.title,
          meta: command.meta,
          hint: command.hint || "",
          onSelect: command.run,
        };
      }),
    },
    {
      title: "Commands",
      items: commands.map(function (command): PaletteItem {
        return {
          title: command.title,
          meta: command.meta,
          hint: command.hint || "",
          onSelect: command.run,
        };
      }),
    },
    {
      title: "Pages",
      items: pages.map(function (page): PaletteItem {
        const leaf = pageLeafName(page.path);
        const title = page.title && page.title !== leaf ? page.title : "";
        return {
          title: leaf,
          meta: [page.path, title].concat(page.tags && page.tags.length ? [page.tags.join(", ")] : []).filter(Boolean).join(" · "),
          onSelect: function () {
            options.onOpenPage(page.path);
          },
        };
      }),
    },
  ];
}

export function renderCommandPaletteResults(options: RenderCommandPaletteOptions): number {
  return renderPaletteSections(options.container, buildCommandPaletteSections(options), "No matches.");
}
