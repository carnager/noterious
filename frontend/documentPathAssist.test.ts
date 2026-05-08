import { describe, expect, it } from "vitest";

import { buildDocumentMoveAssist, buildDocumentPathDialogAssist } from "./documentPathAssist";

describe("document path assist", function () {
  it("preserves the source extension when the user omits it", function () {
    const assist = buildDocumentPathDialogAssist({
      input: "Quarterly Report",
      sourcePath: "notes/meeting-notes.pdf",
      documents: ["notes/meeting-notes.pdf"],
      folders: ["notes", "archive"],
    });

    expect(assist.targetPath).toBe("notes/quarterly-report.pdf");
    expect(assist.error).toBe("");
    expect(assist.helper).toBe('Will rename file to "notes/quarterly-report.pdf".');
  });

  it("detects folder collisions on the exact target path", function () {
    const assist = buildDocumentPathDialogAssist({
      input: "archive/reports.pdf",
      sourcePath: "notes/meeting-notes.pdf",
      documents: ["notes/meeting-notes.pdf"],
      folders: ["archive/reports.pdf"],
    });

    expect(assist.targetPath).toBe("archive/reports.pdf");
    expect(assist.error).toBe('A folder already exists at "archive/reports.pdf".');
  });

  it("warns when a move leaves the current scope", function () {
    const assist = buildDocumentPathDialogAssist({
      input: "Personal/invoice",
      sourcePath: "Work/docs/spec.pdf",
      scopePrefix: "Work",
      documents: ["Work/docs/spec.pdf"],
      folders: ["Work/docs", "Personal"],
    });

    expect(assist.targetPath).toBe("Personal/invoice.pdf");
    expect(assist.helperTone).toBe("warn");
    expect(assist.helper).toContain("out of the current scope");
  });

  it("suggests scoped folders using the current document name", function () {
    const assist = buildDocumentPathDialogAssist({
      input: "",
      sourcePath: "Work/docs/spec.pdf",
      scopePrefix: "Work",
      documents: ["Work/docs/spec.pdf"],
      folders: ["Work/docs", "Work/archive", "Personal/files"],
    });

    expect(assist.suggestions.map(function (suggestion) {
      return suggestion.value;
    })).toEqual([
      "Work/spec.pdf",
      "Work/archive/spec.pdf",
    ]);
  });
});

describe("document move assist", function () {
  it("treats slash as the current scope root when moving a document", function () {
    const assist = buildDocumentMoveAssist({
      input: "/",
      sourcePath: "Work/docs/spec.pdf",
      scopePrefix: "Work",
      documents: ["Work/docs/spec.pdf"],
      folders: ["Work/docs", "Work/archive"],
    });

    expect(assist.error).toBe("");
    expect(assist.targetFolder).toBe("Work");
    expect(assist.targetPath).toBe("Work/spec.pdf");
    expect(assist.helper).toContain('/Work/spec.pdf');
  });

  it("shows full canonical folder paths in move suggestions", function () {
    const assist = buildDocumentMoveAssist({
      input: "",
      sourcePath: "Work/docs/spec.pdf",
      scopePrefix: "Work",
      documents: ["Work/docs/spec.pdf"],
      folders: ["Work/docs", "Work/archive", "Private/files"],
    });

    expect(assist.suggestions).toEqual(expect.arrayContaining([
      expect.objectContaining({ value: "/", label: "/Work" }),
      expect.objectContaining({ value: "Work/archive", label: "/Work/archive" }),
      expect.objectContaining({ value: "Private/files", label: "/Private/files" }),
    ]));
  });

  it("rejects missing target folders for file moves", function () {
    const assist = buildDocumentMoveAssist({
      input: "missing",
      sourcePath: "notes/meeting-notes.pdf",
      documents: ["notes/meeting-notes.pdf"],
      folders: ["notes", "archive"],
    });

    expect(assist.error).toBe('Folder "missing" does not exist.');
  });
});
