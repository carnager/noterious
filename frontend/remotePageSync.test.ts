import { describe, expect, it } from "vitest";

import type { LoadedPageDetail } from "./details";
import { planRemotePageSync } from "./remotePageSync";

function loadedRemote(rawMarkdown: string): LoadedPageDetail {
  return {
    page: {
      page: "notes/alpha",
      path: "notes/alpha",
      title: "Alpha",
      rawMarkdown,
      frontmatter: {},
      links: [],
      tasks: [],
    },
    derived: {
      toc: [],
      backlinks: [],
      queryBlocks: [],
      linkCounts: {},
      taskCounts: {},
    },
    focusOffset: null,
  };
}

describe("planRemotePageSync", function () {
  it("applies disjoint edits and reports a merge", function () {
    expect(planRemotePageSync({
      pagePath: "notes/alpha",
      baseMarkdown: "# Alpha\none\ntwo\n",
      localMarkdown: "# Alpha\none local\ntwo\n",
      loadedRemote: loadedRemote("# Alpha\none\ntwo remote\n"),
      unsafeUIState: false,
    })).toEqual({
      action: "apply",
      markdown: "# Alpha\none local\ntwo remote\n",
      mergedLocalEdits: true,
      status: "Merged remote edits into notes/alpha.",
    });
  });

  it("applies remote-only updates without opening conflict review", function () {
    expect(planRemotePageSync({
      pagePath: "notes/alpha",
      baseMarkdown: "# Alpha\none\ntwo\n",
      localMarkdown: "# Alpha\none\ntwo\n",
      loadedRemote: loadedRemote("# Alpha\none\ntwo remote\n"),
      unsafeUIState: false,
    })).toEqual({
      action: "apply",
      markdown: "# Alpha\none\ntwo remote\n",
      mergedLocalEdits: false,
      status: "Updated notes/alpha from remote changes.",
    });
  });

  it("opens an unsafe remote review when structured UI state is open", function () {
    const result = planRemotePageSync({
      pagePath: "notes/alpha",
      baseMarkdown: "# Alpha\none\ntwo\n",
      localMarkdown: "# Alpha\none\ntwo\n",
      loadedRemote: loadedRemote("# Alpha\none\ntwo remote\n"),
      unsafeUIState: true,
    });

    expect(result.action).toBe("conflict");
    if (result.action !== "conflict") {
      return;
    }
    expect(result.draft.mode).toBe("unsafe-remote-review");
    expect(result.draft.editable).toBe(false);
    expect(result.status).toContain("structured editor");
  });

  it("opens conflict review for overlapping edits", function () {
    const result = planRemotePageSync({
      pagePath: "notes/alpha",
      baseMarkdown: "# Alpha\none\ntwo\n",
      localMarkdown: "# Alpha\none local\ntwo\n",
      loadedRemote: loadedRemote("# Alpha\none remote\ntwo\n"),
      unsafeUIState: false,
    });

    expect(result.action).toBe("conflict");
    if (result.action !== "conflict") {
      return;
    }
    expect(result.draft.mode).toBe("remote-conflict");
    expect(result.draft.editable).toBe(true);
    expect(result.status).toContain("overlapping local and remote edits");
  });
});
