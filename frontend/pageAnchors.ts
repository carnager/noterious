import { normalizePageDraftPath } from "./commands";
import type { HeadingRecord } from "./types";

export interface PageAnchorTarget {
  pagePath: string;
  anchor: string;
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch (_error) {
    return value;
  }
}

export function normalizePageAnchor(value: string): string {
  const decoded = safeDecodeURIComponent(String(value || "").trim().replace(/^#+/, ""));
  return decoded.trim();
}

export function slugifyHeadingAnchor(text: string): string {
  const source = normalizePageAnchor(text).toLowerCase();
  let result = "";
  let lastDash = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const isAlpha = char >= "a" && char <= "z";
    const isDigit = char >= "0" && char <= "9";
    if (isAlpha || isDigit) {
      result += char;
      lastDash = false;
      continue;
    }
    if (char === " " || char === "-" || char === "_" || char === "/") {
      if (result && !lastDash) {
        result += "-";
        lastDash = true;
      }
    }
  }

  return result.replace(/^-+|-+$/g, "");
}

export function parsePageAnchorTarget(target: string, currentPagePath?: string): PageAnchorTarget | null {
  const raw = String(target || "").trim();
  if (!raw) {
    return null;
  }

  const hashIndex = raw.indexOf("#");
  const pagePart = hashIndex >= 0 ? raw.slice(0, hashIndex) : raw;
  const anchorPart = hashIndex >= 0 ? raw.slice(hashIndex + 1) : "";
  const pagePath = normalizePageDraftPath(pagePart || currentPagePath || "");
  const anchor = normalizePageAnchor(anchorPart);

  if (!pagePath) {
    return null;
  }

  return {
    pagePath,
    anchor,
  };
}

function splitMarkdownFrontmatter(markdown: string): { bodyLines: string[]; bodyStartLine: number } {
  const lines = String(markdown || "").replace(/\r\n/g, "\n").split("\n");
  if (!lines.length || String(lines[0] || "").trim() !== "---") {
    return {
      bodyLines: lines,
      bodyStartLine: 0,
    };
  }

  for (let index = 1; index < lines.length; index += 1) {
    const trimmed = String(lines[index] || "").trim();
    if (trimmed === "---" || trimmed === "...") {
      return {
        bodyLines: lines.slice(index + 1),
        bodyStartLine: index + 1,
      };
    }
  }

  return {
    bodyLines: lines,
    bodyStartLine: 0,
  };
}

export function extractHeadingAnchors(markdown: string): HeadingRecord[] {
  const split = splitMarkdownFrontmatter(markdown);
  const headings: HeadingRecord[] = [];
  const anchorCounts: Record<string, number> = {};

  split.bodyLines.forEach(function (line, index) {
    const match = String(line || "").match(/^\s{0,3}(#{1,6})\s+(.+?)\s*$/);
    if (!match) {
      return;
    }

    const text = String(match[2] || "").trim();
    if (!text) {
      return;
    }

    const baseAnchor = slugifyHeadingAnchor(text) || ("section-" + String(split.bodyStartLine + index + 1));
    const nextCount = (anchorCounts[baseAnchor] || 0) + 1;
    anchorCounts[baseAnchor] = nextCount;

    headings.push({
      level: String(match[1] || "").length,
      text,
      anchor: nextCount > 1 ? (baseAnchor + "-" + String(nextCount)) : baseAnchor,
      line: split.bodyStartLine + index + 1,
    });
  });

  return headings;
}

export function resolveHeadingAnchorLine(toc: HeadingRecord[], anchor: string): number | null {
  const normalizedAnchor = normalizePageAnchor(anchor);
  if (!normalizedAnchor) {
    return null;
  }

  const exactNeedle = normalizedAnchor.toLowerCase();
  const slugNeedle = slugifyHeadingAnchor(normalizedAnchor);

  const exactMatch = (Array.isArray(toc) ? toc : []).find(function (heading) {
    return String(heading.anchor || "").trim().toLowerCase() === exactNeedle;
  });
  if (exactMatch && Number(exactMatch.line) > 0) {
    return Number(exactMatch.line);
  }

  const slugMatch = (Array.isArray(toc) ? toc : []).find(function (heading) {
    return String(heading.anchor || "").trim().toLowerCase() === slugNeedle
      || slugifyHeadingAnchor(String(heading.text || "")) === slugNeedle;
  });
  if (slugMatch && Number(slugMatch.line) > 0) {
    return Number(slugMatch.line);
  }

  return null;
}

export function resolveHeadingAnchorLineInMarkdown(markdown: string, anchor: string): number | null {
  return resolveHeadingAnchorLine(extractHeadingAnchors(markdown), anchor);
}
