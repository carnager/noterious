import { renderPaletteSections, type PaletteItem, type PaletteSection } from "./palette";

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
  selectedPage: string;
  sourceOpen: boolean;
  railOpen: boolean;
  currentHomePage: string;
  hotkeys: {
    globalSearch: string;
    commandPalette: string;
    quickSwitcher: string;
    help: string;
    saveCurrentPage: string;
    toggleRawMode: string;
  };
  onToggleSource(): void;
  onOpenHelp(): void;
  onOpenSettings(): void;
  onOpenDocuments(): void;
  onOpenQuickSwitcher(): void;
  onOpenSearch(): void;
  onFocusRail(tab: string): void;
  onToggleRail(): void;
  onOpenHomePage(pagePath: string): void;
  onSetHomePage(pagePath: string): void;
  onDeletePage(pagePath: string): void;
  onClearHomePage(): void;
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
  const parts = String(pagePath || "").split("/");
  return parts[parts.length - 1] || pagePath;
}

function buildCommandEntries(options: RenderCommandPaletteOptions): CommandEntry[] {
  const commands: CommandEntry[] = [
    {
      title: options.sourceOpen ? "Close Raw Mode" : "Open Raw Mode",
      meta: "Editor",
      keywords: "raw mode markdown source editor",
      hint: options.hotkeys.toggleRawMode,
      run: options.onToggleSource,
    },
    {
      title: "Global Search",
      meta: "Search",
      keywords: "search find global",
      hint: options.hotkeys.globalSearch,
      run: options.onOpenSearch,
    },
    {
      title: "Open Documents",
      meta: "Documents",
      keywords: "documents files attachments uploads",
      run: options.onOpenDocuments,
    },
    {
      title: "Open Help",
      meta: "Help",
      keywords: "help shortcuts keyboard keymap",
      hint: options.hotkeys.help,
      run: options.onOpenHelp,
    },
    {
      title: "Open Settings",
      meta: "Settings",
      keywords: "settings preferences hotkeys workspace",
      run: options.onOpenSettings,
    },
    {
      title: "Open Quick Switcher",
      meta: "Navigation",
      keywords: "quick switcher open file note",
      hint: options.hotkeys.quickSwitcher,
      run: options.onOpenQuickSwitcher,
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
  const commands = buildCommandEntries(options).filter(function (command) {
    if (!query) {
      return true;
    }
    return [command.title, command.meta, command.keywords].join(" ").toLowerCase().indexOf(query) >= 0;
  });

  return [
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
  ];
}

export function renderCommandPaletteResults(options: RenderCommandPaletteOptions): number {
  return renderPaletteSections(options.container, buildCommandPaletteSections(options), "No matches.");
}
