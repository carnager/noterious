import { describe, expect, it } from "vitest";

import { createPageConflictDraft } from "./pageConflict";

describe("createPageConflictDraft", function () {
  it("builds an editable save-conflict draft seeded with local markdown", function () {
    const draft = createPageConflictDraft({
      mode: "save-conflict",
      pagePath: "notes/alpha",
      baseMarkdown: "# Alpha\nbase\n",
      localMarkdown: "# Alpha\nlocal\n",
      remoteMarkdown: "# Alpha\nremote\n",
    });

    expect(draft.editable).toBe(true);
    expect(draft.title).toBe("Resolve Save Conflict");
    expect(draft.resolutionMarkdown).toBe("# Alpha\nlocal\n");
    expect(draft.summary).toContain("notes/alpha changed before your save completed");
  });

  it("builds an editable remote-conflict draft", function () {
    const draft = createPageConflictDraft({
      mode: "remote-conflict",
      pagePath: "notes/alpha",
      baseMarkdown: "# Alpha\nbase\n",
      localMarkdown: "# Alpha\nlocal\n",
      remoteMarkdown: "# Alpha\nremote\n",
    });

    expect(draft.editable).toBe(true);
    expect(draft.title).toBe("Resolve Remote Change");
    expect(draft.callout).toContain("preserved");
  });

  it("builds a read-only unsafe remote review draft", function () {
    const draft = createPageConflictDraft({
      mode: "unsafe-remote-review",
      pagePath: "notes/alpha",
      baseMarkdown: "# Alpha\nbase\n",
      localMarkdown: "# Alpha\nlocal\n",
      remoteMarkdown: "# Alpha\nremote\n",
    });

    expect(draft.editable).toBe(false);
    expect(draft.title).toBe("Review Remote Change");
    expect(draft.callout).toContain("Reloading now will discard");
  });
});
