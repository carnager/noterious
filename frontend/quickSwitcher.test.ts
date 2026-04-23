import { describe, expect, it } from "vitest";

import { buildQuickSwitcherSections } from "./quickSwitcher";
import type { PageSummary } from "./types";

function page(path: string, updatedAt: string, title?: string): PageSummary {
  return {
    path,
    title: title || path,
    tags: [],
    frontmatter: {},
    outgoingLinkCount: 0,
    backlinkCount: 0,
    taskCount: 0,
    openTaskCount: 0,
    doneTaskCount: 0,
    queryBlockCount: 0,
    createdAt: "",
    updatedAt,
  };
}

describe("quick switcher", function () {
  it("shows recent notes when the query is empty", function () {
    const sections = buildQuickSwitcherSections({
      inputValue: "",
      pages: [
        page("notes/alpha", "2026-04-20T10:00:00Z"),
        page("notes/beta", "2026-04-23T10:00:00Z"),
      ],
      selectedPage: "",
      onClose: function () {},
      onOpenPage: function () {},
      onCreatePage: function () {},
    });

    expect(sections[0].items).toEqual([]);
    expect(sections[1].title).toBe("Recent Notes");
    expect(sections[1].items[0].title).toBe("beta");
    expect(sections[1].items[1].title).toBe("alpha");
  });

  it("adds a create note action when there is no exact page match", function () {
    const calls: string[] = [];
    const sections = buildQuickSwitcherSections({
      inputValue: "notes/new-note",
      pages: [page("notes/alpha", "2026-04-23T10:00:00Z")],
      selectedPage: "",
      onClose: function () {
        calls.push("close");
      },
      onOpenPage: function (pagePath: string) {
        calls.push("open:" + pagePath);
      },
      onCreatePage: function (pagePath: string) {
        calls.push("create:" + pagePath);
      },
    });

    expect(sections[0].items[0].title).toBe("Create note");
    sections[0].items[0].onSelect();
    expect(calls).toEqual(["close", "create:notes/new-note"]);
  });

  it("prioritizes exact matches over loose path matches", function () {
    const sections = buildQuickSwitcherSections({
      inputValue: "alpha",
      pages: [
        page("notes/project-alpha", "2026-04-23T10:00:00Z"),
        page("alpha", "2026-04-21T10:00:00Z"),
      ],
      selectedPage: "",
      onClose: function () {},
      onOpenPage: function () {},
      onCreatePage: function () {},
    });

    expect(sections[1].items[0].title).toBe("alpha");
  });
});
