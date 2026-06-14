// @vitest-environment jsdom

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { EditorView } from "@codemirror/view";

import {
  markdownAbbreviationDefinitionMatch,
  markdownDefinitionListPrefixMatch,
  markdownFootnoteDefinitionMatch,
} from "./markdownExtensions";
import { renderedTaskRawColumn, renderedTaskVisibleColumn, taskPrefixLength } from "./taskNavigation";
import type { NoteriousEditorApi, TaskRender } from "./types";

const originalCanvasGetContext = HTMLCanvasElement.prototype.getContext;
const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
const originalResizeObserver = globalThis.ResizeObserver;
let consoleErrorSpy: ReturnType<typeof vi.spyOn> | null = null;

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

interface MountedEditor {
  api: NoteriousEditorApi;
  view: EditorView;
  destroy(): void;
}

interface MountedEditorInScrollShell extends MountedEditor {
  shell: HTMLDivElement;
}

interface KeyPressOptions {
  shiftKey?: boolean;
}

beforeAll(async function () {
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    configurable: true,
    value: function (): CanvasRenderingContext2D {
      return {
        font: "",
        measureText(text: string): TextMetrics {
          return { width: String(text || "").length * 8 } as TextMetrics;
        },
      } as CanvasRenderingContext2D;
    },
  });
  HTMLElement.prototype.scrollIntoView = function (): void {};
  Object.assign(globalThis, {
    ResizeObserver: ResizeObserverStub,
  });

  await import("./editor");
});

beforeEach(function () {
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(function () {});
});

afterEach(function () {
  consoleErrorSpy?.mockRestore();
  consoleErrorSpy = null;
  document.body.innerHTML = "";
});

afterAll(function () {
  HTMLCanvasElement.prototype.getContext = originalCanvasGetContext;
  HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
  Object.assign(globalThis, {
    ResizeObserver: originalResizeObserver,
  });
});

function createTask(line: number, text: string, fields?: Partial<TaskRender>): TaskRender {
  return {
    ref: "notes/today:" + String(line),
    line,
    text,
    done: false,
    due: "",
    remind: "",
    who: [],
    ...fields,
  };
}

function mountEditor(markdown: string, tasks: TaskRender[] = []): MountedEditor {
  document.body.innerHTML = '<div id="host"><textarea id="markdown-editor"></textarea></div>';
  const textarea = document.getElementById("markdown-editor") as HTMLTextAreaElement | null;
  if (!textarea) {
    throw new Error("missing textarea");
  }
  textarea.value = markdown;

  const api = window.NoteriousCodeEditor?.create(textarea) || null;
  if (!api) {
    throw new Error("editor failed to mount");
  }

  api.setPagePath("notes/today");
  api.setTasks(tasks);
  api.setEditable(true);

  const view = api.view as EditorView;
  return {
    api,
    view,
    destroy() {
      view.destroy();
    },
  };
}

function mountEditorInScrollShell(markdown: string, tasks: TaskRender[] = []): MountedEditorInScrollShell {
  document.body.innerHTML = '<div id="shell" style="height: 120px; overflow: auto;"><div style="height: 640px;"><div id="host"><textarea id="markdown-editor"></textarea></div></div></div>';
  const shell = document.getElementById("shell") as HTMLDivElement | null;
  const textarea = document.getElementById("markdown-editor") as HTMLTextAreaElement | null;
  if (!shell || !textarea) {
    throw new Error("missing scroll shell");
  }
  textarea.value = markdown;

  const api = window.NoteriousCodeEditor?.create(textarea) || null;
  if (!api) {
    throw new Error("editor failed to mount");
  }

  api.setPagePath("notes/today");
  api.setTasks(tasks);
  api.setEditable(true);

  const view = api.view as EditorView;
  return {
    api,
    view,
    shell,
    destroy() {
      view.destroy();
    },
  };
}

function renderedVisiblePrefixLength(text: string): number {
  const taskPrefix = taskPrefixLength(text);
  if (taskPrefix) {
    return taskPrefix;
  }
  const headingMatch = String(text || "").match(/^(#{1,6})(\s+)/);
  if (headingMatch) {
    return headingMatch[0].length;
  }
  const quoteMatch = String(text || "").match(/^((?: {0,3}>\s*)+)/);
  const quotePrefix = quoteMatch ? quoteMatch[0].length : 0;
  const listMatch = String(text || "").slice(quotePrefix).match(/^(\s*)([-+*])(\s+)|^(\s*)(\d+)([.)])(\s+)/);
  let prefixLength = quotePrefix + (listMatch ? listMatch[0].length : 0);
  const footnoteDefinition = markdownFootnoteDefinitionMatch(text, prefixLength);
  if (footnoteDefinition && footnoteDefinition.prefixLength) {
    return prefixLength + footnoteDefinition.prefixLength;
  }
  const abbreviationDefinition = markdownAbbreviationDefinitionMatch(text, prefixLength);
  if (abbreviationDefinition && abbreviationDefinition.prefixLength) {
    return prefixLength + abbreviationDefinition.prefixLength;
  }
  const definitionPrefix = markdownDefinitionListPrefixMatch(text, prefixLength);
  return prefixLength + (definitionPrefix ? definitionPrefix.prefixLength : 0);
}

function lineColumn(view: EditorView): { lineNumber: number; column: number } {
  const selection = view.state.selection.main;
  const line = view.state.doc.lineAt(selection.head);
  let column = selection.head - line.from;
  const visiblePrefix = renderedVisiblePrefixLength(line.text);
  if (column === 0 && selection.assoc > 0 && visiblePrefix > 0) {
    column = visiblePrefix;
  }
  return {
    lineNumber: line.number,
    column,
  };
}

function setCursor(view: EditorView, lineNumber: number, column: number): void {
  const line = view.state.doc.line(lineNumber);
  view.dispatch({
    selection: {
      anchor: Math.max(line.from, Math.min(line.from + column, line.to)),
    },
  });
}

function renderedLineElement(view: EditorView, lineNumber: number): HTMLElement | null {
  const lines = Array.from(view.contentDOM.querySelectorAll(".cm-line"));
  const target = lines[lineNumber - 1] || null;
  return target instanceof HTMLElement ? target : null;
}

function lineColumnAt(view: EditorView, position: number, assoc = 0): { lineNumber: number; column: number } {
  const line = view.state.doc.lineAt(position);
  let column = position - line.from;
  const visiblePrefix = renderedVisiblePrefixLength(line.text);
  if (column === 0 && assoc > 0 && visiblePrefix > 0) {
    column = visiblePrefix;
  }
  return {
    lineNumber: line.number,
    column,
  };
}

function selectionLineColumns(view: EditorView): { anchor: { lineNumber: number; column: number }; head: { lineNumber: number; column: number } } {
  const selection = view.state.selection.main;
  return {
    anchor: lineColumnAt(view, selection.anchor),
    head: lineColumnAt(view, selection.head, selection.assoc),
  };
}

function pressKey(view: EditorView, key: string, options: KeyPressOptions = {}): boolean {
  view.focus();
  const target = view.contentDOM;
  const event = new window.KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    shiftKey: Boolean(options.shiftKey),
  });
  target.dispatchEvent(event);
  return event.defaultPrevented;
}

function expectArrow(view: EditorView, key: string, lineNumber: number, column: number, options: KeyPressOptions = {}): void {
  expect(pressKey(view, key, options)).toBe(true);
  const line = view.state.doc.line(lineNumber);
  expect(lineColumn(view)).toEqual({
    lineNumber,
    column: Math.min(column, line.length),
  });
}

describe("mounted editor UI", function () {
  it("exposes undo and redo through the editor API", function () {
    const editor = mountEditor("Alpha");

    try {
      expect(editor.api.canUndo()).toBe(false);
      expect(editor.api.canRedo()).toBe(false);

      editor.api.replaceRange(5, 5, " beta");

      expect(editor.api.getValue()).toBe("Alpha beta");
      expect(editor.api.canUndo()).toBe(true);
      expect(editor.api.canRedo()).toBe(false);

      expect(editor.api.undo()).toBe(true);
      expect(editor.api.getValue()).toBe("Alpha");
      expect(editor.api.canUndo()).toBe(false);
      expect(editor.api.canRedo()).toBe(true);

      expect(editor.api.redo()).toBe(true);
      expect(editor.api.getValue()).toBe("Alpha beta");
    } finally {
      editor.destroy();
    }
  });

  it("does not add undo history when syncing an external value", function () {
    const editor = mountEditor("Alpha");

    try {
      expect(editor.api.canUndo()).toBe(false);

      editor.api.syncValue("Alpha beta");

      expect(editor.api.getValue()).toBe("Alpha beta");
      expect(editor.api.canUndo()).toBe(false);
      expect(editor.api.undo()).toBe(false);
      expect(editor.api.getValue()).toBe("Alpha beta");
    } finally {
      editor.destroy();
    }
  });

  it("does not add undo history when syncing an external range", function () {
    const editor = mountEditor("- [ ] Task");

    try {
      expect(editor.api.canUndo()).toBe(false);

      editor.api.syncReplaceRange(3, 4, "x");

      expect(editor.api.getValue()).toBe("- [x] Task");
      expect(editor.api.canUndo()).toBe(false);
      expect(editor.api.undo()).toBe(false);
      expect(editor.api.getValue()).toBe("- [x] Task");
    } finally {
      editor.destroy();
    }
  });

  it("preserves scrollable ancestor position when focusing with preventScroll", function () {
    const editor = mountEditorInScrollShell("- [ ] Task", [createTask(1, "Task")]);
    const focusSpy = vi.spyOn(window, "requestAnimationFrame").mockImplementation(function (callback: FrameRequestCallback): number {
      callback(0);
      return 1;
    });

    try {
      editor.shell.scrollTop = 186;
      const originalFocus = editor.view.focus;
      (editor.view as EditorView & { focus: () => void }).focus = function (): void {
        editor.shell.scrollTop = 0;
        originalFocus.call(editor.view);
      };

      editor.api.focus({preventScroll: true});

      expect(editor.shell.scrollTop).toBe(186);
    } finally {
      focusSpy.mockRestore();
      editor.destroy();
    }
  });

  it("clamps render-mode selection out of frontmatter and blank safe space", function () {
    const markdown = [
      "---",
      "title: Today",
      "tags:",
      "  - work",
      "---",
      "",
      "# Today",
      "",
      "Body",
    ].join("\n");
    const editor = mountEditor(markdown);

    try {
      const firstBodyLine = editor.view.state.doc.line(7);
      editor.api.setSelectionRange(0, 0);
      editor.api.setRenderMode(true);

      expect(editor.api.getSelectionStart()).toBe(firstBodyLine.from + 2);
      expect(lineColumn(editor.view)).toEqual({
        lineNumber: 7,
        column: 2,
      });
    } finally {
      editor.destroy();
    }
  });

  it("preserves visible task columns across task lines with inline metadata", function () {
    const markdown = [
      "- [ ] Alpha [due: 2026-05-01]",
      "- [ ] Beta [remind: 09:00]",
      "Paragraph",
    ].join("\n");
    const editor = mountEditor(markdown, [
      createTask(1, "Alpha", { due: "2026-05-01" }),
      createTask(2, "Beta", { remind: "09:00" }),
    ]);

    try {
      editor.api.setRenderMode(true);
      setCursor(editor.view, 1, 11);
      const currentLine = editor.view.state.doc.line(1);
      const targetLine = editor.view.state.doc.line(2);
      const visibleColumn = renderedTaskVisibleColumn(currentLine.text, 11);

      expect(pressKey(editor.view, "ArrowDown")).toBe(true);
      expect(lineColumn(editor.view)).toEqual({
        lineNumber: 2,
        column: renderedTaskRawColumn(targetLine.text, visibleColumn),
      });
    } finally {
      editor.destroy();
    }
  });

  it("moves upward from below a rendered table to the table end line", function () {
    const markdown = [
      "Intro",
      "| Name | Value |",
      "| --- | --- |",
      "| Alpha | 1 |",
      "Outro",
    ].join("\n");
    const editor = mountEditor(markdown);

    try {
      editor.api.setRenderMode(true);
      setCursor(editor.view, 5, 0);

      expectArrow(editor.view, "ArrowUp", 4, 0);
    } finally {
      editor.destroy();
    }
  });

  it("extends selection upward from below a rendered table to the table end line", function () {
    const markdown = [
      "Intro",
      "| Name | Value |",
      "| --- | --- |",
      "| Alpha | 1 |",
      "Outro",
    ].join("\n");
    const editor = mountEditor(markdown);

    try {
      editor.api.setRenderMode(true);
      setCursor(editor.view, 5, 0);

      expect(pressKey(editor.view, "ArrowUp", {shiftKey: true})).toBe(true);
      expect(selectionLineColumns(editor.view)).toEqual({
        anchor: {lineNumber: 5, column: 0},
        head: {lineNumber: 4, column: 0},
      });
    } finally {
      editor.destroy();
    }
  });

  it("moves downward from above a rendered table to the table start line", function () {
    const markdown = [
      "Intro",
      "| Name | Value |",
      "| --- | --- |",
      "| Alpha | 1 |",
      "Outro",
    ].join("\n");
    const editor = mountEditor(markdown);

    try {
      editor.api.setRenderMode(true);
      setCursor(editor.view, 1, 0);

      expectArrow(editor.view, "ArrowDown", 2, 0);
    } finally {
      editor.destroy();
    }
  });

  it("does not skip blank lines adjacent to rendered tables", function () {
    const markdown = [
      "Above",
      "",
      "| Name | Value |",
      "| --- | --- |",
      "| Alpha | 1 |",
      "",
      "Below",
    ].join("\n");
    const editor = mountEditor(markdown);

    try {
      editor.api.setRenderMode(true);
      setCursor(editor.view, 1, 0);
      expectArrow(editor.view, "ArrowDown", 2, 0);
      expectArrow(editor.view, "ArrowDown", 3, 0);

      setCursor(editor.view, 7, 0);
      expectArrow(editor.view, "ArrowUp", 6, 0);
      expectArrow(editor.view, "ArrowUp", 5, 0);
    } finally {
      editor.destroy();
    }
  });

  it("renders aligned markdown tables as full-width widgets with left, center, and right cell alignment", function () {
    const markdown = [
      "### Aligned Table",
      "",
      "| Left Aligned | Center Aligned | Right Aligned |",
      "| :----------- | :------------: | ------------: |",
      "| Row 1 | Data | $100 |",
      "| Row 2 | Data | $20 |",
      "| Row 3 | Data | $3,000 |",
      "",
      "Tail",
    ].join("\n");
    const editor = mountEditor(markdown);

    try {
      editor.api.setSelectionRange(markdown.length, markdown.length);
      editor.api.setRenderMode(true);

      const widget = editor.view.contentDOM.querySelector(".cm-md-table-block") as HTMLElement | null;
      const block = editor.view.contentDOM.querySelector(".markdown-table-block") as HTMLElement | null;
      const cells = Array.from(editor.view.contentDOM.querySelectorAll(".markdown-table-block th, .markdown-table-block td")) as HTMLElement[];

      expect(widget).toBeTruthy();
      expect(block).toBeTruthy();
      expect(window.getComputedStyle(widget as HTMLElement).display).toBe("block");
      expect((widget as HTMLElement).style.paddingTop).toBe("0.4rem");
      expect((widget as HTMLElement).style.paddingBottom).toBe("0.7rem");
      expect((block as HTMLElement).style.marginTop).toBe("0px");
      expect((block as HTMLElement).style.marginBottom).toBe("0px");
      expect(cells.map((cell) => window.getComputedStyle(cell).textAlign)).toEqual([
        "left",
        "center",
        "right",
        "left",
        "center",
        "right",
        "left",
        "center",
        "right",
        "left",
        "center",
        "right",
      ]);
    } finally {
      editor.destroy();
    }
  });

  it("re-enters a rendered code block from the adjacent line", function () {
    const markdown = [
      "Intro",
      "```ts",
      "const alpha = 1;",
      "console.log(alpha);",
      "```",
      "Outro",
    ].join("\n");
    const editor = mountEditor(markdown);

    try {
      editor.api.setRenderMode(true);
      setCursor(editor.view, 1, 0);

      const codeStartLine = renderedLineElement(editor.view, 2);
      expect(Number.parseFloat(window.getComputedStyle(codeStartLine as HTMLElement).marginTop || "0")).toBe(0);

      expect(pressKey(editor.view, "ArrowDown")).toBe(true);
      expect(lineColumn(editor.view)).toEqual({
        lineNumber: 2,
        column: 0,
      });
    } finally {
      editor.destroy();
    }
  });

  it("re-enters a rendered code block from below at the last content line", function () {
    const markdown = [
      "Intro",
      "```ts",
      "const alpha = 1;",
      "console.log(alpha);",
      "```",
      "Outro",
    ].join("\n");
    const editor = mountEditor(markdown);

    try {
      editor.api.setRenderMode(true);
      setCursor(editor.view, 6, 0);

      expectArrow(editor.view, "ArrowUp", 4, 0);
    } finally {
      editor.destroy();
    }
  });

  it("extends selection upward into a rendered code block at the last content line", function () {
    const markdown = [
      "Intro",
      "```ts",
      "const alpha = 1;",
      "console.log(alpha);",
      "```",
      "Outro",
    ].join("\n");
    const editor = mountEditor(markdown);

    try {
      editor.api.setRenderMode(true);
      setCursor(editor.view, 6, 0);

      expect(pressKey(editor.view, "ArrowUp", {shiftKey: true})).toBe(true);
      expect(selectionLineColumns(editor.view)).toEqual({
        anchor: {lineNumber: 6, column: 0},
        head: {lineNumber: 4, column: 0},
      });
    } finally {
      editor.destroy();
    }
  });

  it("keeps long code blocks expanded when the preference is enabled", function () {
    const markdown = [
      "Intro",
      "```ts",
      "const line1 = 1;",
      "const line2 = 2;",
      "const line3 = 3;",
      "const line4 = 4;",
      "const line5 = 5;",
      "const line6 = 6;",
      "const line7 = 7;",
      "const line8 = 8;",
      "const line9 = 9;",
      "const line10 = 10;",
      "const line11 = 11;",
      "const line12 = 12;",
      "const line13 = 13;",
      "const line14 = 14;",
      "```",
      "Outro",
    ].join("\n");
    const editor = mountEditor(markdown);

    try {
      editor.api.setRenderMode(true);

      expect(editor.view.contentDOM.querySelectorAll(".cm-md-code-block-hidden").length).toBeGreaterThan(0);
      expect(editor.view.contentDOM.querySelector(".cm-md-code-toggle")).not.toBeNull();

      editor.api.setCodeBlocksAlwaysExpanded(true);

      expect(editor.view.contentDOM.querySelectorAll(".cm-md-code-block-hidden")).toHaveLength(0);
      expect(editor.view.contentDOM.querySelector(".cm-md-code-toggle")).toBeNull();
    } finally {
      editor.destroy();
    }
  });

  it("keeps query blocks rendered in view-only mode even when the caret enters the fence", function () {
    const markdown = [
      "Intro",
      "```query",
      "tag: today",
      "```",
      "Outro",
    ].join("\n");
    const editor = mountEditor(markdown);

    try {
      editor.api.setQueryBlocks([{
        source: "```query\ntag: today\n```",
        html: '<div class="embedded-query"><div class="query-result">Alpha</div></div>',
      }]);
      editor.api.setRenderMode(true);
      setCursor(editor.view, 3, 0);

      expect(editor.view.contentDOM.querySelector(".cm-md-query-block")).toBeNull();

      editor.api.setViewOnly(true);

      expect(editor.view.contentDOM.querySelector(".cm-md-query-block")).toBeTruthy();
      expect(editor.view.contentDOM.querySelector("[data-query-edit]")).toBeNull();
      expect(Number.parseFloat(window.getComputedStyle(editor.view.contentDOM.querySelector(".cm-md-query-block") as HTMLElement).marginBottom || "0")).toBe(0);
    } finally {
      editor.destroy();
    }
  });

  it("keeps code copy available but removes code collapse controls in view-only mode", function () {
    const markdown = [
      "```ts",
      "const line01 = 1;",
      "const line02 = 2;",
      "const line03 = 3;",
      "const line04 = 4;",
      "const line05 = 5;",
      "const line06 = 6;",
      "const line07 = 7;",
      "const line08 = 8;",
      "const line09 = 9;",
      "const line10 = 10;",
      "const line11 = 11;",
      "const line12 = 12;",
      "const line13 = 13;",
      "```",
    ].join("\n");
    const editor = mountEditor(markdown);

    try {
      editor.api.setRenderMode(true);
      editor.api.setViewOnly(true);

      expect(editor.view.contentDOM.querySelector("[data-code-copy]")).toBeTruthy();
      expect(editor.view.contentDOM.querySelector("[data-code-toggle]")).toBeNull();
    } finally {
      editor.destroy();
    }
  });

  it("renders parser-backed inline emphasis and autolinks on non-editing lines", function () {
    const markdown = [
      "**Bold** and _italic_ and https://example.com",
      "Second",
    ].join("\n");
    const editor = mountEditor(markdown);

    try {
      editor.api.setRenderMode(true);
      setCursor(editor.view, 2, 0);

      const firstLine = renderedLineElement(editor.view, 1);
      expect(firstLine?.innerHTML || "").toContain("cm-md-bold");
      expect(firstLine?.innerHTML || "").toContain("cm-md-italic");
      expect(firstLine?.querySelector("a.cm-md-link")?.getAttribute("href")).toBe("https://example.com");
    } finally {
      editor.destroy();
    }
  });

  it("renders reference links, inline html, and inline math on non-editing lines", function () {
    const markdown = [
      "Use [this one][ref-link], <sub>2</sub>, <kbd>Ctrl</kbd>, and $E = mc^2$.",
      "",
      "[ref-link]: https://example.com/reference",
      "Tail",
    ].join("\n");
    const editor = mountEditor(markdown);

    try {
      editor.api.setRenderMode(true);
      setCursor(editor.view, 4, 0);

      const firstLine = renderedLineElement(editor.view, 1);
      const referenceSection = editor.view.contentDOM.querySelector(".cm-md-reference-definitions-details") as HTMLDetailsElement | null;
      const referenceJump = editor.view.contentDOM.querySelector("[data-reference-jump]") as HTMLElement | null;
      const visibleLines = Array.from(editor.view.contentDOM.querySelectorAll(".cm-line")).map(function (line) {
        return line.textContent || "";
      });
      expect(firstLine?.querySelector("[data-external-link]")?.getAttribute("data-external-link")).toBe("https://example.com/reference");
      expect(firstLine?.innerHTML || "").toContain("cm-md-html-sub");
      expect(firstLine?.innerHTML || "").toContain("cm-md-html-kbd");
      expect(firstLine?.innerHTML || "").toContain("cm-md-math-inline");
      expect(firstLine?.textContent || "").not.toContain("<sub>");
      expect(visibleLines.some(function (text) {
        return text.indexOf("[ref-link]: https://example.com/reference") >= 0;
      })).toBe(false);
      expect(referenceSection).toBeTruthy();
      expect(referenceSection?.open).toBe(false);
      expect(referenceSection?.textContent || "").toContain("[ref-link]");
      expect(referenceJump).toBeTruthy();

      referenceJump?.dispatchEvent(new window.MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
      }));

      expect(lineColumn(editor.view)).toEqual({
        lineNumber: 3,
        column: 0,
      });
      expect(renderedLineElement(editor.view, 3)?.textContent || "").toContain("[ref-link]: https://example.com/reference");
    } finally {
      editor.destroy();
    }
  });

  it("reveals raw reference-style links as soon as the cursor enters them", function () {
    const markdown = "Use [this one][ref-link] today\n\n[ref-link]: https://example.com/reference";
    const editor = mountEditor(markdown);

    try {
      editor.api.setRenderMode(true);

      const line = editor.view.state.doc.line(1);
      const linkStart = line.text.indexOf("[");
      const linkEnd = line.text.indexOf("]") + "[ref-link]".length + 1;
      const labelEnd = line.text.indexOf("]");

      expect(renderedLineElement(editor.view, 1)?.querySelector("[data-external-link]")).toBeTruthy();

      setCursor(editor.view, 1, linkStart);
      expect(pressKey(editor.view, "ArrowRight")).toBe(true);
      expect(lineColumn(editor.view)).toEqual({
        lineNumber: 1,
        column: linkStart + 1,
      });
      expect(renderedLineElement(editor.view, 1)?.textContent || "").toContain("[this one][ref-link]");
      expect(renderedLineElement(editor.view, 1)?.querySelector("[data-external-link]")).toBeNull();

      editor.api.setRenderMode(true);
      setCursor(editor.view, 1, linkEnd);
      expect(pressKey(editor.view, "ArrowLeft")).toBe(true);
      expect(lineColumn(editor.view)).toEqual({
        lineNumber: 1,
        column: labelEnd,
      });
      expect(renderedLineElement(editor.view, 1)?.textContent || "").toContain("[this one][ref-link]");
      expect(renderedLineElement(editor.view, 1)?.querySelector("[data-external-link]")).toBeNull();
    } finally {
      editor.destroy();
    }
  });

  it("dispatches a context menu event for rendered reference-style links", function () {
    const markdown = "Use [this one][ref-link] today\n\n[ref-link]: https://example.com/reference";
    const editor = mountEditor(markdown);
    const openSpy = vi.spyOn(window, "open").mockImplementation(function () {
      return null as Window | null;
    });

    try {
      editor.api.setRenderMode(true);

      let detail: Record<string, unknown> | null = null;
      editor.api.host.addEventListener("noterious:reference-link-contextmenu", function (event) {
        detail = {...((event as CustomEvent<Record<string, unknown>>).detail || {})};
      });

      const link = renderedLineElement(editor.view, 1)?.querySelector("[data-external-link][data-reference-definition-offset]") as HTMLElement | null;
      expect(link).toBeTruthy();

      link?.dispatchEvent(new window.MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
        button: 2,
      }));
      expect(openSpy).not.toHaveBeenCalled();

      link?.dispatchEvent(new window.MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        button: 2,
        clientX: 84,
        clientY: 112,
      }));

      expect(detail).toEqual({
        page: "",
        documentHref: "",
        externalHref: "https://example.com/reference",
        definitionOffset: String(markdown.indexOf("[ref-link]:")),
        left: 84,
        top: 112,
      });
    } finally {
      openSpy.mockRestore();
      editor.destroy();
    }
  });

  it("jumps to reference definitions through the editor API", function () {
    const markdown = "Use [this one][ref-link] today\n\n[ref-link]: https://example.com/reference";
    const editor = mountEditor(markdown);

    try {
      editor.api.setRenderMode(true);
      setCursor(editor.view, 1, 0);

      editor.api.jumpToOffset(markdown.indexOf("[ref-link]:"));

      expect(lineColumn(editor.view)).toEqual({
        lineNumber: 3,
        column: 0,
      });
      expect(renderedLineElement(editor.view, 3)?.textContent || "").toContain("[ref-link]: https://example.com/reference");
    } finally {
      editor.destroy();
    }
  });

  it("renders markdown document and image links with spaced targets on non-editing lines", function () {
    const markdown = [
      "[Quarterly Report](Docs/Quarterly Report.pdf)",
      "![Quarterly Chart](Assets/Quarterly Chart.png)",
      "Tail",
    ].join("\n");
    const editor = mountEditor(markdown);

    try {
      editor.api.setRenderMode(true);
      setCursor(editor.view, 3, 0);

      const linkLine = renderedLineElement(editor.view, 1);
      const imageLine = renderedLineElement(editor.view, 2);
      const imageLink = imageLine?.querySelector(".cm-md-image-link") as HTMLElement | null;

      expect(linkLine?.querySelector(".cm-md-link")?.getAttribute("data-document-download")).toBe(
        "/api/documents/download?path=notes%2FDocs%2FQuarterly%20Report.pdf"
      );
      expect(imageLine?.querySelector("img.cm-md-image")?.getAttribute("src")).toBe(
        "/api/documents/download?path=notes%2FAssets%2FQuarterly%20Chart.png&inline=1"
      );
      expect(Number.parseFloat(window.getComputedStyle(imageLink as HTMLElement).marginTop || "0")).toBe(0);
      expect(Number.parseFloat(window.getComputedStyle(imageLink as HTMLElement).marginBottom || "0")).toBe(0);
    } finally {
      editor.destroy();
    }
  });

  it("reveals raw markdown document links as soon as the cursor enters them", function () {
    const markdown = "See [Quarterly Report](Docs/Quarterly Report.pdf) today";
    const editor = mountEditor(markdown);

    try {
      editor.api.setRenderMode(true);

      const line = editor.view.state.doc.line(1);
      const linkStart = line.text.indexOf("[");
      const linkEnd = line.text.indexOf(")") + 1;
      const labelEnd = line.text.indexOf("](");

      expect(renderedLineElement(editor.view, 1)?.querySelector("[data-document-download]")).toBeTruthy();

      setCursor(editor.view, 1, linkStart);
      expect(pressKey(editor.view, "ArrowRight")).toBe(true);
      expect(lineColumn(editor.view)).toEqual({
        lineNumber: 1,
        column: linkStart + 1,
      });
      expect(renderedLineElement(editor.view, 1)?.textContent || "").toContain("[Quarterly Report](Docs/Quarterly Report.pdf)");
      expect(renderedLineElement(editor.view, 1)?.querySelector("[data-document-download]")).toBeNull();
      expect(pressKey(editor.view, "ArrowRight")).toBe(true);
      expect(lineColumn(editor.view)).toEqual({
        lineNumber: 1,
        column: linkStart + 2,
      });

      editor.api.setRenderMode(true);
      setCursor(editor.view, 1, linkEnd);
      expect(pressKey(editor.view, "ArrowLeft")).toBe(true);
      expect(lineColumn(editor.view)).toEqual({
        lineNumber: 1,
        column: labelEnd,
      });
      expect(renderedLineElement(editor.view, 1)?.textContent || "").toContain("[Quarterly Report](Docs/Quarterly Report.pdf)");
      expect(renderedLineElement(editor.view, 1)?.querySelector("[data-document-download]")).toBeNull();
      expect(pressKey(editor.view, "ArrowLeft")).toBe(true);
      expect(lineColumn(editor.view)).toEqual({
        lineNumber: 1,
        column: labelEnd - 1,
      });
    } finally {
      editor.destroy();
    }
  });

  it("reveals raw wiki links as soon as the cursor enters them", function () {
    const markdown = "See [[Projects/Quarterly Report|Quarterly Report]] today";
    const editor = mountEditor(markdown);

    try {
      editor.api.setRenderMode(true);

      const line = editor.view.state.doc.line(1);
      const linkStart = line.text.indexOf("[[");
      const linkEnd = line.text.indexOf("]]") + 2;
      const labelStart = line.text.indexOf("Quarterly Report]]");
      const labelEnd = line.text.indexOf("]]");

      expect(renderedLineElement(editor.view, 1)?.querySelector(".cm-md-link")?.getAttribute("data-page-link")).toBe(
        "Projects/Quarterly Report"
      );

      setCursor(editor.view, 1, linkStart);
      expect(pressKey(editor.view, "ArrowRight")).toBe(true);
      expect(lineColumn(editor.view)).toEqual({
        lineNumber: 1,
        column: labelStart,
      });
      expect(renderedLineElement(editor.view, 1)?.textContent || "").toContain("[[Projects/Quarterly Report|Quarterly Report]]");
      expect(renderedLineElement(editor.view, 1)?.querySelector("[data-page-link]")).toBeNull();
      expect(pressKey(editor.view, "ArrowRight")).toBe(true);
      expect(lineColumn(editor.view)).toEqual({
        lineNumber: 1,
        column: labelStart + 1,
      });

      editor.api.setRenderMode(true);
      setCursor(editor.view, 1, linkEnd);
      expect(pressKey(editor.view, "ArrowLeft")).toBe(true);
      expect(lineColumn(editor.view)).toEqual({
        lineNumber: 1,
        column: labelEnd,
      });
      expect(renderedLineElement(editor.view, 1)?.textContent || "").toContain("[[Projects/Quarterly Report|Quarterly Report]]");
      expect(renderedLineElement(editor.view, 1)?.querySelector("[data-page-link]")).toBeNull();
      expect(pressKey(editor.view, "ArrowLeft")).toBe(true);
      expect(lineColumn(editor.view)).toEqual({
        lineNumber: 1,
        column: labelEnd - 1,
      });
    } finally {
      editor.destroy();
    }
  });

  it("hides escape markers on non-editing lines", function () {
    const markdown = [
      "Escaped \\*stars\\* and \\\\ slash",
      "Second",
    ].join("\n");
    const editor = mountEditor(markdown);

    try {
      editor.api.setRenderMode(true);
      setCursor(editor.view, 2, 0);

      expect(renderedLineElement(editor.view, 1)?.textContent).toContain("Escaped *stars* and \\ slash");
    } finally {
      editor.destroy();
    }
  });

  it("renders footnotes, abbreviations, emoji, and markdown sub/sup syntax on non-editing lines", function () {
    const markdown = [
      "Here is a sentence with a footnote[^1], another[^note], and HTML.",
      "",
      "[^1]: This is the first footnote.",
      "[^note]: This is the named footnote.",
      "",
      "*[HTML]: Hyper Text Markup Language",
      "The HTML spec launches :rocket: with H~2~O and 2^10^ power.",
      "Tail",
    ].join("\n");
    const editor = mountEditor(markdown);

    try {
      editor.api.setRenderMode(true);
      setCursor(editor.view, 8, 0);

      const firstLine = renderedLineElement(editor.view, 1);
      const firstFootnoteRef = firstLine?.querySelector(".cm-md-footnote-ref") as HTMLElement | null;
      const secondFootnoteRef = firstLine?.querySelectorAll(".cm-md-footnote-ref")[1] as HTMLElement | undefined;
      const footnoteLine = renderedLineElement(editor.view, 3);
      const abbreviationLine = renderedLineElement(editor.view, 6);
      const contentLine = renderedLineElement(editor.view, 7);

      expect(firstFootnoteRef?.textContent).toBe("1");
      expect(secondFootnoteRef?.textContent).toBe("note");
      expect(firstLine?.textContent || "").not.toContain("[^1]");
      expect(footnoteLine?.querySelector(".cm-md-footnote-label")?.textContent).toBe("1");
      expect(footnoteLine?.textContent || "").not.toContain("[^1]:");
      expect(abbreviationLine?.querySelector(".cm-md-abbr-definition-chip")?.textContent).toBe("HTML");
      expect(abbreviationLine?.textContent || "").not.toContain("*[HTML]:");
      expect(contentLine?.querySelector(".cm-md-abbr")?.getAttribute("title")).toBe("Hyper Text Markup Language");
      expect(contentLine?.querySelector(".cm-md-emoji")?.textContent).toBe("🚀");
      expect(contentLine?.innerHTML || "").toContain("cm-md-subscript");
      expect(contentLine?.innerHTML || "").toContain("cm-md-superscript");
    } finally {
      editor.destroy();
    }
  });

  it("renders definition lists without raw colon prefixes", function () {
    const markdown = [
      "Term 1",
      ": Definition for term 1.",
      "",
      "Term 2",
      ": First definition for term 2.",
      ": Second definition for term 2.",
      "Tail",
    ].join("\n");
    const editor = mountEditor(markdown);

    try {
      editor.api.setRenderMode(true);
      setCursor(editor.view, 7, 0);

      expect(renderedLineElement(editor.view, 1)?.className || "").toContain("cm-md-definition-term");
      expect(renderedLineElement(editor.view, 2)?.querySelector(".cm-md-definition-marker")).toBeTruthy();
      expect(renderedLineElement(editor.view, 2)?.textContent || "").not.toContain(": Definition");
      expect(renderedLineElement(editor.view, 4)?.className || "").toContain("cm-md-definition-term");
      expect(renderedLineElement(editor.view, 5)?.querySelector(".cm-md-definition-marker")).toBeTruthy();
      expect(renderedLineElement(editor.view, 6)?.querySelector(".cm-md-definition-marker")).toBeTruthy();
    } finally {
      editor.destroy();
    }
  });

  it("treats definition-style prefixes as hidden home positions", function () {
    const markdown = [
      "[^1]: Footnote body",
      "*[HTML]: Hyper Text Markup Language",
      "Term",
      ": Definition body",
      "Tail",
    ].join("\n");
    const editor = mountEditor(markdown);

    try {
      editor.api.setRenderMode(true);

      setCursor(editor.view, 1, editor.view.state.doc.line(1).length);
      expectArrow(editor.view, "Home", 1, 6);

      setCursor(editor.view, 2, editor.view.state.doc.line(2).length);
      expectArrow(editor.view, "Home", 2, 9);

      setCursor(editor.view, 4, editor.view.state.doc.line(4).length);
      expectArrow(editor.view, "Home", 4, 2);
    } finally {
      editor.destroy();
    }
  });

  it("renders nested blockquotes without raw quote markers", function () {
    const markdown = [
      "> Outer quote",
      "> > Nested quote",
      "> > > Third level",
      "Tail",
    ].join("\n");
    const editor = mountEditor(markdown);

    try {
      editor.api.setRenderMode(true);
      setCursor(editor.view, 4, 0);

      const outerLine = renderedLineElement(editor.view, 1) as HTMLElement | null;
      const nestedLine = renderedLineElement(editor.view, 2) as HTMLElement | null;
      const thirdLevelLine = renderedLineElement(editor.view, 3) as HTMLElement | null;
      expect(outerLine?.className || "").toContain("cm-md-quote");
      expect(nestedLine?.className || "").toContain("cm-md-quote");
      expect(thirdLevelLine?.className || "").toContain("cm-md-quote");
      expect(outerLine?.style.getPropertyValue("--quote-depth")).toBe("1");
      expect(outerLine?.style.getPropertyValue("--quote-gutter-width")).toBe("0.72rem");
      expect(outerLine?.style.getPropertyValue("--quote-step-width")).toBe("0.72rem");
      expect(outerLine?.style.getPropertyValue("--quote-top-gap")).toBe("0.14em");
      expect(outerLine?.style.getPropertyValue("--quote-bottom-gap")).toBe("0");
      expect(nestedLine?.style.getPropertyValue("--quote-depth")).toBe("2");
      expect(nestedLine?.style.getPropertyValue("--quote-gutter-width")).toBe("1.44rem");
      expect(nestedLine?.style.getPropertyValue("--quote-step-width")).toBe("0.72rem");
      expect(nestedLine?.style.getPropertyValue("--quote-top-gap")).toBe("0");
      expect(nestedLine?.style.getPropertyValue("--quote-bottom-gap")).toBe("0");
      expect(thirdLevelLine?.style.getPropertyValue("--quote-depth")).toBe("3");
      expect(thirdLevelLine?.style.getPropertyValue("--quote-gutter-width")).toBe("2.16rem");
      expect(thirdLevelLine?.style.getPropertyValue("--quote-step-width")).toBe("0.72rem");
      expect(thirdLevelLine?.style.getPropertyValue("--quote-top-gap")).toBe("0");
      expect(thirdLevelLine?.style.getPropertyValue("--quote-bottom-gap")).toBe("0.14em");
      expect(nestedLine?.textContent || "").toBe("Nested quote");
      expect(thirdLevelLine?.textContent || "").toBe("Third level");
    } finally {
      editor.destroy();
    }
  });

  it("renders simple html block lines without raw tags", function () {
    const markdown = [
      "<details>",
      "<summary>Click to expand</summary>",
      "",
      "<dl>",
      "<dt>Definition Term</dt>",
      "<dd>Definition description.</dd>",
      "</dl>",
      "</details>",
      "Tail",
    ].join("\n");
    const editor = mountEditor(markdown);

    try {
      editor.api.setRenderMode(true);
      setCursor(editor.view, 9, 0);

      expect(renderedLineElement(editor.view, 1)?.textContent || "").toBe("");
      expect(renderedLineElement(editor.view, 2)?.textContent || "").toContain("Click to expand");
      expect(renderedLineElement(editor.view, 5)?.textContent || "").toBe("Definition Term");
      expect(renderedLineElement(editor.view, 6)?.textContent || "").toContain("Definition description.");
      expect(renderedLineElement(editor.view, 8)?.textContent || "").toBe("");
    } finally {
      editor.destroy();
    }
  });

  it("renders math fence blocks without raw dollar delimiters", function () {
    const markdown = [
      "Block math:",
      "$$",
      "\\frac{n!}{k!(n-k)!} = \\binom{n}{k}",
      "$$",
      "Tail",
    ].join("\n");
    const editor = mountEditor(markdown);

    try {
      editor.api.setRenderMode(true);
      setCursor(editor.view, 5, 0);

      expect(renderedLineElement(editor.view, 2)?.textContent || "").toBe("");
      expect(renderedLineElement(editor.view, 3)?.className || "").toContain("cm-md-math-block-body");
      expect(renderedLineElement(editor.view, 3)?.textContent || "").toContain("\\frac{n!}{k!(n-k)!} = \\binom{n}{k}");
      expect(renderedLineElement(editor.view, 4)?.textContent || "").toBe("");
    } finally {
      editor.destroy();
    }
  });

  it("renders unordered and ordered list markers on non-editing lines", function () {
    const markdown = [
      "- Alpha item",
      "  - Nested item",
      "12. Bravo item",
      "   7. Nested ordered item",
      "Charlie",
    ].join("\n");
    const editor = mountEditor(markdown);

    try {
      editor.api.setRenderMode(true);
      setCursor(editor.view, 5, 0);

      const bulletLine = renderedLineElement(editor.view, 1);
      const nestedBulletLine = renderedLineElement(editor.view, 2);
      const topLevelOrderedLine = renderedLineElement(editor.view, 3);
      const nestedOrderedLine = renderedLineElement(editor.view, 4);
      const bulletMarker = bulletLine?.querySelector(".cm-md-list-marker") as HTMLElement | null;
      const nestedBulletMarker = nestedBulletLine?.querySelector(".cm-md-list-marker") as HTMLElement | null;
      const orderedMarker = topLevelOrderedLine?.querySelector(".cm-md-list-marker-ordered") as HTMLElement | null;
      const nestedOrderedMarker = nestedOrderedLine?.querySelector(".cm-md-list-marker-ordered") as HTMLElement | null;

      expect(bulletMarker?.textContent).toBe("•");
      expect(bulletMarker?.style.getPropertyValue("--list-indent-width")).toBe("0rem");
      expect(nestedBulletMarker?.textContent).toBe("•");
      expect(nestedBulletMarker?.style.getPropertyValue("--list-indent-width")).toBe("1.24rem");
      expect(orderedMarker?.textContent).toBe("12.");
      expect(orderedMarker?.style.getPropertyValue("--list-indent-width")).toBe("0rem");
      expect(nestedOrderedMarker?.textContent).toBe("7.");
      expect(nestedOrderedMarker?.style.getPropertyValue("--list-indent-width")).toBe("1.8599999999999999rem");
    } finally {
      editor.destroy();
    }
  });

  it("renders thematic breaks on non-editing lines", function () {
    const markdown = [
      "Alpha",
      "---",
      "Bravo",
    ].join("\n");
    const editor = mountEditor(markdown);

    try {
      editor.api.setRenderMode(true);
      setCursor(editor.view, 3, 0);

      expect(renderedLineElement(editor.view, 2)?.querySelector(".cm-md-rule")).toBeTruthy();
    } finally {
      editor.destroy();
    }
  });

  it("round-trips visible columns across task lines with inline metadata", function () {
    const markdown = [
      "- [ ] Alpha [due: 2026-05-01]",
      "- [ ] Bravo [remind: 09:00]",
    ].join("\n");
    const editor = mountEditor(markdown, [
      createTask(1, "Alpha", { due: "2026-05-01" }),
      createTask(2, "Bravo", { remind: "09:00" }),
    ]);

    try {
      editor.api.setRenderMode(true);
      const firstLine = editor.view.state.doc.line(1);
      const secondLine = editor.view.state.doc.line(2);
      const maxVisible = Math.min(
        renderedTaskVisibleColumn(firstLine.text, firstLine.length),
        renderedTaskVisibleColumn(secondLine.text, secondLine.length)
      );

      for (let visibleColumn = 0; visibleColumn <= maxVisible; visibleColumn += 1) {
        const startColumn = renderedTaskRawColumn(firstLine.text, visibleColumn);
        const targetColumn = renderedTaskRawColumn(secondLine.text, visibleColumn);

        setCursor(editor.view, 1, startColumn);
        expectArrow(editor.view, "ArrowDown", 2, targetColumn);
        expectArrow(editor.view, "ArrowUp", 1, startColumn);
      }
    } finally {
      editor.destroy();
    }
  });

  it("round-trips visible columns between plain text and a rendered task line", function () {
    const markdown = [
      "Bravo task line stays long enough",
      "- [ ] Bravo task line stays long enough [remind: 09:00]",
    ].join("\n");
    const editor = mountEditor(markdown, [
      createTask(2, "Bravo task line stays long enough", { remind: "09:00" }),
    ]);

    try {
      editor.api.setRenderMode(true);
      const plainLine = editor.view.state.doc.line(1);
      const taskLine = editor.view.state.doc.line(2);

      const maxVisible = Math.min(
        plainLine.length,
        renderedTaskVisibleColumn(taskLine.text, taskLine.length)
      );

      for (let visibleColumn = 0; visibleColumn <= maxVisible; visibleColumn += 1) {
        const targetColumn = renderedTaskRawColumn(taskLine.text, visibleColumn);

        setCursor(editor.view, 1, visibleColumn);
        expectArrow(editor.view, "ArrowDown", 2, targetColumn);
        expectArrow(editor.view, "ArrowUp", 1, visibleColumn);
      }
    } finally {
      editor.destroy();
    }
  });

  it("round-trips visible columns between plain text and a task line without inline metadata", function () {
    const markdown = [
      "Plain task line stays long enough",
      "- [ ] Plain task line stays long enough",
    ].join("\n");
    const editor = mountEditor(markdown, [
      createTask(2, "Plain task line stays long enough"),
    ]);

    try {
      editor.api.setRenderMode(true);
      const plainLine = editor.view.state.doc.line(1);
      const taskLine = editor.view.state.doc.line(2);
      const maxVisible = Math.min(
        plainLine.length,
        renderedTaskVisibleColumn(taskLine.text, taskLine.length)
      );

      for (let visibleColumn = 0; visibleColumn <= maxVisible; visibleColumn += 1) {
        const targetColumn = renderedTaskRawColumn(taskLine.text, visibleColumn);

        setCursor(editor.view, 1, visibleColumn);
        expectArrow(editor.view, "ArrowDown", 2, targetColumn);
        expectArrow(editor.view, "ArrowUp", 1, visibleColumn);
      }
    } finally {
      editor.destroy();
    }
  });

  it("treats the visible task text start as the horizontal home position", function () {
    const markdown = [
      "Alpha",
      "- [ ] Bravo task",
      "Charlie",
    ].join("\n");
    const editor = mountEditor(markdown, [
      createTask(2, "Bravo task"),
    ]);

    try {
      editor.api.setRenderMode(true);
      setCursor(editor.view, 2, taskPrefixLength("- [ ] Bravo task") + 4);

      expectArrow(editor.view, "Home", 2, taskPrefixLength("- [ ] Bravo task"));
    } finally {
      editor.destroy();
    }
  });

  it("moves left from the visible start of a task line to the previous line end", function () {
    const markdown = [
      "Alpha",
      "- [ ] Bravo task",
      "Charlie",
    ].join("\n");
    const editor = mountEditor(markdown, [
      createTask(2, "Bravo task"),
    ]);

    try {
      editor.api.setRenderMode(true);
      setCursor(editor.view, 2, taskPrefixLength("- [ ] Bravo task"));

      expectArrow(editor.view, "ArrowLeft", 1, editor.view.state.doc.line(1).length);
      expectArrow(editor.view, "ArrowRight", 2, taskPrefixLength("- [ ] Bravo task"));
    } finally {
      editor.destroy();
    }
  });

  it("treats the visible quote text start as the horizontal home position", function () {
    const markdown = [
      "Alpha",
      "> Bravo quote",
      "Charlie",
    ].join("\n");
    const editor = mountEditor(markdown);

    try {
      editor.api.setRenderMode(true);
      setCursor(editor.view, 2, 6);

      expectArrow(editor.view, "Home", 2, 2);
    } finally {
      editor.destroy();
    }
  });

  it("keeps render-mode home and end on the current line boundaries", function () {
    const markdown = [
      "Alpha",
      "> - Bravo list",
      "Charlie",
    ].join("\n");
    const editor = mountEditor(markdown);

    try {
      editor.api.setRenderMode(true);
      setCursor(editor.view, 2, 10);

      expectArrow(editor.view, "Home", 2, 4);
      expectArrow(editor.view, "Home", 2, 4);
      expectArrow(editor.view, "End", 2, editor.view.state.doc.line(2).length);
      expectArrow(editor.view, "End", 2, editor.view.state.doc.line(2).length);
    } finally {
      editor.destroy();
    }
  });

  it("moves across hidden quote prefixes without trapping the caret", function () {
    const markdown = [
      "Alpha",
      "> Bravo quote",
      "Charlie",
    ].join("\n");
    const editor = mountEditor(markdown);

    try {
      editor.api.setRenderMode(true);
      setCursor(editor.view, 2, 2);

      expectArrow(editor.view, "ArrowLeft", 1, editor.view.state.doc.line(1).length);
      expectArrow(editor.view, "ArrowRight", 2, 2);
    } finally {
      editor.destroy();
    }
  });

  it("moves across hidden list prefixes without trapping the caret", function () {
    const markdown = [
      "Alpha",
      "- Bravo list",
      "Charlie",
    ].join("\n");
    const editor = mountEditor(markdown);

    try {
      editor.api.setRenderMode(true);
      setCursor(editor.view, 2, 2);

      expectArrow(editor.view, "ArrowLeft", 1, editor.view.state.doc.line(1).length);
      expectArrow(editor.view, "ArrowRight", 2, 2);
    } finally {
      editor.destroy();
    }
  });

  it("clamps task-prefix selections when entering render mode", function () {
    const markdown = [
      "Alpha",
      "- [ ] Bravo task",
      "Charlie",
    ].join("\n");
    const editor = mountEditor(markdown, [
      createTask(2, "Bravo task"),
    ]);

    try {
      const taskLine = editor.view.state.doc.line(2);
      const taskStart = taskLine.from + taskPrefixLength(taskLine.text);

      editor.api.setSelectionRange(taskLine.from, taskLine.from);
      editor.api.setRenderMode(true);

      expect(editor.api.getSelectionStart()).toBe(taskStart);
      expect(editor.api.getSelectionEnd()).toBe(taskStart);
      expect(lineColumn(editor.view)).toEqual({
        lineNumber: 2,
        column: taskPrefixLength(taskLine.text),
      });
    } finally {
      editor.destroy();
    }
  });

  it("clamps hidden quote-prefix selections set while already in render mode", function () {
    const markdown = [
      "Alpha",
      "> Bravo quote",
      "Charlie",
    ].join("\n");
    const editor = mountEditor(markdown);

    try {
      const quoteLine = editor.view.state.doc.line(2);
      const quoteStart = quoteLine.from + 2;

      editor.api.setRenderMode(true);
      editor.api.setSelectionRange(quoteLine.from, quoteLine.from);

      expect(editor.api.getSelectionStart()).toBe(quoteStart);
      expect(editor.api.getSelectionEnd()).toBe(quoteStart);
      expect(lineColumn(editor.view)).toEqual({
        lineNumber: 2,
        column: 2,
      });
    } finally {
      editor.destroy();
    }
  });

  it("clamps combined quote and list prefixes while already in render mode", function () {
    const markdown = [
      "Alpha",
      "> - Bravo list",
      "Charlie",
    ].join("\n");
    const editor = mountEditor(markdown);

    try {
      const listLine = editor.view.state.doc.line(2);
      const visibleStart = listLine.from + 4;

      editor.api.setRenderMode(true);
      editor.api.setSelectionRange(listLine.from, listLine.from);

      expect(editor.api.getSelectionStart()).toBe(visibleStart);
      expect(editor.api.getSelectionEnd()).toBe(visibleStart);
      expect(lineColumn(editor.view)).toEqual({
        lineNumber: 2,
        column: 4,
      });
    } finally {
      editor.destroy();
    }
  });

  it("walks upward through rendered image content into the nearest table from the bottom", function () {
    const markdown = [
      "### Simple Table",
      "",
      "| Name       | Language   | Stars |",
      "| ---------- | ---------- | ----: |",
      "| Linux      | C          | 170k  |",
      "| React      | JavaScript |  220k |",
      "| Rust       | Rust       |  90k  |",
      "",
      "### Aligned Table",
      "",
      "| Left Aligned | Center Aligned | Right Aligned |",
      "| :----------- | :------------: | ------------: |",
      "| Row 1        |    Data        |         $100  |",
      "| Row 2        |    Data        |          $20  |",
      "| Row 3        |    Data        |       $3,000  |",
      "",
      "## Images",
      "",
      "![bear-2.jpg](bear-2.jpg)",
      "[foobar](https://example.com)",
    ].join("\n");
    const editor = mountEditor(markdown);

    try {
      editor.api.setRenderMode(true);
      setCursor(editor.view, 20, editor.view.state.doc.line(20).length);

      expectArrow(editor.view, "ArrowUp", 19, editor.view.state.doc.line(19).length);
      expectArrow(editor.view, "ArrowUp", 18, 0);
      expectArrow(editor.view, "ArrowUp", 17, 3);
      expectArrow(editor.view, "ArrowUp", 16, 0);
      expectArrow(editor.view, "ArrowUp", 15, 0);
    } finally {
      editor.destroy();
    }
  });

});
