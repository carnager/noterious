import { describe, expect, it } from "vitest";

import { parseFrontmatter } from "./markdown";
import {
  allNoteTemplatesFromPages,
  buildPropertyKindHintMetadataPatch,
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
      _type_date: ["geburtstag"],
      _type_notification: ["birthday_notification"],
      _type_tags: ["tags"],
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

  it("builds normalized per-note type metadata and removes legacy aliases", function () {
    expect(buildPropertyKindHintMetadataPatch({
      geburtstag: "date",
      birthday_notification: "notification",
      tags: "tags",
      title: "text",
    })).toEqual({
      set: {
        _type_date: ["geburtstag"],
        _type_notification: ["birthday_notification"],
        _type_tags: ["tags"],
      },
      remove: [
        "_type_tags",
        "_template_tags",
        "_type_list",
        "_template_list",
        "_type_bool",
        "_template_bool",
        "_type_date",
        "_template_date",
        "_type_datetime",
        "_template_datetime",
        "_type_notification",
        "_template_notification",
        "_type_number",
        "_template_number",
        "_type_url",
        "_template_url",
        "_type_email",
        "_template_email",
        "_type_phone",
        "_template_phone",
      ],
    });
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

  it("derives property kind hints from per-note metadata", function () {
    const hints = templatePropertyKindHints({
      _type_date: ["geburtstag"],
      _type_notification: ["birthday_notification"],
      _type_tags: ["tags"],
      geburtstag: "",
      birthday_notification: "",
      tags: [],
    }, []);

    expect(hints).toEqual({
      geburtstag: "date",
      birthday_notification: "notification",
      tags: "tags",
    });
  });

  it("tracks only essential unresolved guided template fields", function () {
    const guidedFields = templateFieldsNeedingInput(template(), "contacts/Alina");

    expect(guidedFields.map(function (field) { return field.key; })).toEqual(["nachname", "geburtstag", "birthday_notification", "phone_private", "email"]);
    expect(templateFieldKindHints(guidedFields)).toEqual({
      nachname: "text",
      geburtstag: "date",
      birthday_notification: "notification",
      phone_private: "text",
      email: "text",
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
      email: "alina@example.com",
    })).toEqual([]);
  });

  it("splits the title into vorname and nachname placeholders", function () {
    const markdown = buildMarkdownFromTemplate(
      "contacts/Alina Steinke",
      template({
        fields: [
          { key: "vorname", kind: "text", defaultValue: "{{vorname}}" },
          { key: "nachname", kind: "text", defaultValue: "{{nachname}}" },
        ],
      }),
    );

    expect(parseFrontmatter(markdown)).toEqual({
      vorname: "Alina",
      nachname: "Steinke",
    });
  });

  it("treats remaining name words as the nachname and leaves it empty for single-word titles", function () {
    const multiWord = buildMarkdownFromTemplate(
      "contacts/Anna Maria von Trapp",
      template({
        fields: [
          { key: "vorname", kind: "text", defaultValue: "{{firstname}}" },
          { key: "nachname", kind: "text", defaultValue: "{{lastname}}" },
        ],
      }),
    );
    expect(parseFrontmatter(multiWord)).toEqual({
      vorname: "Anna",
      nachname: "Maria von Trapp",
    });

    const singleWord = buildMarkdownFromTemplate(
      "contacts/Alina",
      template({
        fields: [
          { key: "vorname", kind: "text", defaultValue: "{{vorname}}" },
          { key: "nachname", kind: "text", defaultValue: "{{nachname}}" },
        ],
      }),
    );
    expect(parseFrontmatter(singleWord)).toEqual({
      vorname: "Alina",
      nachname: "",
    });
  });

  it("creates blank templates with stable unique ids", function () {
    const first = createBlankNoteTemplate("Contact");
    const second = createBlankNoteTemplate("Contact");

    expect(first.id).not.toBe(second.id);
    expect(first.name).toBe("Contact");
    expect(second.name).toBe("Contact");
  });
});
