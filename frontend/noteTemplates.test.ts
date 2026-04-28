import { describe, expect, it } from "vitest";

import { parseFrontmatter } from "./markdown";
import {
  allNoteTemplatesFromPages,
  buildMarkdownFromTemplate,
  buildPagePathFromTemplate,
  createBlankNoteTemplate,
  noteTemplatesFromPages,
  remainingTemplateFields,
  templateDateKey,
  templateFieldKindHints,
  templateFieldsNeedingInput,
  templateFolderKey,
  templateLabelKey,
  templateMarkerKey,
  templateNotificationKey,
  templatePropertyKindHints,
  templateTagsKey,
} from "./noteTemplates";
import type { NoteTemplate, PageSummary } from "./types";

function page(path: string, frontmatter: Record<string, string | boolean | string[]>, title?: string): PageSummary {
  return {
    path,
    title: title || path,
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

function template(overrides?: Partial<NoteTemplate>): NoteTemplate {
  return {
    id: "_templates/contact",
    name: "Contact",
    folder: "contacts",
    fields: [
      { key: "vorname", kind: "text", defaultValue: "{{title}}" },
      { key: "nachname", kind: "text", defaultValue: "" },
      { key: "geburtstag", kind: "date", defaultValue: "" },
      { key: "birthday_notification", kind: "notification", defaultValue: "" },
      { key: "phone_private", kind: "text", defaultValue: "" },
      { key: "email", kind: "text", defaultValue: "" },
      { key: "tags", kind: "tags", defaultValue: ["contact"] },
    ],
    ...overrides,
  };
}

describe("note templates", function () {
  it("discovers root and scoped templates from _templates pages", function () {
    const pages = [
      page("_templates/contact", {
        [templateLabelKey]: "Contact",
        [templateFolderKey]: "contacts",
        [templateDateKey]: ["geburtstag"],
        [templateNotificationKey]: ["birthday_notification"],
        vorname: "{{title}}",
        geburtstag: "",
        birthday_notification: "",
      }, "Contact"),
      page("Work/_templates/meeting", {
        [templateFolderKey]: "meetings",
        agenda: "",
      }, "Meeting"),
      page("notes/alpha", {}, "Alpha"),
    ];

    expect(noteTemplatesFromPages(pages)).toEqual([
      {
        id: "_templates/contact",
        name: "Contact",
        folder: "contacts",
        fields: [
          { key: "vorname", kind: "text", defaultValue: "{{title}}" },
          { key: "geburtstag", kind: "date", defaultValue: "" },
          { key: "birthday_notification", kind: "notification", defaultValue: "" },
        ],
      },
    ]);

    expect(noteTemplatesFromPages(pages, "Work")).toEqual([
      {
        id: "_templates/contact",
        name: "Contact",
        folder: "contacts",
        fields: [
          { key: "vorname", kind: "text", defaultValue: "{{title}}" },
          { key: "geburtstag", kind: "date", defaultValue: "" },
          { key: "birthday_notification", kind: "notification", defaultValue: "" },
        ],
      },
      {
        id: "Work/_templates/meeting",
        name: "Meeting",
        folder: "meetings",
        fields: [
          { key: "agenda", kind: "text", defaultValue: "" },
        ],
      },
    ]);

    expect(allNoteTemplatesFromPages(pages)).toHaveLength(2);
  });

  it("builds template target paths inside a normalized folder", function () {
    expect(buildPagePathFromTemplate(template({ folder: "/contacts/" }), "Alina")).toBe("contacts/Alina");
    expect(buildPagePathFromTemplate(template({ folder: "contacts" }), "contacts/Alina")).toBe("contacts/Alina");
  });

  it("renders template markdown from the source note and strips template-only metadata", function () {
    const markdown = buildMarkdownFromTemplate(
      "contacts/Alina",
      template(),
      [
        "---",
        "_template_label: Contact",
        "_template_folder: contacts",
        "_template_date:",
        "  - geburtstag",
        "_template_tags:",
        "  - tags",
        "vorname: \"{{title}}\"",
        "geburtstag: \"\"",
        "tags:",
        "  - contact",
        "---",
        "## Notes",
        "",
        "- call {{title}}",
      ].join("\n"),
    );

    expect(parseFrontmatter(markdown)).toEqual({
      vorname: "Alina",
      nachname: "",
      geburtstag: "",
      birthday_notification: "",
      phone_private: "",
      email: "",
      tags: ["contact"],
    });
    expect(markdown).toContain("## Notes");
    expect(markdown).toContain("- call Alina");
  });

  it("derives property kind hints from the referenced template when created notes only keep the marker", function () {
    const hints = templatePropertyKindHints({
      [templateMarkerKey]: "_templates/contact",
      vorname: "Alina",
      geburtstag: "",
      birthday_notification: "",
      tags: ["contact"],
    }, [template()]);

    expect(hints).toEqual({
      vorname: "text",
      nachname: "text",
      geburtstag: "date",
      birthday_notification: "notification",
      phone_private: "text",
      email: "text",
      tags: "tags",
    });
  });

  it("tracks only essential unresolved guided template fields", function () {
    const guidedFields = templateFieldsNeedingInput(template(), "contacts/Alina");

    expect(guidedFields.map(function (field) { return field.key; })).toEqual(["nachname", "geburtstag", "birthday_notification", "phone_private"]);
    expect(templateFieldKindHints(guidedFields)).toEqual({
      nachname: "text",
      geburtstag: "date",
      birthday_notification: "notification",
      phone_private: "text",
    });
    expect(remainingTemplateFields(guidedFields, {
      vorname: "Alina",
      nachname: "",
      geburtstag: "",
      birthday_notification: "",
      phone_private: "",
      email: "",
    })).toEqual(guidedFields);
    expect(remainingTemplateFields(guidedFields, {
      vorname: "Alina",
      nachname: "Steinke",
      geburtstag: "1979-09-17",
      birthday_notification: "1979-09-17 09:00",
      phone_private: "+49 123",
      email: "",
    })).toEqual([]);
  });

  it("creates blank templates with stable unique ids", function () {
    const first = createBlankNoteTemplate("Contact");
    const second = createBlankNoteTemplate("Contact");

    expect(first.id).not.toBe(second.id);
    expect(first.name).toBe("Contact");
    expect(second.name).toBe("Contact");
  });
});
