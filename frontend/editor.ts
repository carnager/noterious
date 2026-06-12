import {Compartment, EditorSelection, EditorState, StateEffect, StateField, RangeSetBuilder, Transaction} from "@codemirror/state";
import {EditorView, keymap, drawSelection, highlightActiveLine, Decoration, type DecorationSet, WidgetType} from "@codemirror/view";
import {defaultKeymap, indentWithTab, history, historyKeymap, redo, redoDepth, undo, undoDepth} from "@codemirror/commands";
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
import { escapeHTML, markdownCodeFenceBlockAt, markdownTableBlockAt, renderInline, renderedBodyBoundaryStart, splitFrontmatter } from "./markdown";
import {
  findMarkdownAbbreviationUsageSpans,
  isMarkdownDefinitionTermLine,
  markdownAbbreviationDefinitionMatch,
  markdownAbbreviationDefinitions,
  markdownDefinitionListPrefixMatch,
  markdownEmojiCharacter,
  markdownFootnoteDefinitionMatch,
  markdownFootnoteReferenceMatch,
  type MarkdownAbbreviationDefinition,
} from "./markdownExtensions";
import {
  findMarkdownInlineSpecialSpans,
  markdownReferenceDefinitions,
  markdownResolvedLinkInfo,
  normalizeMarkdownLinkLabel,
  parseInlineMarkdownTree,
  visibleTextFromChildren,
  type MarkdownInlineNode,
  type MarkdownReferenceDefinition,
} from "./markdownInline";
import { renderedTaskRawColumn, renderedTaskVisibleColumn, taskLineHasInlineDate, taskPrefixLength } from "./taskNavigation";
import type { NoteriousEditorApi, QueryBlockRender, TaskRender } from "./types";

interface EditorTaskState {
  ref: string;
  text: string;
  done: boolean;
  due: string;
  remind: string;
  who: string[];
}

const collapsedCodeBlockVisibleLines = 12;

const measureCanvas = document.createElement("canvas");
const measureContext = measureCanvas.getContext("2d");

type ScrollPositionSnapshot =
  | { kind: "element"; node: HTMLElement; left: number; top: number }
  | { kind: "window"; node: Window; left: number; top: number };

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

function isScrollableOverflow(value: string): boolean {
  return value === "auto" || value === "scroll" || value === "overlay";
}

function captureScrollPositionSnapshots(target: HTMLElement): ScrollPositionSnapshot[] {
  const ownerWindow = target.ownerDocument.defaultView || window;
  const snapshots: ScrollPositionSnapshot[] = [];
  let current = target.parentElement;
  while (current) {
    const style = ownerWindow.getComputedStyle(current);
    const overflow = style.overflow;
    const canScrollX = ((isScrollableOverflow(style.overflowX) || isScrollableOverflow(overflow))
      && current.scrollWidth > current.clientWidth)
      || current.scrollLeft !== 0;
    const canScrollY = ((isScrollableOverflow(style.overflowY) || isScrollableOverflow(overflow))
      && current.scrollHeight > current.clientHeight)
      || current.scrollTop !== 0;
    if (canScrollX || canScrollY) {
      snapshots.push({
        kind: "element",
        node: current,
        left: current.scrollLeft,
        top: current.scrollTop,
      });
    }
    current = current.parentElement;
  }
  snapshots.push({
    kind: "window",
    node: ownerWindow,
    left: ownerWindow.scrollX || 0,
    top: ownerWindow.scrollY || 0,
  });
  return snapshots;
}

function restoreScrollPositionSnapshots(snapshots: ScrollPositionSnapshot[]): void {
  for (const snapshot of snapshots) {
    if (snapshot.kind === "element") {
      snapshot.node.scrollLeft = snapshot.left;
      snapshot.node.scrollTop = snapshot.top;
      continue;
    }
    if ((snapshot.node.scrollX || 0) === snapshot.left && (snapshot.node.scrollY || 0) === snapshot.top) {
      continue;
    }
    try {
      snapshot.node.scrollTo(snapshot.left, snapshot.top);
    } catch (_error) {
      // Ignore environments that don't implement scrolling.
    }
  }
}

function focusEditorView(view: EditorView, host: HTMLElement, options?: FocusOptions): void {
  if (!options || !options.preventScroll) {
    view.focus();
    return;
  }
  const snapshots = captureScrollPositionSnapshots(host);
  view.focus();
  restoreScrollPositionSnapshots(snapshots);
  const ownerWindow = host.ownerDocument.defaultView || window;
  ownerWindow.requestAnimationFrame(function () {
    restoreScrollPositionSnapshots(snapshots);
  });
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
const setViewOnlyEffect = StateEffect.define<boolean>();
const setQueryBlocksEffect = StateEffect.define<Map<string, string>>();
const setTasksEffect = StateEffect.define<Map<number, EditorTaskState>>();
const setPagePathEffect = StateEffect.define<string>();
const setHighlightedLineEffect = StateEffect.define<number | null>();
const setCodeBlocksAlwaysExpandedEffect = StateEffect.define<boolean>();
const toggleCodeBlockExpandedEffect = StateEffect.define<string>();
const editableCompartment = new Compartment();
const readOnlyCompartment = new Compartment();
const taskInlineDatePattern = /\[(due|remind):\s*[^\]]+?\]|\b(due|remind)::\s*[^\s]+(?:\s+\d{2}:\d{2})?/g;

function hashString(input: string): string {
  let hash = 2166136261;
  const text = String(input || "");
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function codeBlockStateKey(startLineNumber: number, content: string, language: string): string {
  return String(startLineNumber) + ":" + hashString(String(language || "") + "\n" + String(content || ""));
}

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
  toggleKey: string;
  canCollapse: boolean;
  expanded: boolean;
  hiddenLineCount: number;
  viewOnly: boolean;

  constructor(content: string, language: string, toggleKey: string, canCollapse: boolean, expanded: boolean, hiddenLineCount: number, viewOnly?: boolean) {
    super();
    this.content = content;
    this.language = language;
    this.toggleKey = toggleKey;
    this.canCollapse = Boolean(canCollapse);
    this.expanded = expanded;
    this.hiddenLineCount = Math.max(0, Number(hiddenLineCount) || 0);
    this.viewOnly = Boolean(viewOnly);
  }

  eq(other: CodeToolbarWidget): boolean {
    return other.content === this.content
      && other.language === this.language
      && other.toggleKey === this.toggleKey
      && other.canCollapse === this.canCollapse
      && other.expanded === this.expanded
      && other.hiddenLineCount === this.hiddenLineCount
      && other.viewOnly === this.viewOnly;
  }

  toDOM(): HTMLSpanElement {
    const toolbar = document.createElement("span");
    toolbar.className = "cm-md-code-toolbar";

    const language = document.createElement("span");
    language.className = "cm-md-code-language";
    language.textContent = this.language || "plain text";
    toolbar.appendChild(language);

    const actions = document.createElement("span");
    actions.className = "cm-md-code-actions";

    if (this.canCollapse && !this.viewOnly) {
      const toggleButton = document.createElement("button");
      toggleButton.type = "button";
      toggleButton.className = "cm-md-code-toggle";
      toggleButton.setAttribute("data-code-toggle", this.toggleKey);
      toggleButton.textContent = this.expanded ? "Collapse" : "Expand";
      if (!this.expanded) {
        toggleButton.title = "Show " + String(this.hiddenLineCount) + " more line" + (this.hiddenLineCount === 1 ? "" : "s");
      }
      actions.appendChild(toggleButton);
    }

    const copyButton = document.createElement("button");
    copyButton.type = "button";
    copyButton.className = "cm-md-code-copy";
    copyButton.setAttribute("data-code-copy", encodeURIComponent(this.content));
    copyButton.textContent = "Copy";
    actions.appendChild(copyButton);

    toolbar.appendChild(actions);

    return toolbar;
  }

  ignoreEvent() {
    return this.viewOnly;
  }
}

class TaskCheckboxWidget extends WidgetType {
  done: boolean;
  ref: string;
  indent: number;
  viewOnly: boolean;

  constructor(done: boolean, ref?: string, indent?: number, viewOnly?: boolean) {
    super();
    this.done = done;
    this.ref = ref || "";
    this.indent = Math.max(0, Number(indent) || 0);
    this.viewOnly = Boolean(viewOnly);
  }

  eq(other: TaskCheckboxWidget): boolean {
    return other.done === this.done
      && other.ref === this.ref
      && other.indent === this.indent
      && other.viewOnly === this.viewOnly;
  }

  toDOM(): HTMLSpanElement {
    const toggle = document.createElement("span");
    toggle.className = "cm-md-task-toggle" + (this.viewOnly ? " cm-md-task-toggle-passive" : "");
    if (!this.viewOnly) {
      toggle.setAttribute("data-task-toggle", "true");
    }
    toggle.setAttribute("data-done", this.done ? "true" : "false");
    toggle.style.setProperty("--task-indent", String(this.indent * 0.62) + "rem");
    if (this.ref) {
      toggle.setAttribute("data-task-ref", this.ref);
    }
    if (!this.viewOnly) {
      toggle.setAttribute("role", "checkbox");
      toggle.setAttribute("tabindex", "0");
      toggle.setAttribute("aria-checked", this.done ? "true" : "false");
      toggle.setAttribute("aria-label", this.done ? "Mark task incomplete" : "Mark task complete");
    }

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
    return this.viewOnly;
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

class ListMarkerWidget extends WidgetType {
  marker: string;
  prefixLength: number;
  indentLength: number;
  ordered: boolean;

  constructor(marker: string, prefixLength: number, indentLength: number, ordered: boolean) {
    super();
    this.marker = String(marker || "");
    this.prefixLength = Math.max(1, Number(prefixLength) || 0);
    this.indentLength = Math.max(0, Number(indentLength) || 0);
    this.ordered = Boolean(ordered);
  }

  eq(other: ListMarkerWidget): boolean {
    return other.marker === this.marker &&
      other.prefixLength === this.prefixLength &&
      other.indentLength === this.indentLength &&
      other.ordered === this.ordered;
  }

  toDOM(): HTMLSpanElement {
    const marker = document.createElement("span");
    marker.className = "cm-md-list-marker" + (this.ordered ? " cm-md-list-marker-ordered" : "");
    marker.style.setProperty("--list-prefix-width", String(this.prefixLength * 0.62) + "rem");
    marker.style.setProperty("--list-indent-width", String(this.indentLength * 0.62) + "rem");
    marker.textContent = this.marker;
    marker.setAttribute("aria-hidden", "true");
    return marker;
  }

  ignoreEvent() {
    return true;
  }
}

class ThematicBreakWidget extends WidgetType {
  eq(other: ThematicBreakWidget): boolean {
    return other instanceof ThematicBreakWidget;
  }

  toDOM(): HTMLSpanElement {
    const rule = document.createElement("span");
    rule.className = "cm-md-rule";
    rule.setAttribute("aria-hidden", "true");
    return rule;
  }

  ignoreEvent() {
    return true;
  }
}

class HtmlLineWidget extends WidgetType {
  className: string;
  html: string;

  constructor(className: string, html: string) {
    super();
    this.className = className;
    this.html = html;
  }

  eq(other: HtmlLineWidget): boolean {
    return other.className === this.className && other.html === this.html;
  }

  toDOM(): HTMLSpanElement {
    const wrapper = document.createElement("span");
    wrapper.className = this.className;
    wrapper.innerHTML = this.html;
    return wrapper;
  }

  ignoreEvent() {
    return true;
  }
}

class InlineHTMLWidget extends WidgetType {
  className: string;
  html: string;
  styleProperties: Record<string, string>;

  constructor(className: string, html: string, styleProperties?: Record<string, string>) {
    super();
    this.className = className;
    this.html = html;
    this.styleProperties = styleProperties ? {...styleProperties} : {};
  }

  eq(other: InlineHTMLWidget): boolean {
    return other.className === this.className
      && other.html === this.html
      && JSON.stringify(other.styleProperties) === JSON.stringify(this.styleProperties);
  }

  toDOM(): HTMLSpanElement {
    const wrapper = document.createElement("span");
    wrapper.className = this.className;
    Object.keys(this.styleProperties).forEach((name) => {
      wrapper.style.setProperty(name, this.styleProperties[name]);
    });
    wrapper.innerHTML = this.html;
    return wrapper;
  }

  ignoreEvent() {
    return true;
  }
}

class QueryBlockWidget extends WidgetType {
  html: string;
  editLineNumber: number;
  viewOnly: boolean;

  constructor(html: string, editLineNumber: number, viewOnly?: boolean) {
    super();
    this.html = html;
    this.editLineNumber = editLineNumber;
    this.viewOnly = Boolean(viewOnly);
  }

  eq(other: QueryBlockWidget): boolean {
    return other.html === this.html
      && other.editLineNumber === this.editLineNumber
      && other.viewOnly === this.viewOnly;
  }

  toDOM(): HTMLDivElement {
    const wrapper = document.createElement("div");
    wrapper.className = "cm-md-query-block";

    const content = document.createElement("div");
    content.className = "cm-md-query-content";
    content.innerHTML = this.html;

    if (!this.viewOnly) {
      const toolbar = document.createElement("div");
      toolbar.className = "cm-md-query-toolbar";

      const button = document.createElement("button");
      button.type = "button";
      button.className = "cm-md-query-edit";
      button.setAttribute("data-query-edit", String(this.editLineNumber));
      button.textContent = "Edit Query";
      toolbar.appendChild(button);
      wrapper.appendChild(toolbar);
    }
    wrapper.appendChild(content);
    return wrapper;
  }

  ignoreEvent() {
    return this.viewOnly;
  }
}

class MarkdownTableWidget extends WidgetType {
  html: string;
  viewOnly: boolean;

  constructor(html: string, viewOnly?: boolean) {
    super();
    this.html = html;
    this.viewOnly = Boolean(viewOnly);
  }

  eq(other: MarkdownTableWidget): boolean {
    return other.html === this.html && other.viewOnly === this.viewOnly;
  }

  toDOM(): HTMLDivElement {
    const wrapper = document.createElement("div");
    wrapper.className = "cm-md-table-block";
    wrapper.style.display = "block";
    wrapper.style.width = "100%";
    wrapper.style.boxSizing = "border-box";
    // Keep vertical spacing on the measured widget wrapper. Margins on the inner
    // rendered block are not included in CodeMirror's block-widget height mapping.
    wrapper.style.padding = "0.4rem 0 0.7rem";
    wrapper.innerHTML = this.html;
    const tableBlock = wrapper.querySelector(".markdown-table-block");
    if (tableBlock instanceof HTMLElement) {
      tableBlock.style.margin = "0";
    }
    if (!this.viewOnly) {
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
    }
    return wrapper;
  }

  ignoreEvent() {
    return true;
  }
}

class ReferenceDefinitionsWidget extends WidgetType {
  definitions: MarkdownReferenceDefinition[];

  constructor(definitions: MarkdownReferenceDefinition[]) {
    super();
    this.definitions = definitions.slice();
  }

  eq(other: ReferenceDefinitionsWidget): boolean {
    return JSON.stringify(other.definitions) === JSON.stringify(this.definitions);
  }

  toDOM(): HTMLDivElement {
    const wrapper = document.createElement("div");
    wrapper.className = "cm-md-reference-definitions";

    const details = document.createElement("details");
    details.className = "cm-md-reference-definitions-details";

    const summary = document.createElement("summary");
    summary.className = "cm-md-reference-definitions-summary";
    summary.textContent = "References (" + String(this.definitions.length) + ")";
    details.appendChild(summary);

    const list = document.createElement("div");
    list.className = "cm-md-reference-definitions-list";

    this.definitions.forEach(function (definition) {
      const item = document.createElement("div");
      item.className = "cm-md-reference-definition-item";

      const jump = document.createElement("button");
      jump.type = "button";
      jump.className = "cm-md-reference-definition-jump";
      jump.setAttribute("data-reference-jump", String(definition.from));
      jump.setAttribute("title", "Jump to reference definition");
      jump.textContent = "[" + String(definition.label || "") + "]";
      item.appendChild(jump);

      if (definition.target) {
        const target = document.createElement("a");
        target.className = "cm-md-reference-definition-target markdown-external-link";
        target.href = definition.target;
        target.target = "_blank";
        target.rel = "noopener";
        target.textContent = definition.target;
        item.appendChild(target);
      }

      if (definition.title) {
        const title = document.createElement("span");
        title.className = "cm-md-reference-definition-title";
        title.textContent = '"' + definition.title + '"';
        item.appendChild(title);
      }

      list.appendChild(item);
    });

    details.appendChild(list);
    wrapper.appendChild(details);
    return wrapper;
  }

  ignoreEvent() {
    return false;
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

const expandedCodeBlocksField = StateField.define<Record<string, boolean>>({
  create() {
    return {};
  },
  update(value, transaction) {
    let next = value;
    for (const effect of transaction.effects) {
      if (effect.is(toggleCodeBlockExpandedEffect)) {
        const key = String(effect.value || "");
        if (!key) {
          continue;
        }
        if (next === value) {
          next = {...value};
        }
        next[key] = !Boolean(next[key]);
      }
    }
    return next;
  },
});

const codeBlocksAlwaysExpandedField = StateField.define<boolean>({
  create() {
    return false;
  },
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setCodeBlocksAlwaysExpandedEffect)) {
        return Boolean(effect.value);
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

interface MarkdownQuotePrefixMatch {
  prefixLength: number;
  depth: number;
}

function markdownBlockquotePrefixMatch(text: string): MarkdownQuotePrefixMatch | null {
  const match = String(text || "").match(/^((?: {0,3}>\s*)+)/);
  if (!match) {
    return null;
  }
  const prefix = String(match[1] || "");
  const depth = (prefix.match(/>/g) || []).length;
  if (!depth) {
    return null;
  }
  return {
    prefixLength: prefix.length,
    depth,
  };
}

function quoteLineStyle(depth: number, connectAbove: boolean, connectBelow: boolean): string {
  const safeDepth = Math.max(1, Number(depth) || 1);
  const quoteStepWidth = 0.72;
  const gutterWidth = String(safeDepth * quoteStepWidth) + "rem";
  return "--quote-depth:" + String(safeDepth)
    + ";--quote-gutter-width:" + gutterWidth
    + ";--quote-step-width:" + String(quoteStepWidth) + "rem"
    + ";--quote-top-gap:" + (connectAbove ? "0" : "0.14em")
    + ";--quote-bottom-gap:" + (connectBelow ? "0" : "0.14em") + ";";
}

interface MarkdownListPrefixMatch {
  prefixLength: number;
  indentLength: number;
  markerText: string;
  ordered: boolean;
}

function markdownListPrefixMatch(text: string, startOffset = 0): MarkdownListPrefixMatch | null {
  const source = String(text || "").slice(Math.max(0, Number(startOffset) || 0));

  let match = source.match(/^(\s*)([-+*])(\s+)/);
  if (match) {
    return {
      prefixLength: match[0].length,
      indentLength: match[1].length,
      markerText: "•",
      ordered: false,
    };
  }

  match = source.match(/^(\s*)(\d+)([.)])(\s+)/);
  if (match) {
    return {
      prefixLength: match[0].length,
      indentLength: match[1].length,
      markerText: String(match[2] || "") + String(match[3] || "."),
      ordered: true,
    };
  }

  return null;
}

function isMarkdownThematicBreak(text: string): boolean {
  const source = String(text || "").trim();
  return /^((-\s*){3,}|(\*\s*){3,}|(_\s*){3,})$/.test(source);
}

interface MarkdownMathBlock {
  startLineIndex: number;
  endLineIndex: number;
}

function markdownMathBlockAt(lines: string[], startLineIndex: number): MarkdownMathBlock | null {
  if (!Array.isArray(lines) || startLineIndex < 0 || startLineIndex >= lines.length) {
    return null;
  }
  if (String(lines[startLineIndex] || "").trim() !== "$$") {
    return null;
  }

  let endLineIndex = lines.length - 1;
  for (let index = startLineIndex + 1; index < lines.length; index += 1) {
    if (String(lines[index] || "").trim() === "$$") {
      endLineIndex = index;
      break;
    }
  }

  return {
    startLineIndex,
    endLineIndex,
  };
}

interface MarkdownHtmlLineMatch {
  kind: "details_open" | "details_close" | "summary" | "dl_open" | "dl_close" | "dt" | "dd";
  inner?: string;
}

function markdownHtmlLineMatch(text: string): MarkdownHtmlLineMatch | null {
  const source = String(text || "").trim();
  if (/^<details(?:\s+open)?\s*>$/i.test(source)) {
    return {kind: "details_open"};
  }
  if (/^<\/details>$/i.test(source)) {
    return {kind: "details_close"};
  }
  if (/^<dl>$/i.test(source)) {
    return {kind: "dl_open"};
  }
  if (/^<\/dl>$/i.test(source)) {
    return {kind: "dl_close"};
  }

  let match = source.match(/^<summary>([\s\S]*?)<\/summary>$/i);
  if (match) {
    return {
      kind: "summary",
      inner: String(match[1] || ""),
    };
  }

  match = source.match(/^<dt>([\s\S]*?)<\/dt>$/i);
  if (match) {
    return {
      kind: "dt",
      inner: String(match[1] || ""),
    };
  }

  match = source.match(/^<dd>([\s\S]*?)<\/dd>$/i);
  if (match) {
    return {
      kind: "dd",
      inner: String(match[1] || ""),
    };
  }

  return null;
}

interface AllowedInlineHtmlSpan {
  from: number;
  to: number;
  tagName: "sub" | "sup" | "kbd" | "mark";
  innerFrom: number;
  innerTo: number;
}

function findAllowedInlineHtmlSpans(source: string): AllowedInlineHtmlSpan[] {
  const text = String(source || "");
  const spans: AllowedInlineHtmlSpan[] = [];
  const pattern = /<(sub|sup|kbd|mark)>([\s\S]*?)<\/\1>/gi;
  let match: RegExpExecArray | null = null;

  while ((match = pattern.exec(text)) !== null) {
    const tagName = String(match[1] || "").toLowerCase() as AllowedInlineHtmlSpan["tagName"];
    const openingTag = "<" + tagName + ">";
    const closingTag = "</" + tagName + ">";
    spans.push({
      from: match.index,
      to: match.index + match[0].length,
      tagName,
      innerFrom: match.index + openingTag.length,
      innerTo: match.index + match[0].length - closingTag.length,
    });
  }

  return spans;
}

interface InlineMathSpan {
  from: number;
  to: number;
  innerFrom: number;
  innerTo: number;
}

function findInlineMathSpans(source: string): InlineMathSpan[] {
  const text = String(source || "");
  const spans: InlineMathSpan[] = [];
  let index = 0;

  while (index < text.length) {
    if (text[index] !== "$" || text[index + 1] === "$" || (index > 0 && text[index - 1] === "\\")) {
      index += 1;
      continue;
    }

    let end = index + 1;
    while (end < text.length) {
      if (text[end] === "$" && text[end - 1] !== "\\") {
        break;
      }
      end += 1;
    }
    if (end >= text.length || text[end] !== "$") {
      break;
    }

    const content = text.slice(index + 1, end);
    if (!content || /^\s|\s$/.test(content)) {
      index = end + 1;
      continue;
    }

    spans.push({
      from: index,
      to: end + 1,
      innerFrom: index + 1,
      innerTo: end,
    });
    index = end + 1;
  }

  return spans;
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

function clampSelectionToRenderedVisibleOffsets(state: EditorState, selection: EditorSelection): EditorSelection {
  if (!state.field(renderModeField, false)) {
    return selection;
  }
  const ranges = selection.ranges.map(function (range) {
    const anchorLine = state.doc.lineAt(range.anchor);
    const anchorVisibleStart = Math.min(anchorLine.to, anchorLine.from + renderedHiddenPrefixLength(anchorLine.text));
    const anchor = range.anchor < anchorVisibleStart ? anchorVisibleStart : range.anchor;

    const headLine = state.doc.lineAt(range.head);
    const headVisibleStart = Math.min(headLine.to, headLine.from + renderedHiddenPrefixLength(headLine.text));
    const head = range.head < headVisibleStart ? headVisibleStart : range.head;

    if (anchor === head) {
      return EditorSelection.cursor(
        anchor,
        range.assoc,
        range.bidiLevel === null ? undefined : range.bidiLevel,
        range.goalColumn
      );
    }
    return EditorSelection.range(
      anchor,
      head,
      range.goalColumn,
      range.bidiLevel === null ? undefined : range.bidiLevel,
      range.assoc
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

function renderedVisibleLineStart(line: { from: number; to: number; text: string }): number {
  return Math.min(line.to, line.from + renderedHiddenPrefixLength(line.text));
}

function dispatchRenderedSelection(view: EditorView, head: number, extend = false): boolean {
  const protectedUntil = renderedBodyStartOffset(view.state);
  let nextSelection: EditorSelection = extend
    ? EditorSelection.single(view.state.selection.main.anchor, head)
    : EditorSelection.single(head);
  nextSelection = clampSelectionToOffset(nextSelection, protectedUntil);
  nextSelection = clampSelectionToRenderedVisibleOffsets(view.state, nextSelection);
  view.dispatch({
    selection: nextSelection,
    scrollIntoView: true,
  });
  return true;
}

function moveHeadToLine(state: EditorState, sourceHead: number, lineNumber: number): number | null {
  if (lineNumber < 1 || lineNumber > state.doc.lines) {
    return null;
  }
  const currentLine = state.doc.lineAt(sourceHead);
  const column = Math.max(0, sourceHead - currentLine.from);
  const targetLine = state.doc.line(lineNumber);
  const visibleStart = state.field(renderModeField, false)
    ? renderedVisibleLineStart(targetLine)
    : targetLine.from;
  const targetHead = Math.min(targetLine.from + column, targetLine.to);
  return Math.max(visibleStart, targetHead);
}

function renderedTableArrowTarget(view: EditorView, key: "ArrowUp" | "ArrowDown", sourceHead: number): number | null {
  if (!view.state.field(renderModeField, false)) {
    return null;
  }

  const currentLine = view.state.doc.lineAt(sourceHead);
  const lines = view.state.doc.toString().split("\n");
  if (key === "ArrowUp") {
    if (currentLine.number <= 1) {
      return null;
    }

    const tableEndingOnPreviousLine = tableBlockEndingAtLine(lines, currentLine.number - 2);
    if (tableEndingOnPreviousLine) {
      return moveHeadToLine(view.state, sourceHead, tableEndingOnPreviousLine.endLineIndex + 1);
    }

    const tableEndingTwoLinesAbove = tableBlockEndingAtLine(lines, currentLine.number - 3);
    if (tableEndingTwoLinesAbove) {
      return moveHeadToLine(view.state, sourceHead, currentLine.number - 1);
    }

    return null;
  }

  if (currentLine.number >= view.state.doc.lines) {
    return null;
  }

  const tableStartingOnNextLine = markdownTableBlockAt(lines, currentLine.number);
  if (tableStartingOnNextLine) {
    return moveHeadToLine(view.state, sourceHead, tableStartingOnNextLine.startLineIndex + 1);
  }

  const tableStartingTwoLinesBelow = markdownTableBlockAt(lines, currentLine.number + 1);
  if (tableStartingTwoLinesBelow) {
    return moveHeadToLine(view.state, sourceHead, currentLine.number + 1);
  }

  return null;
}

function renderedTaskArrowTarget(view: EditorView, key: "ArrowUp" | "ArrowDown", sourceHead: number): number | null {
  if (!view.state.field(renderModeField, false)) {
    return null;
  }

  const currentLine = view.state.doc.lineAt(sourceHead);
  const targetLineNumber = key === "ArrowDown" ? currentLine.number + 1 : currentLine.number - 1;
  if (targetLineNumber < 1 || targetLineNumber > view.state.doc.lines) {
    return null;
  }

  const targetLine = view.state.doc.line(targetLineNumber);
  const currentTaskPrefix = taskPrefixLength(currentLine.text);
  const targetTaskPrefix = taskPrefixLength(targetLine.text);
  if (
    !currentTaskPrefix
    && !targetTaskPrefix
    && !taskLineHasInlineDate(currentLine.text)
    && !taskLineHasInlineDate(targetLine.text)
  ) {
    return null;
  }

  const rawColumn = Math.max(0, sourceHead - currentLine.from);
  const visibleColumn = renderedTaskVisibleColumn(currentLine.text, rawColumn);
  const targetRawColumn = renderedTaskRawColumn(targetLine.text, visibleColumn);
  return Math.min(targetLine.from + targetRawColumn, targetLine.to);
}

function renderedCodeBlockArrowTarget(view: EditorView, key: "ArrowUp" | "ArrowDown", sourceHead: number): number | null {
  if (!view.state.field(renderModeField, false)) {
    return null;
  }

  const currentLine = view.state.doc.lineAt(sourceHead);
  const column = Math.max(0, sourceHead - currentLine.from);
  const lines = view.state.doc.toString().split("\n");

  if (key === "ArrowDown") {
    if (currentLine.number >= view.state.doc.lines) {
      return null;
    }
    const block = markdownCodeFenceBlockAt(lines, currentLine.number);
    if (!block) {
      return null;
    }
    const targetLine = view.state.doc.line(block.startLineIndex + 1);
    return Math.min(targetLine.from + column, targetLine.to);
  }

  if (currentLine.number <= 1) {
    return null;
  }
  const block = codeBlockEndingAtLine(lines, currentLine.number - 2);
  if (!block) {
    return null;
  }
  const targetLineNumber = block.closed && block.endLineIndex > block.startLineIndex + 1
    ? block.endLineIndex
    : block.endLineIndex + 1;
  const targetLine = view.state.doc.line(targetLineNumber);
  return Math.min(targetLine.from + column, targetLine.to);
}

function renderedHiddenPrefixLength(text: string): number {
  const taskPrefix = taskPrefixLength(text);
  if (taskPrefix) {
    return taskPrefix;
  }
  const headingMatch = String(text || "").match(/^(#{1,6})(\s+)/);
  if (headingMatch) {
    return headingMatch[0].length;
  }
  const quoteMatch = markdownBlockquotePrefixMatch(text);
  const quotePrefix = quoteMatch ? quoteMatch.prefixLength : 0;
  const listPrefix = markdownListPrefixMatch(text, quotePrefix);
  let prefixLength = quotePrefix + (listPrefix ? listPrefix.prefixLength : 0);

  const footnoteDefinition = markdownFootnoteDefinitionMatch(text, prefixLength);
  if (footnoteDefinition && footnoteDefinition.prefixLength) {
    return prefixLength + footnoteDefinition.prefixLength;
  }

  const abbreviationDefinition = markdownAbbreviationDefinitionMatch(text, prefixLength);
  if (abbreviationDefinition && abbreviationDefinition.prefixLength) {
    return prefixLength + abbreviationDefinition.prefixLength;
  }

  const definitionPrefix = markdownDefinitionListPrefixMatch(text, prefixLength);
  if (definitionPrefix) {
    prefixLength += definitionPrefix.prefixLength;
  }

  return prefixLength;
}

function handleRenderedLineBoundary(view: EditorView, key: "Home" | "End", extend = false): boolean {
  if (!view.state.field(renderModeField, false)) {
    return false;
  }

  const selection = view.state.selection.main;
  const currentLine = view.state.doc.lineAt(selection.head);
  const targetHead = key === "End"
    ? currentLine.to
    : renderedVisibleLineStart(currentLine);
  return dispatchRenderedSelection(view, targetHead, extend);
}

function handleRenderedHiddenPrefixHorizontalBoundary(view: EditorView, key: "ArrowLeft" | "ArrowRight"): boolean {
  if (!view.state.field(renderModeField, false)) {
    return false;
  }

  const selection = view.state.selection.main;
  if (!selection.empty) {
    return false;
  }

  const currentLine = view.state.doc.lineAt(selection.head);
  const currentPrefix = renderedHiddenPrefixLength(currentLine.text);
  const rawColumn = Math.max(0, selection.head - currentLine.from);

  if (key === "ArrowLeft") {
    if (!currentPrefix || rawColumn > currentPrefix) {
      return false;
    }
    if (currentLine.number <= 1) {
      return dispatchRenderedSelection(view, currentLine.from + currentPrefix);
    }
    const previousLine = view.state.doc.line(currentLine.number - 1);
    return dispatchRenderedSelection(view, previousLine.to);
  }

  if (currentPrefix && rawColumn < currentPrefix) {
    return dispatchRenderedSelection(view, currentLine.from + currentPrefix);
  }

  if (rawColumn !== currentLine.length || currentLine.number >= view.state.doc.lines) {
    return false;
  }

  const nextLine = view.state.doc.line(currentLine.number + 1);
  const nextPrefix = renderedHiddenPrefixLength(nextLine.text);
  if (!nextPrefix) {
    return false;
  }

  return dispatchRenderedSelection(view, nextLine.from + nextPrefix);
}

function handleRenderedVerticalArrow(view: EditorView, key: "ArrowUp" | "ArrowDown", extend = false): boolean {
  if (!view.state.field(renderModeField, false)) {
    return false;
  }

  const selection = view.state.selection.main;
  if (!extend && !selection.empty) {
    return false;
  }

  const sourceHead = selection.head;
  const taskTarget = renderedTaskArrowTarget(view, key, sourceHead);
  if (taskTarget !== null) {
    return dispatchRenderedSelection(view, taskTarget, extend);
  }

  const tableTarget = renderedTableArrowTarget(view, key, sourceHead);
  if (tableTarget !== null) {
    return dispatchRenderedSelection(view, tableTarget, extend);
  }

  const codeBlockTarget = renderedCodeBlockArrowTarget(view, key, sourceHead);
  if (codeBlockTarget !== null) {
    return dispatchRenderedSelection(view, codeBlockTarget, extend);
  }

  const currentLine = view.state.doc.lineAt(sourceHead);
  const targetLineNumber = key === "ArrowDown" ? currentLine.number + 1 : currentLine.number - 1;
  const targetHead = moveHeadToLine(view.state, sourceHead, targetLineNumber);
  if (targetHead === null) {
    return false;
  }
  return dispatchRenderedSelection(view, targetHead, extend);
}

interface InlineDeco {
  from: number;
  to: number;
  deco: Decoration;
  atomic?: boolean;
}

interface InlineSelectionLike {
  from: number;
  to: number;
  head: number;
  empty: boolean;
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

function inlineRangesOverlap(from: number, to: number, ranges: Array<{ from: number; to: number }>): boolean {
  return ranges.some(function (range) {
    return from < range.to && range.from < to;
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

function addHiddenInlineMarker(decos: InlineDeco[], from: number, to: number): void {
  if (to > from) {
    decos.push({
      from,
      to,
      deco: Decoration.replace({}),
      atomic: true,
    });
  }
}

function addInlineStyle(decos: InlineDeco[], from: number, to: number, className: string): void {
  if (to > from) {
    decos.push({
      from,
      to,
      deco: Decoration.mark({class: className}),
    });
  }
}

function addInlineDecoration(
  decos: InlineDeco[],
  from: number,
  to: number,
  className: string,
  attributes?: Record<string, string>
): void {
  if (to > from) {
    decos.push({
      from,
      to,
      deco: Decoration.mark({
        class: className,
        attributes,
      }),
    });
  }
}

function addInlineLinkLabelDecoration(
  decos: InlineDeco[],
  linkFrom: number,
  labelFrom: number,
  labelTo: number,
  linkTo: number,
  className: string,
  attributes?: Record<string, string>
): boolean {
  if (labelTo <= labelFrom || labelFrom < linkFrom || labelTo > linkTo) {
    return false;
  }
  addHiddenInlineMarker(decos, linkFrom, labelFrom);
  addHiddenInlineMarker(decos, labelTo, linkTo);
  addInlineDecoration(decos, labelFrom, labelTo, className, attributes);
  return true;
}

function addInlineDocumentLinkDecoration(
  decos: InlineDeco[],
  linkFrom: number,
  labelFrom: number,
  labelTo: number,
  linkTo: number,
  href: string,
  extraAttributes?: Record<string, string>
): boolean {
  return addInlineLinkLabelDecoration(
    decos,
    linkFrom,
    labelFrom,
    labelTo,
    linkTo,
    "cm-md-link",
    {
      "data-document-download": href,
      ...(extraAttributes || {}),
    }
  );
}

function addInlineExternalLinkDecoration(
  decos: InlineDeco[],
  linkFrom: number,
  labelFrom: number,
  labelTo: number,
  linkTo: number,
  href: string,
  extraAttributes?: Record<string, string>
): boolean {
  return addInlineLinkLabelDecoration(
    decos,
    linkFrom,
    labelFrom,
    labelTo,
    linkTo,
    "cm-md-link",
    {
      "data-external-link": href,
      ...(extraAttributes || {}),
    }
  );
}

function addInlinePageLinkDecoration(
  decos: InlineDeco[],
  linkFrom: number,
  labelFrom: number,
  labelTo: number,
  linkTo: number,
  target: string,
  extraAttributes?: Record<string, string>
): boolean {
  return addInlineLinkLabelDecoration(
    decos,
    linkFrom,
    labelFrom,
    labelTo,
    linkTo,
    "cm-md-link",
    {
      "data-page-link": target,
      ...(extraAttributes || {}),
    }
  );
}

function referenceDefinitionDecorationAttributes(
  referenceDefinitions: Map<string, MarkdownReferenceDefinition> | null,
  referenceLabel?: string
): Record<string, string> | undefined {
  if (!referenceDefinitions || !referenceLabel) {
    return undefined;
  }
  const definition = referenceDefinitions.get(normalizeMarkdownLinkLabel(referenceLabel));
  if (!definition || definition.from < 0) {
    return undefined;
  }
  return {
    "data-reference-definition-offset": String(definition.from),
  };
}

interface SpecialSpanLabelRange {
  labelFrom: number;
  labelTo: number;
  revealLeft: number | null;
  revealRight: number | null;
}

function specialSpanLabelRange(span: ReturnType<typeof findMarkdownInlineSpecialSpans>[number]): SpecialSpanLabelRange | null {
  if (span.kind === "wiki_link" || span.kind === "wiki_image") {
    const raw = String(span.raw || "");
    const closingOffset = raw.endsWith("]]") ? raw.length - 2 : raw.length;
    const pipeOffset = raw.indexOf("|");
    const prefixLength = span.kind === "wiki_image" ? 3 : 2;
    const labelFrom = pipeOffset >= 0 ? pipeOffset + 1 : prefixLength;
    if (closingOffset <= labelFrom) {
      return null;
    }
    return {
      labelFrom,
      labelTo: closingOffset,
      revealLeft: pipeOffset >= 0 ? prefixLength : null,
      revealRight: null,
    };
  }

  if (span.kind === "markdown_link" || span.kind === "markdown_image") {
    const raw = String(span.raw || "");
    const openOffset = raw.indexOf("[");
    const closeLabelOffset = raw.indexOf("](");
    if (openOffset < 0 || closeLabelOffset <= openOffset + 1) {
      return null;
    }
    const targetOffset = closeLabelOffset + 2;
    return {
      labelFrom: openOffset + 1,
      labelTo: closeLabelOffset,
      revealLeft: null,
      revealRight: targetOffset < raw.length ? targetOffset : null,
    };
  }

  return null;
}

function selectionEditsInlineLink(
  selection: InlineSelectionLike,
  linkFrom: number,
  _labelFrom: number,
  _labelTo: number,
  linkTo: number
): boolean {
  if (!selection.empty) {
    return selection.from < linkTo && selection.to > linkFrom;
  }
  return selection.head > linkFrom && selection.head < linkTo;
}

function nodeChildrenByName(node: MarkdownInlineNode, name: string): MarkdownInlineNode[] {
  return node.children.filter(function (child) {
    return child.name === name;
  });
}

function addInlineStyledNode(
  decos: InlineDeco[],
  blockedRanges: Array<{ from: number; to: number }>,
  node: MarkdownInlineNode,
  bodyFrom: number,
  className: string,
  markNodeName: string
): void {
  const nodeFrom = bodyFrom + node.from;
  const nodeTo = bodyFrom + node.to;
  if (inlineRangesOverlap(nodeFrom, nodeTo, blockedRanges)) {
    return;
  }

  const markNodes = nodeChildrenByName(node, markNodeName);
  if (markNodes.length < 2) {
    return;
  }

  const firstMark = markNodes[0];
  const lastMark = markNodes[markNodes.length - 1];
  addHiddenInlineMarker(decos, bodyFrom + firstMark.from, bodyFrom + firstMark.to);
  addHiddenInlineMarker(decos, bodyFrom + lastMark.from, bodyFrom + lastMark.to);
  addInlineStyle(decos, bodyFrom + firstMark.to, bodyFrom + lastMark.from, className);
}

function addSpecialInlineSpanDecoration(
  decos: InlineDeco[],
  blockedRanges: Array<{ from: number; to: number }>,
  body: string,
  bodyFrom: number,
  currentPagePath: string,
  selection: InlineSelectionLike
): void {
  const spans = findMarkdownInlineSpecialSpans(body);
  for (let index = 0; index < spans.length; index += 1) {
    const span = spans[index];
    const spanFrom = bodyFrom + span.from;
    const spanTo = bodyFrom + span.to;
    const target = String(span.target || "").trim();
    const anchor = String(span.anchor || "");
    const label = embeddedLinkLabel(target, String(span.label || ""));
    const resolvedPath = resolveDocumentPath(currentPagePath || "", target);
    const looksLikeDocument = resolvedPath ? documentPathLeaf(resolvedPath).indexOf(".") >= 0 : false;
    const labelRange = specialSpanLabelRange(span);
    const labelFrom = labelRange ? spanFrom + labelRange.labelFrom : spanFrom;
    const labelTo = labelRange ? spanFrom + labelRange.labelTo : spanTo;
    const editing = labelRange
      ? selectionEditsInlineLink(selection, spanFrom, labelFrom, labelTo, spanTo)
      : (selection.from < spanTo && selection.to > spanFrom);

    if (span.kind === "markdown_link") {
      if (/^[a-z]+:/i.test(target)) {
        if (isImagePath(target) && shouldRenderMarkdownLinkAsImage(label, target)) {
          decos.push({
            from: spanFrom,
            to: spanTo,
            deco: Decoration.replace({widget: new MarkdownImageWidget(target, target, label || documentPathLeaf(target) || "image")}),
            atomic: true,
          });
        } else {
          if (editing) {
            decos.push({
              from: spanFrom,
              to: spanTo,
              deco: Decoration.mark({class: "cm-md-link-raw"}),
            });
            blockedRanges.push({from: spanFrom, to: spanTo});
            continue;
          }
          if (!labelRange || !addInlineExternalLinkDecoration(decos, spanFrom, labelFrom, labelTo, spanTo, target)) {
            decos.push({
              from: spanFrom,
              to: spanTo,
              deco: Decoration.replace({widget: new ExternalLinkWidget(target, label || target)}),
              atomic: true,
            });
          }
        }
        blockedRanges.push({from: spanFrom, to: spanTo});
        continue;
      }

      if (resolvedPath && !/\.md$/i.test(resolvedPath) && !target.startsWith("#")) {
        if (isImagePath(resolvedPath) && shouldRenderMarkdownLinkAsImage(label, target)) {
          const href = inlineDocumentURL(resolvedPath);
          decos.push({
            from: spanFrom,
            to: spanTo,
            deco: Decoration.replace({widget: new MarkdownImageWidget(href, href, label || documentPathLeaf(resolvedPath) || "image")}),
            atomic: true,
          });
        } else {
          if (editing) {
            decos.push({
              from: spanFrom,
              to: spanTo,
              deco: Decoration.mark({class: "cm-md-link-raw"}),
            });
            blockedRanges.push({from: spanFrom, to: spanTo});
            continue;
          }
          if (!labelRange || !addInlineDocumentLinkDecoration(decos, spanFrom, labelFrom, labelTo, spanTo, documentDownloadURL(resolvedPath) + anchor)) {
            decos.push({
              from: spanFrom,
              to: spanTo,
              deco: Decoration.replace({widget: new MarkdownLinkWidget(documentDownloadURL(resolvedPath) + anchor, label || documentPathLeaf(resolvedPath) || documentPathLeaf(target) || target)}),
              atomic: true,
            });
          }
        }
        blockedRanges.push({from: spanFrom, to: spanTo});
        continue;
      }

      if (editing) {
        decos.push({
          from: spanFrom,
          to: spanTo,
          deco: Decoration.mark({class: "cm-md-link-raw"}),
        });
        blockedRanges.push({from: spanFrom, to: spanTo});
        continue;
      }

      if (!labelRange || !addInlinePageLinkDecoration(decos, spanFrom, labelFrom, labelTo, spanTo, target + anchor)) {
        decos.push({
          from: spanFrom,
          to: spanTo,
          deco: Decoration.replace({widget: new WikiLinkWidget(target + anchor, label || pageTitleFromPath(target))}),
          atomic: true,
        });
      }
      blockedRanges.push({from: spanFrom, to: spanTo});
      continue;
    }

    if (span.kind === "markdown_image") {
      if (editing) {
        decos.push({
          from: spanFrom,
          to: spanTo,
          deco: Decoration.mark({class: "cm-md-link-raw"}),
        });
        blockedRanges.push({from: spanFrom, to: spanTo});
        continue;
      }

      if (/^[a-z]+:/i.test(target)) {
        decos.push({
          from: spanFrom,
          to: spanTo,
          deco: Decoration.replace({widget: new MarkdownImageWidget(target, target, label || documentPathLeaf(target) || "image")}),
          atomic: true,
        });
        blockedRanges.push({from: spanFrom, to: spanTo});
        continue;
      }

      if (resolvedPath && !/\.md$/i.test(resolvedPath) && !target.startsWith("#")) {
        const href = inlineDocumentURL(resolvedPath);
        decos.push({
          from: spanFrom,
          to: spanTo,
          deco: Decoration.replace({widget: new MarkdownImageWidget(href, href, label || documentPathLeaf(resolvedPath) || "image")}),
          atomic: true,
        });
        blockedRanges.push({from: spanFrom, to: spanTo});
      }
      continue;
    }

    if (editing) {
      decos.push({
        from: spanFrom,
        to: spanTo,
        deco: Decoration.mark({class: "cm-md-link-raw"}),
      });
      blockedRanges.push({from: spanFrom, to: spanTo});
      continue;
    }

    if (span.kind === "wiki_link" && resolvedPath && looksLikeDocument && !/\.md$/i.test(resolvedPath) && !target.startsWith("#")) {
      if (isImagePath(resolvedPath)) {
        const href = inlineDocumentURL(resolvedPath);
        decos.push({
          from: spanFrom,
          to: spanTo,
          deco: Decoration.replace({widget: new MarkdownImageWidget(href, href, label || documentPathLeaf(resolvedPath) || "image")}),
          atomic: true,
        });
      } else {
        if (!labelRange || !addInlineDocumentLinkDecoration(decos, spanFrom, labelFrom, labelTo, spanTo, documentDownloadURL(resolvedPath))) {
          decos.push({
            from: spanFrom,
            to: spanTo,
            deco: Decoration.replace({widget: new MarkdownLinkWidget(documentDownloadURL(resolvedPath), label || documentPathLeaf(resolvedPath))}),
            atomic: true,
          });
        }
      }
      blockedRanges.push({from: spanFrom, to: spanTo});
      continue;
    }

    if (!labelRange || !addInlinePageLinkDecoration(decos, spanFrom, labelFrom, labelTo, spanTo, target)) {
      decos.push({
        from: spanFrom,
        to: spanTo,
        deco: Decoration.replace({widget: new WikiLinkWidget(target, label)}),
        atomic: true,
      });
    }
    blockedRanges.push({from: spanFrom, to: spanTo});
  }
}

function addAllowedInlineHtmlSpanDecorations(
  decos: InlineDeco[],
  blockedRanges: Array<{ from: number; to: number }>,
  body: string,
  bodyFrom: number,
  selection: InlineSelectionLike
): void {
  const classNames: Record<AllowedInlineHtmlSpan["tagName"], string> = {
    sub: "cm-md-html-sub",
    sup: "cm-md-html-sup",
    kbd: "cm-md-html-kbd",
    mark: "cm-md-html-mark",
  };

  const spans = findAllowedInlineHtmlSpans(body);
  for (let index = 0; index < spans.length; index += 1) {
    const span = spans[index];
    const spanFrom = bodyFrom + span.from;
    const spanTo = bodyFrom + span.to;
    const editing = selection.from <= spanTo && selection.to >= spanFrom;
    if (editing) {
      decos.push({
        from: spanFrom,
        to: spanTo,
        deco: Decoration.mark({class: "cm-md-html-raw"}),
        atomic: true,
      });
      blockedRanges.push({from: spanFrom, to: spanTo});
      continue;
    }

    const openingTagLength = span.innerFrom - span.from;
    const closingTagLength = span.to - span.innerTo;
    addHiddenInlineMarker(decos, spanFrom, spanFrom + openingTagLength);
    addHiddenInlineMarker(decos, spanTo - closingTagLength, spanTo);
    addInlineStyle(decos, bodyFrom + span.innerFrom, bodyFrom + span.innerTo, classNames[span.tagName]);
    blockedRanges.push({from: spanFrom, to: spanTo});
  }
}

function addInlineMathSpanDecorations(
  decos: InlineDeco[],
  blockedRanges: Array<{ from: number; to: number }>,
  body: string,
  bodyFrom: number,
  selection: InlineSelectionLike
): void {
  const spans = findInlineMathSpans(body);
  for (let index = 0; index < spans.length; index += 1) {
    const span = spans[index];
    const spanFrom = bodyFrom + span.from;
    const spanTo = bodyFrom + span.to;
    const editing = selection.from <= spanTo && selection.to >= spanFrom;
    if (editing) {
      decos.push({
        from: spanFrom,
        to: spanTo,
        deco: Decoration.mark({class: "cm-md-math-raw"}),
        atomic: true,
      });
      blockedRanges.push({from: spanFrom, to: spanTo});
      continue;
    }

    addHiddenInlineMarker(decos, spanFrom, spanFrom + 1);
    addHiddenInlineMarker(decos, spanTo - 1, spanTo);
    addInlineStyle(decos, bodyFrom + span.innerFrom, bodyFrom + span.innerTo, "cm-md-math-inline");
    blockedRanges.push({from: spanFrom, to: spanTo});
  }
}

function addInlineAbbreviationDecorations(
  decos: InlineDeco[],
  blockedRanges: Array<{ from: number; to: number }>,
  body: string,
  bodyFrom: number,
  editingLine: boolean,
  abbreviationDefinitions: Map<string, MarkdownAbbreviationDefinition> | null
): void {
  if (editingLine || !abbreviationDefinitions || !abbreviationDefinitions.size) {
    return;
  }

  const spans = findMarkdownAbbreviationUsageSpans(body, abbreviationDefinitions);
  for (let index = 0; index < spans.length; index += 1) {
    const span = spans[index];
    const spanFrom = bodyFrom + span.from;
    const spanTo = bodyFrom + span.to;
    if (inlineRangesOverlap(spanFrom, spanTo, blockedRanges)) {
      continue;
    }

    addInlineDecoration(decos, spanFrom, spanTo, "cm-md-abbr", {
      title: span.title || span.label,
      "aria-label": span.title || span.label,
    });
  }
}

function addParsedInlineDecorationNode(
  decos: InlineDeco[],
  blockedRanges: Array<{ from: number; to: number }>,
  node: MarkdownInlineNode,
  parentName: string,
  body: string,
  bodyFrom: number,
  editingLine: boolean,
  selection: InlineSelectionLike,
  currentPagePath: string,
  referenceDefinitions: Map<string, MarkdownReferenceDefinition> | null
): void {
  const nodeFrom = bodyFrom + node.from;
  const nodeTo = bodyFrom + node.to;

  switch (node.name) {
    case "Link": {
      const footnoteReference = markdownFootnoteReferenceMatch(body.slice(node.from, node.to));
      if (footnoteReference) {
        if (!editingLine && !inlineRangesOverlap(nodeFrom, nodeTo, blockedRanges)) {
          addHiddenInlineMarker(decos, nodeFrom, nodeFrom + 2);
          addHiddenInlineMarker(decos, nodeTo - 1, nodeTo);
          addInlineStyle(decos, nodeFrom + 2, nodeTo - 1, "cm-md-footnote-ref");
          blockedRanges.push({from: nodeFrom, to: nodeTo});
        }
        return;
      }

      if (inlineRangesOverlap(nodeFrom, nodeTo, blockedRanges)) {
        return;
      }
      const info = markdownResolvedLinkInfo(node, body, referenceDefinitions);
      if (!info) {
        return;
      }
      const target = String(info.target || "").trim();
      const label = visibleTextFromChildren(node, body, info.labelFrom, info.labelTo).trim() || pageTitleFromPath(target);
      const labelFrom = bodyFrom + info.labelFrom;
      const labelTo = bodyFrom + info.labelTo;
      const referenceAttributes = referenceDefinitionDecorationAttributes(referenceDefinitions, info.referenceLabel);
      const editing = selectionEditsInlineLink(selection, nodeFrom, labelFrom, labelTo, nodeTo);
      if (editing) {
        decos.push({
          from: nodeFrom,
          to: nodeTo,
          deco: Decoration.mark({class: "cm-md-link-raw"}),
        });
        blockedRanges.push({from: nodeFrom, to: nodeTo});
        return;
      }

      if (/^[a-z]+:/i.test(target)) {
        if (isImagePath(target) && shouldRenderMarkdownLinkAsImage(label, target)) {
          decos.push({
            from: nodeFrom,
            to: nodeTo,
            deco: Decoration.replace({widget: new MarkdownImageWidget(target, target, label || documentPathLeaf(target) || "image")}),
            atomic: true,
          });
        } else {
          if (!addInlineExternalLinkDecoration(decos, nodeFrom, labelFrom, labelTo, nodeTo, target, referenceAttributes)) {
            decos.push({
              from: nodeFrom,
              to: nodeTo,
              deco: Decoration.replace({widget: new ExternalLinkWidget(target, label || target)}),
              atomic: true,
            });
          }
        }
        blockedRanges.push({from: nodeFrom, to: nodeTo});
        return;
      }

      const resolvedPath = resolveDocumentPath(currentPagePath || "", target);
      if (resolvedPath && !/\.md$/i.test(resolvedPath) && !target.startsWith("#")) {
        if (isImagePath(resolvedPath) && shouldRenderMarkdownLinkAsImage(label, target)) {
          const imageHref = inlineDocumentURL(resolvedPath);
          decos.push({
            from: nodeFrom,
            to: nodeTo,
            deco: Decoration.replace({widget: new MarkdownImageWidget(imageHref, imageHref, label || documentPathLeaf(resolvedPath) || "image")}),
            atomic: true,
          });
        } else if (!addInlineDocumentLinkDecoration(decos, nodeFrom, labelFrom, labelTo, nodeTo, documentDownloadURL(resolvedPath), referenceAttributes)) {
          decos.push({
            from: nodeFrom,
            to: nodeTo,
            deco: Decoration.replace({widget: new MarkdownLinkWidget(documentDownloadURL(resolvedPath), label || documentPathLeaf(resolvedPath) || documentPathLeaf(target) || target)}),
            atomic: true,
          });
        }
        blockedRanges.push({from: nodeFrom, to: nodeTo});
        return;
      }

      if (!addInlinePageLinkDecoration(decos, nodeFrom, labelFrom, labelTo, nodeTo, target, referenceAttributes)) {
        decos.push({
          from: nodeFrom,
          to: nodeTo,
          deco: Decoration.replace({widget: new WikiLinkWidget(target, label || pageTitleFromPath(target))}),
          atomic: true,
        });
      }
      blockedRanges.push({from: nodeFrom, to: nodeTo});
      return;
    }

    case "Image": {
      if (inlineRangesOverlap(nodeFrom, nodeTo, blockedRanges)) {
        return;
      }
      const info = markdownResolvedLinkInfo(node, body, referenceDefinitions);
      if (!info) {
        return;
      }
      const target = String(info.target || "").trim();
      const alt = visibleTextFromChildren(node, body, info.labelFrom, info.labelTo).trim();
      const editing = selection.from <= nodeTo && selection.to >= nodeFrom;
      if (editing) {
        decos.push({
          from: nodeFrom,
          to: nodeTo,
          deco: Decoration.mark({class: "cm-md-link-raw"}),
        });
        blockedRanges.push({from: nodeFrom, to: nodeTo});
        return;
      }

      if (/^[a-z]+:/i.test(target)) {
        decos.push({
          from: nodeFrom,
          to: nodeTo,
          deco: Decoration.replace({widget: new MarkdownImageWidget(target, target, alt || documentPathLeaf(target) || "image")}),
          atomic: true,
        });
        blockedRanges.push({from: nodeFrom, to: nodeTo});
        return;
      }

      const resolvedPath = resolveDocumentPath(currentPagePath || "", target);
      if (resolvedPath && !/\.md$/i.test(resolvedPath) && !target.startsWith("#")) {
        const href = inlineDocumentURL(resolvedPath);
        decos.push({
          from: nodeFrom,
          to: nodeTo,
          deco: Decoration.replace({widget: new MarkdownImageWidget(href, href, alt || documentPathLeaf(resolvedPath) || "image")}),
          atomic: true,
        });
        blockedRanges.push({from: nodeFrom, to: nodeTo});
      }
      return;
    }

    case "Autolink": {
      if (inlineRangesOverlap(nodeFrom, nodeTo, blockedRanges)) {
        return;
      }
      const urlNode = node.children.find(function (child) {
        return child.name === "URL";
      });
      const target = String(urlNode ? body.slice(urlNode.from, urlNode.to) : body.slice(node.from, node.to)).trim();
      if (!target) {
        return;
      }
      const editing = selection.from <= nodeTo && selection.to >= nodeFrom;
      if (editing) {
        decos.push({
          from: nodeFrom,
          to: nodeTo,
          deco: Decoration.mark({class: "cm-md-link-raw"}),
        });
      } else if (!editingLine) {
        decos.push({
          from: nodeFrom,
          to: nodeTo,
          deco: Decoration.replace({widget: new ExternalLinkWidget(target, target)}),
          atomic: true,
        });
      }
      blockedRanges.push({from: nodeFrom, to: nodeTo});
      return;
    }

    case "URL": {
      if (parentName === "Link" || parentName === "Image" || parentName === "Autolink" || inlineRangesOverlap(nodeFrom, nodeTo, blockedRanges)) {
        return;
      }
      const target = String(body.slice(node.from, node.to) || "").trim();
      if (!target) {
        return;
      }
      const editing = selection.from <= nodeTo && selection.to >= nodeFrom;
      if (editing) {
        decos.push({
          from: nodeFrom,
          to: nodeTo,
          deco: Decoration.mark({class: "cm-md-link-raw"}),
        });
      } else if (!editingLine) {
        decos.push({
          from: nodeFrom,
          to: nodeTo,
          deco: Decoration.replace({widget: new ExternalLinkWidget(target, target)}),
          atomic: true,
        });
      }
      blockedRanges.push({from: nodeFrom, to: nodeTo});
      return;
    }

    case "InlineCode":
      if (!editingLine) {
        addInlineStyledNode(decos, blockedRanges, node, bodyFrom, "cm-md-inline-code", "CodeMark");
        blockedRanges.push({from: nodeFrom, to: nodeTo});
      }
      return;

    case "StrongEmphasis":
      if (!editingLine) {
        addInlineStyledNode(decos, blockedRanges, node, bodyFrom, "cm-md-bold", "EmphasisMark");
      }
      break;

    case "Emphasis":
      if (!editingLine) {
        addInlineStyledNode(decos, blockedRanges, node, bodyFrom, "cm-md-italic", "EmphasisMark");
      }
      break;

    case "Strikethrough":
      if (!editingLine) {
        addInlineStyledNode(decos, blockedRanges, node, bodyFrom, "cm-md-strikethrough", "StrikethroughMark");
      }
      break;

    case "Subscript":
      if (!editingLine) {
        addInlineStyledNode(decos, blockedRanges, node, bodyFrom, "cm-md-subscript", "SubscriptMark");
      }
      break;

    case "Superscript":
      if (!editingLine) {
        addInlineStyledNode(decos, blockedRanges, node, bodyFrom, "cm-md-superscript", "SuperscriptMark");
      }
      break;

    case "Emoji":
      if (!editingLine && !inlineRangesOverlap(nodeFrom, nodeTo, blockedRanges)) {
        const raw = body.slice(node.from, node.to);
        const emoji = markdownEmojiCharacter(raw);
        if (emoji !== raw) {
          decos.push({
            from: nodeFrom,
            to: nodeTo,
            deco: Decoration.replace({
              widget: new InlineHTMLWidget(
                "cm-md-inline-widget cm-md-emoji",
                '<span role="img" aria-label="' + escapeHTML(raw) + '">' + escapeHTML(emoji) + "</span>"
              ),
            }),
            atomic: true,
          });
          blockedRanges.push({from: nodeFrom, to: nodeTo});
        }
      }
      return;

    case "Escape":
      if (!editingLine && !inlineRangesOverlap(nodeFrom, nodeTo, blockedRanges) && node.to > node.from) {
        addHiddenInlineMarker(decos, nodeFrom, nodeFrom + 1);
      }
      return;
  }

  for (let index = 0; index < node.children.length; index += 1) {
    addParsedInlineDecorationNode(
      decos,
      blockedRanges,
      node.children[index],
      node.name,
      body,
      bodyFrom,
      editingLine,
      selection,
      currentPagePath,
      referenceDefinitions
    );
  }
}

function addInlineDecorations(
  builder: RangeSetBuilder<Decoration>,
  atomicBuilder: RangeSetBuilder<Decoration>,
  lineFrom: number,
  text: string,
  startOffset: number,
  editingLine: boolean,
  selection: InlineSelectionLike,
  currentPagePath: string,
  referenceDefinitions: Map<string, MarkdownReferenceDefinition> | null,
  abbreviationDefinitions: Map<string, MarkdownAbbreviationDefinition> | null,
  extraDecos: InlineDeco[]
): void {
  const decos: InlineDeco[] = extraDecos.slice();
  const blockedRanges: Array<{ from: number; to: number }> = [];
  const body = text.slice(startOffset);
  const bodyFrom = lineFrom + startOffset;
  addSpecialInlineSpanDecoration(decos, blockedRanges, body, bodyFrom, currentPagePath, selection);
  addAllowedInlineHtmlSpanDecorations(decos, blockedRanges, body, bodyFrom, selection);
  addInlineMathSpanDecorations(decos, blockedRanges, body, bodyFrom, selection);
  const root = parseInlineMarkdownTree(body);
  addParsedInlineDecorationNode(decos, blockedRanges, root, "", body, bodyFrom, editingLine, selection, currentPagePath, referenceDefinitions);
  addInlineAbbreviationDecorations(decos, blockedRanges, body, bodyFrom, editingLine, abbreviationDefinitions);

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
  const expandedCodeBlocks = state.field(expandedCodeBlocksField);
  const codeBlocksAlwaysExpanded = state.field(codeBlocksAlwaysExpandedField);
  const viewOnly = state.field(viewOnlyField, false);
  const selection: InlineSelectionLike = viewOnly
    ? {
        from: -1,
        to: -1,
        head: -1,
        empty: true,
      }
    : state.selection.main;
  const currentPagePath = state.field(pagePathField);
  const markdown = state.doc.toString();
  const lines = markdown.split("\n");
  const abbreviationDefinitions = markdownAbbreviationDefinitions(markdown);
  const referenceDefinitions = markdownReferenceDefinitions(markdown);
  const referenceDefinitionStarts = new Map<number, { definition: MarkdownReferenceDefinition; endLineNumber: number }>();
  const referenceDefinitionEntries: Array<{ definition: MarkdownReferenceDefinition; endLineNumber: number }> = [];
  referenceDefinitions.forEach(function (definition) {
    const fromLine = state.doc.lineAt(definition.from).number;
    const toLine = state.doc.lineAt(Math.max(definition.from, definition.to - 1)).number;
    const entry = {
      definition,
      endLineNumber: toLine,
    };
    referenceDefinitionStarts.set(fromLine, entry);
    referenceDefinitionEntries.push(entry);
  });
  const editingReferenceDefinitions = referenceDefinitionEntries.some(function (entry) {
    const startLine = state.doc.lineAt(entry.definition.from);
    const endLine = state.doc.line(entry.endLineNumber);
    return selection.from <= endLine.to && selection.to >= startLine.from;
  });
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
    const referenceDefinitionEntry = referenceDefinitionStarts.get(lineNumber);
    if (referenceDefinitionEntry && !editingReferenceDefinitions) {
      const endLine = state.doc.line(referenceDefinitionEntry.endLineNumber);
      const hiddenTo = referenceDefinitionEntry.endLineNumber < state.doc.lines
        ? endLine.to + 1
        : endLine.to;
      builder.add(line.from, hiddenTo, Decoration.replace({block: true}));
      addAtomicRange(atomicBuilder, line.from, hiddenTo);
      lineNumber = referenceDefinitionEntry.endLineNumber;
      continue;
    }
    const tableBlock = markdownTableBlockAt(lines, lineNumber - 1, {
      abbreviationDefinitions,
      currentPagePath,
      referenceDefinitions,
    });
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
          widget: new MarkdownTableWidget(tableBlock.html, viewOnly),
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
          widget: new QueryBlockWidget(html, editLineNumber, viewOnly),
        })
      );
      addAtomicRange(atomicBuilder, line.from, endLine.to);
      lineNumber = endLineNumber;
      continue;
    }

    const mathBlock = markdownMathBlockAt(lines, lineNumber - 1);
    if (mathBlock) {
      const endLine = state.doc.line(mathBlock.endLineIndex + 1);
      const editingMathBlock = selection.from <= endLine.to && selection.to >= line.from;
      if (editingMathBlock) {
        lineNumber = mathBlock.endLineIndex + 1;
        continue;
      }
      for (let mathLineNumber = lineNumber; mathLineNumber <= mathBlock.endLineIndex + 1; mathLineNumber += 1) {
        const mathLine = state.doc.line(mathLineNumber);
        if (mathLineNumber === lineNumber || mathLineNumber === mathBlock.endLineIndex + 1) {
          builder.add(mathLine.from, mathLine.from, Decoration.line({class: "cm-md-math-block-fence"}));
          builder.add(mathLine.from, mathLine.to, Decoration.replace({}));
          addAtomicRange(atomicBuilder, mathLine.from, mathLine.to);
        } else {
          builder.add(mathLine.from, mathLine.from, Decoration.line({class: "cm-md-math-block-body"}));
        }
      }
      lineNumber = mathBlock.endLineIndex + 1;
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
      const bodyLineCount = Math.max(0, codeBlock.content ? codeBlock.content.split("\n").length : 0);
      const codeBlockKey = codeBlockStateKey(lineNumber, codeBlock.content, codeBlock.language);
      const canCollapse = bodyLineCount > collapsedCodeBlockVisibleLines && !codeBlocksAlwaysExpanded;
      const expanded = codeBlocksAlwaysExpanded || (canCollapse ? Boolean(expandedCodeBlocks[codeBlockKey]) : false);
      const hiddenLineCount = canCollapse && !expanded
        ? bodyLineCount - collapsedCodeBlockVisibleLines
        : 0;
      for (let codeLineNumber = lineNumber; codeLineNumber <= codeBlock.endLineIndex + 1; codeLineNumber += 1) {
        const codeLine = state.doc.line(codeLineNumber);
        const classNames = ["cm-md-code-block"];
        let replaceDecoration: Decoration | null = null;
        if (codeLineNumber === lineNumber) {
          classNames.push("cm-md-code-block-start");
          replaceDecoration = Decoration.replace({
            widget: new CodeToolbarWidget(codeBlock.content, codeBlock.language, codeBlockKey, canCollapse, expanded, hiddenLineCount, viewOnly),
          });
        } else if (codeLineNumber === codeBlock.endLineIndex + 1) {
          classNames.push("cm-md-code-block-end", "cm-md-code-fence-hidden");
          replaceDecoration = Decoration.replace({});
        } else {
          classNames.push("cm-md-code-block-body");
          const bodyLineIndex = codeLineNumber - lineNumber - 1;
          if (canCollapse && !expanded && bodyLineIndex >= collapsedCodeBlockVisibleLines) {
            classNames.push("cm-md-code-block-hidden");
            addAtomicRange(atomicBuilder, codeLine.from, codeLine.to);
          } else if (canCollapse && !expanded && bodyLineIndex === collapsedCodeBlockVisibleLines - 1) {
            classNames.push("cm-md-code-block-truncated");
          }
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

    const htmlLine = markdownHtmlLineMatch(text);
    if (htmlLine) {
      if (!editingLine) {
        if (htmlLine.kind === "details_open" || htmlLine.kind === "details_close" || htmlLine.kind === "dl_open" || htmlLine.kind === "dl_close") {
          builder.add(from, line.to, Decoration.replace({}));
          addAtomicRange(atomicBuilder, from, line.to);
          continue;
        }

        const innerHTML = renderInline(String(htmlLine.inner || ""), {
          abbreviationDefinitions,
          currentPagePath,
          referenceDefinitions,
        });
        let className = "cm-md-html-line";
        let html = innerHTML;
        if (htmlLine.kind === "summary") {
          className += " cm-md-html-summary";
          html = '<span class="cm-md-html-summary-marker" aria-hidden="true">▾</span><span class="cm-md-html-summary-text">' + innerHTML + "</span>";
        } else if (htmlLine.kind === "dt") {
          className += " cm-md-html-dt";
        } else if (htmlLine.kind === "dd") {
          className += " cm-md-html-dd";
        }

        builder.add(from, from, Decoration.line({class: className}));
        builder.add(from, line.to, Decoration.replace({widget: new HtmlLineWidget(className, html)}));
        addAtomicRange(atomicBuilder, from, line.to);
        continue;
      }
    }

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

    const quoteMatch = markdownBlockquotePrefixMatch(text);
    if (quoteMatch) {
      const previousQuoteMatch = lineNumber > 1
        ? markdownBlockquotePrefixMatch(lines[lineNumber - 2] || "")
        : null;
      const nextQuoteMatch = lineNumber < lines.length
        ? markdownBlockquotePrefixMatch(lines[lineNumber] || "")
        : null;
      builder.add(
        from,
        from,
        Decoration.line({
          class: "cm-md-quote",
          attributes: {
            style: quoteLineStyle(quoteMatch.depth, Boolean(previousQuoteMatch), Boolean(nextQuoteMatch)),
          },
        })
      );
      builder.add(from, from + quoteMatch.prefixLength, Decoration.replace({}));
      addAtomicRange(atomicBuilder, from, from + quoteMatch.prefixLength);
      if (quoteMatch.prefixLength > inlineStart) {
        inlineStart = quoteMatch.prefixLength;
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
      builder.add(from, from + prefixLength, Decoration.replace({widget: new TaskCheckboxWidget(task.done, task.ref, indentLength, viewOnly)}));
      addAtomicRange(atomicBuilder, from, from + prefixLength);
      inlineStart = prefixLength;

      if (!viewOnly) {
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
      }
      taskInlineDatePattern.lastIndex = 0;

      if (task.text && bodyText.startsWith(task.text) && task.who && task.who.length) {
        taskMetaWidget = new TaskMetaWidget(task);
      }
    }

    const listPrefix = markdownListPrefixMatch(text, inlineStart);
    if (listPrefix) {
      if (editingLine) {
        builder.add(
          from + inlineStart,
          from + inlineStart + listPrefix.prefixLength,
          Decoration.mark({class: "cm-md-list-raw"})
        );
      } else {
        builder.add(
          from + inlineStart,
          from + inlineStart + listPrefix.prefixLength,
          Decoration.replace({widget: new ListMarkerWidget(listPrefix.markerText, listPrefix.prefixLength, listPrefix.indentLength, listPrefix.ordered)})
        );
        addAtomicRange(atomicBuilder, from + inlineStart, from + inlineStart + listPrefix.prefixLength);
      }
      inlineStart += listPrefix.prefixLength;
    }

    const footnoteDefinition = markdownFootnoteDefinitionMatch(text, inlineStart);
    if (footnoteDefinition && footnoteDefinition.prefixLength) {
      if (!editingLine) {
        builder.add(from, from, Decoration.line({class: "cm-md-footnote-line"}));
        builder.add(
          from + inlineStart,
          from + inlineStart + footnoteDefinition.prefixLength,
          Decoration.replace({
            widget: new InlineHTMLWidget(
              "cm-md-inline-widget cm-md-footnote-label",
              '<sup class="cm-md-footnote-ref">' + escapeHTML(footnoteDefinition.displayLabel) + "</sup>",
              {
                "--md-prefix-width": String(footnoteDefinition.prefixLength * 0.62) + "rem",
              }
            ),
          })
        );
        addAtomicRange(atomicBuilder, from + inlineStart, from + inlineStart + footnoteDefinition.prefixLength);
        inlineStart += footnoteDefinition.prefixLength;
      }
    } else {
      const abbreviationDefinition = markdownAbbreviationDefinitionMatch(text, inlineStart);
      if (abbreviationDefinition && abbreviationDefinition.prefixLength) {
        if (!editingLine) {
          builder.add(from, from, Decoration.line({class: "cm-md-abbr-definition-line"}));
          builder.add(
            from + inlineStart,
            from + inlineStart + abbreviationDefinition.prefixLength,
            Decoration.replace({
              widget: new InlineHTMLWidget(
                "cm-md-inline-widget cm-md-abbr-definition-label",
                '<span class="cm-md-abbr-definition-chip">' + escapeHTML(abbreviationDefinition.label) + "</span>",
                {
                  "--md-prefix-width": String(abbreviationDefinition.prefixLength * 0.62) + "rem",
                }
              ),
            })
          );
          addAtomicRange(atomicBuilder, from + inlineStart, from + inlineStart + abbreviationDefinition.prefixLength);
          inlineStart += abbreviationDefinition.prefixLength;
        }
      } else {
        const definitionPrefix = markdownDefinitionListPrefixMatch(text, inlineStart);
        if (definitionPrefix) {
          if (!editingLine) {
            builder.add(from, from, Decoration.line({class: "cm-md-definition-desc"}));
            builder.add(
              from + inlineStart,
              from + inlineStart + definitionPrefix.prefixLength,
              Decoration.replace({
                widget: new InlineHTMLWidget(
                  "cm-md-inline-widget cm-md-definition-marker",
                  '<span class="cm-md-definition-marker-glyph" aria-hidden="true">›</span>',
                  {
                    "--md-prefix-width": String(definitionPrefix.prefixLength * 0.62) + "rem",
                  }
                ),
              })
            );
            addAtomicRange(atomicBuilder, from + inlineStart, from + inlineStart + definitionPrefix.prefixLength);
            inlineStart += definitionPrefix.prefixLength;
          }
        } else if (!editingLine) {
          const nextLineText = lineNumber < state.doc.lines ? state.doc.line(lineNumber + 1).text : "";
          if (isMarkdownDefinitionTermLine(text, nextLineText, inlineStart)) {
            builder.add(from, from, Decoration.line({class: "cm-md-definition-term"}));
          }
        }
      }
    }

    if (isMarkdownThematicBreak(text) && !editingLine) {
      builder.add(from, from, Decoration.line({class: "cm-md-rule-line"}));
      builder.add(from, line.to, Decoration.replace({widget: new ThematicBreakWidget()}));
      addAtomicRange(atomicBuilder, from, line.to);
      continue;
    }

    addInlineDecorations(
      builder,
      atomicBuilder,
      from,
      text,
      inlineStart,
      editingLine,
      selection,
      currentPagePath,
      referenceDefinitions,
      abbreviationDefinitions,
      inlineExtraDecos
    );

    if (taskMetaWidget) {
      builder.add(line.to, line.to, Decoration.widget({widget: taskMetaWidget, side: 1}));
    }
  }

  if (referenceDefinitionEntries.length && !editingReferenceDefinitions) {
    builder.add(
      state.doc.length,
      state.doc.length,
      Decoration.widget({
        block: true,
        side: 1,
        widget: new ReferenceDefinitionsWidget(referenceDefinitionEntries.map(function (entry) {
          return entry.definition;
        })),
      })
    );
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

const viewOnlyField = StateField.define<boolean>({
  create() {
    return false;
  },
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setViewOnlyEffect)) {
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
    const viewOnlyChanged = transaction.effects.some((effect) => effect.is(setViewOnlyEffect));
    const tasksChanged = transaction.effects.some((effect) => effect.is(setTasksEffect));
    const codeBlockPreferenceChanged = transaction.effects.some((effect) => effect.is(setCodeBlocksAlwaysExpandedEffect));
    const codeBlocksChanged = transaction.effects.some((effect) => effect.is(toggleCodeBlockExpandedEffect));
    if (!modeChanged && !viewOnlyChanged && !tasksChanged && !codeBlockPreferenceChanged && !codeBlocksChanged && !transaction.docChanged && !transaction.selection) {
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
        if (view.state.field(viewOnlyField, false)) {
          return false;
        }
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
        const viewOnly = view.state.field(viewOnlyField, false);
        const target = event.target instanceof Element ? event.target : null;
        const referenceJump = target ? target.closest("[data-reference-jump]") : null;
        if (referenceJump) {
          if (event.button !== 0) {
            return false;
          }
          event.preventDefault();
          const offset = Number(referenceJump.getAttribute("data-reference-jump") || "-1");
          if (offset >= 0 && offset <= view.state.doc.length) {
            focusEditorView(view, host, {preventScroll: true});
            view.dispatch({
              selection: {
                anchor: offset,
              },
              scrollIntoView: true,
            });
          }
          return true;
        }

        const pageLink = target ? target.closest("[data-page-link]") : null;
        if (pageLink) {
          if (event.button !== 0) {
            return false;
          }
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
          if (event.button !== 0) {
            return false;
          }
          event.preventDefault();
          host.dispatchEvent(new CustomEvent("noterious:document-download", {
            detail: {
              href: documentLink.getAttribute("data-document-download") || "",
            },
            bubbles: true,
          }));
          return true;
        }

        const externalLink = target ? target.closest("[data-external-link]") : null;
        if (externalLink) {
          if (event.button !== 0) {
            return false;
          }
          event.preventDefault();
          const href = externalLink.getAttribute("data-external-link") || "";
          if (href) {
            try {
              window.open(href, "_blank", "noopener");
            } catch (_error) {
              // Ignore blocked popup environments.
            }
          }
          return true;
        }

        const queryEdit = target ? target.closest("[data-query-edit]") : null;
        if (queryEdit) {
          if (viewOnly) {
            return true;
          }
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

        const codeToggle = target ? target.closest("[data-code-toggle]") : null;
        if (codeToggle) {
          if (viewOnly) {
            return true;
          }
          event.preventDefault();
          const key = String(codeToggle.getAttribute("data-code-toggle") || "");
          if (key) {
            view.dispatch({
              effects: toggleCodeBlockExpandedEffect.of(key),
            });
          }
          return true;
        }

        const taskToggle = target ? target.closest("[data-task-toggle]") : null;
        if (taskToggle) {
          if (viewOnly) {
            return true;
          }
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
          if (viewOnly) {
            return true;
          }
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
          if (viewOnly) {
            return true;
          }
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
      contextmenu(event) {
        const target = event.target instanceof Element ? event.target : null;
        const referenceLink = target
          ? target.closest("[data-reference-definition-offset][data-page-link], [data-reference-definition-offset][data-document-download], [data-reference-definition-offset][data-external-link]")
          : null;
        if (!referenceLink) {
          return false;
        }
        event.preventDefault();
        host.dispatchEvent(new CustomEvent("noterious:reference-link-contextmenu", {
          detail: {
            page: referenceLink.getAttribute("data-page-link") || "",
            documentHref: referenceLink.getAttribute("data-document-download") || "",
            externalHref: referenceLink.getAttribute("data-external-link") || "",
            definitionOffset: referenceLink.getAttribute("data-reference-definition-offset") || "",
            left: event.clientX,
            top: event.clientY,
          },
          bubbles: true,
        }));
        return true;
      },
      keydown(event, view) {
        const viewOnly = view.state.field(viewOnlyField, false);
        const target = event.target instanceof Element ? event.target : null;
        const taskToggle = target ? target.closest("[data-task-toggle]") : null;
        if (!viewOnly && taskToggle && (event.key === " " || event.key === "Enter")) {
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

    const extensions = [
      editableCompartment.of(EditorView.editable.of(true)),
      readOnlyCompartment.of(EditorState.readOnly.of(false)),
      history(),
      drawSelection(),
      highlightActiveLine(),
      keymap.of([
        {
          key: "ArrowUp",
          run(view) {
            return handleRenderedVerticalArrow(view, "ArrowUp");
          },
        },
        {
          key: "ArrowDown",
          run(view) {
            return handleRenderedVerticalArrow(view, "ArrowDown");
          },
        },
        {
          key: "Shift-ArrowUp",
          run(view) {
            return handleRenderedVerticalArrow(view, "ArrowUp", true);
          },
        },
        {
          key: "Shift-ArrowDown",
          run(view) {
            return handleRenderedVerticalArrow(view, "ArrowDown", true);
          },
        },
        {
          key: "ArrowLeft",
          run(view) {
            return handleRenderedHiddenPrefixHorizontalBoundary(view, "ArrowLeft");
          },
        },
        {
          key: "ArrowRight",
          run(view) {
            return handleRenderedHiddenPrefixHorizontalBoundary(view, "ArrowRight");
          },
        },
        {
          key: "Home",
          run(view) {
            return handleRenderedLineBoundary(view, "Home");
          },
        },
        {
          key: "End",
          run(view) {
            return handleRenderedLineBoundary(view, "End");
          },
        },
        {
          key: "Shift-Home",
          run(view) {
            return handleRenderedLineBoundary(view, "Home", true);
          },
        },
        {
          key: "Shift-End",
          run(view) {
            return handleRenderedLineBoundary(view, "End", true);
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
      viewOnlyField,
      pagePathField,
      highlightedLineField,
      queryBlocksField,
      tasksField,
      expandedCodeBlocksField,
      codeBlocksAlwaysExpandedField,
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
    ];

    function createViewState(value: string): EditorState {
      return EditorState.create({
        doc: value,
        extensions,
      });
    }

    const view = new EditorView({
      state: createViewState(textarea.value || ""),
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
      syncValue(value: string) {
        const nextValue = String(value || "");
        const current = view.state.doc.toString();
        if (nextValue === current) {
          setTextareaValue(textarea, nextValue);
          return;
        }
        suppressInput = true;
        view.dispatch({
          changes: {from: 0, to: current.length, insert: nextValue},
          annotations: Transaction.addToHistory.of(false),
        });
        suppressInput = false;
        setTextareaValue(textarea, nextValue);
      },
      syncReplaceRange(from: number, to: number, insert: string) {
        const max = view.state.doc.length;
        const nextFrom = Math.max(0, Math.min(Number(from) || 0, max));
        const nextTo = Math.max(nextFrom, Math.min(Number(to) || 0, max));
        const nextInsert = String(insert || "");
        if (nextFrom === nextTo && !nextInsert) {
          return;
        }
        suppressInput = true;
        view.dispatch({
          changes: {
            from: nextFrom,
            to: nextTo,
            insert: nextInsert,
          },
          annotations: Transaction.addToHistory.of(false),
        });
        suppressInput = false;
        setTextareaValue(textarea, view.state.doc.toString());
      },
      resetValue(value: string) {
        const nextValue = String(value || "");
        const current = view.state.doc.toString();
        if (nextValue === current) {
          setTextareaValue(textarea, nextValue);
          return;
        }
        suppressInput = true;
        view.setState(createViewState(nextValue));
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
      undo() {
        return undo(view);
      },
      redo() {
        return redo(view);
      },
      canUndo() {
        return undoDepth(view.state) > 0;
      },
      canRedo() {
        return redoDepth(view.state) > 0;
      },
      focus(options?: FocusOptions) {
        try {
          focusEditorView(view, host, options);
        } catch (_error) {
          focusEditorView(view, host, options);
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
        let clampedSelection = clampSelectionToOffset(EditorSelection.single(nextAnchor, nextHead), protectedUntil);
        clampedSelection = clampSelectionToRenderedVisibleOffsets(view.state, clampedSelection);
        view.dispatch({
          selection: clampedSelection,
          scrollIntoView: Boolean(reveal),
        });
      },
      jumpToOffset(offset) {
        const max = view.state.doc.length;
        const protectedUntil = renderedBodyStartOffset(view.state);
        const nextOffset = Math.max(protectedUntil, Math.min(Number(offset) || 0, max));
        let clampedSelection = clampSelectionToOffset(EditorSelection.single(nextOffset), protectedUntil);
        clampedSelection = clampSelectionToRenderedVisibleOffsets(view.state, clampedSelection);
        focusEditorView(view, host, {preventScroll: true});
        view.dispatch({
          selection: clampedSelection,
          scrollIntoView: true,
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
          let clampedSelection = clampSelectionToOffset(view.state.selection, protectedUntil);
          clampedSelection = clampSelectionToRenderedVisibleOffsets(view.state, clampedSelection);
          if (!clampedSelection.eq(view.state.selection, true)) {
            view.dispatch({
              selection: clampedSelection,
              scrollIntoView: true,
            });
          }
        }
      },
      setViewOnly(enabled: boolean) {
        const viewOnly = Boolean(enabled);
        host.classList.toggle("is-view-only", viewOnly);
        view.dispatch({
          effects: setViewOnlyEffect.of(viewOnly),
        });
        if (viewOnly && view.state.field(renderModeField, false)) {
          const protectedUntil = renderedBodyStartOffset(view.state);
          let clampedSelection = clampSelectionToOffset(view.state.selection, protectedUntil);
          clampedSelection = clampSelectionToRenderedVisibleOffsets(view.state, clampedSelection);
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
      setCodeBlocksAlwaysExpanded(enabled: boolean) {
        view.dispatch({
          effects: setCodeBlocksAlwaysExpandedEffect.of(Boolean(enabled)),
        });
      },
      setEditable(enabled: boolean) {
        const editable = Boolean(enabled);
        host.classList.toggle("is-readonly", !editable);
        view.dispatch({
          effects: [
            editableCompartment.reconfigure(EditorView.editable.of(editable)),
            readOnlyCompartment.reconfigure(EditorState.readOnly.of(!editable)),
          ],
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
