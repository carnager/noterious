import { describe, expect, it, vi } from "vitest";

import type { LoadedPageDetail } from "./details";
import { runSelectedPageRemoteSync } from "./pageSyncIntegration";

function loadedDetail(markdown: string): LoadedPageDetail {
  return {
    page: {
      page: "notes/alpha",
      path: "notes/alpha",
      title: "alpha",
      rawMarkdown: markdown,
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

describe("runSelectedPageRemoteSync", function () {
  it("applies a safe remote merge and restores the viewport", async function () {
    const applyLoadedPageDetailState = vi.fn(function () {
      return false;
    });
    const restoreCurrentEditorViewport = vi.fn();
    const refreshCollections = vi.fn();
    const setNoteStatus = vi.fn();

    await runSelectedPageRemoteSync({
      pagePath: "notes/alpha",
      baseMarkdown: "Line 1\nLine 2\n",
      localMarkdown: "Line 1\nLine 2 local\n",
      unsafeUIState: false,
      selectionStart: 4,
      selectionEnd: 4,
      scrollTop: 120,
      focusEditor: true,
      loadRemoteDetail: function () {
        return Promise.resolve(loadedDetail("Line 1 remote\nLine 2\n"));
      },
      shouldContinue: function () {
        return true;
      },
      formatErrorMessage: function (error) {
        return String(error);
      },
      applyLoadedPageDetailState: applyLoadedPageDetailState,
      restoreCurrentEditorViewport: restoreCurrentEditorViewport,
      showRemoteChangeToast: vi.fn(),
      openConflict: vi.fn(),
      setNoteStatus: setNoteStatus,
      refreshCollections: refreshCollections,
    });

    expect(applyLoadedPageDetailState).toHaveBeenCalledWith(
      "notes/alpha",
      expect.objectContaining({ page: expect.objectContaining({ path: "notes/alpha" }) }),
      "Line 1 remote\nLine 2 local\n"
    );
    expect(restoreCurrentEditorViewport).toHaveBeenCalledWith(4, 4, 120, true);
    expect(setNoteStatus).toHaveBeenCalledWith("Merged remote edits into notes/alpha.");
    expect(refreshCollections).toHaveBeenCalledTimes(1);
  });

  it("opens a conflict dialog when merging is unsafe", async function () {
    const openConflict = vi.fn();
    const setNoteStatus = vi.fn();

    await runSelectedPageRemoteSync({
      pagePath: "notes/alpha",
      baseMarkdown: "Alpha\n",
      localMarkdown: "Alpha local\n",
      unsafeUIState: true,
      selectionStart: 0,
      selectionEnd: 0,
      scrollTop: 0,
      focusEditor: true,
      loadRemoteDetail: function () {
        return Promise.resolve(loadedDetail("Alpha remote\n"));
      },
      shouldContinue: function () {
        return true;
      },
      formatErrorMessage: function (error) {
        return String(error);
      },
      applyLoadedPageDetailState: vi.fn(),
      restoreCurrentEditorViewport: vi.fn(),
      showRemoteChangeToast: vi.fn(),
      openConflict: openConflict,
      setNoteStatus: setNoteStatus,
      refreshCollections: vi.fn(),
    });

    expect(openConflict).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "unsafe-remote-review" }),
      expect.any(Object),
      "Remote changes are ready to review, but Noterious paused automatic merge because a structured editor is still open.",
      "Remote change review needed for notes/alpha."
    );
    expect(setNoteStatus).not.toHaveBeenCalled();
  });

  it("shows the remote-change toast on load errors", async function () {
    const showRemoteChangeToast = vi.fn();
    const setNoteStatus = vi.fn();

    await runSelectedPageRemoteSync({
      pagePath: "notes/alpha",
      baseMarkdown: "Alpha\n",
      localMarkdown: "Alpha\n",
      unsafeUIState: false,
      selectionStart: 0,
      selectionEnd: 0,
      scrollTop: 0,
      focusEditor: false,
      loadRemoteDetail: function () {
        return Promise.reject(new Error("boom"));
      },
      shouldContinue: function () {
        return true;
      },
      formatErrorMessage: function (error) {
        return error instanceof Error ? error.message : String(error);
      },
      applyLoadedPageDetailState: vi.fn(),
      restoreCurrentEditorViewport: vi.fn(),
      showRemoteChangeToast: showRemoteChangeToast,
      openConflict: vi.fn(),
      setNoteStatus: setNoteStatus,
      refreshCollections: vi.fn(),
    });

    expect(showRemoteChangeToast).toHaveBeenCalledWith("notes/alpha");
    expect(setNoteStatus).toHaveBeenCalledWith("Remote refresh failed: boom");
  });
});
