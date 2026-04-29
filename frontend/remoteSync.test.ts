import { describe, expect, it } from "vitest";

import { buildRemoteSyncPlan, hasUnsafeRemoteSyncUIState } from "./remoteSync";

describe("remote sync helpers", function () {
  it("flags transient non-markdown drafts as unsafe", function () {
    expect(hasUnsafeRemoteSyncUIState({
      propertyDraftOpen: false,
      inlineTableEditorOpen: false,
      inlineTableEditorFocused: false,
      noteTitleFocused: false,
    })).toBe(false);

    expect(hasUnsafeRemoteSyncUIState({
      propertyDraftOpen: true,
      inlineTableEditorOpen: false,
      inlineTableEditorFocused: false,
      noteTitleFocused: false,
    })).toBe(true);
  });

  it("builds an apply plan for disjoint edits", function () {
    expect(buildRemoteSyncPlan({
      baseMarkdown: "# Note\nalpha\nbeta\n",
      localMarkdown: "# Note\nalpha changed\nbeta\n",
      remoteMarkdown: "# Note\nalpha\nbeta changed\n",
      unsafeUIState: false,
    })).toEqual({
      action: "apply",
      markdown: "# Note\nalpha changed\nbeta changed\n",
      mergedLocalEdits: true,
    });
  });

  it("builds a warning plan when UI state is unsafe", function () {
    expect(buildRemoteSyncPlan({
      baseMarkdown: "# Note\nalpha\n",
      localMarkdown: "# Note\nalpha\n",
      remoteMarkdown: "# Note\nalpha changed\n",
      unsafeUIState: true,
    })).toEqual({
      action: "warn",
      reason: "unsafe-ui-state",
    });
  });

  it("builds a warning plan for overlapping edits", function () {
    expect(buildRemoteSyncPlan({
      baseMarkdown: "# Note\nalpha\n",
      localMarkdown: "# Note\nalpha from local\n",
      remoteMarkdown: "# Note\nalpha from remote\n",
      unsafeUIState: false,
    })).toEqual({
      action: "warn",
      reason: "conflict",
    });
  });
});
