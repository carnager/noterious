import { describe, expect, it } from "vitest";

import type { LoadedPageDetail } from "./details";
import { HTTPError } from "./http";
import { savePageConflictResolutionFlow } from "./pageConflictSaveFlow";

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

describe("savePageConflictResolutionFlow", function () {
  it("returns a saved result when the resolved markdown is accepted", async function () {
    const payload = {
      page: "notes/alpha",
      path: "notes/alpha",
      title: "Alpha",
      rawMarkdown: "# Alpha\nresolved\n",
      frontmatter: {},
      links: [],
      tasks: [],
    };

    const result = await savePageConflictResolutionFlow({
      mode: "remote-conflict",
      pagePath: "notes/alpha",
      baseMarkdown: "# Alpha\nbase\n",
      remoteMarkdown: "# Alpha\nremote\n",
      resolutionMarkdown: "# Alpha\nresolved\n",
      saveResolvedMarkdown: async function () {
        return payload;
      },
      loadLatestRemote: async function () {
        return loadedRemote("# Alpha\nignored\n");
      },
    });

    expect(result).toEqual({
      action: "saved",
      payload,
      status: "Saved resolved version of notes/alpha.",
    });
  });

  it("reopens the conflict with the attempted resolution preserved after a 409", async function () {
    const result = await savePageConflictResolutionFlow({
      mode: "remote-conflict",
      pagePath: "notes/alpha",
      baseMarkdown: "# Alpha\nbase\n",
      remoteMarkdown: "# Alpha\nremote\n",
      resolutionMarkdown: "# Alpha\nattempt three\n",
      saveResolvedMarkdown: async function () {
        throw new HTTPError(409, "conflict");
      },
      loadLatestRemote: async function () {
        return loadedRemote("# Alpha\nremote latest\n");
      },
    });

    expect(result.action).toBe("reopened");
    if (result.action !== "reopened") {
      return;
    }
    expect(result.status).toContain("changed again while you were resolving it");
    expect(result.noteStatus).toBe("Conflict changed again on notes/alpha.");
    expect(result.draft.localMarkdown).toBe("# Alpha\nattempt three\n");
    expect(result.draft.resolutionMarkdown).toBe("# Alpha\nattempt three\n");
    expect(result.draft.remoteMarkdown).toBe("# Alpha\nremote latest\n");
  });

  it("returns a reload error when the fresh remote version cannot be loaded", async function () {
    const result = await savePageConflictResolutionFlow({
      mode: "remote-conflict",
      pagePath: "notes/alpha",
      baseMarkdown: "# Alpha\nbase\n",
      remoteMarkdown: "# Alpha\nremote\n",
      resolutionMarkdown: "# Alpha\nattempt three\n",
      saveResolvedMarkdown: async function () {
        throw new HTTPError(409, "conflict");
      },
      loadLatestRemote: async function () {
        throw new Error("network down");
      },
    });

    expect(result).toEqual({
      action: "reload-error",
      status: "The page changed again, and the latest remote version could not be loaded: network down",
    });
  });

  it("returns a save error for non-conflict failures", async function () {
    const result = await savePageConflictResolutionFlow({
      mode: "remote-conflict",
      pagePath: "notes/alpha",
      baseMarkdown: "# Alpha\nbase\n",
      remoteMarkdown: "# Alpha\nremote\n",
      resolutionMarkdown: "# Alpha\nattempt three\n",
      saveResolvedMarkdown: async function () {
        throw new Error("permission denied");
      },
      loadLatestRemote: async function () {
        return loadedRemote("# Alpha\nremote latest\n");
      },
    });

    expect(result).toEqual({
      action: "save-error",
      status: "Save failed: permission denied",
    });
  });
});
