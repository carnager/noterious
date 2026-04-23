import { describe, expect, it } from "vitest";

import { buildGlobalSearchSections } from "./search";
import type { SearchPayload } from "./types";

describe("search helpers", function () {
  it("builds page, task, and query sections with callbacks", function () {
    const calls: string[] = [];
    const payload: SearchPayload = {
      counts: { total: 3, pages: 1, tasks: 1, queries: 1 },
      pages: [{ path: "notes/alpha", title: "Alpha", line: 7, match: "alpha" }],
      tasks: [{ ref: "task-1", page: "notes/alpha", line: 9, text: "Follow up" }],
      queries: [{ name: "recent", title: "Recent", folder: "saved" }],
    };

    const sections = buildGlobalSearchSections({
      payload,
      onClose: function () {
        calls.push("close");
      },
      onOpenPage: function (pagePath: string) {
        calls.push("page:" + pagePath);
      },
      onOpenPageAtLine: function (pagePath: string, lineNumber: number | string) {
        calls.push("line:" + pagePath + ":" + lineNumber);
      },
      onOpenPageAtTask: function (pagePath: string, taskRef: string, lineNumber: number | string) {
        calls.push("task:" + pagePath + ":" + taskRef + ":" + lineNumber);
      },
      onOpenSavedQuery: function (name: string) {
        calls.push("query:" + name);
      },
    });

    expect(sections.map(function (section) { return section.title; })).toEqual(["Pages", "Tasks", "Saved Queries"]);

    sections[0].items[0].onSelect();
    sections[1].items[0].onSelect();
    sections[2].items[0].onSelect();

    expect(calls).toEqual([
      "close",
      "line:notes/alpha:7",
      "close",
      "task:notes/alpha:task-1:9",
      "close",
      "query:recent",
    ]);
  });

  it("returns no sections when the payload is empty", function () {
    expect(buildGlobalSearchSections({
      payload: { counts: { total: 0 }, pages: [], tasks: [], queries: [] },
      onClose: function () {},
      onOpenPage: function () {},
      onOpenPageAtLine: function () {},
      onOpenPageAtTask: function () {},
      onOpenSavedQuery: function () {},
    })).toEqual([]);
  });
});
