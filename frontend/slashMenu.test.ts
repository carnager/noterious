import { describe, expect, it } from "vitest";

import { slashCommandsForText, wikilinkCommandsForContext } from "./slashMenu";
import type { PageSummary } from "./types";

function page(path: string, title?: string): PageSummary {
  return {
    path,
    title: title || path,
    tags: [],
    outgoingLinkCount: 0,
    backlinkCount: 0,
    taskCount: 0,
    openTaskCount: 0,
    doneTaskCount: 0,
    queryBlockCount: 0,
    createdAt: "",
    updatedAt: "2026-04-24T00:00:00Z",
  };
}

describe("slash menu", function () {
  it("shows editor commands for a bare slash trigger", function () {
    const commands = slashCommandsForText("/");

    expect(commands.length).toBeGreaterThan(5);
    expect(commands.some(function (command) {
      return command.id === "task";
    })).toBe(true);
    expect(commands.some(function (command) {
      return command.id === "callout";
    })).toBe(true);
  });

  it("filters commands with fuzzy matching", function () {
    const commands = slashCommandsForText("/hd");

    expect(commands.map(function (command) {
      return command.id;
    })).toEqual(["h1", "h2", "h3"]);
  });

  it("keeps slash commands editor-scoped rather than page-scoped", function () {
    const commands = slashCommandsForText("/notes");

    expect(commands).toEqual([]);
  });

  it("offers page links when typing a wikilink", function () {
    const commands = wikilinkCommandsForContext("See [[alp", 9, [
      page("notes/alpha", "Alpha"),
      page("notes/beta", "Beta"),
    ]);

    expect(commands.map(function (command) {
      return command.id;
    })).toEqual(["notes/alpha"]);
    expect(commands[0].apply("See [[alp")).toBe("See [[notes/alpha]]");
    expect(commands[0].hint).toBe("[[");
  });

  it("offers embed links when typing an embedded wikilink", function () {
    const commands = wikilinkCommandsForContext("![[alph", 7, [
      page("notes/alpha", "Alpha"),
    ]);

    expect(commands[0].apply("![[alph")).toBe("![[notes/alpha]]");
    expect(commands[0].hint).toBe("![[");
  });
});
