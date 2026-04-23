import { focusWithoutScroll } from "./dom";
import type {
  FocusRestoreSpec,
  NoteriousEditorApi,
  QueryBlockRender,
  SlashMenuContext,
  TaskRender,
} from "./types";

export interface EditorControllerState {
  markdownEditorApi: NoteriousEditorApi | null;
  restoreFocusSpec: FocusRestoreSpec | null;
}

export interface EditorControllerElements {
  markdownEditor: HTMLTextAreaElement;
  taskModalShell: HTMLElement;
  searchModalShell: HTMLElement;
  commandModalShell: HTMLElement;
}

export interface RawLineContext {
  value: string;
  selectionStart: number;
  selectionEnd: number;
  lineStart: number;
  lineEnd: number;
  lineText: string;
  caretInLine: number;
}

export function markdownEditorAPI(state: EditorControllerState): NoteriousEditorApi | null {
  return state.markdownEditorApi || null;
}

export function markdownEditorValue(state: EditorControllerState, elements: EditorControllerElements): string {
  const api = markdownEditorAPI(state);
  return api ? api.getValue() : elements.markdownEditor.value;
}

export function setMarkdownEditorValue(state: EditorControllerState, elements: EditorControllerElements, value: string): void {
  const api = markdownEditorAPI(state);
  if (api) {
    api.setValue(value);
    return;
  }
  elements.markdownEditor.value = value;
}

export function markdownEditorSelectionStart(state: EditorControllerState, elements: EditorControllerElements): number {
  const api = markdownEditorAPI(state);
  return api ? api.getSelectionStart() : (elements.markdownEditor.selectionStart || 0);
}

export function markdownEditorSelectionEnd(state: EditorControllerState, elements: EditorControllerElements): number {
  const api = markdownEditorAPI(state);
  return api ? api.getSelectionEnd() : (elements.markdownEditor.selectionEnd || 0);
}

export function setMarkdownEditorSelection(
  state: EditorControllerState,
  elements: EditorControllerElements,
  anchor: number,
  head?: number,
  reveal?: boolean
): void {
  const api = markdownEditorAPI(state);
  if (api) {
    api.setSelectionRange(anchor, typeof head === "number" ? head : anchor, Boolean(reveal));
    return;
  }
  elements.markdownEditor.setSelectionRange(anchor, typeof head === "number" ? head : anchor);
}

export function focusMarkdownEditor(
  state: EditorControllerState,
  elements: EditorControllerElements,
  options?: FocusOptions
): void {
  const api = markdownEditorAPI(state);
  if (api) {
    api.focus(options);
    return;
  }
  focusWithoutScroll(elements.markdownEditor);
}

export function markdownEditorScrollTop(state: EditorControllerState, elements: EditorControllerElements): number {
  const api = markdownEditorAPI(state);
  return api ? api.getScrollTop() : elements.markdownEditor.scrollTop;
}

export function setMarkdownEditorScrollTop(state: EditorControllerState, elements: EditorControllerElements, value: number): void {
  const api = markdownEditorAPI(state);
  if (api) {
    api.setScrollTop(value);
    return;
  }
  elements.markdownEditor.scrollTop = value;
}

export function markdownEditorHasFocus(state: EditorControllerState, elements: EditorControllerElements): boolean {
  const api = markdownEditorAPI(state);
  return api ? api.hasFocus() : document.activeElement === elements.markdownEditor;
}

export function markdownEditorCaretRect(state: EditorControllerState): DOMRect | null {
  const api = markdownEditorAPI(state);
  return api && typeof api.getCaretRect === "function" ? api.getCaretRect() : null;
}

export function markdownEditorSetRenderMode(state: EditorControllerState, enabled: boolean): void {
  const api = markdownEditorAPI(state);
  if (api && typeof api.setRenderMode === "function") {
    api.setRenderMode(Boolean(enabled));
  }
}

export function markdownEditorSetPagePath(state: EditorControllerState, path: string): void {
  const api = markdownEditorAPI(state);
  if (api && typeof api.setPagePath === "function") {
    api.setPagePath(String(path || ""));
  }
}

export function markdownEditorSetQueryBlocks(state: EditorControllerState, blocks: QueryBlockRender[]): void {
  const api = markdownEditorAPI(state);
  if (api && typeof api.setQueryBlocks === "function") {
    api.setQueryBlocks(blocks);
  }
}

export function markdownEditorSetTasks(state: EditorControllerState, tasks: TaskRender[]): void {
  const api = markdownEditorAPI(state);
  if (api && typeof api.setTasks === "function") {
    api.setTasks(tasks);
  }
}

export function currentRawLineContext(state: EditorControllerState, elements: EditorControllerElements): RawLineContext {
  const value = markdownEditorValue(state, elements);
  const start = markdownEditorSelectionStart(state, elements);
  const end = markdownEditorSelectionEnd(state, elements);
  const lineStart = value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
  const lineEndIndex = value.indexOf("\n", end);
  const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex;
  return {
    value,
    selectionStart: start,
    selectionEnd: end,
    lineStart,
    lineEnd,
    lineText: value.slice(lineStart, lineEnd),
    caretInLine: Math.max(0, start - lineStart),
  };
}

export function captureEditorFocusSpec(state: EditorControllerState, elements: EditorControllerElements): void {
  if (markdownEditorHasFocus(state, elements)) {
    state.restoreFocusSpec = {
      mode: "editor",
      offset: markdownEditorSelectionStart(state, elements),
    };
  }
}

export function blockingOverlayOpen(elements: EditorControllerElements): boolean {
  return Boolean(
    !elements.taskModalShell.classList.contains("hidden") ||
    !elements.searchModalShell.classList.contains("hidden") ||
    !elements.commandModalShell.classList.contains("hidden")
  );
}

export function restoreEditorFocus(
  state: EditorControllerState,
  elements: EditorControllerElements,
  selectedPage: string
): void {
  if (!selectedPage || !state.restoreFocusSpec) {
    return;
  }
  if (blockingOverlayOpen(elements)) {
    return;
  }

  const focusSpec = state.restoreFocusSpec;
  state.restoreFocusSpec = null;

  window.requestAnimationFrame(function () {
    if (focusSpec.mode === "editor") {
      const value = markdownEditorValue(state, elements);
      const offset = Math.max(0, Math.min(Number(focusSpec.offset) || 0, value.length));
      focusMarkdownEditor(state, elements, { preventScroll: true });
      setMarkdownEditorSelection(state, elements, offset, offset);
    }
  });
}
