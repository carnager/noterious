import { describe, expect, it } from "vitest";

import { filterTasks, type TaskPanelFilters } from "./pageViews";
import type { TaskRecord } from "./types";

function makeFilters(overrides?: Partial<TaskPanelFilters>): TaskPanelFilters {
  return {
    currentPage: false,
    notDone: false,
    hasDue: false,
    hasReminder: false,
    ...overrides,
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
