// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  captureEditorFocusSpec,
  restoreEditorFocus,
  type EditorControllerElements,
  type EditorControllerState,
} from "./editorState";

function createElements(textarea: HTMLTextAreaElement): EditorControllerElements {
  const searchModalShell = document.createElement("div");
  searchModalShell.className = "hidden";
  const commandModalShell = document.createElement("div");
  commandModalShell.className = "hidden";
  document.body.appendChild(textarea);
  document.body.appendChild(searchModalShell);
  document.body.appendChild(commandModalShell);
  return {
    markdownEditor: textarea,
    searchModalShell,
    commandModalShell,
  };
}

describe("editor focus restore", function () {
  afterEach(function () {
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("captures and restores editor selection with scroll position", function () {
    const textarea = document.createElement("textarea");
    textarea.value = "Alpha\nBeta\nGamma\nDelta";
    const elements = createElements(textarea);
    const state: EditorControllerState = {
      markdownEditorApi: null,
      restoreFocusSpec: null,
    };

    textarea.focus();
    textarea.setSelectionRange(8, 8);
    textarea.scrollTop = 132;

    captureEditorFocusSpec(state, elements);

    expect(state.restoreFocusSpec).toEqual({
      mode: "editor",
      offset: 8,
      scrollTop: 132,
    });

    textarea.blur();
    textarea.setSelectionRange(0, 0);
    textarea.scrollTop = 0;

    vi.spyOn(window, "requestAnimationFrame").mockImplementation(function (callback: FrameRequestCallback): number {
      callback(0);
      return 1;
    });

    restoreEditorFocus(state, elements, "notes/test");

    expect(state.restoreFocusSpec).toBeNull();
    expect(textarea.selectionStart).toBe(8);
    expect(textarea.selectionEnd).toBe(8);
    expect(textarea.scrollTop).toBe(132);
  });

  it("clears stale restore state when the editor is not focused", function () {
    const textarea = document.createElement("textarea");
    const elements = createElements(textarea);
    const other = document.createElement("button");
    document.body.appendChild(other);
    const state: EditorControllerState = {
      markdownEditorApi: null,
      restoreFocusSpec: {
        mode: "editor",
        offset: 4,
        scrollTop: 44,
      },
    };

    other.focus();
    captureEditorFocusSpec(state, elements);

    expect(state.restoreFocusSpec).toBeNull();
  });
});
