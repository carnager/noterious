import {
  formatEditableDateValue,
  formatReminderLabel,
  parseEditableDateValue,
  parseEditableDateTimeValue,
  parseEditableTimeValue,
} from "./datetime";
import { clearNode } from "./dom";
import {
  focusMarkdownEditor,
  markdownEditorScrollTop,
  setMarkdownEditorScrollTop,
  setMarkdownEditorSelection,
  setMarkdownEditorValue,
} from "./editorState";
import {
  findMarkdownTableBlockForLine,
  formatMarkdownTableRow,
  markdownTableRowsForLine,
} from "./markdown";
import type { FocusRestoreSpec, NoteriousEditorApi, TaskRecord } from "./types";

export interface TaskPickerState {
  mode: "" | "due" | "remind" | "schedule";
  ref: string;
  left: number;
  top: number;
  anchorTop: number;
  anchorBottom: number;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

export interface TableEditorState {
  startLine: number;
  row: number;
  col: number;
  rows: string[][];
  dirty: boolean;
  left: number;
  top: number;
  width: number;
  bodyFontFamily: string;
  bodyFontSize: string;
  bodyLineHeight: string;
  bodyLetterSpacing: string;
  bodyColor: string;
  bodyFontWeight: string;
  headerColor: string;
  headerFontWeight: string;
}

export interface InlineEditorElements {
  inlineTaskPicker: HTMLDivElement;
  inlineTablePanel: HTMLDivElement;
  rawView: HTMLElement;
  markdownEditor: HTMLTextAreaElement;
  searchModalShell: HTMLElement;
  commandModalShell: HTMLElement;
}

export interface InlineEditorAppState {
  currentMarkdown: string;
  selectedPage: string;
  currentPage: unknown | null;
  sourceOpen: boolean;
  tableEditor: TableEditorState | null;
  markdownEditorApi: NoteriousEditorApi | null;
  restoreFocusSpec: FocusRestoreSpec | null;
}

export function defaultTaskPickerState(): TaskPickerState {
  return {
    mode: "",
    ref: "",
    left: 0,
    top: 0,
    anchorTop: 0,
    anchorBottom: 0,
    year: 0,
    month: 0,
    day: 0,
    hour: 9,
    minute: 0,
  };
}

function canonicalDate(year: number, month: number, day: number): string {
  return [
    String(year).padStart(4, "0"),
    String(month).padStart(2, "0"),
    String(day).padStart(2, "0"),
  ].join("-");
}

function canonicalDateTime(year: number, month: number, day: number, hour: number, minute: number): string {
  return canonicalDate(year, month, day) + " " + [hour, minute].map(function (value) {
    return String(value).padStart(2, "0");
  }).join(":");
}

function canonicalTime(hour: number, minute: number): string {
  return [hour, minute].map(function (value) {
    return String(value).padStart(2, "0");
  }).join(":");
}

export function taskPickerPartsFromValue(mode: "due" | "remind", rawValue: string, dueValue: string): { year: number; month: number; day: number; hour: number; minute: number } {
  const fallback = new Date();
  try {
    if (mode === "remind") {
      const timeCanonical = parseEditableTimeValue(rawValue);
      const baseDate = parseEditableDateValue(dueValue) || canonicalDate(fallback.getFullYear(), fallback.getMonth() + 1, fallback.getDate());
      const [year, month, day] = baseDate.split("-").map(Number);
      const [hour, minute] = timeCanonical.split(":").map(Number);
      if (![year, month, day, hour, minute].every(Number.isFinite)) {
        throw new Error("invalid");
      }
      return { year, month, day, hour, minute };
    }
    const canonical = parseEditableDateValue(rawValue);
    if (!canonical) {
      throw new Error("empty");
    }
    const datePart = canonical.slice(0, 10);
    const [year, month, day] = datePart.split("-").map(Number);
    const [hour, minute] = [9, 0];
    if (![year, month, day, hour, minute].every(Number.isFinite)) {
      throw new Error("invalid");
    }
    return { year, month, day, hour, minute };
  } catch (_error) {
    if (mode === "remind") {
      try {
        const canonical = parseEditableDateTimeValue(rawValue);
        const datePart = canonical.slice(0, 10);
        const timePart = canonical.slice(11, 16);
        const [year, month, day] = datePart.split("-").map(Number);
        const [hour, minute] = timePart.split(":").map(Number);
        if ([year, month, day, hour, minute].every(Number.isFinite)) {
          return { year, month, day, hour, minute };
        }
      } catch (_nestedError) {
        // Fall through to the default selection below.
      }
    }
    return {
      year: fallback.getFullYear(),
      month: fallback.getMonth() + 1,
      day: fallback.getDate(),
      hour: 9,
      minute: 0,
    };
  }
}

export function setTaskDateApplySuppressed(markdownEditorApi: NoteriousEditorApi | null, active: boolean): void {
  if (!markdownEditorApi || !markdownEditorApi.host) {
    return;
  }
  markdownEditorApi.host.classList.toggle("task-date-apply-active", active);
}

export function positionInlineTaskPicker(taskPickerState: TaskPickerState, els: InlineEditorElements): void {
  const picker = els.inlineTaskPicker;
  const viewportWidth = Math.max(320, window.innerWidth || 0);
  const viewportHeight = Math.max(320, window.innerHeight || 0);
  const width = picker.offsetWidth || 320;
  const height = picker.offsetHeight || 0;
  const maxLeft = Math.max(12, viewportWidth - width - 12);
  const anchorBottom = Number.isFinite(taskPickerState.anchorBottom) && taskPickerState.anchorBottom > 0
    ? taskPickerState.anchorBottom
    : taskPickerState.top;
  const gap = Math.max(6, Math.round(taskPickerState.top - anchorBottom) || 0);
  const anchorTop = Number.isFinite(taskPickerState.anchorTop) && taskPickerState.anchorTop > 0
    ? taskPickerState.anchorTop
    : Math.max(12, anchorBottom - gap);
  const belowTop = Math.max(12, taskPickerState.top);
  let top = belowTop;
  if (height > 0) {
    const fitsBelow = belowTop + height <= viewportHeight - 12;
    const aboveTop = anchorTop - height - gap;
    const fitsAbove = aboveTop >= 12;
    if (!fitsBelow && fitsAbove) {
      top = aboveTop;
    } else {
      top = Math.max(12, Math.min(belowTop, viewportHeight - height - 12));
    }
  }
  picker.style.left = Math.max(12, Math.min(taskPickerState.left, maxLeft)) + "px";
  picker.style.top = top + "px";
}

export function closeTaskPickers(taskPickerState: TaskPickerState, els: InlineEditorElements): void {
  taskPickerState.mode = "";
  taskPickerState.ref = "";
  els.inlineTaskPicker.classList.add("hidden");
  clearNode(els.inlineTaskPicker);
}

function buildTableEditorRows(currentMarkdown: string, startLineNumber: number): string[][] | null {
  const lines = String(currentMarkdown || "").replace(/\r\n/g, "\n").split("\n");
  const table = markdownTableRowsForLine(lines, startLineNumber);
  if (!table) {
    return null;
  }
  const width = Math.max(2, table.header.length);
  const normalizeRow = function (cells: string[]): string[] {
    const next = new Array(width).fill("");
    for (let index = 0; index < width; index += 1) {
      next[index] = String(cells[index] || "");
    }
    return next;
  };
  const rows = [normalizeRow(table.header)].concat(table.rows.map(normalizeRow));
  if (rows.length < 2) {
    rows.push(new Array(width).fill(""));
  }
  return rows;
}

export function closeInlineTableEditor(appState: InlineEditorAppState, els: InlineEditorElements): void {
  appState.tableEditor = null;
  els.inlineTablePanel.classList.add("hidden");
  els.inlineTablePanel.style.left = "";
  els.inlineTablePanel.style.top = "";
  els.inlineTablePanel.style.width = "";
  clearNode(els.inlineTablePanel);
}

export function inlineTableEditorHasFocus(els: InlineEditorElements): boolean {
  const active = document.activeElement instanceof Node ? document.activeElement : null;
  return Boolean(active && els.inlineTablePanel.contains(active));
}

export function inlineTableEditorOpen(appState: InlineEditorAppState, els: InlineEditorElements): boolean {
  return Boolean(appState.tableEditor && !els.inlineTablePanel.classList.contains("hidden"));
}

function focusInlineTableEditorCell(els: InlineEditorElements, rowIndex: number, colIndex: number): void {
  window.requestAnimationFrame(function () {
    const input = els.inlineTablePanel.querySelector('[data-inline-table-row="' + String(rowIndex) + '"][data-inline-table-col="' + String(colIndex) + '"]');
    if (input instanceof HTMLInputElement) {
      input.focus({ preventScroll: true });
      input.select();
    }
  });
}

function appendInlineTableEditorRow(editorState: TableEditorState): void {
  const cols = Math.max(1, editorState.rows[0] ? editorState.rows[0].length : 0);
  editorState.rows.push(new Array(cols).fill(""));
  editorState.dirty = true;
}

export function canDeleteInlineTableEditorRow(editorState: TableEditorState): boolean {
  return editorState.rows.length > 2 && editorState.row > 0;
}

function insertInlineTableEditorRowAfter(editorState: TableEditorState, rowIndex: number): void {
  const cols = Math.max(1, editorState.rows[0] ? editorState.rows[0].length : 0);
  const nextRow = new Array(cols).fill("");
  const insertAt = Math.max(0, Math.min(rowIndex + 1, editorState.rows.length));
  editorState.rows.splice(insertAt, 0, nextRow);
  editorState.dirty = true;
  editorState.row = insertAt;
  editorState.col = Math.max(0, Math.min(editorState.col, cols - 1));
}

export function deleteInlineTableEditorRow(editorState: TableEditorState): boolean {
  if (!canDeleteInlineTableEditorRow(editorState)) {
    return false;
  }
  const deleteAt = Math.max(1, Math.min(editorState.row, editorState.rows.length - 1));
  editorState.rows.splice(deleteAt, 1);
  editorState.dirty = true;
  editorState.row = Math.max(1, Math.min(deleteAt, editorState.rows.length - 1));
  const cols = Math.max(1, editorState.rows[0] ? editorState.rows[0].length : 0);
  editorState.col = Math.max(0, Math.min(editorState.col, cols - 1));
  return true;
}

function insertInlineTableEditorColumnAfter(editorState: TableEditorState, colIndex: number): void {
  const insertAt = Math.max(0, colIndex + 1);
  editorState.rows = editorState.rows.map(function (row) {
    const next = row.slice();
    next.splice(insertAt, 0, "");
    return next;
  });
  editorState.dirty = true;
  editorState.col = insertAt;
}

export function canDeleteInlineTableEditorColumn(editorState: TableEditorState): boolean {
  const cols = Math.max(1, editorState.rows[0] ? editorState.rows[0].length : 0);
  return cols > 2;
}

export function deleteInlineTableEditorColumn(editorState: TableEditorState): boolean {
  if (!canDeleteInlineTableEditorColumn(editorState)) {
    return false;
  }
  const cols = Math.max(1, editorState.rows[0] ? editorState.rows[0].length : 0);
  const deleteAt = Math.max(0, Math.min(editorState.col, cols - 1));
  editorState.rows = editorState.rows.map(function (row) {
    const next = row.slice();
    next.splice(deleteAt, 1);
    return next;
  });
  editorState.dirty = true;
  const nextCols = Math.max(1, editorState.rows[0] ? editorState.rows[0].length : 0);
  editorState.col = Math.max(0, Math.min(deleteAt, nextCols - 1));
  return true;
}

function moveInlineTableEditorFocus(
  els: InlineEditorElements,
  editorState: TableEditorState,
  rowIndex: number,
  colIndex: number,
  backward: boolean,
): void {
  const rowCount = editorState.rows.length;
  const colCount = Math.max(1, editorState.rows[0] ? editorState.rows[0].length : 0);
  if (backward) {
    if (colIndex > 0) {
      editorState.row = rowIndex;
      editorState.col = colIndex - 1;
    } else if (rowIndex > 0) {
      editorState.row = rowIndex - 1;
      editorState.col = colCount - 1;
    } else {
      editorState.row = 0;
      editorState.col = 0;
    }
    focusInlineTableEditorCell(els, editorState.row, editorState.col);
    return;
  }
  if (colIndex < colCount - 1) {
    editorState.row = rowIndex;
    editorState.col = colIndex + 1;
    focusInlineTableEditorCell(els, editorState.row, editorState.col);
    return;
  }
  if (rowIndex < rowCount - 1) {
    editorState.row = rowIndex + 1;
    editorState.col = 0;
    focusInlineTableEditorCell(els, editorState.row, editorState.col);
    return;
  }
  appendInlineTableEditorRow(editorState);
  editorState.row = editorState.rows.length - 1;
  editorState.col = 0;
}

export function restoreInlineTableEditorFocus(appState: InlineEditorAppState, els: InlineEditorElements): void {
  if (!appState.tableEditor || els.inlineTablePanel.classList.contains("hidden")) {
    return;
  }
  const row = appState.tableEditor.row;
  const col = appState.tableEditor.col;
  focusInlineTableEditorCell(els, row, col);
  window.setTimeout(function () {
    if (appState.tableEditor && !els.inlineTablePanel.classList.contains("hidden")) {
      focusInlineTableEditorCell(els, appState.tableEditor.row, appState.tableEditor.col);
    }
  }, 50);
  window.setTimeout(function () {
    if (appState.tableEditor && !els.inlineTablePanel.classList.contains("hidden")) {
      focusInlineTableEditorCell(els, appState.tableEditor.row, appState.tableEditor.col);
    }
  }, 180);
}

function clampTableEditorWidth(width: number): number {
  const viewportWidth = Math.max(320, window.innerWidth || 0);
  return Math.max(320, Math.min(Math.round(width || 0), viewportWidth - 24, 900));
}

function readRenderedTableTypography(
  appState: InlineEditorAppState,
  startLineNumber: number,
): {
  bodyFontFamily: string;
  bodyFontSize: string;
  bodyLineHeight: string;
  bodyLetterSpacing: string;
  bodyColor: string;
  bodyFontWeight: string;
  headerColor: string;
  headerFontWeight: string;
} {
  const host = appState.markdownEditorApi && appState.markdownEditorApi.host ? appState.markdownEditorApi.host : null;
  const base = {
    bodyFontFamily: "",
    bodyFontSize: "",
    bodyLineHeight: "",
    bodyLetterSpacing: "",
    bodyColor: "",
    bodyFontWeight: "",
    headerColor: "",
    headerFontWeight: "",
  };
  if (!host) {
    return base;
  }
  const bodyCell = host.querySelector(
    '[data-table-start-line="' + String(startLineNumber) + '"][data-table-row="1"][data-table-col="0"]'
  );
  const headerCell = host.querySelector(
    '[data-table-start-line="' + String(startLineNumber) + '"][data-table-row="0"][data-table-col="0"]'
  );
  const bodyStyle = bodyCell instanceof HTMLElement ? window.getComputedStyle(bodyCell) : null;
  const headerStyle = headerCell instanceof HTMLElement ? window.getComputedStyle(headerCell) : bodyStyle;
  if (!bodyStyle) {
    return base;
  }
  return {
    bodyFontFamily: bodyStyle.fontFamily || "",
    bodyFontSize: bodyStyle.fontSize || "",
    bodyLineHeight: bodyStyle.lineHeight || "",
    bodyLetterSpacing: bodyStyle.letterSpacing || "",
    bodyColor: bodyStyle.color || "",
    bodyFontWeight: bodyStyle.fontWeight || "",
    headerColor: headerStyle ? (headerStyle.color || bodyStyle.color || "") : (bodyStyle.color || ""),
    headerFontWeight: headerStyle ? (headerStyle.fontWeight || bodyStyle.fontWeight || "") : (bodyStyle.fontWeight || ""),
  };
}

export function positionInlineTableEditorPanel(appState: InlineEditorAppState, els: InlineEditorElements): void {
  if (!appState.tableEditor) {
    return;
  }
  if (els.inlineTablePanel.classList.contains("hidden")) {
    return;
  }
  const viewportWidth = Math.max(320, window.innerWidth || 0);
  const viewportHeight = Math.max(320, window.innerHeight || 0);
  const width = clampTableEditorWidth(appState.tableEditor.width || 0);
  const rect = els.inlineTablePanel.getBoundingClientRect();
  const panelHeight = rect.height || 0;
  let left = Math.round(appState.tableEditor.left || 12);
  let top = Math.round(appState.tableEditor.top || 12);
  left = Math.max(12, Math.min(left, viewportWidth - width - 12));
  if (panelHeight > 0 && top + panelHeight > viewportHeight - 12) {
    top = Math.max(12, viewportHeight - panelHeight - 12);
  }
  els.inlineTablePanel.style.left = String(left) + "px";
  els.inlineTablePanel.style.top = String(top) + "px";
  els.inlineTablePanel.style.width = String(width) + "px";
}

export function anchorInlineTableEditorToRenderedTable(appState: InlineEditorAppState, els: InlineEditorElements, startLineNumber: number): void {
  const host = appState.markdownEditorApi && appState.markdownEditorApi.host ? appState.markdownEditorApi.host : null;
  if (!host || !appState.tableEditor) {
    return;
  }
  const anchor = host.querySelector('[data-table-start-line="' + String(startLineNumber) + '"]');
  const rect = anchor instanceof HTMLElement ? anchor.getBoundingClientRect() : null;
  if (!rect) {
    return;
  }
  appState.tableEditor.left = Math.round(rect.left);
  appState.tableEditor.top = Math.round(rect.top);
  appState.tableEditor.width = Math.round(rect.width);
  positionInlineTableEditorPanel(appState, els);
}

export function applyInlineTableEditor(appState: InlineEditorAppState, els: InlineEditorElements, options: {
  closeAfter: boolean;
  refreshLivePageChrome: () => void;
  scheduleAutosave: () => void;
}): void {
  if (!appState.tableEditor || !appState.selectedPage || !appState.currentPage) {
    if (options.closeAfter) {
      closeInlineTableEditor(appState, els);
    }
    return;
  }
  const editorState = appState.tableEditor;
  const width = Math.max(2, ...editorState.rows.map(function (row) { return row.length; }));
  const normalizedRows = editorState.rows.map(function (row) {
    const next = new Array(width).fill("");
    for (let index = 0; index < width; index += 1) {
      next[index] = String(row[index] || "");
    }
    return next;
  });
  if (normalizedRows.length < 2) {
    normalizedRows.push(new Array(width).fill(""));
  }
  const lines = String(appState.currentMarkdown || "").replace(/\r\n/g, "\n").split("\n");
  const block = findMarkdownTableBlockForLine(lines, editorState.startLine);
  if (!block) {
    closeInlineTableEditor(appState, els);
    return;
  }
  const replaceFrom = lines.slice(0, block.startLineIndex).reduce(function (sum, line) {
    return sum + line.length + 1;
  }, 0);
  const replaceTo = lines.slice(0, block.endLineIndex + 1).reduce(function (sum, line) {
    return sum + line.length + 1;
  }, 0) - (block.endLineIndex + 1 < lines.length ? 1 : 0);
  const hasFollowingLine = block.endLineIndex + 1 < lines.length;
  const replacementLines = [
    formatMarkdownTableRow(normalizedRows[0]),
    formatMarkdownTableRow(new Array(width).fill("---")),
  ].concat(normalizedRows.slice(1).map(formatMarkdownTableRow));
  const replacement = replacementLines.join("\n");
  lines.splice(block.startLineIndex, block.endLineIndex - block.startLineIndex + 1, ...replacementLines);
  const nextMarkdown = lines.join("\n");
  const scrollTop = markdownEditorScrollTop(appState, els);
  if (appState.markdownEditorApi) {
    appState.markdownEditorApi.replaceRange(replaceFrom, replaceTo, replacement);
  } else {
    setMarkdownEditorValue(appState, els, nextMarkdown);
  }
  setMarkdownEditorScrollTop(appState, els, scrollTop);
  appState.currentMarkdown = nextMarkdown;
  appState.tableEditor.rows = normalizedRows;
  appState.tableEditor.dirty = false;
  els.rawView.textContent = nextMarkdown;
  options.refreshLivePageChrome();
  options.scheduleAutosave();
  if (options.closeAfter) {
    closeInlineTableEditor(appState, els);
    const focusOffset = Math.max(0, Math.min(nextMarkdown.length, replaceFrom + replacement.length + (hasFollowingLine ? 1 : 0)));
    window.requestAnimationFrame(function () {
      focusMarkdownEditor(appState, els, { preventScroll: true });
      setMarkdownEditorSelection(appState, els, focusOffset, focusOffset, true);
    });
    return;
  }
}

export function renderInlineTableEditor(appState: InlineEditorAppState, els: InlineEditorElements, callbacks: {
  applyInlineTableEditor: (closeAfter: boolean) => void;
  closeInlineTableEditor: () => void;
}): void {
  clearNode(els.inlineTablePanel);
  if (!appState.tableEditor || appState.sourceOpen) {
    els.inlineTablePanel.classList.add("hidden");
    els.inlineTablePanel.style.left = "";
    els.inlineTablePanel.style.top = "";
    els.inlineTablePanel.style.width = "";
    return;
  }
  const editorState = appState.tableEditor;
  const cols = editorState.rows[0] ? editorState.rows[0].length : 0;
  const handlePanelShortcut = function (rawEvent: KeyboardEvent): void {
    const event = rawEvent as KeyboardEvent;
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (event.key === "Escape" && !event.altKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      event.stopPropagation();
      callbacks.closeInlineTableEditor();
      return;
    }
    if (event.key === "Enter" && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey) {
      if (target && target.closest("button")) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      callbacks.applyInlineTableEditor(true);
    }
  };

  const head = document.createElement("div");
  head.className = "table-editor-head";
  head.addEventListener("keydown", handlePanelShortcut);

  const title = document.createElement("h3");
  title.textContent = editorState.dirty ? "Table Editor • Unsaved" : "Table Editor";
  head.appendChild(title);

  const actions = document.createElement("div");
  actions.className = "table-editor-actions";

  const addRow = document.createElement("button");
  addRow.type = "button";
  addRow.textContent = "+ Row";
  addRow.addEventListener("click", function () {
    insertInlineTableEditorRowAfter(editorState, editorState.row);
    renderInlineTableEditor(appState, els, callbacks);
    focusInlineTableEditorCell(els, editorState.row, editorState.col);
  });
  actions.appendChild(addRow);

  const removeRow = document.createElement("button");
  removeRow.type = "button";
  removeRow.textContent = "- Row";
  removeRow.disabled = !canDeleteInlineTableEditorRow(editorState);
  removeRow.addEventListener("click", function () {
    if (!deleteInlineTableEditorRow(editorState)) {
      return;
    }
    renderInlineTableEditor(appState, els, callbacks);
    focusInlineTableEditorCell(els, editorState.row, editorState.col);
  });
  actions.appendChild(removeRow);

  const addCol = document.createElement("button");
  addCol.type = "button";
  addCol.textContent = "+ Col";
  addCol.addEventListener("click", function () {
    insertInlineTableEditorColumnAfter(editorState, editorState.col);
    renderInlineTableEditor(appState, els, callbacks);
    focusInlineTableEditorCell(els, editorState.row, editorState.col);
  });
  actions.appendChild(addCol);

  const removeCol = document.createElement("button");
  removeCol.type = "button";
  removeCol.textContent = "- Col";
  removeCol.disabled = !canDeleteInlineTableEditorColumn(editorState);
  removeCol.addEventListener("click", function () {
    if (!deleteInlineTableEditorColumn(editorState)) {
      return;
    }
    renderInlineTableEditor(appState, els, callbacks);
    focusInlineTableEditorCell(els, editorState.row, editorState.col);
  });
  actions.appendChild(removeCol);

  const apply = document.createElement("button");
  apply.type = "button";
  apply.textContent = "Apply";
  apply.addEventListener("click", function () {
    callbacks.applyInlineTableEditor(false);
  });
  actions.appendChild(apply);

  const done = document.createElement("button");
  done.type = "button";
  done.textContent = "Done";
  done.addEventListener("click", function () {
    callbacks.applyInlineTableEditor(true);
  });
  actions.appendChild(done);

  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.textContent = "Cancel";
  cancel.addEventListener("click", function () {
    callbacks.closeInlineTableEditor();
  });
  actions.appendChild(cancel);

  head.appendChild(actions);
  els.inlineTablePanel.appendChild(head);

  const grid = document.createElement("div");
  grid.className = "table-editor-grid";
  grid.addEventListener("keydown", handlePanelShortcut);
  if (editorState.bodyFontFamily) {
    grid.style.fontFamily = editorState.bodyFontFamily;
  }
  if (editorState.bodyFontSize) {
    grid.style.fontSize = editorState.bodyFontSize;
  }
  if (editorState.bodyLineHeight) {
    grid.style.lineHeight = editorState.bodyLineHeight;
  }
  if (editorState.bodyLetterSpacing) {
    grid.style.letterSpacing = editorState.bodyLetterSpacing;
  }

  editorState.rows.forEach(function (row, rowIndex) {
    const rowNode = document.createElement("div");
    rowNode.className = "table-editor-row" + (rowIndex === 0 ? " table-editor-header" : "");
    rowNode.style.gridTemplateColumns = "repeat(" + String(Math.max(1, cols)) + ", minmax(0, 1fr))";
    row.forEach(function (cell, colIndex) {
      const input = document.createElement("input");
      input.type = "text";
      input.value = cell;
      input.setAttribute("data-inline-table-row", String(rowIndex));
      input.setAttribute("data-inline-table-col", String(colIndex));
      input.addEventListener("focus", function () {
        editorState.row = rowIndex;
        editorState.col = colIndex;
      });
      if (editorState.bodyFontFamily) {
        input.style.fontFamily = editorState.bodyFontFamily;
      }
      if (editorState.bodyFontSize) {
        input.style.fontSize = editorState.bodyFontSize;
      }
      if (editorState.bodyLineHeight) {
        input.style.lineHeight = editorState.bodyLineHeight;
      }
      if (editorState.bodyLetterSpacing) {
        input.style.letterSpacing = editorState.bodyLetterSpacing;
      }
      if (rowIndex === 0) {
        if (editorState.headerColor) {
          input.style.color = editorState.headerColor;
        }
        if (editorState.headerFontWeight) {
          input.style.fontWeight = editorState.headerFontWeight;
        }
      } else {
        if (editorState.bodyColor) {
          input.style.color = editorState.bodyColor;
        }
        if (editorState.bodyFontWeight) {
          input.style.fontWeight = editorState.bodyFontWeight;
        }
      }
      input.addEventListener("input", function () {
        editorState.rows[rowIndex][colIndex] = input.value;
        editorState.dirty = true;
      });
      input.addEventListener("keydown", function (rawEvent) {
        const event = rawEvent as KeyboardEvent;
        if (event.key !== "Tab") {
          return;
        }
        event.preventDefault();
        editorState.rows[rowIndex][colIndex] = input.value;
        moveInlineTableEditorFocus(els, editorState, rowIndex, colIndex, event.shiftKey);
        renderInlineTableEditor(appState, els, callbacks);
        focusInlineTableEditorCell(els, editorState.row, editorState.col);
      });
      rowNode.appendChild(input);
    });
    grid.appendChild(rowNode);
  });

  els.inlineTablePanel.appendChild(grid);
  els.inlineTablePanel.classList.remove("hidden");
  positionInlineTableEditorPanel(appState, els);
}

export function openInlineTableEditor(appState: InlineEditorAppState, els: InlineEditorElements, options: {
  startLineNumber: number;
  rowIndex: number;
  colIndex: number;
  anchor?: { left: number; top: number; width: number };
  renderInlineTableEditor: () => void;
}): void {
  if (appState.tableEditor && appState.tableEditor.startLine === options.startLineNumber) {
    appState.tableEditor.row = options.rowIndex;
    appState.tableEditor.col = options.colIndex;
    if (options.anchor) {
      appState.tableEditor.left = options.anchor.left;
      appState.tableEditor.top = options.anchor.top;
      appState.tableEditor.width = options.anchor.width;
    }
    options.renderInlineTableEditor();
    restoreInlineTableEditorFocus(appState, els);
    return;
  }
  const rows = buildTableEditorRows(appState.currentMarkdown, options.startLineNumber);
  if (!rows) {
    closeInlineTableEditor(appState, els);
    return;
  }
  appState.tableEditor = {
    startLine: options.startLineNumber,
    row: Math.max(0, options.rowIndex),
    col: Math.max(0, options.colIndex),
    rows: rows,
    dirty: false,
    left: options.anchor ? options.anchor.left : 12,
    top: options.anchor ? options.anchor.top : 12,
    width: options.anchor ? options.anchor.width : 520,
    ...readRenderedTableTypography(appState, options.startLineNumber),
  };
  options.renderInlineTableEditor();
  if (!options.anchor) {
    window.requestAnimationFrame(function () {
      anchorInlineTableEditorToRenderedTable(appState, els, options.startLineNumber);
      restoreInlineTableEditorFocus(appState, els);
    });
  }
  restoreInlineTableEditorFocus(appState, els);
}

export interface TaskPickerCallbacks {
  currentPickerTask: () => TaskRecord | null;
  saveTaskDateField: (task: TaskRecord, field: "due" | "remind", value: string) => Promise<void>;
  saveTaskReminders: (task: TaskRecord, reminders: string[]) => Promise<void>;
  closeTaskPickers: () => void;
  setNoteStatus: (message: string) => void;
  errorMessage: (error: unknown) => string;
}

interface ReminderOffsetOption {
  label: string;
  value: string;
}

function reminderOffsetOptions(): ReminderOffsetOption[] {
  return [
    { label: "On due date", value: "" },
    { label: "1 day before", value: "-1d" },
    { label: "2 days before", value: "-2d" },
    { label: "3 days before", value: "-3d" },
    { label: "1 week before", value: "-1w" },
    { label: "2 weeks before", value: "-2w" },
  ];
}

function renderScheduleDueSection(taskPickerState: TaskPickerState, target: HTMLElement, task: TaskRecord | null, callbacks: TaskPickerCallbacks, rerender: () => void): void {
  const dueValue = task && task.due ? String(task.due).slice(0, 10) : "";
  let selYear = 0;
  let selMonth = 0;
  let selDay = 0;
  if (dueValue) {
    const parts = dueValue.split("-").map(Number);
    selYear = parts[0] || 0;
    selMonth = parts[1] || 0;
    selDay = parts[2] || 0;
  }

  const saveDue = function (value: string): void {
    const currentTask = callbacks.currentPickerTask();
    if (!currentTask) {
      callbacks.closeTaskPickers();
      return;
    }
    callbacks.saveTaskDateField(currentTask, "due", value).catch(function (error) {
      callbacks.setNoteStatus("Due date update failed: " + callbacks.errorMessage(error));
    });
  };

  const head = document.createElement("div");
  head.className = "task-picker-head";
  const title = document.createElement("strong");
  const monthStart = new Date(taskPickerState.year, taskPickerState.month - 1, 1);
  title.textContent = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(monthStart);
  head.appendChild(title);

  const nav = document.createElement("div");
  nav.className = "task-picker-nav";
  const prev = document.createElement("button");
  prev.type = "button";
  prev.textContent = "<";
  prev.addEventListener("click", function () {
    taskPickerState.month -= 1;
    if (taskPickerState.month < 1) {
      taskPickerState.month = 12;
      taskPickerState.year -= 1;
    }
    rerender();
  });
  nav.appendChild(prev);
  const next = document.createElement("button");
  next.type = "button";
  next.textContent = ">";
  next.addEventListener("click", function () {
    taskPickerState.month += 1;
    if (taskPickerState.month > 12) {
      taskPickerState.month = 1;
      taskPickerState.year += 1;
    }
    rerender();
  });
  nav.appendChild(next);
  head.appendChild(nav);
  target.appendChild(head);

  const firstWeekday = (monthStart.getDay() + 6) % 7;
  const gridStart = new Date(taskPickerState.year, taskPickerState.month - 1, 1 - firstWeekday);
  const weekdays = document.createElement("div");
  weekdays.className = "task-picker-weekdays";
  ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].forEach(function (label) {
    const cell = document.createElement("span");
    cell.textContent = label;
    weekdays.appendChild(cell);
  });
  target.appendChild(weekdays);

  const grid = document.createElement("div");
  grid.className = "task-picker-grid";
  for (let index = 0; index < 42; index += 1) {
    const current = new Date(gridStart);
    current.setDate(gridStart.getDate() + index);
    const dayButton = document.createElement("button");
    dayButton.type = "button";
    dayButton.className = "task-picker-day";
    if (current.getMonth() !== taskPickerState.month - 1) {
      dayButton.classList.add("is-faded");
    }
    if (selYear && current.getFullYear() === selYear && current.getMonth() === selMonth - 1 && current.getDate() === selDay) {
      dayButton.classList.add("is-selected");
    }
    dayButton.textContent = String(current.getDate());
    dayButton.addEventListener("click", function () {
      taskPickerState.year = current.getFullYear();
      taskPickerState.month = current.getMonth() + 1;
      taskPickerState.day = current.getDate();
      saveDue(canonicalDate(taskPickerState.year, taskPickerState.month, taskPickerState.day));
    });
    grid.appendChild(dayButton);
  }
  target.appendChild(grid);

  const dueRow = document.createElement("div");
  dueRow.className = "task-picker-due-row";
  const status = document.createElement("span");
  status.className = "task-picker-due-status";
  status.textContent = dueValue ? "Due " + formatEditableDateValue(dueValue) : "No due date yet — pick a day";
  dueRow.appendChild(status);
  if (dueValue) {
    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "task-picker-due-clear";
    clear.textContent = "Clear";
    clear.addEventListener("click", function () {
      saveDue("");
    });
    dueRow.appendChild(clear);
  }
  target.appendChild(dueRow);
}

function renderScheduleReminderSection(taskPickerState: TaskPickerState, target: HTMLElement, task: TaskRecord | null, callbacks: TaskPickerCallbacks): void {
  const dueValue = task && task.due ? String(task.due) : "";
  const reminders = task && Array.isArray(task.remind) ? task.remind.slice() : [];

  const persist = function (next: string[]): void {
    const currentTask = callbacks.currentPickerTask();
    if (!currentTask) {
      callbacks.closeTaskPickers();
      return;
    }
    callbacks.saveTaskReminders(currentTask, next).catch(function (error) {
      callbacks.setNoteStatus("Reminder update failed: " + callbacks.errorMessage(error));
    });
  };

  const addReminder = function (value: string): void {
    const trimmed = String(value || "").trim();
    if (!trimmed || reminders.indexOf(trimmed) !== -1) {
      return;
    }
    persist(reminders.concat(trimmed));
  };

  const heading = document.createElement("div");
  heading.className = "task-picker-remind-composer-label";
  heading.textContent = "Reminders";
  target.appendChild(heading);

  if (!dueValue) {
    const note = document.createElement("div");
    note.className = "task-picker-note";
    note.textContent = "Pick a due date above to add reminders.";
    target.appendChild(note);
  }

  if (reminders.length) {
    const list = document.createElement("div");
    list.className = "task-picker-remind-list";
    reminders.forEach(function (remind) {
      const row = document.createElement("div");
      row.className = "task-picker-remind-row";
      const label = document.createElement("span");
      label.className = "task-picker-remind-label";
      label.textContent = formatReminderLabel(remind);
      row.appendChild(label);
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "task-picker-remind-remove";
      remove.setAttribute("aria-label", "Remove reminder");
      remove.textContent = "✕";
      remove.addEventListener("click", function () {
        persist(reminders.filter(function (item) { return item !== remind; }));
      });
      row.appendChild(remove);
      list.appendChild(row);
    });
    target.appendChild(list);
  }

  const composer = document.createElement("div");
  composer.className = "task-picker-remind-composer";

  const composerLabel = document.createElement("div");
  composerLabel.className = "task-picker-remind-composer-label";
  composerLabel.textContent = "Add a reminder";
  composer.appendChild(composerLabel);

  const offsetSelect = document.createElement("select");
  offsetSelect.className = "task-picker-remind-offset";
  reminderOffsetOptions().forEach(function (option, index) {
    const node = document.createElement("option");
    node.value = option.value;
    node.textContent = option.label;
    node.selected = index === 1; // default to "1 day before"
    offsetSelect.appendChild(node);
  });
  offsetSelect.disabled = !dueValue;
  composer.appendChild(offsetSelect);

  const controls = document.createElement("div");
  controls.className = "task-picker-remind-controls";

  const atLabel = document.createElement("span");
  atLabel.className = "task-picker-remind-at";
  atLabel.textContent = "at";
  controls.appendChild(atLabel);

  const hourSelect = document.createElement("select");
  for (let hour = 0; hour < 24; hour += 1) {
    const option = document.createElement("option");
    option.value = String(hour);
    option.textContent = String(hour).padStart(2, "0");
    option.selected = hour === taskPickerState.hour;
    hourSelect.appendChild(option);
  }
  hourSelect.disabled = !dueValue;
  hourSelect.addEventListener("change", function () {
    taskPickerState.hour = Number(hourSelect.value) || 0;
  });
  controls.appendChild(hourSelect);

  const colon = document.createElement("span");
  colon.className = "task-picker-remind-colon";
  colon.textContent = ":";
  controls.appendChild(colon);

  const minuteSelect = document.createElement("select");
  for (let minute = 0; minute < 60; minute += 5) {
    const option = document.createElement("option");
    option.value = String(minute);
    option.textContent = String(minute).padStart(2, "0");
    option.selected = minute === taskPickerState.minute;
    minuteSelect.appendChild(option);
  }
  minuteSelect.disabled = !dueValue;
  minuteSelect.addEventListener("change", function () {
    taskPickerState.minute = Number(minuteSelect.value) || 0;
  });
  controls.appendChild(minuteSelect);

  composer.appendChild(controls);

  const addButton = document.createElement("button");
  addButton.type = "button";
  addButton.className = "task-picker-remind-add-btn";
  addButton.textContent = "Add reminder";
  addButton.disabled = !dueValue;
  addButton.addEventListener("click", function () {
    const time = canonicalTime(taskPickerState.hour, taskPickerState.minute);
    const offset = offsetSelect.value;
    // No offset means "on the due date" — a bare clock time; otherwise combine
    // the relative offset with the chosen time, e.g. "-1d@08:30".
    addReminder(offset ? offset + "@" + time : time);
  });
  composer.appendChild(addButton);

  target.appendChild(composer);
}

export function renderTaskPicker(taskPickerState: TaskPickerState, els: InlineEditorElements, callbacks: TaskPickerCallbacks): void {
  if (taskPickerState.mode === "") {
    closeTaskPickers(taskPickerState, els);
    return;
  }

  const target = els.inlineTaskPicker;
  const task = callbacks.currentPickerTask();
  clearNode(target);

  const rerender = function () {
    renderTaskPicker(taskPickerState, els, callbacks);
  };

  const head = document.createElement("div");
  head.className = "task-picker-schedule-head";
  const heading = document.createElement("strong");
  heading.textContent = "Schedule";
  head.appendChild(heading);
  target.appendChild(head);

  renderScheduleDueSection(taskPickerState, target, task, callbacks, rerender);

  const divider = document.createElement("div");
  divider.className = "task-picker-remind-divider";
  target.appendChild(divider);

  renderScheduleReminderSection(taskPickerState, target, task, callbacks);

  const footer = document.createElement("div");
  footer.className = "task-picker-footer";
  const hint = document.createElement("span");
  hint.className = "task-picker-remind-hint";
  hint.textContent = "Reminders before the due date shift with it.";
  footer.appendChild(hint);
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "Done";
  close.addEventListener("click", callbacks.closeTaskPickers);
  footer.appendChild(close);
  target.appendChild(footer);

  els.inlineTaskPicker.classList.remove("hidden");
  window.requestAnimationFrame(function () {
    positionInlineTaskPicker(taskPickerState, els);
  });
}

export function openInlineTaskPicker(taskPickerState: TaskPickerState, options: {
  ref: string;
  mode: "due" | "remind" | "schedule";
  left: number;
  top: number;
  anchorTop?: number;
  anchorBottom?: number;
  task: TaskRecord | null;
  rememberNoteFocus: () => void;
  closeTaskPickers: () => void;
  renderTaskPicker: () => void;
}): void {
  // Every entry point now opens the same combined schedule dialog.
  if (taskPickerState.mode === "schedule" && taskPickerState.ref === options.ref) {
    options.closeTaskPickers();
    return;
  }
  if (!options.task) {
    return;
  }
  options.rememberNoteFocus();
  const reminderSeed = Array.isArray(options.task.remind)
    ? (options.task.remind.find(function (item) { return /^\d{1,2}:\d{2}$/.test(String(item || "").trim()); }) || "")
    : "";
  const dateParts = taskPickerPartsFromValue("due", options.task.due || "", options.task.due || "");
  const timeParts = taskPickerPartsFromValue("remind", reminderSeed, options.task.due || "");
  const parts = { year: dateParts.year, month: dateParts.month, day: dateParts.day, hour: timeParts.hour, minute: timeParts.minute };
  taskPickerState.mode = "schedule";
  taskPickerState.ref = options.ref;
  taskPickerState.left = options.left;
  taskPickerState.top = options.top;
  taskPickerState.anchorTop = Number(options.anchorTop) || 0;
  taskPickerState.anchorBottom = Number(options.anchorBottom) || 0;
  taskPickerState.year = parts.year;
  taskPickerState.month = parts.month;
  taskPickerState.day = parts.day;
  taskPickerState.hour = parts.hour;
  taskPickerState.minute = parts.minute - (parts.minute % 5);
  options.renderTaskPicker();
}
