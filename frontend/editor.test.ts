import { describe, expect, it } from "vitest";

import {
  renderedTaskRawColumn,
  renderedTaskVisibleColumn,
  taskLineHasInlineDate,
  taskPrefixLength,
} from "./taskNavigation";

describe("rendered task navigation helpers", function () {
  it("detects task prefixes and inline due/remind fields", function () {
    expect(taskPrefixLength("- [ ] Plain task")).toBe(6);
    expect(taskPrefixLength("Paragraph")).toBe(0);
    expect(taskLineHasInlineDate("- [ ] Follow up [due: 2026-05-01]")).toBe(true);
    expect(taskLineHasInlineDate("- [ ] Follow up [remind: 09:00]")).toBe(true);
    expect(taskLineHasInlineDate("- [ ] Follow up")).toBe(false);
  });

  it("maps raw columns through hidden task prefixes", function () {
    const plainTask = "- [ ] Follow up";
    const datedTask = "- [ ] Follow up [due: 2026-05-01] [remind: 09:00]";

    expect(renderedTaskVisibleColumn(plainTask, 6)).toBe(0);
    expect(renderedTaskVisibleColumn(plainTask, 11)).toBe(5);
    expect(renderedTaskRawColumn(datedTask, 5)).toBe(11);
    expect(renderedTaskRawColumn("Paragraph", 5)).toBe(5);
  });
});
