import { describe, expect, it } from "vitest";

import type { LoadedPageDetail } from "./details";
import { syncRemotePageChange } from "./remotePageChangeFlow";

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

describe("syncRemotePageChange", function () {
  it("loads, merges, and returns an apply result for disjoint edits", async function () {
    const result = await syncRemotePageChange({
      pagePath: "notes/alpha",
      baseMarkdown: "# Alpha\none\ntwo\n",
      localMarkdown: "# Alpha\none local\ntwo\n",
      unsafeUIState: false,
      loadRemoteDetail: async function () {
        return loadedRemote("# Alpha\none\ntwo remote\n");
      },
    });

    expect(result).toEqual({
      action: "apply",
      pagePath: "notes/alpha",
      loaded: loadedRemote("# Alpha\none\ntwo remote\n"),
      markdown: "# Alpha\none local\ntwo remote\n",
      mergedLocalEdits: true,
      status: "Merged remote edits into notes/alpha.",
    });
  });

  it("returns a conservative conflict review when structured UI state is open", async function () {
    const result = await syncRemotePageChange({
      pagePath: "notes/alpha",
      baseMarkdown: "# Alpha\none\ntwo\n",
      localMarkdown: "# Alpha\none\ntwo\n",
      unsafeUIState: true,
      loadRemoteDetail: async function () {
        return loadedRemote("# Alpha\none\ntwo remote\n");
      },
    });

    expect(result.action).toBe("conflict");
    if (result.action !== "conflict") {
      return;
    }
    expect(result.draft.mode).toBe("unsafe-remote-review");
    expect(result.status).toContain("structured editor");
  });

  it("returns a stale result if the page changed before the remote load finished", async function () {
    const result = await syncRemotePageChange({
      pagePath: "notes/alpha",
      baseMarkdown: "# Alpha\none\ntwo\n",
      localMarkdown: "# Alpha\none\ntwo\n",
      unsafeUIState: false,
      loadRemoteDetail: async function () {
        return loadedRemote("# Alpha\none\ntwo remote\n");
      },
      shouldContinue: function () {
        return false;
      },
    });

    expect(result).toEqual({
      action: "stale",
    });
  });

  it("returns a formatted refresh error when the remote load fails", async function () {
    const result = await syncRemotePageChange({
      pagePath: "notes/alpha",
      baseMarkdown: "# Alpha\none\ntwo\n",
      localMarkdown: "# Alpha\none\ntwo\n",
      unsafeUIState: false,
      loadRemoteDetail: async function () {
        throw new Error("network down");
      },
    });

    expect(result).toEqual({
      action: "error",
      pagePath: "notes/alpha",
      status: "Remote refresh failed: network down",
    });
  });
});
