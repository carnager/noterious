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
  let offset = split.frontmatter.length;
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
  const bodyStart = split.frontmatter.length;
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

export function renderInline(value: string): string {
  const source = String(value || "");
  const wikiPattern = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
  let result = "";
  let cursor = 0;
  let match: RegExpExecArray | null = null;

  while ((match = wikiPattern.exec(source)) !== null) {
    const [fullMatch, rawTarget, rawLabel] = match;
    result += escapeHTML(source.slice(cursor, match.index));
    const target = String(rawTarget || "").trim();
    const label = String(rawLabel || rawTarget || "").trim();
    result += '<button type="button" class="wiki-link" data-page-link="' + escapeHTML(target) + '">' + escapeHTML(label) + "</button>";
    cursor = match.index + fullMatch.length;
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
