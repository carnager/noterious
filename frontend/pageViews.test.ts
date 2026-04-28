import { describe, expect, it } from "vitest";

import { filterPagesByTag, filterTasks, summarizeTagsForPages, type TaskPanelFilters } from "./pageViews";
import type { PageSummary, TaskRecord } from "./types";

function makeFilters(overrides?: Partial<TaskPanelFilters>): TaskPanelFilters {
  return {
    currentPage: false,
    notDone: false,
    hasDue: false,
    hasReminder: false,
    ...overrides,
  };
}

function page(path: string, tags: string[]): PageSummary {
  return {
    path,
    title: path.split("/").slice(-1)[0] || path,
    tags,
    frontmatter: {},
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

describe("task panel filters", function () {
  const tasks: TaskRecord[] = [
    { ref: "1", page: "work/alpha", line: 1, text: "Open plain", state: "todo", done: false },
    { ref: "2", page: "work/alpha", line: 2, text: "Open due", state: "todo", done: false, due: "2026-05-01" },
    { ref: "3", page: "work/beta", line: 3, text: "Done reminder", state: "done", done: true, remind: "2026-05-01 09:00" },
  ];

  it("returns all tasks when no filter is active", function () {
    expect(filterTasks(tasks, makeFilters())).toHaveLength(3);
  });

  it("combines current-page and other toggles", function () {
    expect(filterTasks(tasks, makeFilters({
      currentPage: true,
      notDone: true,
      hasDue: true,
    }), "work/alpha").map(function (task) {
      return task.ref;
    })).toEqual(["2"]);
  });
});

describe("tag panel helpers", function () {
  const pages = [
    page("work/alpha", ["ops", "Work"]),
    page("work/beta", ["ops", "ship"]),
    page("work/gamma", ["Ship", "ops", "ship"]),
  ];

  it("aggregates tags case-insensitively and sorts by frequency", function () {
    expect(summarizeTagsForPages(pages)).toEqual([
      { tag: "ops", count: 3 },
      { tag: "ship", count: 2 },
      { tag: "Work", count: 1 },
    ]);
  });

  it("filters pages by exact tag match ignoring case", function () {
    expect(filterPagesByTag(pages, "SHIP").map(function (entry) {
      return entry.path;
    })).toEqual(["work/beta", "work/gamma"]);
  });
});
