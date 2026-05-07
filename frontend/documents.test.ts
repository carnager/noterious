import { describe, expect, it } from "vitest";

import {
  buildDocumentSections,
  documentUploadHint,
  documentUploadTargetLabel,
  inlineDocumentURL,
  markdownLinkForDocument,
  relativeDocumentPath,
  resolveDocumentPath,
  rewriteDocumentLinksInMarkdown,
} from "./documents";
import type { DocumentRecord } from "./types";
import type { ServerDocumentSettings } from "./types";

function document(path: string, contentType = "application/pdf", overrides: Partial<DocumentRecord> = {}): DocumentRecord {
  return {
    id: path,
    path,
    name: path.split("/").slice(-1)[0] || path,
    contentType,
    size: 1024,
    createdAt: "2026-04-24T00:00:00Z",
    downloadURL: "/api/documents/download?path=" + encodeURIComponent(path),
    ...overrides,
  };
}

function documentSettings(uploadPlacement: ServerDocumentSettings["uploadPlacement"], uploadSubfolder = "_files"): ServerDocumentSettings {
  return {
    uploadPlacement,
    uploadSubfolder,
  };
}

describe("document helpers", function () {
  it("builds relative markdown links from the current note", function () {
    expect(markdownLinkForDocument(document("Meetings/Teamsitzungen/Adventscafe.pdf"), "Meetings/Teamsitzungen/index")).toBe(
      "[Adventscafe.pdf](Adventscafe.pdf)"
    );
    expect(markdownLinkForDocument(document("Meetings/Adventscafe.pdf"), "Meetings/Teamsitzungen/index")).toBe(
      "[Adventscafe.pdf](../Adventscafe.pdf)"
    );
  });

  it("builds image markdown for image documents", function () {
    expect(markdownLinkForDocument(document("Assets/cat.png", "image/png"), "Notes/today")).toBe(
      "![cat.png](../Assets/cat.png)"
    );
    expect(inlineDocumentURL("Assets/cat.png")).toBe(
      "/api/documents/download?path=" + encodeURIComponent("Assets/cat.png") + "&inline=1"
    );
  });

  it("resolves relative document paths from the current note", function () {
    expect(relativeDocumentPath("Meetings/Teamsitzungen/index", "Meetings/Teamsitzungen/Adventscafe.pdf")).toBe("Adventscafe.pdf");
    expect(resolveDocumentPath("Meetings/Teamsitzungen/index", "Adventscafe.pdf")).toBe("Meetings/Teamsitzungen/Adventscafe.pdf");
    expect(resolveDocumentPath("Meetings/Teamsitzungen/index", "../Adventscafe.pdf")).toBe("Meetings/Adventscafe.pdf");
  });

  it("rewrites moved document links in markdown and wiki syntax", function () {
    const source = "![Cat](Assets/cat.png)\n![[Assets/cat.png|Cat]]\n[Spec](Docs/spec.pdf)";
    const rewritten = rewriteDocumentLinksInMarkdown(source, "Notes/today", "Notes/Assets/cat.png", "Media/cat.png");

    expect(rewritten.changed).toBe(true);
    expect(rewritten.markdown).toBe("![Cat](../Media/cat.png)\n![[../Media/cat.png|Cat]]\n[Spec](Docs/spec.pdf)");
  });

  it("describes where uploads for the current note will be stored", function () {
    expect(documentUploadTargetLabel("Meetings/Teamsitzungen/index", documentSettings("same-folder"))).toBe("Meetings/Teamsitzungen/");
    expect(documentUploadTargetLabel("Inbox", documentSettings("same-folder"))).toBe("vault root");
    expect(documentUploadHint("Meetings/Teamsitzungen/index", true, documentSettings("same-folder"))).toBe(
      "New uploads for this note go to the same folder: Meetings/Teamsitzungen/."
    );
    expect(documentUploadHint("Inbox", true, documentSettings("same-folder"))).toBe("New uploads for this note go to the vault root.");
  });

  it("describes configurable upload placements", function () {
    expect(documentUploadTargetLabel("Meetings/Teamsitzungen/index", documentSettings("vault-root"))).toBe("vault root");
    expect(documentUploadHint("Meetings/Teamsitzungen/index", true, documentSettings("vault-root"))).toBe(
      "New uploads for this note go to the vault root."
    );
    expect(documentUploadTargetLabel("Meetings/Teamsitzungen/index", documentSettings("note-subfolder", "_assets"))).toBe(
      "Meetings/Teamsitzungen/_assets/"
    );
    expect(documentUploadTargetLabel("Inbox", documentSettings("note-subfolder", "_assets"))).toBe("_assets/");
    expect(documentUploadHint("Meetings/Teamsitzungen/index", true, documentSettings("note-subfolder", "_assets"))).toBe(
      "New uploads for this note go to the configured subfolder: Meetings/Teamsitzungen/_assets/."
    );
  });

  it("explains upload behavior when no note is open", function () {
    expect(documentUploadHint("", false, documentSettings("same-folder"))).toContain("Open a note");
    expect(documentUploadHint("", false, documentSettings("same-folder"))).toContain("configured attachment location");
  });

  it("surfaces unused uploads ahead of recent documents when usage is known", function () {
    const sections = buildDocumentSections({
      inputValue: "",
      documents: [
        document("notes/_files/unused.pdf", "application/pdf", { usageKnown: true, referenceCount: 0 }),
        document("notes/spec.pdf", "application/pdf", { usageKnown: true, referenceCount: 2 }),
      ],
      onSelectDocument: function () {},
    });

    expect(sections.map(function (section) {
      return section.title;
    })).toEqual(["Unused Uploads", "Recent Documents"]);
    expect(sections[0]?.items[0]?.title).toBe("unused.pdf");
    expect(sections[0]?.items[0]?.meta).toContain("Unused");
    expect(sections[1]?.items[0]?.meta).toContain("Used in 2 notes");
  });
});
