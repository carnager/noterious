import { describe, expect, it, vi } from "vitest";

import { buildCommandPaletteSections, normalizePageDraftPath, pageTitleFromPath } from "./commands";
import type { PageSummary } from "./types";

function samplePage(path: string, title?: string): PageSummary {
  return {
    path,
    title: title || path,
    tags: [],
    outgoingLinkCount: 0,
    backlinkCount: 0,
    taskCount: 0,
    openTaskCount: 0,
    doneTaskCount: 0,
    queryBlockCount: 0,
    createdAt: "",
    updatedAt: "",
  };
}

function paletteOptions(overrides: Partial<Parameters<typeof buildCommandPaletteSections>[0]> = {}) {
  const calls: string[] = [];
  return {
    calls,
    options: {
      container: {} as HTMLElement,
      inputValue: "",
      pages: [samplePage("notes/alpha", "Alpha"), samplePage("projects/beta", "Project Beta")],
      selectedPage: "notes/alpha",
      sourceOpen: false,
      railOpen: false,
      currentHomePage: "notes/home",
      onToggleSource: function () {
        calls.push("toggle-source");
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
      onMovePage: function (pagePath: string, targetPage: string) {
        calls.push("move:" + pagePath + "->" + targetPage);
      },
      onCreatePage: function (pagePath: string) {
        calls.push("create:" + pagePath);
      },
      onOpenPage: function (pagePath: string) {
        calls.push("open-page:" + pagePath);
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

  it("builds create and move entries for a new path draft", function () {
    const { options } = paletteOptions({ inputValue: "notes/new-page" });
    const sections = buildCommandPaletteSections(options);

    expect(sections[0].items[0].title).toBe("Move Page");
    expect(sections[1].items[0].title).toBe("Create Page");
    expect(sections[0].items[0].meta).toContain("notes/new-page");
    expect(sections[1].items[0].meta).toBe("notes/new-page");
    expect(sections[3].items).toEqual([]);
  });

  it("wires command actions through palette item callbacks", function () {
    const { options, calls } = paletteOptions({ inputValue: "" });
    const sections = buildCommandPaletteSections(options);

    const commands = sections[2].items;
    const setHome = commands.find(function (item) {
      return item.title === "Set Home Page";
    });
    const openHome = commands.find(function (item) {
      return item.title === "Open Home Page";
    });

    expect(setHome).toBeTruthy();
    expect(openHome).toBeTruthy();

    setHome?.onSelect();
    openHome?.onSelect();

    expect(calls).toContain("set-home:notes/alpha");
    expect(calls).toContain("open-home:notes/home");
  });

  it("suppresses set-home action when the selected page is already home", function () {
    const { options, calls } = paletteOptions({
      selectedPage: "notes/home",
      currentHomePage: "notes/home",
    });
    const sections = buildCommandPaletteSections(options);
    const setHome = sections[2].items.find(function (item) {
      return item.title === "Home Page Already Set";
    });

    expect(setHome?.hint).toBe("Current");
    setHome?.onSelect();
    expect(calls).not.toContain("set-home:notes/home");
  });
});
