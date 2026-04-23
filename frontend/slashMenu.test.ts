import { describe, expect, it } from "vitest";

import { slashCommandsForText } from "./slashMenu";

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
});
