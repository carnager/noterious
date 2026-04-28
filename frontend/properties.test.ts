import { describe, expect, it } from "vitest";

import { setDateTimeDisplayFormat } from "./datetime";
import {
  applyPropertyDraftKind,
  coercePropertyValue,
  inferFrontmatterKind,
  makePropertyDraft,
  propertyScalarInputType,
  propertyScalarInputValue,
} from "./properties";

describe("property helpers", function () {
  it("infers tag properties from list-shaped tags frontmatter", function () {
    expect(inferFrontmatterKind(["work", "ops"], "tags")).toBe("tags");
    expect(inferFrontmatterKind("work", "tags")).toBe("text");
  });

  it("keeps hinted kinds for empty templated values", function () {
    expect(inferFrontmatterKind("", "geburtstag", "date")).toBe("date");
    expect(inferFrontmatterKind("", "tags", "tags")).toBe("tags");
  });

  it("converts draft values when changing property kind", function () {
    const draft = makePropertyDraft("aliases", "Alpha", "__new__");

    expect(applyPropertyDraftKind(draft, "list")).toEqual({
      originalKey: "__new__",
      key: "aliases",
      kind: "list",
      text: "",
      list: ["Alpha"],
    });
    expect(applyPropertyDraftKind(draft, "tags")).toEqual({
      originalKey: "__new__",
      key: "aliases",
      kind: "tags",
      text: "",
      list: ["Alpha"],
    });
    expect(applyPropertyDraftKind(draft, "bool").text).toBe("false");
  });

  it("treats reminder-style keys as notification properties", function () {
    expect(inferFrontmatterKind("2026-04-30 09:15", "notification")).toBe("notification");
    expect(inferFrontmatterKind("", "birthday_notification")).toBe("notification");
    expect(coercePropertyValue("notification", "2026-04-30 09:15", "notification")).toBe("2026-04-30 09:15");
  });

  it("normalizes tags when saving tag values", function () {
    expect(coercePropertyValue("tags", ["#work", " ops ", "", "#ship"], "tags")).toEqual(["work", "ops", "ship"]);
  });

  it("honors the configured date display format for frontmatter date inputs", function () {
    setDateTimeDisplayFormat("de");
    expect(propertyScalarInputType("date")).toBe("date");
    expect(propertyScalarInputValue("date", "2026-04-30")).toBe("2026-04-30");
    expect(propertyScalarInputType("datetime")).toBe("datetime-local");
    expect(propertyScalarInputValue("datetime", "2026-04-30 09:15")).toBe("2026-04-30T09:15");
    expect(propertyScalarInputType("notification")).toBe("datetime-local");
    expect(propertyScalarInputValue("notification", "2026-04-30 09:15")).toBe("2026-04-30T09:15");

    setDateTimeDisplayFormat("browser");
    expect(propertyScalarInputType("date")).toBe("date");
    expect(propertyScalarInputValue("date", "2026-04-30")).toBe("2026-04-30");
    expect(propertyScalarInputType("datetime")).toBe("datetime-local");
    expect(propertyScalarInputValue("datetime", "2026-04-30 09:15")).toBe("2026-04-30T09:15");
    expect(propertyScalarInputType("notification")).toBe("datetime-local");
    expect(propertyScalarInputValue("notification", "2026-04-30 09:15")).toBe("2026-04-30T09:15");
  });
});
