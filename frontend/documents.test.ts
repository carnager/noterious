import { describe, expect, it } from "vitest";

import {
  documentUploadHint,
  documentUploadTargetLabel,
  inlineDocumentURL,
  markdownLinkForDocument,
  relativeDocumentPath,
  resolveDocumentPath,
} from "./documents";
import type { DocumentRecord } from "./types";

function document(path: string, contentType = "application/pdf"): DocumentRecord {
  return {
    id: path,
    path,
    name: path.split("/").slice(-1)[0] || path,
    contentType,
    size: 1024,
    createdAt: "2026-04-24T00:00:00Z",
    downloadURL: "/api/documents/download?path=" + encodeURIComponent(path),
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

  it("describes where uploads for the current note will be stored", function () {
    expect(documentUploadTargetLabel("Meetings/Teamsitzungen/index")).toBe("Meetings/Teamsitzungen/");
    expect(documentUploadTargetLabel("Inbox")).toBe("vault root");
    expect(documentUploadHint("Meetings/Teamsitzungen/index", true)).toBe(
      "New uploads for this note go to the same folder: Meetings/Teamsitzungen/."
    );
    expect(documentUploadHint("Inbox", true)).toBe("New uploads for this note go to the vault root.");
  });

  it("explains upload behavior when no note is open", function () {
    expect(documentUploadHint("", false)).toContain("Open a note");
    expect(documentUploadHint("", false)).toContain("opens the file");
  });
});
