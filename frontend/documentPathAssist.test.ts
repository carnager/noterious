import { describe, expect, it } from "vitest";

import { buildDocumentPathDialogAssist } from "./documentPathAssist";

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
