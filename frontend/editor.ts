import {EditorSelection, EditorState, StateEffect, StateField, RangeSetBuilder, Transaction} from "@codemirror/state";
import {EditorView, keymap, drawSelection, highlightActiveLine, Decoration, type DecorationSet, WidgetType} from "@codemirror/view";
import {defaultKeymap, indentWithTab, history, historyKeymap} from "@codemirror/commands";
import {markdown} from "@codemirror/lang-markdown";
import {LanguageDescription, HighlightStyle, syntaxHighlighting} from "@codemirror/language";
import {javascript} from "@codemirror/lang-javascript";
import {json} from "@codemirror/lang-json";
import {css} from "@codemirror/lang-css";
import {html} from "@codemirror/lang-html";
import {python} from "@codemirror/lang-python";
import {go} from "@codemirror/lang-go";
import {yaml} from "@codemirror/lang-yaml";
import {sql} from "@codemirror/lang-sql";
import {tags} from "@lezer/highlight";
import { formatDateTimeValue, formatDateValue, normalizeDateTimeDisplayFormat, setDateTimeDisplayFormat } from "./datetime";
import { pageTitleFromPath } from "./commands";
import { documentDownloadURL, documentPathLeaf, inlineDocumentURL, isImagePath, resolveDocumentPath } from "./documents";
import { markdownCodeFenceBlockAt, markdownTableBlockAt, renderedBodyBoundaryStart, splitFrontmatter } from "./markdown";
import { renderedTaskRawColumn, renderedTaskVisibleColumn, taskLineHasInlineDate } from "./taskNavigation";
import type { NoteriousEditorApi, QueryBlockRender, TaskRender } from "./types";

interface EditorTaskState {
  ref: string;
  text: string;
  done: boolean;
  due: string;
  remind: string;
  who: string[];
}


const measureCanvas = document.createElement("canvas");
const measureContext = measureCanvas.getContext("2d");

function bindTransientScrollClass(element: HTMLElement, className: string): void {
  let clearTimer = 0;
  element.addEventListener("scroll", function () {
    element.classList.add(className);
    if (clearTimer) {
      window.clearTimeout(clearTimer);
    }
    clearTimer = window.setTimeout(function () {
      element.classList.remove(className);
    }, 650);
  }, {passive: true});
}

function measuredTextWidth(text: string, element: HTMLElement): number {
  const source = String(text || "").replace(/\t/g, "  ");
  if (!measureContext) {
    return source.length * 8;
  }
  const style = window.getComputedStyle(element);
  measureContext.font = style.font || [
    style.fontStyle,
    style.fontVariant,
    style.fontWeight,
    style.fontSize,
    style.fontFamily,
  ].filter(Boolean).join(" ");
  return measureContext.measureText(source).width;
}

function syncTextareaValue(textarea: HTMLTextAreaElement, value: string): void {
  textarea.value = value;
  textarea.dispatchEvent(new Event("input", {bubbles: true}));
}

function setTextareaValue(textarea: HTMLTextAreaElement, value: string): void {
  textarea.value = value;
}

const setRenderModeEffect = StateEffect.define<boolean>();
const setQueryBlocksEffect = StateEffect.define<Map<string, string>>();
const setTasksEffect = StateEffect.define<Map<number, EditorTaskState>>();
const setPagePathEffect = StateEffect.define<string>();
const setHighlightedLineEffect = StateEffect.define<number | null>();
const taskInlineDatePattern = /\[(due|remind):\s*[^\]]+?\]|\b(due|remind)::\s*[^\s]+(?:\s+\d{2}:\d{2})?/g;

const codeLanguages = [
  LanguageDescription.of({name: "JavaScript", alias: ["js", "javascript"], extensions: ["js", "mjs", "cjs"], support: javascript()}),
  LanguageDescription.of({name: "TypeScript", alias: ["ts", "typescript"], extensions: ["ts", "tsx"], support: javascript({typescript: true})}),
  LanguageDescription.of({name: "JSON", alias: ["json"], extensions: ["json"], support: json()}),
  LanguageDescription.of({name: "CSS", alias: ["css"], extensions: ["css"], support: css()}),
  LanguageDescription.of({name: "HTML", alias: ["html"], extensions: ["html", "htm"], support: html()}),
  LanguageDescription.of({name: "Python", alias: ["py", "python"], extensions: ["py"], support: python()}),
  LanguageDescription.of({name: "Go", alias: ["go", "golang"], extensions: ["go"], support: go()}),
  LanguageDescription.of({name: "YAML", alias: ["yaml", "yml"], extensions: ["yaml", "yml"], support: yaml()}),
  LanguageDescription.of({name: "SQL", alias: ["sql"], extensions: ["sql"], support: sql()}),
];

const themedHighlight = HighlightStyle.define([
  {tag: tags.keyword, color: "color-mix(in srgb, var(--accent) 72%, var(--ink))"},
  {tag: [tags.name, tags.deleted, tags.character, tags.propertyName, tags.macroName], color: "color-mix(in srgb, var(--accent) 62%, var(--muted))"},
  {tag: [tags.variableName], color: "var(--accent)"},
  {tag: [tags.function(tags.variableName), tags.labelName], color: "var(--accent)"},
  {tag: [tags.color, tags.constant(tags.name), tags.standard(tags.name)], color: "color-mix(in srgb, var(--warn) 70%, var(--accent))"},
  {tag: [tags.definition(tags.name), tags.separator], color: "color-mix(in srgb, var(--accent) 62%, var(--muted))"},
  {tag: [tags.brace, tags.squareBracket, tags.angleBracket], color: "color-mix(in srgb, var(--muted) 84%, var(--ink))"},
  {tag: [tags.number, tags.changed, tags.annotation, tags.modifier, tags.self, tags.namespace], color: "color-mix(in srgb, var(--accent) 54%, var(--warn))"},
  {tag: [tags.typeName, tags.className], color: "color-mix(in srgb, var(--accent) 58%, var(--ink))"},
  {tag: [tags.operator, tags.operatorKeyword], color: "color-mix(in srgb, var(--accent) 72%, var(--muted))"},
  {tag: [tags.tagName, tags.attributeName], color: "var(--accent)"},
  {tag: [tags.special(tags.variableName), tags.special(tags.string)], color: "color-mix(in srgb, var(--accent) 82%, var(--ink))"},
  {tag: [tags.regexp, tags.escape, tags.link, tags.url], color: "color-mix(in srgb, var(--accent) 82%, var(--ink))"},
  {tag: [tags.meta, tags.comment], color: "var(--muted)", fontStyle: "italic"},
  {tag: [tags.strong], fontWeight: "700", color: "color-mix(in srgb, var(--ink) 92%, white 8%)"},
  {tag: [tags.emphasis], fontStyle: "italic", color: "color-mix(in srgb, var(--ink) 88%, var(--muted))"},
  {tag: [tags.strikethrough], textDecoration: "line-through"},
  {tag: [tags.atom, tags.bool, tags.special(tags.brace)], color: "color-mix(in srgb, var(--warn) 62%, var(--accent))"},
  {tag: [tags.processingInstruction, tags.string, tags.inserted], color: "color-mix(in srgb, var(--accent) 78%, var(--ink))"},
  {tag: [tags.invalid], color: "var(--warn)"},
]);

class WikiLinkWidget extends WidgetType {
  target: string;
  label: string;

  constructor(target: string, label: string) {
    super();
    this.target = target;
    this.label = label;
  }

  eq(other: WikiLinkWidget): boolean {
    return other.target === this.target && other.label === this.label;
  }

  toDOM(): HTMLButtonElement {
    const link = document.createElement("button");
    link.type = "button";
    link.className = "cm-md-link";
    link.setAttribute("data-page-link", this.target);
    link.textContent = this.label;
    return link;
  }

  ignoreEvent() {
    return false;
  }
}

class MarkdownLinkWidget extends WidgetType {
  href: string;
  label: string;

  constructor(href: string, label: string) {
    super();
    this.href = href;
    this.label = label;
  }

  eq(other: MarkdownLinkWidget): boolean {
    return other.href === this.href && other.label === this.label;
  }

  toDOM(): HTMLButtonElement {
    const link = document.createElement("button");
    link.type = "button";
    link.className = "cm-md-link";
    link.setAttribute("data-document-download", this.href);
    link.textContent = this.label;
    return link;
  }

  ignoreEvent() {
    return false;
  }
}

class MarkdownImageWidget extends WidgetType {
  href: string;
  src: string;
  alt: string;

  constructor(href: string, src: string, alt: string) {
    super();
    this.href = href;
    this.src = src;
    this.alt = alt;
  }

  eq(other: MarkdownImageWidget): boolean {
    return other.href === this.href && other.src === this.src && other.alt === this.alt;
  }

  toDOM(): HTMLAnchorElement {
    const link = document.createElement("a");
    link.className = "cm-md-image-link";
    link.href = this.href;
    link.target = "_blank";
    link.rel = "noopener";

    const image = document.createElement("img");
    image.className = "cm-md-image";
    image.src = this.src;
    image.alt = this.alt;
    image.loading = "lazy";

    link.appendChild(image);
    return link;
  }

  ignoreEvent() {
    return false;
  }
}

class ExternalLinkWidget extends WidgetType {
  href: string;
  label: string;

  constructor(href: string, label: string) {
    super();
    this.href = href;
    this.label = label;
  }

  eq(other: ExternalLinkWidget): boolean {
    return other.href === this.href && other.label === this.label;
  }

  toDOM(): HTMLAnchorElement {
    const link = document.createElement("a");
    link.className = "cm-md-link";
    link.href = this.href;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = this.label;
    return link;
  }

  ignoreEvent() {
    return false;
  }
}

class CodeToolbarWidget extends WidgetType {
  content: string;
  language: string;

  constructor(content: string, language: string) {
    super();
    this.content = content;
    this.language = language;
  }

  eq(other: CodeToolbarWidget): boolean {
    return other.content === this.content && other.language === this.language;
  }

  toDOM(): HTMLSpanElement {
    const toolbar = document.createElement("span");
    toolbar.className = "cm-md-code-toolbar";

    const language = document.createElement("span");
    language.className = "cm-md-code-language";
    language.textContent = this.language || "plain text";
    toolbar.appendChild(language);

    const copyButton = document.createElement("button");
    copyButton.type = "button";
    copyButton.className = "cm-md-code-copy";
    copyButton.setAttribute("data-code-copy", encodeURIComponent(this.content));
    copyButton.textContent = "Copy";
    toolbar.appendChild(copyButton);

    return toolbar;
  }

  ignoreEvent() {
    return false;
  }
}

class TaskCheckboxWidget extends WidgetType {
  done: boolean;
  ref: string;
  indent: number;

  constructor(done: boolean, ref?: string, indent?: number) {
    super();
    this.done = done;
    this.ref = ref || "";
    this.indent = Math.max(0, Number(indent) || 0);
  }

  eq(other: TaskCheckboxWidget): boolean {
    return other.done === this.done && other.ref === this.ref && other.indent === this.indent;
  }

  toDOM(): HTMLSpanElement {
    const toggle = document.createElement("span");
    toggle.className = "cm-md-task-toggle";
    toggle.setAttribute("data-task-toggle", "true");
    toggle.setAttribute("data-done", this.done ? "true" : "false");
    toggle.style.setProperty("--task-indent", String(this.indent * 0.62) + "rem");
    if (this.ref) {
      toggle.setAttribute("data-task-ref", this.ref);
    }
    toggle.setAttribute("role", "checkbox");
    toggle.setAttribute("tabindex", "0");
    toggle.setAttribute("aria-checked", this.done ? "true" : "false");
    toggle.setAttribute("aria-label", this.done ? "Mark task incomplete" : "Mark task complete");

    const box = document.createElement("input");
    box.type = "checkbox";
    box.className = "cm-md-task-toggle-box";
    box.checked = this.done;
    box.tabIndex = -1;
    box.setAttribute("aria-hidden", "true");
    toggle.appendChild(box);

    return toggle;
  }

  ignoreEvent() {
    return false;
  }
}

class TaskMetaWidget extends WidgetType {
  task: EditorTaskState;

  constructor(task: EditorTaskState) {
    super();
    this.task = task;
  }

  eq(other: TaskMetaWidget): boolean {
    return JSON.stringify(other.task) === JSON.stringify(this.task);
  }

  toDOM(): HTMLSpanElement {
    const meta = document.createElement("span");
    meta.className = "cm-md-task-meta";

    if (this.task.who && this.task.who.length) {
      const pill = document.createElement("span");
      pill.className = "token";
      pill.textContent = this.task.who.join(", ");
      meta.appendChild(pill);
    }
    return meta;
  }

  ignoreEvent() {
    return false;
  }
}

class QueryBlockWidget extends WidgetType {
  html: string;
  editLineNumber: number;

  constructor(html: string, editLineNumber: number) {
    super();
    this.html = html;
    this.editLineNumber = editLineNumber;
  }

  eq(other: QueryBlockWidget): boolean {
    return other.html === this.html && other.editLineNumber === this.editLineNumber;
  }

  toDOM(): HTMLDivElement {
    const wrapper = document.createElement("div");
    wrapper.className = "cm-md-query-block";

    const toolbar = document.createElement("div");
    toolbar.className = "cm-md-query-toolbar";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "cm-md-query-edit";
    button.setAttribute("data-query-edit", String(this.editLineNumber));
    button.textContent = "Edit Query";
    toolbar.appendChild(button);

    const content = document.createElement("div");
    content.className = "cm-md-query-content";
    content.innerHTML = this.html;

    wrapper.appendChild(toolbar);
    wrapper.appendChild(content);
    return wrapper;
  }

  ignoreEvent() {
    return false;
  }
}

class MarkdownTableWidget extends WidgetType {
  html: string;

  constructor(html: string) {
    super();
    this.html = html;
  }

  eq(other: MarkdownTableWidget): boolean {
    return other.html === this.html;
  }

  toDOM(): HTMLDivElement {
    const wrapper = document.createElement("div");
    wrapper.className = "cm-md-table-block";
    wrapper.innerHTML = this.html;
    wrapper.addEventListener("click", function (event) {
      const target = event.target instanceof HTMLElement ? event.target : null;
      const cell = target ? target.closest("[data-table-cell]") : null;
      if (cell) {
        event.preventDefault();
        const tableBlock = cell.closest(".markdown-table-block");
        const rect = (tableBlock instanceof HTMLElement ? tableBlock : cell).getBoundingClientRect();
        cell.dispatchEvent(new CustomEvent("noterious:table-open", {
          bubbles: true,
          detail: {
            startLine: cell.getAttribute("data-table-start-line") || "",
            row: cell.getAttribute("data-table-row") || "",
            col: cell.getAttribute("data-table-col") || "",
            left: String(Math.round(rect.left)),
            top: String(Math.round(rect.top)),
            width: String(Math.round(rect.width)),
          },
        }));
        return;
      }
    });
    return wrapper;
  }

  ignoreEvent() {
    return true;
  }
}

const queryBlocksField = StateField.define<Map<string, string>>({
  create() {
    return new Map<string, string>();
  },
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setQueryBlocksEffect)) {
        return effect.value;
      }
    }
    return value;
  },
});

const tasksField = StateField.define<Map<number, EditorTaskState>>({
  create() {
    return new Map<number, EditorTaskState>();
  },
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setTasksEffect)) {
        return effect.value;
      }
    }
    return value;
  },
});

const highlightedLineField = StateField.define<number | null>({
  create() {
    return null;
  },
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setHighlightedLineEffect)) {
        const next = Number(effect.value);
        if (!Number.isFinite(next) || next <= 0) {
          return null;
        }
        return Math.floor(next);
      }
    }
    if (value !== null && transaction.selection) {
      const currentLine = transaction.state.doc.lineAt(transaction.state.selection.main.head).number;
      if (currentLine !== value) {
        return null;
      }
    }
    return value;
  },
});

const highlightedLineDecorationsField = StateField.define<DecorationSet>({
  create(state) {
    const highlightedLine = state.field(highlightedLineField);
    if (highlightedLine === null || highlightedLine < 1 || highlightedLine > state.doc.lines) {
      return Decoration.none;
    }
    const line = state.doc.line(highlightedLine);
    const builder = new RangeSetBuilder<Decoration>();
    builder.add(line.from, line.from, Decoration.line({class: "cm-search-hit-line"}));
    return builder.finish();
  },
  update(value, transaction) {
    const lineChanged = transaction.startState.field(highlightedLineField) !== transaction.state.field(highlightedLineField);
    if (!lineChanged && !transaction.docChanged) {
      return value;
    }
    const highlightedLine = transaction.state.field(highlightedLineField);
    if (highlightedLine === null || highlightedLine < 1 || highlightedLine > transaction.state.doc.lines) {
      return Decoration.none;
    }
    const line = transaction.state.doc.line(highlightedLine);
    const builder = new RangeSetBuilder<Decoration>();
    builder.add(line.from, line.from, Decoration.line({class: "cm-search-hit-line"}));
    return builder.finish();
  },
  provide: (field) => EditorView.decorations.from(field),
});

function clearSearchHitHighlight(view: EditorView): void {
  const highlightedLine = view.state.field(highlightedLineField, false);
  if (typeof highlightedLine === "number" && highlightedLine > 0) {
    view.dispatch({
      effects: setHighlightedLineEffect.of(null),
    });
  }
}

function codeBlockEndingAtLine(lines: string[], endLineIndex: number) {
  for (let index = Math.max(0, endLineIndex); index >= 0; index -= 1) {
    const block = markdownCodeFenceBlockAt(lines, index);
    if (block && block.endLineIndex === endLineIndex) {
      return block;
    }
  }
  return null;
}

function tableBlockEndingAtLine(lines: string[], endLineIndex: number) {
  for (let index = Math.max(0, endLineIndex); index >= 0; index -= 1) {
    const block = markdownTableBlockAt(lines, index);
    if (block && block.endLineIndex === endLineIndex) {
      return block;
    }
  }
  return null;
}

function renderedBodyStartOffset(state: EditorState): number {
  if (!state.field(renderModeField, false)) {
    return 0;
  }
  return renderedBodyBoundaryStart(state.doc.toString());
}

function clampSelectionToOffset(selection: EditorSelection, minOffset: number): EditorSelection {
  if (minOffset <= 0) {
    return selection;
  }
  const ranges = selection.ranges.map(function (range) {
    const anchor = Math.max(minOffset, range.anchor);
    const head = Math.max(minOffset, range.head);
    if (anchor === head) {
      return EditorSelection.cursor(
        anchor,
        anchor === minOffset ? 1 : range.assoc,
        range.bidiLevel === null ? undefined : range.bidiLevel,
        range.goalColumn
      );
    }
    return EditorSelection.range(
      anchor,
      head,
      range.goalColumn,
      range.bidiLevel === null ? undefined : range.bidiLevel,
      head === minOffset ? 1 : range.assoc
    );
  });
  return EditorSelection.create(ranges, selection.mainIndex);
}

function changesTouchProtectedRange(transaction: Transaction, protectedUntil: number): boolean {
  if (!transaction.docChanged || protectedUntil <= 0) {
    return false;
  }
  let touched = false;
  transaction.changes.iterChangedRanges(function (fromA, toA) {
    if (fromA < protectedUntil || toA < protectedUntil) {
      touched = true;
    }
  });
  return touched;
}

function revealRenderedCodeBlockByArrow(view: EditorView, key: string): boolean {
  if (!view.state.field(renderModeField, false)) {
    return false;
  }

  const selection = view.state.selection.main;
  if (!selection.empty) {
    return false;
  }

  const currentLine = view.state.doc.lineAt(selection.head);
  const column = Math.max(0, selection.head - currentLine.from);
  const lines = view.state.doc.toString().split("\n");

  if (key === "ArrowDown") {
    if (currentLine.number >= view.state.doc.lines) {
      return false;
    }
    const block = markdownCodeFenceBlockAt(lines, currentLine.number);
    if (!block) {
      return false;
    }
    const targetLine = view.state.doc.line(block.startLineIndex + 1);
    view.dispatch({
      selection: {
        anchor: Math.min(targetLine.from + column, targetLine.to),
      },
      scrollIntoView: true,
    });
    return true;
  }

  if (key === "ArrowUp") {
    if (currentLine.number <= 1) {
      return false;
    }
    const block = codeBlockEndingAtLine(lines, currentLine.number - 2);
    if (!block) {
      return false;
    }
    const targetLine = view.state.doc.line(block.endLineIndex + 1);
    view.dispatch({
      selection: {
        anchor: Math.min(targetLine.from + column, targetLine.to),
      },
      scrollIntoView: true,
    });
    return true;
  }

  return false;
}

function moveCursorToLine(view: EditorView, lineNumber: number): boolean {
  if (lineNumber < 1 || lineNumber > view.state.doc.lines) {
    return false;
  }
  const selection = view.state.selection.main;
  const currentLine = view.state.doc.lineAt(selection.head);
  const column = Math.max(0, selection.head - currentLine.from);
  const targetLine = view.state.doc.line(lineNumber);
  view.dispatch({
    selection: {
      anchor: Math.min(targetLine.from + column, targetLine.to),
    },
    scrollIntoView: true,
  });
  return true;
}

function handleRenderedTableArrowUp(view: EditorView): boolean {
  if (!view.state.field(renderModeField, false)) {
    return false;
  }

  const selection = view.state.selection.main;
  if (!selection.empty) {
    return false;
  }

  const currentLine = view.state.doc.lineAt(selection.head);
  const lines = view.state.doc.toString().split("\n");
  if (currentLine.number <= 1) {
    return false;
  }

  const tableEndingOnPreviousLine = tableBlockEndingAtLine(lines, currentLine.number - 2);
  if (tableEndingOnPreviousLine) {
    return moveCursorToLine(view, tableEndingOnPreviousLine.startLineIndex);
  }

  const tableEndingTwoLinesAbove = tableBlockEndingAtLine(lines, currentLine.number - 3);
  if (tableEndingTwoLinesAbove) {
    return moveCursorToLine(view, currentLine.number - 1);
  }

  return false;
}

function handleRenderedTaskArrow(view: EditorView, key: "ArrowUp" | "ArrowDown"): boolean {
  if (!view.state.field(renderModeField, false)) {
    return false;
  }

  const selection = view.state.selection.main;
  if (!selection.empty) {
    return false;
  }

  const currentLine = view.state.doc.lineAt(selection.head);
  const targetLineNumber = key === "ArrowDown" ? currentLine.number + 1 : currentLine.number - 1;
  if (targetLineNumber < 1 || targetLineNumber > view.state.doc.lines) {
    return false;
  }

  const targetLine = view.state.doc.line(targetLineNumber);
  if (!taskLineHasInlineDate(currentLine.text) && !taskLineHasInlineDate(targetLine.text)) {
    return false;
  }

  const rawColumn = Math.max(0, selection.head - currentLine.from);
  const visibleColumn = renderedTaskVisibleColumn(currentLine.text, rawColumn);
  const targetRawColumn = renderedTaskRawColumn(targetLine.text, visibleColumn);
  view.dispatch({
    selection: {
      anchor: Math.min(targetLine.from + targetRawColumn, targetLine.to),
    },
    scrollIntoView: true,
  });
  return true;
}

interface InlineDeco {
  from: number;
  to: number;
  deco: Decoration;
  atomic?: boolean;
}

interface RenderedDecorationSets {
  decorations: DecorationSet;
  atomicRanges: DecorationSet;
}

const atomicRangeDecoration = Decoration.mark({});

function addAtomicRange(builder: RangeSetBuilder<Decoration>, from: number, to: number): void {
  if (to > from) {
    builder.add(from, to, atomicRangeDecoration);
  }
}

function inlineDecorationOverlaps(decos: InlineDeco[], from: number, to: number): boolean {
  return decos.some(function (deco) {
    return from < deco.to && deco.from < to;
  });
}

function embeddedLinkLabel(target: string, label: string): string {
  const explicit = String(label || "").trim();
  if (explicit) {
    return explicit;
  }
  const leaf = documentPathLeaf(target);
  if (leaf && leaf.indexOf(".") >= 0) {
    return leaf;
  }
  return pageTitleFromPath(target);
}

function shouldRenderMarkdownLinkAsImage(label: string, target: string): boolean {
  const trimmedLabel = String(label || "").trim();
  if (!trimmedLabel) {
    return true;
  }
  return trimmedLabel === documentPathLeaf(target);
}

function addInlineDecorations(
  builder: RangeSetBuilder<Decoration>,
  atomicBuilder: RangeSetBuilder<Decoration>,
  lineFrom: number,
  text: string,
  startOffset: number,
  editingLine: boolean,
  selection: { from: number; to: number },
  currentPagePath: string,
  extraDecos: InlineDeco[]
): void {
  const decos: InlineDeco[] = extraDecos.slice();
  const body = text.slice(startOffset);
  const bodyFrom = lineFrom + startOffset;
  const imagePattern = /!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]|!\[([^\]]*)\]\(([^)\s]+)\)/g;
  const pattern = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]|\[([^\]]+)\]\(([^)\s]+)\)|(?<![(\[])https?:\/\/[^\s)\]>]+|`([^`]+)`|\*\*(.+?)\*\*|__(.+?)__|\*(.+?)\*|_(.+?)_|~~(.+?)~~/g;

  let imageMatch: RegExpExecArray | null = null;
  while ((imageMatch = imagePattern.exec(body)) !== null) {
    const mFrom = bodyFrom + imageMatch.index;
    const mEnd = mFrom + imageMatch[0].length;
    const editing = selection.from <= mEnd && selection.to >= mFrom;

    if (editing) {
      decos.push({from: mFrom, to: mEnd, deco: Decoration.mark({class: "cm-md-link-raw"})});
      continue;
    }

    if (imageMatch[1] !== undefined) {
      const target = String(imageMatch[1] || "").trim();
      const label = embeddedLinkLabel(target, String(imageMatch[2] || ""));
      const resolvedPath = resolveDocumentPath(currentPagePath || "", target);
      const looksLikeDocument = resolvedPath ? documentPathLeaf(resolvedPath).indexOf(".") >= 0 : false;
      if (resolvedPath && looksLikeDocument && !/\.md$/i.test(resolvedPath) && !target.startsWith("#")) {
        if (isImagePath(resolvedPath)) {
          const href = inlineDocumentURL(resolvedPath);
          decos.push({
            from: mFrom,
            to: mEnd,
            deco: Decoration.replace({widget: new MarkdownImageWidget(href, href, label || documentPathLeaf(resolvedPath) || "image")}),
            atomic: true,
          });
        } else {
          decos.push({
            from: mFrom,
            to: mEnd,
            deco: Decoration.replace({widget: new MarkdownLinkWidget(documentDownloadURL(resolvedPath), label || documentPathLeaf(resolvedPath))}),
            atomic: true,
          });
        }
        continue;
      }

      decos.push({
        from: mFrom,
        to: mEnd,
        deco: Decoration.replace({widget: new WikiLinkWidget(target, label)}),
        atomic: true,
      });
      continue;
    }

    const alt = String(imageMatch[3] || "").trim();
    const target = String(imageMatch[4] || "").trim();
    if (/^[a-z]+:/i.test(target)) {
      decos.push({
        from: mFrom,
        to: mEnd,
        deco: Decoration.replace({widget: new MarkdownImageWidget(target, target, alt || documentPathLeaf(target) || "image")}),
        atomic: true,
      });
      continue;
    }

    const resolvedPath = resolveDocumentPath(currentPagePath || "", target);
    if (resolvedPath && !/\.md$/i.test(resolvedPath) && !target.startsWith("#")) {
      const href = inlineDocumentURL(resolvedPath);
      decos.push({
        from: mFrom,
        to: mEnd,
        deco: Decoration.replace({widget: new MarkdownImageWidget(href, href, alt || documentPathLeaf(resolvedPath) || "image")}),
        atomic: true,
      });
    }
  }

  let m: RegExpExecArray | null = null;
  while ((m = pattern.exec(body)) !== null) {
    const mFrom = bodyFrom + m.index;
    const mEnd = mFrom + m[0].length;
    if (inlineDecorationOverlaps(decos, mFrom, mEnd)) {
      continue;
    }

    if (m[1] !== undefined) {
      const target = String(m[1]).trim();
      const label = String(m[2] || "").trim() || pageTitleFromPath(target);
      const editing = selection.from <= mEnd && selection.to >= mFrom;
      if (editing) {
        decos.push({from: mFrom, to: mEnd, deco: Decoration.mark({class: "cm-md-link-raw"})});
      } else {
        decos.push({from: mFrom, to: mEnd, deco: Decoration.replace({widget: new WikiLinkWidget(target, label)}), atomic: true});
      }
    } else if (m[3] !== undefined) {
      const label = String(m[3]).trim();
      const target = String(m[4] || "").trim();
      const editing = selection.from <= mEnd && selection.to >= mFrom;
      if (/^[a-z]+:/i.test(target)) {
        if (editing) {
          decos.push({from: mFrom, to: mEnd, deco: Decoration.mark({class: "cm-md-link-raw"})});
        } else if (isImagePath(target) && shouldRenderMarkdownLinkAsImage(label, target)) {
          decos.push({
            from: mFrom,
            to: mEnd,
            deco: Decoration.replace({widget: new MarkdownImageWidget(target, target, label || documentPathLeaf(target) || "image")}),
            atomic: true,
          });
        } else {
          decos.push({from: mFrom, to: mEnd, deco: Decoration.replace({widget: new ExternalLinkWidget(target, label || target)}), atomic: true});
        }
      } else {
        const resolvedPath = resolveDocumentPath(currentPagePath || "", target);
        if (!resolvedPath || /\.md$/i.test(resolvedPath) || target.startsWith("#")) {
          continue;
        }
        const href = documentDownloadURL(resolvedPath);
        if (editing) {
          decos.push({from: mFrom, to: mEnd, deco: Decoration.mark({class: "cm-md-link-raw"})});
        } else if (isImagePath(resolvedPath) && shouldRenderMarkdownLinkAsImage(label, target)) {
          const imageHref = inlineDocumentURL(resolvedPath);
          decos.push({
            from: mFrom,
            to: mEnd,
            deco: Decoration.replace({widget: new MarkdownImageWidget(imageHref, imageHref, label || documentPathLeaf(resolvedPath) || "image")}),
            atomic: true,
          });
        } else {
          decos.push({from: mFrom, to: mEnd, deco: Decoration.replace({widget: new MarkdownLinkWidget(href, label || href)}), atomic: true});
        }
      }
    } else if (m[0][0] === "h" && /^https?:\/\//.test(m[0])) {
      const editing = selection.from <= mEnd && selection.to >= mFrom;
      if (editing) {
        decos.push({from: mFrom, to: mEnd, deco: Decoration.mark({class: "cm-md-link-raw"})});
      } else if (!editingLine) {
        decos.push({from: mFrom, to: mEnd, deco: Decoration.replace({widget: new ExternalLinkWidget(m[0], m[0])}), atomic: true});
      }
    } else if (!editingLine) {
      if (m[5] !== undefined) {
        decos.push({from: mFrom, to: mFrom + 1, deco: Decoration.replace({}), atomic: true});
        decos.push({from: mFrom + 1, to: mEnd - 1, deco: Decoration.mark({class: "cm-md-inline-code"})});
        decos.push({from: mEnd - 1, to: mEnd, deco: Decoration.replace({}), atomic: true});
      } else if (m[6] !== undefined || m[7] !== undefined) {
        decos.push({from: mFrom, to: mFrom + 2, deco: Decoration.replace({}), atomic: true});
        decos.push({from: mFrom + 2, to: mEnd - 2, deco: Decoration.mark({class: "cm-md-bold"})});
        decos.push({from: mEnd - 2, to: mEnd, deco: Decoration.replace({}), atomic: true});
      } else if (m[8] !== undefined || m[9] !== undefined) {
        decos.push({from: mFrom, to: mFrom + 1, deco: Decoration.replace({}), atomic: true});
        decos.push({from: mFrom + 1, to: mEnd - 1, deco: Decoration.mark({class: "cm-md-italic"})});
        decos.push({from: mEnd - 1, to: mEnd, deco: Decoration.replace({}), atomic: true});
      } else if (m[10] !== undefined) {
        decos.push({from: mFrom, to: mFrom + 2, deco: Decoration.replace({}), atomic: true});
        decos.push({from: mFrom + 2, to: mEnd - 2, deco: Decoration.mark({class: "cm-md-strikethrough"})});
        decos.push({from: mEnd - 2, to: mEnd, deco: Decoration.replace({}), atomic: true});
      }
    }
  }

  decos.sort(function (a, b) { return a.from - b.from || a.to - b.to; });
  for (let i = 0; i < decos.length; i += 1) {
    builder.add(decos[i].from, decos[i].to, decos[i].deco);
    if (decos[i].atomic) {
      addAtomicRange(atomicBuilder, decos[i].from, decos[i].to);
    }
  }
}

function buildRenderedDecorations(state: EditorState): RenderedDecorationSets {
  if (!state.field(renderModeField, false)) {
    return {
      decorations: Decoration.none,
      atomicRanges: Decoration.none,
    };
  }

  const builder = new RangeSetBuilder<Decoration>();
  const atomicBuilder = new RangeSetBuilder<Decoration>();
  const queryBlocks = state.field(queryBlocksField);
  const tasks = state.field(tasksField);
  const selection = state.selection.main;
  const currentPagePath = state.field(pagePathField);
  const markdown = state.doc.toString();
  const lines = markdown.split("\n");
  let hiddenFrontmatterUntil = 0;

  const frontmatter = splitFrontmatter(markdown).frontmatter;
  if (frontmatter) {
    builder.add(
      0,
      frontmatter.length,
      Decoration.replace({
        block: true,
      })
    );
    addAtomicRange(atomicBuilder, 0, frontmatter.length);
    hiddenFrontmatterUntil = frontmatter.split("\n").length - 1;
  }

  for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber += 1) {
    if (lineNumber <= hiddenFrontmatterUntil) {
      continue;
    }
    const line = state.doc.line(lineNumber);
    const text = line.text;
    const from = line.from;
    const editingLine = selection.from <= line.to && selection.to >= line.from;
    const tableBlock = markdownTableBlockAt(lines, lineNumber - 1);
    if (tableBlock) {
      const tableEndLine = state.doc.line(tableBlock.endLineIndex + 1);
      const editingTable = selection.from <= tableEndLine.to && selection.to >= line.from;
      if (editingTable) {
        lineNumber = tableBlock.endLineIndex + 1;
        continue;
      }
      builder.add(
        line.from,
        tableEndLine.to,
        Decoration.replace({
          block: true,
          widget: new MarkdownTableWidget(tableBlock.html),
        })
      );
      addAtomicRange(atomicBuilder, line.from, tableEndLine.to);
      lineNumber = tableBlock.endLineIndex + 1;
      continue;
    }

    if (/^```query(?:\s|$)/i.test(text.trim())) {
      let endLineNumber = lineNumber;
      while (endLineNumber < state.doc.lines) {
        const candidate = state.doc.line(endLineNumber + 1);
        endLineNumber += 1;
        if (/^```/.test(candidate.text.trim())) {
          break;
        }
      }
      const endLine = state.doc.line(endLineNumber);
      const editingQuery = selection.from <= endLine.to && selection.to >= line.from;
      if (editingQuery) {
        lineNumber = endLineNumber;
        continue;
      }
      const blockSource = state.doc.sliceString(line.from, endLine.to).replace(/\r\n/g, "\n").trim();
      const html = queryBlocks.get(blockSource) || '<div class="embedded-query embedded-query-empty"><small>No results.</small></div>';
      const editLineNumber = endLineNumber > lineNumber + 1 ? lineNumber + 1 : lineNumber;
      builder.add(
        line.from,
        endLine.to,
        Decoration.replace({
          block: true,
          widget: new QueryBlockWidget(html, editLineNumber),
        })
      );
      addAtomicRange(atomicBuilder, line.from, endLine.to);
      lineNumber = endLineNumber;
      continue;
    }

    const codeBlock = markdownCodeFenceBlockAt(lines, lineNumber - 1);
    if (codeBlock) {
      const endLine = state.doc.line(codeBlock.endLineIndex + 1);
      const editingCodeBlock = selection.from <= endLine.to && selection.to >= line.from;
      if (editingCodeBlock) {
        lineNumber = codeBlock.endLineIndex + 1;
        continue;
      }
      for (let codeLineNumber = lineNumber; codeLineNumber <= codeBlock.endLineIndex + 1; codeLineNumber += 1) {
        const codeLine = state.doc.line(codeLineNumber);
        const classNames = ["cm-md-code-block"];
        let replaceDecoration: Decoration | null = null;
        if (codeLineNumber === lineNumber) {
          classNames.push("cm-md-code-block-start");
          replaceDecoration = Decoration.replace({
            widget: new CodeToolbarWidget(codeBlock.content, codeBlock.language),
          });
        } else if (codeLineNumber === codeBlock.endLineIndex + 1) {
          classNames.push("cm-md-code-block-end", "cm-md-code-fence-hidden");
          replaceDecoration = Decoration.replace({});
        } else {
          classNames.push("cm-md-code-block-body");
        }
        builder.add(codeLine.from, codeLine.from, Decoration.line({class: classNames.join(" ")}));
        if (replaceDecoration) {
          builder.add(codeLine.from, codeLine.to, replaceDecoration);
          addAtomicRange(atomicBuilder, codeLine.from, codeLine.to);
        }
      }
      lineNumber = codeBlock.endLineIndex + 1;
      continue;
    }

    let inlineStart = 0;
    const inlineExtraDecos: InlineDeco[] = [];
    let taskMetaWidget: WidgetType | null = null;

    let match = text.match(/^(#{1,6})(\s+)/);
    if (match) {
      builder.add(from, from, Decoration.line({class: "cm-md-heading cm-md-heading-" + String(match[1].length)}));
      if (editingLine) {
        builder.add(from, from + match[0].length, Decoration.mark({class: "cm-md-heading-raw"}));
      } else {
        builder.add(from, from + match[0].length, Decoration.replace({}));
        addAtomicRange(atomicBuilder, from, from + match[0].length);
        inlineStart = match[0].length;
      }
    }

    match = text.match(/^(>\s?)/);
    if (match) {
      builder.add(from, from, Decoration.line({class: "cm-md-quote"}));
      builder.add(from, from + match[1].length, Decoration.replace({}));
      addAtomicRange(atomicBuilder, from, from + match[1].length);
      if (match[1].length > inlineStart) {
        inlineStart = match[1].length;
      }
    }

    match = text.match(/^(\s*)-\s+\[([ xX])\]\s+/);
    if (match) {
      const task = tasks.get(lineNumber) || {
        ref: "",
        text: text.replace(/^(\s*)-\s+\[[ xX]\]\s+/, ""),
        done: /[xX]/.test(match[2] || ""),
        due: "",
        remind: "",
        who: [],
      };
      const indentLength = String(match[1] || "").length;
      const prefixLength = match[0].length;
      const bodyText = text.slice(prefixLength);
      builder.add(from, from, Decoration.line({class: "cm-md-task-line" + (task.done ? " cm-md-task-done" : "")}));
      builder.add(from, from + prefixLength, Decoration.replace({widget: new TaskCheckboxWidget(task.done, task.ref, indentLength)}));
      addAtomicRange(atomicBuilder, from, from + prefixLength);
      inlineStart = prefixLength;

      let dateMatch: RegExpExecArray | null = null;
      while ((dateMatch = taskInlineDatePattern.exec(bodyText)) !== null) {
        const field = String(dateMatch[1] || "");
        const start = from + prefixLength + dateMatch.index;
        const end = start + dateMatch[0].length;
        inlineExtraDecos.push({
          from: start,
          to: end,
          deco: Decoration.mark({
            class: "cm-md-task-inline-date",
            attributes: {
              "data-task-date-edit": field,
              "data-task-ref": task.ref || "",
            },
          }),
        });
      }
      taskInlineDatePattern.lastIndex = 0;

      if (task.text && bodyText.startsWith(task.text) && task.who && task.who.length) {
        taskMetaWidget = new TaskMetaWidget(task);
      }
    }

    addInlineDecorations(builder, atomicBuilder, from, text, inlineStart, editingLine, selection, currentPagePath, inlineExtraDecos);

    if (taskMetaWidget) {
      builder.add(line.to, line.to, Decoration.widget({widget: taskMetaWidget, side: 1}));
    }
  }

  return {
    decorations: builder.finish(),
    atomicRanges: atomicBuilder.finish(),
  };
}

const renderModeField = StateField.define<boolean>({
  create() {
    return false;
  },
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setRenderModeEffect)) {
        return Boolean(effect.value);
      }
    }
    return value;
  },
});

const pagePathField = StateField.define<string>({
  create() {
    return "";
  },
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setPagePathEffect)) {
        return String(effect.value || "");
      }
    }
    return value;
  },
});

const renderedDecorationsField = StateField.define<RenderedDecorationSets>({
  create(state) {
    return buildRenderedDecorations(state);
  },
  update(value, transaction) {
    const modeChanged = transaction.effects.some((effect) => effect.is(setRenderModeEffect));
    const tasksChanged = transaction.effects.some((effect) => effect.is(setTasksEffect));
    if (!modeChanged && !tasksChanged && !transaction.docChanged && !transaction.selection) {
      return value;
    }
    return buildRenderedDecorations(transaction.state);
  },
  provide: (field) => [
    EditorView.decorations.from(field, function (value) {
      return value.decorations;
    }),
    EditorView.atomicRanges.of(function (view) {
      const value = view.state.field(field, false);
      return value ? value.atomicRanges : Decoration.none;
    }),
  ],
});

const renderedFrontmatterBoundaryFilter = EditorState.transactionFilter.of((transaction) => {
  if (!transaction.startState.field(renderModeField, false)) {
    return transaction;
  }
  if (
    !transaction.isUserEvent("select")
    && !transaction.isUserEvent("move")
    && !transaction.isUserEvent("input")
    && !transaction.isUserEvent("delete")
    && !transaction.isUserEvent("undo")
    && !transaction.isUserEvent("redo")
  ) {
    return transaction;
  }

  const protectedUntil = renderedBodyBoundaryStart(transaction.startState.doc.toString());
  if (protectedUntil <= 0) {
    return transaction;
  }

  const clampedSelection = clampSelectionToOffset(transaction.newSelection, protectedUntil);
  if (changesTouchProtectedRange(transaction, protectedUntil)) {
    const userEvent = transaction.annotation(Transaction.userEvent);
    return [{
      selection: clampedSelection,
      scrollIntoView: transaction.scrollIntoView,
      userEvent: userEvent,
    }];
  }

  if (!clampedSelection.eq(transaction.newSelection, true)) {
    return [
      transaction,
      {
        selection: clampedSelection,
        sequential: true,
        scrollIntoView: transaction.scrollIntoView,
      },
    ];
  }

  return transaction;
});

window.NoteriousCodeEditor = {
  create(textarea: HTMLTextAreaElement): NoteriousEditorApi | null {
    if (!textarea || textarea.__noteriousEditor) {
      return textarea && textarea.__noteriousEditor ? textarea.__noteriousEditor : null;
    }

    const host = document.createElement("div");
    host.className = "markdown-editor-host hidden";
    textarea.parentNode?.insertBefore(host, textarea);
    textarea.classList.add("markdown-editor-native");
    bindTransientScrollClass(textarea, "is-scrolling");

    let suppressInput = false;

    const eventHandlers = EditorView.domEventHandlers({
      paste(event, view) {
        const text = event.clipboardData ? event.clipboardData.getData("text/plain") : "";
        if (!text || !/^https?:\/\/\S+$/i.test(text.trim())) {
          return false;
        }
        const url = text.trim();
        const selection = view.state.selection.main;
        const hasSelection = !selection.empty;
        const label = hasSelection ? view.state.sliceDoc(selection.from, selection.to) : url;
        const insert = "[" + label + "](" + url + ")";
        event.preventDefault();
        view.dispatch({
          changes: { from: selection.from, to: selection.to, insert },
          selection: { anchor: selection.from + insert.length },
        });
        syncTextareaValue(textarea, view.state.doc.toString());
        return true;
      },
      mousedown(event, view) {
        clearSearchHitHighlight(view);
        const target = event.target instanceof Element ? event.target : null;
        const pageLink = target ? target.closest("[data-page-link]") : null;
        if (pageLink) {
          event.preventDefault();
          host.dispatchEvent(new CustomEvent("noterious:page-link", {
            detail: {
              page: pageLink.getAttribute("data-page-link") || "",
              line: pageLink.getAttribute("data-page-line") || "",
              taskRef: pageLink.getAttribute("data-task-ref") || "",
            },
            bubbles: true,
          }));
          return true;
        }

        const documentLink = target ? target.closest("[data-document-download]") : null;
        if (documentLink) {
          event.preventDefault();
          host.dispatchEvent(new CustomEvent("noterious:document-download", {
            detail: {
              href: documentLink.getAttribute("data-document-download") || "",
            },
            bubbles: true,
          }));
          return true;
        }

        const queryEdit = target ? target.closest("[data-query-edit]") : null;
        if (queryEdit) {
          event.preventDefault();
          const lineNumber = Number(queryEdit.getAttribute("data-query-edit") || "0");
          if (lineNumber > 0 && lineNumber <= view.state.doc.lines) {
            const targetLine = view.state.doc.line(lineNumber);
            view.focus();
            view.dispatch({
              selection: {
                anchor: targetLine.from,
              },
              scrollIntoView: true,
            });
          }
          return true;
        }

        const codeCopy = target ? target.closest("[data-code-copy]") : null;
        if (codeCopy) {
          event.preventDefault();
          host.dispatchEvent(new CustomEvent("noterious:code-copy", {
            detail: {
              code: decodeURIComponent(codeCopy.getAttribute("data-code-copy") || ""),
            },
            bubbles: true,
          }));
          return true;
        }

        const taskToggle = target ? target.closest("[data-task-toggle]") : null;
        if (taskToggle) {
          event.preventDefault();
          const taskCarrier = target ? target.closest("[data-task-ref]") : null;
          const taskRef = taskCarrier ? taskCarrier.getAttribute("data-task-ref") || "" : "";
          const position = view.posAtDOM(taskToggle);
          const lineNumber = view.state.doc.lineAt(position).number;
          host.dispatchEvent(new CustomEvent("noterious:task-toggle", {
            detail: {
              lineNumber: lineNumber,
              ref: taskRef,
            },
            bubbles: true,
          }));
          return true;
        }

        const taskDateEdit = target ? target.closest("[data-task-date-edit]") : null;
        if (taskDateEdit) {
          event.preventDefault();
          const trigger = taskDateEdit instanceof HTMLElement ? taskDateEdit : null;
          const rect = trigger ? trigger.getBoundingClientRect() : null;
          host.dispatchEvent(new CustomEvent("noterious:task-date-edit", {
            detail: {
              ref: taskDateEdit.getAttribute("data-task-ref") || "",
              field: taskDateEdit.getAttribute("data-task-date-edit") || "",
              left: rect ? rect.left : 0,
              top: rect ? rect.bottom + 6 : 0,
              anchorTop: rect ? rect.top : 0,
              anchorBottom: rect ? rect.bottom : 0,
            },
            bubbles: true,
          }));
          return true;
        }

        const taskDelete = target ? target.closest("[data-task-delete]") : null;
        if (taskDelete) {
          event.preventDefault();
          host.dispatchEvent(new CustomEvent("noterious:task-delete", {
            detail: {
              ref: taskDelete.getAttribute("data-task-ref") || "",
            },
            bubbles: true,
          }));
          return true;
        }

        return false;
      },
      keydown(event, view) {
        const target = event.target instanceof Element ? event.target : null;
        const taskToggle = target ? target.closest("[data-task-toggle]") : null;
        if (taskToggle && (event.key === " " || event.key === "Enter")) {
          event.preventDefault();
          const taskRef = taskToggle.getAttribute("data-task-ref") || "";
          const position = view.posAtDOM(taskToggle);
          const lineNumber = view.state.doc.lineAt(position).number;
          host.dispatchEvent(new CustomEvent("noterious:task-toggle", {
            detail: {
              lineNumber: lineNumber,
              ref: taskRef,
            },
            bubbles: true,
          }));
          return true;
        }
        if (!event.altKey && !event.ctrlKey && !event.metaKey && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
          if (handleRenderedTaskArrow(view, event.key === "ArrowDown" ? "ArrowDown" : "ArrowUp")) {
            event.preventDefault();
            return true;
          }
          if (revealRenderedCodeBlockByArrow(view, event.key)) {
            event.preventDefault();
            return true;
          }
        }
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          clearSearchHitHighlight(view);
        }
        // Auto-convert bare URLs to markdown link syntax on Space or Enter
        if (event.key === " " || event.key === "Enter") {
          const cursor = view.state.selection.main.head;
          const line = view.state.doc.lineAt(cursor);
          const textBefore = line.text.slice(0, cursor - line.from);
          const urlMatch = textBefore.match(/(https?:\/\/[^\s)\]>]+)$/);
          if (urlMatch) {
            const url = urlMatch[1];
            // Don't convert if already inside a markdown link
            const prefix = textBefore.slice(0, textBefore.length - url.length);
            if (!prefix.endsWith("](") && !prefix.endsWith("(")) {
              const from = cursor - url.length;
              const mdLink = "[" + url + "](" + url + ")";
              view.dispatch({
                changes: { from, to: cursor, insert: mdLink },
                selection: { anchor: from + mdLink.length },
              });
              syncTextareaValue(textarea, view.state.doc.toString());
            }
          }
        }
        return false;
      },
    });

    const view = new EditorView({
      state: EditorState.create({
        doc: textarea.value || "",
        extensions: [
          history(),
          drawSelection(),
          highlightActiveLine(),
          keymap.of([
            {
              key: "ArrowUp",
              run(view) {
                return handleRenderedTableArrowUp(view);
              },
            },
            indentWithTab,
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          EditorView.lineWrapping,
          markdown({
            codeLanguages,
          }),
          syntaxHighlighting(themedHighlight, {fallback: true}),
          renderModeField,
          pagePathField,
          highlightedLineField,
          queryBlocksField,
          tasksField,
          highlightedLineDecorationsField,
          renderedDecorationsField,
          renderedFrontmatterBoundaryFilter,
          eventHandlers,
          EditorView.updateListener.of((update) => {
            const value = update.state.doc.toString();
            setTextareaValue(textarea, value);
            if (update.docChanged && !suppressInput) {
              syncTextareaValue(textarea, value);
            }
          }),
        ],
      }),
      parent: host,
    });
    bindTransientScrollClass(view.scrollDOM, "is-scrolling");

    const api: NoteriousEditorApi = {
      host,
      view,
      getValue() {
        return view.state.doc.toString();
      },
      setValue(value: string) {
        const nextValue = String(value || "");
        const current = view.state.doc.toString();
        if (nextValue === current) {
          setTextareaValue(textarea, nextValue);
          return;
        }
        suppressInput = true;
        view.dispatch({
          changes: {from: 0, to: current.length, insert: nextValue},
        });
        suppressInput = false;
        setTextareaValue(textarea, nextValue);
      },
      replaceRange(from: number, to: number, insert: string) {
        const max = view.state.doc.length;
        const nextFrom = Math.max(0, Math.min(Number(from) || 0, max));
        const nextTo = Math.max(nextFrom, Math.min(Number(to) || 0, max));
        const nextInsert = String(insert || "");
        suppressInput = true;
        view.dispatch({
          changes: {
            from: nextFrom,
            to: nextTo,
            insert: nextInsert,
          },
        });
        suppressInput = false;
        setTextareaValue(textarea, view.state.doc.toString());
      },
      focus(options?: FocusOptions) {
        try {
          view.focus();
          if (options && options.preventScroll) {
            view.scrollDOM.scrollTop = view.scrollDOM.scrollTop;
          }
        } catch (_error) {
          view.focus();
        }
      },
      blur() {
        const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        if (active && host.contains(active)) {
          active.blur();
        }
      },
      hasFocus() {
        return view.hasFocus;
      },
      getSelectionStart() {
        return view.state.selection.main.from;
      },
      getSelectionEnd() {
        return view.state.selection.main.to;
      },
      setSelectionRange(anchor, head, reveal) {
        const max = view.state.doc.length;
        const protectedUntil = renderedBodyStartOffset(view.state);
        const nextAnchor = Math.max(protectedUntil, Math.min(Number(anchor) || 0, max));
        const nextHead = Math.max(protectedUntil, Math.min(typeof head === "number" ? head : nextAnchor, max));
        const clampedSelection = clampSelectionToOffset(EditorSelection.single(nextAnchor, nextHead), protectedUntil);
        view.dispatch({
          selection: clampedSelection,
          scrollIntoView: Boolean(reveal),
        });
      },
      getScrollTop() {
        return view.scrollDOM.scrollTop;
      },
      setScrollTop(value) {
        view.scrollDOM.scrollTop = Number(value) || 0;
      },
      getCaretRect() {
        const head = view.state.selection.main.head;
        const line = view.state.doc.lineAt(head);
        const domAtPos = view.domAtPos(Math.max(line.from, Math.min(head, line.to)));
        const element = domAtPos.node instanceof Element ? domAtPos.node : domAtPos.node.parentElement;
        const lineElement = element instanceof HTMLElement ? element.closest(".cm-line") as HTMLElement | null : null;
        if (lineElement) {
          const lineRect = lineElement.getBoundingClientRect();
          const style = window.getComputedStyle(lineElement);
          const lineHeight = Number.parseFloat(style.lineHeight || "") || Number.parseFloat(style.fontSize || "") || 16;
          const prefix = line.text.slice(0, Math.max(0, head - line.from));
          const left = lineRect.left + measuredTextWidth(prefix, lineElement);
          return new DOMRect(left, lineRect.top, 1, lineHeight);
        }

        const rect = view.coordsAtPos(head, 1);
        return rect ? new DOMRect(rect.left, rect.top, rect.right - rect.left, rect.bottom - rect.top) : null;
      },
      setHighlightedLine(lineNumber: number | null) {
        view.dispatch({
          effects: setHighlightedLineEffect.of(typeof lineNumber === "number" ? lineNumber : null),
        });
      },
      setRenderMode(enabled: boolean) {
        host.classList.toggle("render-mode", Boolean(enabled));
        host.classList.toggle("raw-mode", !enabled);
        view.dispatch({
          effects: setRenderModeEffect.of(Boolean(enabled)),
        });
        if (enabled) {
          const protectedUntil = renderedBodyStartOffset(view.state);
          const clampedSelection = clampSelectionToOffset(view.state.selection, protectedUntil);
          if (!clampedSelection.eq(view.state.selection, true)) {
            view.dispatch({
              selection: clampedSelection,
              scrollIntoView: true,
            });
          }
        }
      },
      setPagePath(path: string) {
        view.dispatch({
          effects: setPagePathEffect.of(String(path || "")),
        });
      },
      setDateTimeFormat(format: "browser" | "iso" | "de") {
        setDateTimeDisplayFormat(normalizeDateTimeDisplayFormat(format));
        view.dispatch({
          effects: setTasksEffect.of(new Map(view.state.field(tasksField))),
        });
      },
      setQueryBlocks(blocks: QueryBlockRender[]) {
        const map = new Map<string, string>();
        (Array.isArray(blocks) ? blocks : []).forEach((block) => {
          const source = String(block && block.source ? block.source : "").replace(/\r\n/g, "\n").trim();
          const html = String(block && block.html ? block.html : "");
          if (source) {
            map.set(source, html);
          }
        });
        view.dispatch({
          effects: setQueryBlocksEffect.of(map),
        });
      },
      setTasks(tasks: TaskRender[]) {
        const map = new Map<number, EditorTaskState>();
        (Array.isArray(tasks) ? tasks : []).forEach((task) => {
          const line = Number(task && task.line);
          if (line > 0) {
            map.set(line, {
              ref: String(task.ref || ""),
              text: String(task.text || ""),
              done: Boolean(task.done),
              due: String(task.due || ""),
              remind: String(task.remind || ""),
              who: Array.isArray(task.who) ? task.who.slice() : [],
            });
          }
        });
        view.dispatch({
          effects: setTasksEffect.of(map),
        });
      },
      isRenderMode() {
        return Boolean(view.state.field(renderModeField, false));
      },
      onKeydown(handler: EventListenerOrEventListenerObject) {
        view.dom.addEventListener("keydown", handler, {capture: true});
      },
    };

    textarea.__noteriousEditor = api;
    return api;
  },
};
