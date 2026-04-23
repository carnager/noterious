import { describe, expect, it, vi } from "vitest";

import { buildCommandPaletteSections, normalizePageDraftPath, pageTitleFromPath } from "./commands";
function paletteOptions(overrides: Partial<Parameters<typeof buildCommandPaletteSections>[0]> = {}) {
  const calls: string[] = [];
  return {
    calls,
    options: {
      container: {} as HTMLElement,
      inputValue: "",
      selectedPage: "notes/alpha",
      sourceOpen: false,
      railOpen: false,
      currentHomePage: "notes/home",
      hotkeys: {
        quickSwitcher: "Mod+K",
        globalSearch: "Mod+Shift+K",
        commandPalette: "Mod+Shift+P",
        help: "?",
        saveCurrentPage: "Mod+S",
        toggleRawMode: "Mod+E",
      },
      onToggleSource: function () {
        calls.push("toggle-source");
      },
      onOpenHelp: function () {
        calls.push("open-help");
      },
      onOpenSettings: function () {
        calls.push("open-settings");
      },
      onOpenQuickSwitcher: function () {
        calls.push("open-quick-switcher");
      },
      onOpenSearch: function () {
        calls.push("open-search");
      },
      onFocusRail: function (tab: string) {
        calls.push("focus:" + tab);
      },
      onToggleRail: function () {
        calls.push("toggle-rail");
      },
      onOpenHomePage: function (pagePath: string) {
        calls.push("open-home:" + pagePath);
      },
      onSetHomePage: function (pagePath: string) {
        calls.push("set-home:" + pagePath);
      },
      onDeletePage: function (pagePath: string) {
        calls.push("delete:" + pagePath);
      },
      onClearHomePage: function () {
        calls.push("clear-home");
      },
      ...overrides,
    },
  };
}

describe("command helpers", function () {
  it("normalizes draft paths and derives page titles", function () {
    expect(normalizePageDraftPath(" /notes\\\\alpha.md ")).toBe("notes/alpha");
    expect(pageTitleFromPath("notes/alpha")).toBe("alpha");
  });

  it("only shows command results in the command palette", function () {
    const { options } = paletteOptions({ inputValue: "notes/new-page" });
    const sections = buildCommandPaletteSections(options);

    expect(sections).toHaveLength(1);
    expect(sections[0].title).toBe("Commands");
    expect(sections[0].items).toEqual([]);
  });

  it("wires command actions through palette item callbacks", function () {
    const { options, calls } = paletteOptions({ inputValue: "" });
    const sections = buildCommandPaletteSections(options);

    const commands = sections[0].items;
    const setHome = commands.find(function (item) {
      return item.title === "Set Home Page";
    });
    const openHome = commands.find(function (item) {
      return item.title === "Open Home Page";
    });
    const help = commands.find(function (item) {
      return item.title === "Open Help";
    });
    const settings = commands.find(function (item) {
      return item.title === "Open Settings";
    });
    const quickSwitcher = commands.find(function (item) {
      return item.title === "Open Quick Switcher";
    });

    expect(setHome).toBeTruthy();
    expect(openHome).toBeTruthy();
    expect(help).toBeTruthy();
    expect(settings).toBeTruthy();
    expect(quickSwitcher).toBeTruthy();

    setHome?.onSelect();
    openHome?.onSelect();
    help?.onSelect();
    settings?.onSelect();
    quickSwitcher?.onSelect();

    expect(calls).toContain("set-home:notes/alpha");
    expect(calls).toContain("open-home:notes/home");
    expect(calls).toContain("open-help");
    expect(calls).toContain("open-settings");
    expect(calls).toContain("open-quick-switcher");
  });

  it("suppresses set-home action when the selected page is already home", function () {
    const { options, calls } = paletteOptions({
      selectedPage: "notes/home",
      currentHomePage: "notes/home",
    });
    const sections = buildCommandPaletteSections(options);
    const setHome = sections[0].items.find(function (item) {
      return item.title === "Home Page Already Set";
    });

    expect(setHome?.hint).toBe("Current");
    setHome?.onSelect();
    expect(calls).not.toContain("set-home:notes/home");
  });
});
