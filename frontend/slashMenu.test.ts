import { describe, expect, it } from "vitest";

import { documentCommandsForText, slashCommandsForText, wikilinkCommandsForContext } from "./slashMenu";
import type { DocumentRecord, PageSummary } from "./types";

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

function document(id: string, name: string): DocumentRecord {
  return {
    id,
    path: "docs/" + name,
    name,
    contentType: "application/pdf",
    size: 1024,
    createdAt: "2026-04-24T00:00:00Z",
    downloadURL: "/api/documents/download?path=" + encodeURIComponent("docs/" + name),
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
    expect(commands.some(function (command) {
      return command.id === "table";
    })).toBe(true);
  });

  it("filters commands with fuzzy matching", function () {
    const commands = slashCommandsForText("/hd");

    expect(commands.map(function (command) {
      return command.id;
    })).toEqual(["h1", "h2", "h3", "due"]);
  });

  it("keeps slash commands editor-scoped rather than page-scoped", function () {
    const commands = slashCommandsForText("/notes");

    expect(commands).toEqual([]);
  });

  it("inserts due and remind fields with current canonical values", function () {
    const due = slashCommandsForText("/due").find(function (command) {
      return command.id === "due";
    });
    const remind = slashCommandsForText("/remind").find(function (command) {
      return command.id === "remind";
    });

    expect(due).toBeTruthy();
    expect(remind).toBeTruthy();
    expect(due?.apply("- [ ] follow up /due")).toMatch(/^- \[ \] follow up \[due: \d{4}-\d{2}-\d{2}\]$/);
    expect(remind?.apply("- [ ] follow up /remind")).toMatch(/^- \[ \] follow up \[remind: \d{2}:\d{2}\]$/);
  });

  it("inserts a markdown table template", function () {
    const table = slashCommandsForText("/table").find(function (command) {
      return command.id === "table";
    });

    expect(table).toBeTruthy();
    expect(table?.apply("/table")).toBe("| Column | Value |\n| --- | --- |\n|  |  |\n");
  });

  it("offers page links when typing a wikilink", function () {
    const commands = wikilinkCommandsForContext("See [[alp", 9, [
      page("notes/alpha", "Alpha"),
      page("notes/beta", "Beta"),
    ]);

    expect(commands.map(function (command) {
      return command.id;
    })).toEqual(["notes/alpha", "create:alp"]);
    expect(commands[0].apply("See [[alp")).toBe("See [[notes/alpha]]");
    expect(commands[0].hint).toBe("[[");
  });

  it("offers creating a note when a wikilink target does not exist", function () {
    const commands = wikilinkCommandsForContext("See [[new note", 15, [
      page("notes/alpha", "Alpha"),
    ]);

    expect(commands[0].id).toBe("create:new note");
    expect(commands[0].title).toBe("Create note");
    expect(commands[0].apply("See [[new note")).toBe("See [[new note]]");
  });

  it("offers embed links when typing an embedded wikilink", function () {
    const commands = wikilinkCommandsForContext("![[alph", 7, [
      page("notes/alpha", "Alpha"),
    ]);

    expect(commands[0].apply("![[alph")).toBe("![[notes/alpha]]");
    expect(commands[0].hint).toBe("![[");
  });

  it("offers document links from slash commands", function () {
    const commands = documentCommandsForText("/document meeting", [
      document("doc-1", "meeting-notes.pdf"),
      document("doc-2", "budget.xlsx"),
    ], "docs/current-note");

    expect(commands.map(function (command) {
      return command.id;
    })).toEqual(["doc-1"]);
    expect(commands[0].apply("/document meeting")).toBe("[meeting-notes.pdf](meeting-notes.pdf)");
  });
});
