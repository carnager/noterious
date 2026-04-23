import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./http", function () {
  return {
    fetchJSON: vi.fn(),
  };
});

import {
  buildTaskSavePayload,
  loadPageDetailData,
  loadSavedQueryDetailData,
  savePageMarkdown,
  saveTask,
  toggleTaskDone,
} from "./details";
import { rawOffsetForTaskLine } from "./markdown";
import { fetchJSON } from "./http";
import type { DerivedPage, PageRecord, SavedQueryRecord, TaskRecord } from "./types";

const mockedFetchJSON = vi.mocked(fetchJSON);

describe("detail helpers", function () {
  beforeEach(function () {
    mockedFetchJSON.mockReset();
  });

  it("builds normalized task save payloads", function () {
    expect(buildTaskSavePayload(
      "  Follow up  ",
      "done",
      " 2026-04-23 ",
      "2026-04-23T10:30",
      " alice, bob ,, ",
      function (value: string) {
        return value.replace("T", " ");
      }
    )).toEqual({
      text: "Follow up",
      state: "done",
      due: "2026-04-23",
      remind: "2026-04-23 10:30",
      who: ["alice", "bob"],
    });
  });

  it("loads page detail data and computes focus offsets for task refs", async function () {
    const page: PageRecord = {
      page: "notes/alpha",
      path: "notes/alpha",
      title: "Alpha",
      rawMarkdown: "# Alpha\n\n- [ ] Follow up\n",
      frontmatter: {},
      links: [],
      tasks: [{
        ref: "task-1",
        page: "notes/alpha",
        line: 3,
        text: "Follow up",
        state: "todo",
        done: false,
      }],
    };
    const derived: DerivedPage = {
      toc: [],
      backlinks: [],
      queryBlocks: [],
      linkCounts: {},
      taskCounts: {},
    };

    mockedFetchJSON
      .mockResolvedValueOnce(page)
      .mockResolvedValueOnce(derived);

    const loaded = await loadPageDetailData("notes/alpha", function (pagePath: string) {
      return pagePath;
    }, "task-1", null);

    expect(mockedFetchJSON).toHaveBeenNthCalledWith(1, "/api/pages/notes/alpha");
    expect(mockedFetchJSON).toHaveBeenNthCalledWith(2, "/api/pages/notes/alpha/derived");
    expect(loaded.page).toBe(page);
    expect(loaded.derived).toBe(derived);
    expect(loaded.focusOffset).toBe(rawOffsetForTaskLine(page.rawMarkdown, 3));
  });

  it("loads saved query detail data including workbench payload", async function () {
    const savedQuery: SavedQueryRecord = {
      name: "recent",
      title: "Recent",
      tags: [],
      query: "from pages",
    };

    mockedFetchJSON
      .mockResolvedValueOnce(savedQuery)
      .mockResolvedValueOnce({ ...savedQuery, workbench: { preview: [] } });

    const detail = await loadSavedQueryDetailData("recent");

    expect(detail).toEqual({
      savedQuery,
      workbench: { preview: [] },
    });
  });

  it("sends task and page save requests with the expected payloads", async function () {
    const task: TaskRecord = {
      ref: "task-1",
      page: "notes/alpha",
      line: 3,
      text: "Follow up",
      state: "todo",
      done: false,
      who: ["alice"],
    };
    const page: PageRecord = {
      page: "notes/alpha",
      title: "Alpha",
      rawMarkdown: "# Alpha",
      frontmatter: {},
      links: [],
      tasks: [],
    };

    mockedFetchJSON.mockResolvedValue(page);

    await toggleTaskDone(task);
    await saveTask("task-1", {
      text: "Done",
      state: "done",
      due: "",
      remind: "",
      who: [],
    });
    await savePageMarkdown("notes/alpha", "# Alpha", function (pagePath: string) {
      return "encoded/" + pagePath;
    });

    expect(mockedFetchJSON).toHaveBeenNthCalledWith(1, "/api/tasks/task-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        state: "done",
        due: "",
        remind: "",
        who: ["alice"],
      }),
    });
    expect(mockedFetchJSON).toHaveBeenNthCalledWith(2, "/api/tasks/task-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: "Done",
        state: "done",
        due: "",
        remind: "",
        who: [],
      }),
    });
    expect(mockedFetchJSON).toHaveBeenNthCalledWith(3, "/api/pages/encoded/notes/alpha", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rawMarkdown: "# Alpha" }),
    });
  });
});
