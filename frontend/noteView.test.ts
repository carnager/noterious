import { describe, expect, it } from "vitest";

import { renderedQueryBlocksForEditor } from "./noteView";
import type { DerivedPage } from "./types";

describe("note view query rendering", function () {
  it("renders array-valued query cells as stacked lines", function () {
    const derived: DerivedPage = {
      toc: [],
      backlinks: [],
      linkCounts: {},
      taskCounts: {},
      queryBlocks: [{
        source: "```query\nfrom pages\n```",
        line: 1,
        key: "phones",
        rowCount: 1,
        stale: false,
        result: {
          columns: ["name", "phone_work"],
          rows: [{
            name: "Verwaltung",
            phone_work: ["+49 202 111111", "+49 202 222222"],
          }],
        },
      }],
    };

    const html = renderedQueryBlocksForEditor(derived)[0].html;
    expect(html).toContain('class="query-result-lines"');
    expect(html).toContain('class="query-result-line"');
    expect(html).toContain("+49 202 111111");
    expect(html).toContain("+49 202 222222");
  });

  it("renders multi-number phone strings as stacked lines", function () {
    const derived: DerivedPage = {
      toc: [],
      backlinks: [],
      linkCounts: {},
      taskCounts: {},
      queryBlocks: [{
        source: "```query\nfrom pages\n```",
        line: 1,
        key: "phones-string",
        rowCount: 1,
        stale: false,
        result: {
          columns: ["name", "phone_work"],
          rows: [{
            name: "Verwaltung",
            phone_work: "+49 202 111111, +49 202 222222",
          }],
        },
      }],
    };

    const html = renderedQueryBlocksForEditor(derived)[0].html;
    expect(html).toContain('class="query-result-lines"');
    expect(html).toContain("+49 202 111111");
    expect(html).toContain("+49 202 222222");
  });

  it("renders phone arrays that contain comma-separated entries as stacked lines", function () {
    const derived: DerivedPage = {
      toc: [],
      backlinks: [],
      linkCounts: {},
      taskCounts: {},
      queryBlocks: [{
        source: "```query\nfrom pages\n```",
        line: 1,
        key: "phones-array-string",
        rowCount: 1,
        stale: false,
        result: {
          columns: ["name", "phone_work"],
          rows: [{
            name: "Verwaltung",
            phone_work: ["+49 202 111111, +49 202 222222"],
          }],
        },
      }],
    };

    const html = renderedQueryBlocksForEditor(derived)[0].html;
    expect(html).toContain('class="query-result-lines"');
    expect(html).toContain("+49 202 111111");
    expect(html).toContain("+49 202 222222");
  });

  it("renders aliased query columns as their alias", function () {
    const derived: DerivedPage = {
      toc: [],
      backlinks: [],
      linkCounts: {},
      taskCounts: {},
      queryBlocks: [{
        source: "```query\nfrom tasks\n```",
        line: 1,
        key: "tasks-label",
        rowCount: 1,
        stale: false,
        result: {
          columns: ["task", "due"],
          rows: [{
            task: "Follow up",
            due: "2026-04-30",
            __taskRef: "task-1",
            __pagePath: "index",
            __pageLine: 12,
          }],
        },
      }],
    };

    const html = renderedQueryBlocksForEditor(derived)[0].html;
    expect(html).toContain("<th>task</th>");
    expect(html).not.toContain("<th>text</th>");
  });
});
