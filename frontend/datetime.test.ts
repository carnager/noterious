import { describe, expect, it } from "vitest";

import {
  editableDatePlaceholder,
  editableDateTimePlaceholder,
  editableTimePlaceholder,
  formatDateTimeValue,
  formatDateValue,
  formatEditableDateTimeValue,
  formatEditableDateValue,
  formatEditableTimeValue,
  formatMaybeDateValue,
  formatTimeValue,
  parseEditableDateTimeValue,
  parseEditableDateValue,
  parseEditableTimeValue,
  setDateTimeDisplayFormat,
} from "./datetime";

describe("datetime formatting", function () {
  it("formats ISO dates and datetimes explicitly", function () {
    setDateTimeDisplayFormat("iso");
    expect(formatDateValue("2026-04-24")).toBe("2026-04-24");
    expect(formatDateTimeValue("2026-04-24 14:35")).toBe("2026-04-24 14:35");
    expect(formatTimeValue(new Date(2026, 3, 24, 9, 8, 7))).toBe("09:08:07");
  });

  it("formats DE dates and datetimes explicitly", function () {
    setDateTimeDisplayFormat("de");
    expect(formatDateValue("2026-04-24")).toBe("24.04.2026");
    expect(formatDateTimeValue("2026-04-24 14:35")).toBe("24.04.2026, 14:35");
  });

  it("formats and parses editable values independently of browser widgets", function () {
    setDateTimeDisplayFormat("de");
    expect(formatEditableDateValue("2026-04-24")).toBe("24.04.2026");
    expect(formatEditableDateTimeValue("2026-04-24 14:35")).toBe("24.04.2026 14:35");
    expect(formatEditableTimeValue("14:35")).toBe("14:35");
    expect(parseEditableDateValue("24.04.2026")).toBe("2026-04-24");
    expect(parseEditableDateTimeValue("24.04.2026 14:35")).toBe("2026-04-24 14:35");
    expect(parseEditableTimeValue("14:35")).toBe("14:35");
    expect(editableDatePlaceholder()).toBe("30.04.2026");
    expect(editableDateTimePlaceholder()).toBe("30.04.2026 09:00");
    expect(editableTimePlaceholder()).toBe("09:00");
  });

  it("only reformats known date-like columns", function () {
    setDateTimeDisplayFormat("iso");
    expect(formatMaybeDateValue("due", "2026-04-24")).toBe("2026-04-24");
    expect(formatMaybeDateValue("remind", "09:15")).toBe("09:15");
    expect(formatMaybeDateValue("title", "2026-04-24")).toBe("2026-04-24");
  });

  it("keeps time-only reminder values stable", function () {
    setDateTimeDisplayFormat("de");
    expect(formatTimeValue("09:15")).toBe("09:15");
  });
});
