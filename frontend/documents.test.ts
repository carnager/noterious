import { describe, expect, it } from "vitest";

import { markdownLinkForDocument, relativeDocumentPath, resolveDocumentPath } from "./documents";
import type { DocumentRecord } from "./types";

function document(path: string): DocumentRecord {
  return {
    id: path,
    path,
    name: path.split("/").slice(-1)[0] || path,
    contentType: "application/pdf",
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

  it("resolves relative document paths from the current note", function () {
    expect(relativeDocumentPath("Meetings/Teamsitzungen/index", "Meetings/Teamsitzungen/Adventscafe.pdf")).toBe("Adventscafe.pdf");
    expect(resolveDocumentPath("Meetings/Teamsitzungen/index", "Adventscafe.pdf")).toBe("Meetings/Teamsitzungen/Adventscafe.pdf");
    expect(resolveDocumentPath("Meetings/Teamsitzungen/index", "../Adventscafe.pdf")).toBe("Meetings/Adventscafe.pdf");
  });
});
