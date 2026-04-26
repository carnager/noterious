import { describe, expect, it } from "vitest";

import { setDateTimeDisplayFormat } from "./datetime";
import { currentPageView, renderedQueryBlocksForEditor } from "./noteView";
import type { DerivedPage, PageRecord } from "./types";

describe("note view query rendering", function () {
  it("keeps the page title from the filename instead of deriving it from headings", function () {
    const page: PageRecord = {
      page: "notes/alpha",
      path: "notes/alpha",
      title: "alpha",
      rawMarkdown: "# Different Heading\n",
      createdAt: "",
      updatedAt: "",
      frontmatter: {},
      links: [],
      tasks: [],
    };

    expect(currentPageView(page, "# Different Heading\n")?.title).toBe("alpha");
  });

  it("formats date-like query columns using the configured preference", function () {
    setDateTimeDisplayFormat("de");
    const derived: DerivedPage = {
      toc: [],
      backlinks: [],
      linkCounts: {},
      taskCounts: {},
      queryBlocks: [{
        source: "```query\nfrom tasks\n```",
        line: 1,
        key: "dates",
        rowCount: 1,
        stale: false,
        result: {
          columns: ["task", "due", "remind"],
          rows: [{
            task: "Follow up",
            due: "2026-04-30",
            remind: "2026-04-30 09:15",
            __taskRef: "task-1",
            __pagePath: "index",
          }],
        },
      }],
    };

    const html = renderedQueryBlocksForEditor(derived)[0].html;
    expect(html).toContain("30.04.2026");
    expect(html).toContain("30.04.2026, 09:15");
  });

  it("renders array-valued query cells as stacked lines", function () {
    setDateTimeDisplayFormat("browser");
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
    setDateTimeDisplayFormat("browser");
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
    setDateTimeDisplayFormat("browser");
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
    setDateTimeDisplayFormat("browser");
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
    expect(html).toContain('data-task-ref="task-1"');
    expect(html).toContain('data-page-link="index"');
  });

  it("renders inline markdown inside query result cells", function () {
    setDateTimeDisplayFormat("browser");
    const derived: DerivedPage = {
      toc: [],
      backlinks: [],
      linkCounts: {},
      taskCounts: {},
      queryBlocks: [{
        source: "```query\nfrom tasks\n```",
        line: 1,
        key: "markup",
        rowCount: 1,
        stale: false,
        result: {
          columns: ["task", "notes"],
          rows: [{
            task: "**Bold** and *italic*",
            notes: "See **this**",
            __taskRef: "task-1",
            __pagePath: "index",
          }],
        },
      }],
    };

    const html = renderedQueryBlocksForEditor(derived)[0].html;
    expect(html).toContain("<strong>Bold</strong>");
    expect(html).toContain("<em>italic</em>");
    expect(html).toContain("<strong>this</strong>");
  });
});
