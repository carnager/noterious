// Shared position mapping for the editable rendered mode.
//
// Rendered (visual) positions and raw (markdown source) positions diverge
// wherever the rendered layer hides prefixes (task checkboxes, heading
// markers, quote/list markers, ...) or collapses whole blocks (tables, code
// fences). Every consumer — arrow-key handlers, click handling, selection
// clamping — must agree on that mapping, so it lives here as pure functions
// over line text, unit-testable without a DOM or an EditorView.

import {
  markdownAbbreviationDefinitionMatch,
  markdownDefinitionListPrefixMatch,
  markdownFootnoteDefinitionMatch,
} from "./markdownExtensions";
import { markdownCodeFenceBlockAt, markdownTableBlockAt, markdownTableBlockRangeAt } from "./markdown";
import {
  renderedTaskRawColumn,
  renderedTaskVisibleColumn,
  taskLineHasInlineDate,
  taskPrefixLength,
} from "./taskNavigation";

export interface RenderedLinePosition {
  lineIndex: number;
  column: number;
}

export type VerticalArrowKey = "ArrowUp" | "ArrowDown";

export interface MarkdownQuotePrefixMatch {
  prefixLength: number;
  depth: number;
}

export function markdownBlockquotePrefixMatch(text: string): MarkdownQuotePrefixMatch | null {
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

export interface MarkdownListPrefixMatch {
  prefixLength: number;
  indentLength: number;
  markerText: string;
  ordered: boolean;
}

export function markdownListPrefixMatch(text: string, startOffset = 0): MarkdownListPrefixMatch | null {
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

// Length of the raw prefix the rendered layer hides (or replaces with a
// widget) at the start of a line. Columns below this are not reachable in
// rendered mode.
export function renderedHiddenPrefixLength(text: string): number {
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

// First column the caret may occupy on a rendered line.
export function renderedVisibleColumn(text: string): number {
  const source = String(text || "");
  return Math.min(source.length, renderedHiddenPrefixLength(source));
}

export function codeBlockEndingAtLine(lines: string[], endLineIndex: number) {
  for (let index = Math.max(0, endLineIndex); index >= 0; index -= 1) {
    const block = markdownCodeFenceBlockAt(lines, index);
    if (block && block.endLineIndex === endLineIndex) {
      return block;
    }
  }
  return null;
}

export function tableBlockEndingAtLine(lines: string[], endLineIndex: number) {
  for (let index = Math.max(0, endLineIndex); index >= 0; index -= 1) {
    const block = markdownTableBlockAt(lines, index);
    if (block && block.endLineIndex === endLineIndex) {
      return block;
    }
  }
  return null;
}

// Move a caret column onto another line, clamping to the line length and the
// rendered visible start of that line.
function moveColumnToLine(lines: string[], column: number, targetLineIndex: number): RenderedLinePosition | null {
  if (targetLineIndex < 0 || targetLineIndex >= lines.length) {
    return null;
  }
  const text = String(lines[targetLineIndex] || "");
  const targetColumn = Math.min(Math.max(0, Number(column) || 0), text.length);
  return {
    lineIndex: targetLineIndex,
    column: Math.max(renderedVisibleColumn(text), targetColumn),
  };
}

// Vertical arrow movement around rendered table widgets. Tables collapse to a
// single block widget, so the caret has to hop over the hidden source lines.
export function renderedTableArrowTarget(
  lines: string[],
  key: VerticalArrowKey,
  position: RenderedLinePosition
): RenderedLinePosition | null {
  const lineIndex = position.lineIndex;
  if (key === "ArrowUp") {
    if (lineIndex <= 0) {
      return null;
    }

    const tableEndingOnPreviousLine = tableBlockEndingAtLine(lines, lineIndex - 1);
    if (tableEndingOnPreviousLine) {
      return moveColumnToLine(lines, position.column, tableEndingOnPreviousLine.endLineIndex);
    }

    const tableEndingTwoLinesAbove = tableBlockEndingAtLine(lines, lineIndex - 2);
    if (tableEndingTwoLinesAbove) {
      return moveColumnToLine(lines, position.column, lineIndex - 1);
    }

    return null;
  }

  if (lineIndex >= lines.length - 1) {
    return null;
  }

  const tableStartingOnNextLine = markdownTableBlockAt(lines, lineIndex + 1);
  if (tableStartingOnNextLine) {
    return moveColumnToLine(lines, position.column, tableStartingOnNextLine.startLineIndex);
  }

  const tableStartingTwoLinesBelow = markdownTableBlockAt(lines, lineIndex + 2);
  if (tableStartingTwoLinesBelow) {
    return moveColumnToLine(lines, position.column, lineIndex + 1);
  }

  return null;
}

// Vertical arrow movement between task lines: keeps the caret on the same
// visible column even when the raw task prefixes differ in length.
export function renderedTaskArrowTarget(
  lines: string[],
  key: VerticalArrowKey,
  position: RenderedLinePosition
): RenderedLinePosition | null {
  const targetLineIndex = key === "ArrowDown" ? position.lineIndex + 1 : position.lineIndex - 1;
  if (targetLineIndex < 0 || targetLineIndex >= lines.length) {
    return null;
  }

  const currentText = String(lines[position.lineIndex] || "");
  const targetText = String(lines[targetLineIndex] || "");
  const currentTaskPrefix = taskPrefixLength(currentText);
  const targetTaskPrefix = taskPrefixLength(targetText);
  if (
    !currentTaskPrefix
    && !targetTaskPrefix
    && !taskLineHasInlineDate(currentText)
    && !taskLineHasInlineDate(targetText)
  ) {
    return null;
  }

  const visibleColumn = renderedTaskVisibleColumn(currentText, position.column);
  const targetRawColumn = renderedTaskRawColumn(targetText, visibleColumn);
  return {
    lineIndex: targetLineIndex,
    column: Math.min(targetRawColumn, targetText.length),
  };
}

// Vertical arrow movement around rendered code fences: the fence lines are
// hidden, so the caret skips from the line outside the block directly to the
// first/last visible content line.
export function renderedCodeBlockArrowTarget(
  lines: string[],
  key: VerticalArrowKey,
  position: RenderedLinePosition
): RenderedLinePosition | null {
  const lineIndex = position.lineIndex;
  const column = Math.max(0, position.column);

  if (key === "ArrowDown") {
    if (lineIndex >= lines.length - 1) {
      return null;
    }
    const block = markdownCodeFenceBlockAt(lines, lineIndex + 1);
    if (!block) {
      return null;
    }
    const targetText = String(lines[block.startLineIndex] || "");
    return {
      lineIndex: block.startLineIndex,
      column: Math.min(column, targetText.length),
    };
  }

  if (lineIndex <= 0) {
    return null;
  }
  const block = codeBlockEndingAtLine(lines, lineIndex - 1);
  if (!block) {
    return null;
  }
  const targetLineIndex = block.closed && block.endLineIndex > block.startLineIndex + 1
    ? block.endLineIndex - 1
    : block.endLineIndex;
  const targetText = String(lines[targetLineIndex] || "");
  return {
    lineIndex: targetLineIndex,
    column: Math.min(column, targetText.length),
  };
}

export interface MarkdownMathBlock {
  startLineIndex: number;
  endLineIndex: number;
}

export function markdownMathBlockAt(lines: string[], startLineIndex: number): MarkdownMathBlock | null {
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

export function markdownQueryFenceEndLine(lines: string[], startLineIndex: number): number {
  let endLineIndex = startLineIndex;
  while (endLineIndex < lines.length - 1) {
    endLineIndex += 1;
    if (/^```/.test(String(lines[endLineIndex] || "").trim())) {
      break;
    }
  }
  return endLineIndex;
}

export function isMarkdownQueryFenceStart(text: string): boolean {
  return /^```query(?:\s|$)/i.test(String(text || "").trim());
}

export type RenderedBlockKind =
  | "frontmatter"
  | "reference"
  | "table"
  | "query"
  | "math"
  | "code"
  | "line";

// One rendered block: a contiguous run of raw lines the rendered layer treats
// as a unit (a widget, a hidden range, or a single visible line). Line
// indexes are 0-based and inclusive.
export interface RenderedBlockRange {
  kind: RenderedBlockKind;
  startLineIndex: number;
  endLineIndex: number;
}

export interface RenderedBlockScanOptions {
  // Number of leading lines hidden as frontmatter (0 when none).
  frontmatterLineCount?: number;
  // Reference-definition runs to hide, keyed by 0-based start line index.
  // Omit entries (or the map) while definitions are being edited — the lines
  // then scan as ordinary blocks, matching the rendered reveal behavior.
  referenceDefinitionStarts?: Map<number, number> | null;
}

// Partition the document into rendered blocks. Mirrors the walk order of the
// decoration builder: frontmatter, then per line reference definitions,
// tables, query fences, math fences, code fences, and single visible lines.
export function scanRenderedBlocks(lines: string[], options?: RenderedBlockScanOptions): RenderedBlockRange[] {
  const blocks: RenderedBlockRange[] = [];
  const frontmatterLineCount = Math.max(0, Number(options && options.frontmatterLineCount) || 0);
  const referenceDefinitionStarts = options && options.referenceDefinitionStarts
    ? options.referenceDefinitionStarts
    : null;

  let lineIndex = 0;
  if (frontmatterLineCount > 0) {
    blocks.push({
      kind: "frontmatter",
      startLineIndex: 0,
      endLineIndex: Math.min(frontmatterLineCount, lines.length) - 1,
    });
    lineIndex = frontmatterLineCount;
  }

  while (lineIndex < lines.length) {
    const text = String(lines[lineIndex] || "");

    const referenceEndLineIndex = referenceDefinitionStarts ? referenceDefinitionStarts.get(lineIndex) : undefined;
    if (typeof referenceEndLineIndex === "number") {
      blocks.push({
        kind: "reference",
        startLineIndex: lineIndex,
        endLineIndex: Math.max(lineIndex, referenceEndLineIndex),
      });
      lineIndex = Math.max(lineIndex, referenceEndLineIndex) + 1;
      continue;
    }

    const tableRange = markdownTableBlockRangeAt(lines, lineIndex);
    if (tableRange) {
      blocks.push({
        kind: "table",
        startLineIndex: tableRange.startLineIndex,
        endLineIndex: tableRange.endLineIndex,
      });
      lineIndex = tableRange.endLineIndex + 1;
      continue;
    }

    if (isMarkdownQueryFenceStart(text)) {
      const endLineIndex = markdownQueryFenceEndLine(lines, lineIndex);
      blocks.push({
        kind: "query",
        startLineIndex: lineIndex,
        endLineIndex,
      });
      lineIndex = endLineIndex + 1;
      continue;
    }

    const mathBlock = markdownMathBlockAt(lines, lineIndex);
    if (mathBlock) {
      blocks.push({
        kind: "math",
        startLineIndex: mathBlock.startLineIndex,
        endLineIndex: mathBlock.endLineIndex,
      });
      lineIndex = mathBlock.endLineIndex + 1;
      continue;
    }

    const codeBlock = markdownCodeFenceBlockAt(lines, lineIndex);
    if (codeBlock) {
      blocks.push({
        kind: "code",
        startLineIndex: codeBlock.startLineIndex,
        endLineIndex: codeBlock.endLineIndex,
      });
      lineIndex = codeBlock.endLineIndex + 1;
      continue;
    }

    blocks.push({
      kind: "line",
      startLineIndex: lineIndex,
      endLineIndex: lineIndex,
    });
    lineIndex += 1;
  }

  return blocks;
}

// Which rendered block contains the given 0-based line index.
export function renderedBlockContaining(blocks: RenderedBlockRange[], lineIndex: number): RenderedBlockRange | null {
  let low = 0;
  let high = blocks.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const block = blocks[middle];
    if (lineIndex < block.startLineIndex) {
      high = middle - 1;
    } else if (lineIndex > block.endLineIndex) {
      low = middle + 1;
    } else {
      return block;
    }
  }
  return null;
}

// Combined vertical arrow target for rendered mode: task columns first, then
// table hops, then code-fence hops, then a plain one-line move clamped to the
// rendered visible start.
export function renderedVerticalArrowTarget(
  lines: string[],
  key: VerticalArrowKey,
  position: RenderedLinePosition
): RenderedLinePosition | null {
  const taskTarget = renderedTaskArrowTarget(lines, key, position);
  if (taskTarget !== null) {
    return taskTarget;
  }

  const tableTarget = renderedTableArrowTarget(lines, key, position);
  if (tableTarget !== null) {
    return tableTarget;
  }

  const codeBlockTarget = renderedCodeBlockArrowTarget(lines, key, position);
  if (codeBlockTarget !== null) {
    return codeBlockTarget;
  }

  const targetLineIndex = key === "ArrowDown" ? position.lineIndex + 1 : position.lineIndex - 1;
  return moveColumnToLine(lines, position.column, targetLineIndex);
}
