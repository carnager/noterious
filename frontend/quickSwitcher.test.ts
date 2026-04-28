import { describe, expect, it } from "vitest";

import { buildQuickSwitcherSections } from "./quickSwitcher";
import type { NoteTemplate, PageSummary } from "./types";

function page(path: string, updatedAt: string, title?: string): PageSummary {
  return {
    path,
    title: title || path,
    tags: [],
    frontmatter: {},
    outgoingLinkCount: 0,
    backlinkCount: 0,
    taskCount: 0,
    openTaskCount: 0,
    doneTaskCount: 0,
    queryBlockCount: 0,
    createdAt: "",
    updatedAt,
  };
}

function template(name: string, folder: string): NoteTemplate {
  return {
    id: name.toLowerCase(),
    name,
    folder,
    fields: [
      { key: "vorname", kind: "text", defaultValue: "{{title}}" },
      { key: "geburtstag", kind: "date", defaultValue: "" },
      { key: "tags", kind: "tags", defaultValue: ["contact"] },
    ],
  };
}

describe("quick switcher", function () {
  it("shows recent notes when the query is empty", function () {
    const sections = buildQuickSwitcherSections({
      inputValue: "",
      pages: [
        page("notes/alpha", "2026-04-20T10:00:00Z"),
        page("notes/beta", "2026-04-23T10:00:00Z"),
      ],
      templates: [],
      selectedPage: "",
      onClose: function () {},
      onOpenPage: function () {},
      onCreatePage: function () {},
      onCreateTemplatePage: function () {},
    });

    expect(sections[0].items).toEqual([]);
    expect(sections[1].title).toBe("Recent Notes");
    expect(sections[1].items[0].title).toBe("beta");
    expect(sections[1].items[1].title).toBe("alpha");
  });

  it("adds a create note action when there is no exact page match", function () {
    const calls: string[] = [];
    const sections = buildQuickSwitcherSections({
      inputValue: "notes/new-note",
      pages: [page("notes/alpha", "2026-04-23T10:00:00Z")],
      templates: [],
      selectedPage: "",
      onClose: function () {
        calls.push("close");
      },
      onOpenPage: function (pagePath: string) {
        calls.push("open:" + pagePath);
      },
      onCreatePage: function (pagePath: string) {
        calls.push("create:" + pagePath);
      },
      onCreateTemplatePage: function () {},
    });

    expect(sections[0].items[0].title).toBe("Create note");
    sections[0].items[0].onSelect();
    expect(calls).toEqual(["close", "create:notes/new-note"]);
  });

  it("prioritizes exact matches over loose path matches", function () {
    const sections = buildQuickSwitcherSections({
      inputValue: "alpha",
      pages: [
        page("notes/project-alpha", "2026-04-23T10:00:00Z"),
        page("alpha", "2026-04-21T10:00:00Z"),
      ],
      templates: [],
      selectedPage: "",
      onClose: function () {},
      onOpenPage: function () {},
      onCreatePage: function () {},
      onCreateTemplatePage: function () {},
    });

    expect(sections[1].items[0].title).toBe("alpha");
  });

  it("offers template-backed create actions with their target path", function () {
    const calls: string[] = [];
    const contactTemplate = template("Contact", "contacts");
    const sections = buildQuickSwitcherSections({
      inputValue: "Alina",
      pages: [page("notes/alpha", "2026-04-23T10:00:00Z")],
      templates: [contactTemplate],
      selectedPage: "",
      onClose: function () {
        calls.push("close");
      },
      onOpenPage: function () {},
      onCreatePage: function () {},
      onCreateTemplatePage: function (selectedTemplate: NoteTemplate, pagePath: string) {
        calls.push("template:" + selectedTemplate.id + ":" + pagePath);
      },
    });

    expect(sections[0].items).toHaveLength(2);
    expect(sections[0].items[1].title).toBe("Create Contact");
    expect(sections[0].items[1].meta).toBe("contacts/Alina");
    expect(sections[0].items[1].snippet).toBe("vorname · geburtstag · tags");

    sections[0].items[1].onSelect();
    expect(calls).toEqual(["close", "template:contact:contacts/Alina"]);
  });
});
