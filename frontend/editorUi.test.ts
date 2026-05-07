// @vitest-environment jsdom

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { EditorView } from "@codemirror/view";

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
  return quotePrefix + (listMatch ? listMatch[0].length : 0);
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
      expect(firstLine?.querySelector("a.cm-md-link")?.getAttribute("href")).toBe("https://example.com/reference");
      expect(firstLine?.innerHTML || "").toContain("cm-md-html-sub");
      expect(firstLine?.innerHTML || "").toContain("cm-md-html-kbd");
      expect(firstLine?.innerHTML || "").toContain("cm-md-math-inline");
      expect(firstLine?.textContent || "").not.toContain("<sub>");
      expect(renderedLineElement(editor.view, 3)?.textContent || "").toBe("");
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

      const outerPrefix = renderedLineElement(editor.view, 1)?.querySelector(".cm-md-quote-prefix") as HTMLElement | null;
      const nestedPrefix = renderedLineElement(editor.view, 2)?.querySelector(".cm-md-quote-prefix") as HTMLElement | null;
      const thirdLevelPrefix = renderedLineElement(editor.view, 3)?.querySelector(".cm-md-quote-prefix") as HTMLElement | null;
      expect(outerPrefix).toBeTruthy();
      expect(outerPrefix?.style.getPropertyValue("--quote-prefix-width")).toBe("1.24rem");
      expect(outerPrefix?.style.getPropertyValue("--quote-stride-width")).toBe("1.24rem");
      expect(nestedPrefix?.style.getPropertyValue("--quote-prefix-width")).toBe("2.48rem");
      expect(nestedPrefix?.style.getPropertyValue("--quote-stride-width")).toBe("1.24rem");
      expect(thirdLevelPrefix?.style.getPropertyValue("--quote-prefix-width")).toBe("3.7199999999999998rem");
      expect(thirdLevelPrefix?.style.getPropertyValue("--quote-stride-width")).toBe("1.24rem");
      expect(renderedLineElement(editor.view, 2)?.textContent || "").toBe("Nested quote");
      expect(renderedLineElement(editor.view, 3)?.textContent || "").toBe("Third level");
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
