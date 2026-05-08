import { describe, expect, it } from "vitest";

import { buildPathDialogAssist, buildPathMoveAssist } from "./pathAssist";

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

  it("allows notes to share a base name with a folder", function () {
    const assist = buildPathDialogAssist({
      kind: "note",
      action: "rename",
      input: "foobar.md",
      sourcePath: "alpha",
      scopePrefix: "",
      pages: [],
      folders: ["foobar"],
    });

    expect(assist.error).toBe("");
    expect(assist.targetPath).toBe("foobar");
    expect(assist.helper).toContain("notes and folders can coexist");
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

describe("buildPathMoveAssist", function () {
  it("treats slash as the current scope root when moving a note", function () {
    const assist = buildPathMoveAssist({
      kind: "note",
      input: "/",
      sourcePath: "Private/notes/alina",
      scopePrefix: "Private",
      pages: ["Private/notes/alina"],
      folders: ["Private/notes", "Private/archive"],
    });

    expect(assist.error).toBe("");
    expect(assist.targetFolder).toBe("Private");
    expect(assist.targetPath).toBe("Private/alina");
    expect(assist.helper).toContain('/Private/alina');
  });

  it("shows full canonical paths in move suggestions", function () {
    const assist = buildPathMoveAssist({
      kind: "note",
      input: "",
      sourcePath: "Private/notes/alina",
      scopePrefix: "Private",
      pages: ["Private/notes/alina"],
      folders: ["Private/notes", "Private/archive", "Work/shared"],
    });

    expect(assist.suggestions).toEqual(expect.arrayContaining([
      expect.objectContaining({ value: "/", label: "/Private" }),
      expect.objectContaining({ value: "Private/archive", label: "/Private/archive" }),
      expect.objectContaining({ value: "Work/shared", label: "/Work/shared" }),
    ]));
  });

  it("rejects moving a folder into one of its children", function () {
    const assist = buildPathMoveAssist({
      kind: "folder",
      input: "Private/notes/archive",
      sourcePath: "Private/notes",
      scopePrefix: "Private",
      pages: [],
      folders: ["Private", "Private/notes", "Private/notes/archive"],
    });

    expect(assist.error).toBe("A folder cannot be moved into itself.");
  });
});
