import type {
  FrontmatterMap,
  FrontmatterScalar,
  PageIdentity,
  QueryBlockRecord,
  QueryFenceOptions,
} from "./types";

export interface FrontmatterSplit {
  frontmatter: string;
  body: string;
}

export interface BodyPosition {
  lineIndex: number;
  caret: number;
}

export interface WikiLinkMatch {
  target: string;
  label: string;
}

export interface MarkdownTableBlock {
  startLineIndex: number;
  endLineIndex: number;
  columnCount: number;
  html: string;
}

export interface MarkdownTableRows {
  header: string[];
  rows: string[][];
}

export interface MarkdownCodeFenceBlock {
  startLineIndex: number;
  endLineIndex: number;
  fence: string;
  info: string;
  language: string;
  content: string;
  closed: boolean;
}

function escapePattern(value: string): string {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function splitFrontmatter(markdown: string): FrontmatterSplit {
  const source = String(markdown || "").replace(/\r\n/g, "\n");
  if (!source.startsWith("---\n")) {
    return { frontmatter: "", body: source };
  }
  const closing = source.indexOf("\n---\n", 4);
  if (closing === -1) {
    return { frontmatter: "", body: source };
  }
  return {
    frontmatter: source.slice(0, closing + 5),
    body: source.slice(closing + 5),
  };
}

export function parseFrontmatterScalar(raw: string): FrontmatterScalar | FrontmatterScalar[] {
  const text = String(raw || "").trim();
  if (!text) {
    return "";
  }
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    return text.slice(1, -1);
  }
  if (text === "true") {
    return true;
  }
  if (text === "false") {
    return false;
  }
  if (text.startsWith("[") && text.endsWith("]")) {
    return text
      .slice(1, -1)
      .split(",")
      .map((part) => parseFrontmatterScalar(part))
      .flat()
      .filter((part) => !(typeof part === "string" && !part.trim()));
  }
  return text;
}

export function parseFrontmatter(markdown: string): FrontmatterMap {
  const split = splitFrontmatter(markdown);
  if (!split.frontmatter) {
    return {};
  }

  const lines = split.frontmatter
    .replace(/^---\n/, "")
    .replace(/\n---\n?$/, "")
    .split("\n");

  const result: FrontmatterMap = {};
  let pendingListKey = "";

  lines.forEach((line) => {
    if (!String(line || "").trim()) {
      return;
    }

    if (pendingListKey && /^\s*-\s+/.test(line)) {
      const existing = result[pendingListKey];
      const values = Array.isArray(existing) ? existing.slice() : [];
      values.push(parseFrontmatterScalar(line.replace(/^\s*-\s+/, "")) as FrontmatterScalar);
      result[pendingListKey] = values;
      return;
    }

    pendingListKey = "";
    const match = line.match(/^([A-Za-z0-9_-]+):(?:\s*(.*))?$/);
    if (!match) {
      return;
    }

    const key = match[1];
    const rawValue = typeof match[2] === "string" ? match[2] : "";
    if (!rawValue.trim()) {
      result[key] = "";
      pendingListKey = key;
      return;
    }

    result[key] = parseFrontmatterScalar(rawValue);
  });

  return result;
}

export function editableBody(markdown: string): string {
  return splitFrontmatter(markdown).body;
}

export function frontmatterBodyStart(markdown: string): number {
  return splitFrontmatter(markdown).frontmatter.length;
}

export function renderedBodyBoundaryStart(markdown: string): number {
  const split = splitFrontmatter(markdown);
  if (!split.frontmatter) {
    return 0;
  }

  const lines = split.body.split("\n");
  let offset = split.frontmatter.length;

  for (let index = 0; index < lines.length; index += 1) {
    const line = String(lines[index] || "");
    if (line.trim() !== "") {
      return offset;
    }
    offset += line.length;
    if (index < lines.length - 1) {
      offset += 1;
    }
  }

  return String(markdown || "").length;
}

export function inferMarkdownTitle(markdown: string, fallbackPage: PageIdentity | null): string {
  const frontmatter = parseFrontmatter(markdown);
  if (frontmatter.title && String(frontmatter.title).trim()) {
    return String(frontmatter.title).trim();
  }

  const body = editableBody(markdown);
  const match = body.match(/^#{1,6}\s+(.+)$/m);
  if (match && match[1]) {
    return String(match[1]).trim();
  }

  if (fallbackPage) {
    return fallbackPage.title || fallbackPage.page || fallbackPage.path || "";
  }

  return "";
}

export function rawOffsetForBodyPosition(markdown: string, lineIndex: number, caret: number): number {
  const split = splitFrontmatter(markdown);
  const body = split.body;
  const lines = body.split("\n");
  const clampedLine = Math.max(0, Math.min(Number(lineIndex) || 0, Math.max(0, lines.length - 1)));
  let offset = frontmatterBodyStart(markdown);
  for (let index = 0; index < clampedLine; index += 1) {
    offset += lines[index].length + 1;
  }
  const lineText = lines[clampedLine] || "";
  offset += Math.max(0, Math.min(Number(caret) || 0, lineText.length));
  return offset;
}

export function rawOffsetForLineNumber(markdown: string, lineNumber: number): number {
  const source = String(markdown || "").replace(/\r\n/g, "\n");
  const lines = source.split("\n");
  const target = Math.max(1, Math.min(Number(lineNumber) || 1, Math.max(1, lines.length)));
  let offset = 0;
  for (let index = 1; index < target; index += 1) {
    offset += (lines[index - 1] || "").length + 1;
  }
  return offset;
}

export function rawOffsetForTaskLine(markdown: string, lineNumber: number): number {
  const baseOffset = rawOffsetForLineNumber(markdown, lineNumber);
  const source = String(markdown || "").replace(/\r\n/g, "\n");
  const lines = source.split("\n");
  const target = Math.max(1, Math.min(Number(lineNumber) || 1, Math.max(1, lines.length)));
  const lineText = String(lines[target - 1] || "");
  const match = lineText.match(/^(\s*-\s+\[[ xX]\]\s+)/);
  if (!match) {
    return baseOffset;
  }
  return baseOffset + match[1].length;
}

export function bodyPositionFromRawOffset(markdown: string, offset: number): BodyPosition {
  const split = splitFrontmatter(markdown);
  const body = split.body;
  const lines = body.split("\n");
  const bodyStart = frontmatterBodyStart(markdown);
  const absoluteOffset = Math.max(bodyStart, Math.min(Number(offset) || 0, String(markdown || "").length));
  let remaining = absoluteOffset - bodyStart;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (remaining <= line.length) {
      return {
        lineIndex: index,
        caret: remaining,
      };
    }
    remaining -= line.length;
    if (index < lines.length - 1) {
      if (remaining === 0) {
        return {
          lineIndex: index + 1,
          caret: 0,
        };
      }
      remaining -= 1;
    }
  }

  return {
    lineIndex: Math.max(0, lines.length - 1),
    caret: (lines[lines.length - 1] || "").length,
  };
}

export function parseQueryFenceOptions(source: string): QueryFenceOptions {
  const lines = String(source || "").replace(/\r\n/g, "\n").split("\n");
  const firstLine = String(lines[0] || "").trim();
  if (!/^```query(?:\s|$)/i.test(firstLine)) {
    return {};
  }

  const options: QueryFenceOptions = {};
  const tail = firstLine.replace(/^```query\s*/i, "");
  const pattern = /([A-Za-z0-9_-]+)=("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^\s]+)/g;
  let match: RegExpExecArray | null = null;
  while ((match = pattern.exec(tail)) !== null) {
    const key = String(match[1] || "").trim();
    let value = String(match[2] || "").trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    options[key] = value;
  }
  return options;
}

export function normalizeMarkdown(markdown: string): string {
  return String(markdown || "").replace(/\r\n/g, "\n");
}

export function findDerivedQueryBlock(markdown: string, queryBlocks: QueryBlockRecord[]): QueryBlockRecord | null {
  const source = normalizeMarkdown(markdown).trim();
  for (let index = 0; index < queryBlocks.length; index += 1) {
    const block = queryBlocks[index];
    if (normalizeMarkdown(block.source).trim() === source) {
      return block;
    }
  }
  return null;
}

export function escapeHTML(value: unknown): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function splitMarkdownTableRow(line: string): string[] {
  const source = String(line || "").trim();
  const trimmed = source.replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map(function (cell) {
    return cell.trim();
  });
}

export function formatMarkdownTableRow(cells: string[]): string {
  return "| " + cells.map(function (cell) {
    return String(cell || "").trim();
  }).join(" | ") + " |";
}

function isMarkdownTableSeparator(line: string): boolean {
  const cells = splitMarkdownTableRow(line);
  if (!cells.length) {
    return false;
  }
  return cells.every(function (cell) {
    return /^:?-{3,}:?$/.test(cell);
  });
}

function looksLikeMarkdownTableRow(line: string): boolean {
  const source = String(line || "").trim();
  return source.indexOf("|") >= 0 && splitMarkdownTableRow(source).length >= 2;
}

export function markdownTableBlockAt(lines: string[], startLineIndex: number): MarkdownTableBlock | null {
  if (!Array.isArray(lines) || startLineIndex < 0 || startLineIndex + 1 >= lines.length) {
    return null;
  }

  const headerLine = String(lines[startLineIndex] || "");
  const separatorLine = String(lines[startLineIndex + 1] || "");
  if (!looksLikeMarkdownTableRow(headerLine) || !isMarkdownTableSeparator(separatorLine)) {
    return null;
  }

  const headerCells = splitMarkdownTableRow(headerLine);
  if (headerCells.length < 2) {
    return null;
  }

  const alignments = splitMarkdownTableRow(separatorLine).map(function (cell) {
    const text = String(cell || "");
    const left = text.startsWith(":");
    const right = text.endsWith(":");
    if (left && right) {
      return "center";
    }
    if (right) {
      return "right";
    }
    return "left";
  });

  const rows: string[][] = [];
  let endLineIndex = startLineIndex + 1;
  for (let index = startLineIndex + 2; index < lines.length; index += 1) {
    const rowLine = String(lines[index] || "");
    if (!looksLikeMarkdownTableRow(rowLine)) {
      break;
    }
    rows.push(splitMarkdownTableRow(rowLine));
    endLineIndex = index;
  }

  const renderCell = function (cell: string, rowIndex: number, index: number, tag: "th" | "td"): string {
    const alignment = alignments[index] || "left";
    return "<" + tag + ' class="markdown-table-cell" style="text-align:' + alignment + ';" data-table-cell="true" data-table-start-line="' + String(startLineIndex + 1) + '" data-table-row="' + String(rowIndex) + '" data-table-col="' + String(index) + '">' +
      renderInline(cell) +
      "</" + tag + ">";
  };

  const html = '<div class="markdown-table-block" data-table-start-line="' + String(startLineIndex + 1) + '">' +
    "<table><thead><tr>" +
    headerCells.map(function (cell, index) {
      return renderCell(cell, 0, index, "th");
    }).join("") +
    "</tr></thead><tbody>" +
    rows.map(function (row, rowIndex) {
      return "<tr>" + headerCells.map(function (_header, index) {
        return renderCell(String(row[index] || ""), rowIndex + 1, index, "td");
      }).join("") + "</tr>";
    }).join("") +
    "</tbody></table></div>";

  return {
    startLineIndex,
    endLineIndex,
    columnCount: headerCells.length,
    html,
  };
}

export function findMarkdownTableBlockForLine(lines: string[], lineNumber: number): MarkdownTableBlock | null {
  const target = Math.max(1, Number(lineNumber) || 0) - 1;
  for (let index = target; index >= 0; index -= 1) {
    const block = markdownTableBlockAt(lines, index);
    if (block && target >= block.startLineIndex && target <= block.endLineIndex) {
      return block;
    }
  }
  return null;
}

export function markdownTableRowsForLine(lines: string[], lineNumber: number): MarkdownTableRows | null {
  const block = findMarkdownTableBlockForLine(lines, lineNumber);
  if (!block) {
    return null;
  }
  const header = splitMarkdownTableRow(String(lines[block.startLineIndex] || ""));
  const rows: string[][] = [];
  for (let index = block.startLineIndex + 2; index <= block.endLineIndex; index += 1) {
    rows.push(splitMarkdownTableRow(String(lines[index] || "")));
  }
  return { header, rows };
}

export function markdownCodeFenceBlockAt(lines: string[], startLineIndex: number): MarkdownCodeFenceBlock | null {
  if (!Array.isArray(lines) || startLineIndex < 0 || startLineIndex >= lines.length) {
    return null;
  }

  const startLine = String(lines[startLineIndex] || "");
  const match = startLine.trim().match(/^(```+)(.*)$/);
  if (!match) {
    return null;
  }

  const fence = String(match[1] || "```");
  const info = String(match[2] || "").trim();
  const language = String(info.split(/\s+/)[0] || "").trim();
  const endPattern = new RegExp("^" + escapePattern(fence) + "\\s*$");
  let endLineIndex = lines.length - 1;
  let closed = false;

  for (let index = startLineIndex + 1; index < lines.length; index += 1) {
    if (endPattern.test(String(lines[index] || "").trim())) {
      endLineIndex = index;
      closed = true;
      break;
    }
  }

  const contentEnd = closed ? endLineIndex : lines.length;
  const content = lines.slice(startLineIndex + 1, contentEnd).join("\n");

  return {
    startLineIndex,
    endLineIndex,
    fence,
    info,
    language,
    content,
    closed,
  };
}

export function renderInline(value: string): string {
  const source = String(value || "");
  const inlinePattern = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]|\[([^\]]+)\]\(([^)\s]+)\)|`([^`]+)`|\*\*(.+?)\*\*|__(.+?)__|\*(.+?)\*|_(.+?)_|~~(.+?)~~/g;
  let result = "";
  let cursor = 0;
  let match: RegExpExecArray | null = null;

  while ((match = inlinePattern.exec(source)) !== null) {
    result += escapeHTML(source.slice(cursor, match.index));

    if (match[1] !== undefined) {
      const target = String(match[1] || "").trim();
      const label = String(match[2] || match[1] || "").trim();
      result += '<button type="button" class="wiki-link" data-page-link="' + escapeHTML(target) + '">' + escapeHTML(label) + "</button>";
    } else if (match[3] !== undefined) {
      const label = String(match[3] || "").trim();
      const href = String(match[4] || "").trim();
      if (/^[a-z]+:/i.test(href)) {
        result += '<a href="' + escapeHTML(href) + '" target="_blank" rel="noopener">' + escapeHTML(label) + "</a>";
      } else {
        result += '<button type="button" class="wiki-link" data-page-link="' + escapeHTML(href) + '">' + escapeHTML(label) + "</button>";
      }
    } else if (match[5] !== undefined) {
      result += "<code>" + escapeHTML(match[5]) + "</code>";
    } else if (match[6] !== undefined || match[7] !== undefined) {
      result += "<strong>" + escapeHTML(match[6] || match[7]) + "</strong>";
    } else if (match[8] !== undefined || match[9] !== undefined) {
      result += "<em>" + escapeHTML(match[8] || match[9]) + "</em>";
    } else if (match[10] !== undefined) {
      result += "<del>" + escapeHTML(match[10]) + "</del>";
    }

    cursor = match.index + match[0].length;
  }

  result += escapeHTML(source.slice(cursor));
  return result;
}

export function wikiLinkAtCaret(line: string, caret: number): WikiLinkMatch | null {
  const source = String(line || "");
  const pattern = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
  let match: RegExpExecArray | null = null;
  while ((match = pattern.exec(source)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (caret >= start && caret <= end) {
      return {
        target: String(match[1] || "").trim(),
        label: String(match[2] || match[1] || "").trim(),
      };
    }
  }
  return null;
}
