import { describe, expect, it } from "vitest";

import { buildPathDialogAssist } from "./pathAssist";

describe("buildPathDialogAssist", function () {
  it("builds a scoped create preview for notes", function () {
    const assist = buildPathDialogAssist({
      kind: "note",
      action: "create",
      input: "contacts/alina",
      baseFolder: "",
      scopePrefix: "Private",
      pages: [],
      folders: ["Private/contacts", "Private/projects"],
    });

    expect(assist.error).toBe("");
    expect(assist.targetPath).toBe("Private/contacts/alina");
    expect(assist.helper).toContain('Private/contacts/alina');
    expect(assist.suggestions[0]).toMatchObject({
      value: "contacts/",
      label: "contacts/",
    });
  });

  it("detects duplicate note targets while renaming", function () {
    const assist = buildPathDialogAssist({
      kind: "note",
      action: "rename",
      input: "Private/contacts/alina",
      sourcePath: "Private/notes/alina",
      scopePrefix: "Private",
      pages: ["Private/contacts/alina"],
      folders: ["Private/contacts", "Private/notes"],
    });

    expect(assist.error).toBe('A note already exists at "Private/contacts/alina".');
  });

  it("warns when a rename target leaves the current scope", function () {
    const assist = buildPathDialogAssist({
      kind: "note",
      action: "rename",
      input: "Work/alina",
      sourcePath: "Private/notes/alina",
      scopePrefix: "Private",
      pages: [],
      folders: ["Private/notes", "Private/contacts"],
    });

    expect(assist.error).toBe("");
    expect(assist.targetPath).toBe("Work/alina");
    expect(assist.helperTone).toBe("warn");
    expect(assist.helper).toContain("out of the current scope");
  });

  it("offers canonical rename suggestions while showing scope-relative labels", function () {
    const assist = buildPathDialogAssist({
      kind: "note",
      action: "rename",
      input: "",
      sourcePath: "Private/notes/alina",
      scopePrefix: "Private",
      pages: [],
      folders: ["Private/notes", "Private/contacts", "Private/archive/people"],
    });

    expect(assist.suggestions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        value: "Private/alina",
        label: "alina",
        meta: "Scope root",
      }),
      expect.objectContaining({
        value: "Private/contacts/alina",
        label: "contacts/alina",
      }),
    ]));
  });

  it("prevents folders from being moved into themselves", function () {
    const assist = buildPathDialogAssist({
      kind: "folder",
      action: "rename",
      input: "Private/notes/archive",
      sourcePath: "Private/notes",
      scopePrefix: "Private",
      pages: [],
      folders: ["Private/notes", "Private/archive"],
    });

    expect(assist.error).toBe("A folder cannot be moved into itself.");
  });
});
