import { describe, expect, it } from "vitest";

import {
  collectPropertyValueSuggestions,
  filterPropertyValueSuggestions,
  movePropertySuggestionIndex,
} from "./propertySuggestions";
import type { FrontmatterMap, PageSummary } from "./types";

function page(path: string, frontmatter?: FrontmatterMap): PageSummary {
  return {
    path,
    title: path.split("/").pop() || path,
    tags: [],
    frontmatter,
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

describe("collectPropertyValueSuggestions", function () {
  it("collects same-key text values within the current scope", function () {
    expect(collectPropertyValueSuggestions([
      page("Private/contacts/alina", { location: "Berlin" }),
      page("Private/contacts/bob", { location: "Berlin" }),
      page("Private/contacts/cara", { location: "Hamburg" }),
      page("Work/contacts/dan", { location: "Munich" }),
    ], "Private", "Private/current", "location", "text")).toEqual(["Berlin", "Hamburg"]);
  });

  it("flattens list-like values for list and tag properties", function () {
    expect(collectPropertyValueSuggestions([
      page("Private/a", { aliases: ["Alpha", "Beta"] }),
      page("Private/b", { aliases: ["Beta", "Gamma"] }),
      page("Private/c", { aliases: ["", "Gamma"] }),
    ], "Private", "", "aliases", "list")).toEqual(["Beta", "Gamma", "Alpha"]);
  });

  it("ignores the currently selected page and unsupported kinds", function () {
    expect(collectPropertyValueSuggestions([
      page("Private/current", { location: "Berlin", active: true }),
      page("Private/other", { location: "Hamburg", active: false }),
    ], "Private", "Private/current", "location", "text")).toEqual(["Hamburg"]);

    expect(collectPropertyValueSuggestions([
      page("Private/other", { active: true }),
    ], "Private", "", "active", "bool")).toEqual([]);
  });

  it("filters and ranks suggestions for autocomplete", function () {
    expect(filterPropertyValueSuggestions([
      "Berlin",
      "Bern",
      "Hamburg",
      "berlin",
    ], "ber", [])).toEqual(["Bern", "Berlin"]);

    expect(filterPropertyValueSuggestions([
      "Berlin",
    ], "Berlin", [])).toEqual([]);

    expect(filterPropertyValueSuggestions([
      "Berlin",
      "Hamburg",
    ], "", ["Berlin"])).toEqual(["Hamburg"]);
  });

  it("moves the autocomplete selection like a menu", function () {
    expect(movePropertySuggestionIndex(-1, 1, 3)).toBe(0);
    expect(movePropertySuggestionIndex(-1, -1, 3)).toBe(2);
    expect(movePropertySuggestionIndex(1, 1, 3)).toBe(2);
    expect(movePropertySuggestionIndex(1, -1, 3)).toBe(0);
    expect(movePropertySuggestionIndex(0, -1, 3)).toBe(0);
    expect(movePropertySuggestionIndex(0, 1, 0)).toBe(-1);
  });
});
