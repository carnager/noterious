import { describe, expect, it } from "vitest";

import {
  codeBlockEndingAtLine,
  markdownBlockquotePrefixMatch,
  markdownListPrefixMatch,
  markdownMathBlockAt,
  renderedBlockContaining,
  renderedCodeBlockArrowTarget,
  renderedHiddenPrefixLength,
  renderedTableArrowTarget,
  renderedTaskArrowTarget,
  renderedVerticalArrowTarget,
  renderedVisibleColumn,
  scanRenderedBlocks,
  tableBlockEndingAtLine,
} from "./renderedPositions";

describe("markdownBlockquotePrefixMatch", function () {
  it("matches nested quote prefixes with depth", function () {
    expect(markdownBlockquotePrefixMatch("> quoted")).toEqual({ prefixLength: 2, depth: 1 });
    expect(markdownBlockquotePrefixMatch("> > nested")).toEqual({ prefixLength: 4, depth: 2 });
    expect(markdownBlockquotePrefixMatch("plain")).toBeNull();
  });
});

describe("markdownListPrefixMatch", function () {
  it("matches unordered and ordered list prefixes", function () {
    expect(markdownListPrefixMatch("- item")).toEqual({
      prefixLength: 2,
      indentLength: 0,
      markerText: "•",
      ordered: false,
    });
    expect(markdownListPrefixMatch("  3) item")).toEqual({
      prefixLength: 5,
      indentLength: 2,
      markerText: "3)",
      ordered: true,
    });
    expect(markdownListPrefixMatch("plain")).toBeNull();
  });

  it("matches after a start offset", function () {
    expect(markdownListPrefixMatch("> - item", 2)).toEqual({
      prefixLength: 2,
      indentLength: 0,
      markerText: "•",
      ordered: false,
    });
  });
});

describe("renderedHiddenPrefixLength", function () {
  it("uses the task prefix when present", function () {
    expect(renderedHiddenPrefixLength("- [ ] Task text")).toBe(6);
  });

  it("uses heading markers", function () {
    expect(renderedHiddenPrefixLength("## Heading")).toBe(3);
  });

  it("combines quote and list prefixes", function () {
    expect(renderedHiddenPrefixLength("> - item")).toBe(4);
  });

  it("returns zero for plain text", function () {
    expect(renderedHiddenPrefixLength("plain text")).toBe(0);
  });
});

describe("renderedVisibleColumn", function () {
  it("clamps the hidden prefix to the line length", function () {
    expect(renderedVisibleColumn("- [ ] Task")).toBe(6);
    expect(renderedVisibleColumn("plain")).toBe(0);
  });
});

const tableLines = [
  "Before",
  "",
  "| A | B |",
  "| --- | --- |",
  "| 1 | 2 |",
  "",
  "After",
];

describe("tableBlockEndingAtLine", function () {
  it("finds the table block by its end line", function () {
    const block = tableBlockEndingAtLine(tableLines, 4);
    expect(block).not.toBeNull();
    expect(block?.startLineIndex).toBe(2);
    expect(block?.endLineIndex).toBe(4);
    expect(tableBlockEndingAtLine(tableLines, 3)).toBeNull();
  });
});

describe("renderedTableArrowTarget", function () {
  it("moves upward from below a table to the table end line", function () {
    const target = renderedTableArrowTarget(tableLines, "ArrowUp", { lineIndex: 5, column: 0 });
    expect(target).toEqual({ lineIndex: 4, column: 0 });
  });

  it("moves to the adjacent blank line when the table ends two lines above", function () {
    const target = renderedTableArrowTarget(tableLines, "ArrowUp", { lineIndex: 6, column: 3 });
    expect(target).toEqual({ lineIndex: 5, column: 0 });
  });

  it("moves downward from above a table to the table start line", function () {
    const target = renderedTableArrowTarget(tableLines, "ArrowDown", { lineIndex: 1, column: 0 });
    expect(target).toEqual({ lineIndex: 2, column: 0 });
  });

  it("moves to the adjacent blank line when the table starts two lines below", function () {
    const target = renderedTableArrowTarget(tableLines, "ArrowDown", { lineIndex: 0, column: 2 });
    expect(target).toEqual({ lineIndex: 1, column: 0 });
  });

  it("returns null away from tables", function () {
    expect(renderedTableArrowTarget(tableLines, "ArrowUp", { lineIndex: 1, column: 0 })).toBeNull();
    expect(renderedTableArrowTarget(tableLines, "ArrowDown", { lineIndex: 5, column: 0 })).toBeNull();
  });
});

const taskLines = [
  "- [ ] Alpha [due: 2026-01-01]",
  "- [ ] Bravo",
  "plain",
];

describe("renderedTaskArrowTarget", function () {
  it("keeps the visible column when moving between task lines", function () {
    const target = renderedTaskArrowTarget(taskLines, "ArrowDown", { lineIndex: 0, column: 8 });
    expect(target).toEqual({ lineIndex: 1, column: 8 });
  });

  it("maps visible columns between task and plain lines", function () {
    const down = renderedTaskArrowTarget(taskLines, "ArrowDown", { lineIndex: 1, column: 7 });
    expect(down).toEqual({ lineIndex: 2, column: 1 });

    const up = renderedTaskArrowTarget(taskLines, "ArrowUp", { lineIndex: 2, column: 1 });
    expect(up).toEqual({ lineIndex: 1, column: 7 });
  });

  it("returns null between plain lines", function () {
    expect(renderedTaskArrowTarget(["one", "two"], "ArrowDown", { lineIndex: 0, column: 1 })).toBeNull();
  });
});

const codeLines = [
  "Intro",
  "```js",
  "const a = 1;",
  "const b = 2;",
  "```",
  "Outro",
];

describe("codeBlockEndingAtLine", function () {
  it("finds the fence block by its closing line", function () {
    const block = codeBlockEndingAtLine(codeLines, 4);
    expect(block).not.toBeNull();
    expect(block?.startLineIndex).toBe(1);
    expect(block?.closed).toBe(true);
    expect(codeBlockEndingAtLine(codeLines, 3)).toBeNull();
  });
});

describe("renderedCodeBlockArrowTarget", function () {
  it("enters the block from above at the fence line", function () {
    const target = renderedCodeBlockArrowTarget(codeLines, "ArrowDown", { lineIndex: 0, column: 2 });
    expect(target).toEqual({ lineIndex: 1, column: 2 });
  });

  it("enters the block from below at the last content line", function () {
    const target = renderedCodeBlockArrowTarget(codeLines, "ArrowUp", { lineIndex: 5, column: 3 });
    expect(target).toEqual({ lineIndex: 3, column: 3 });
  });

  it("returns null away from code fences", function () {
    expect(renderedCodeBlockArrowTarget(codeLines, "ArrowUp", { lineIndex: 1, column: 0 })).toBeNull();
    expect(renderedCodeBlockArrowTarget(codeLines, "ArrowDown", { lineIndex: 4, column: 0 })).toBeNull();
  });
});

describe("renderedVerticalArrowTarget", function () {
  it("falls back to a plain one-line move clamped to the rendered start", function () {
    const lines = ["plain", "## Heading"];
    const target = renderedVerticalArrowTarget(lines, "ArrowDown", { lineIndex: 0, column: 1 });
    expect(target).toEqual({ lineIndex: 1, column: 3 });
  });

  it("returns null at document boundaries", function () {
    expect(renderedVerticalArrowTarget(["only"], "ArrowUp", { lineIndex: 0, column: 0 })).toBeNull();
    expect(renderedVerticalArrowTarget(["only"], "ArrowDown", { lineIndex: 0, column: 0 })).toBeNull();
  });

  it("prefers the task mapping over the plain move", function () {
    const lines = ["- [ ] Alpha", "- [ ] Bravo"];
    const target = renderedVerticalArrowTarget(lines, "ArrowDown", { lineIndex: 0, column: 7 });
    expect(target).toEqual({ lineIndex: 1, column: 7 });
  });
});

describe("markdownMathBlockAt", function () {
  it("finds a closed math fence", function () {
    expect(markdownMathBlockAt(["$$", "x^2", "$$", "after"], 0)).toEqual({ startLineIndex: 0, endLineIndex: 2 });
  });

  it("extends an unclosed math fence to the last line", function () {
    expect(markdownMathBlockAt(["$$", "x^2"], 0)).toEqual({ startLineIndex: 0, endLineIndex: 1 });
  });

  it("returns null when the line is not a math fence", function () {
    expect(markdownMathBlockAt(["x^2"], 0)).toBeNull();
  });
});

describe("scanRenderedBlocks", function () {
  it("partitions a document into rendered blocks", function () {
    const lines = [
      "# Title",
      "",
      "| A | B |",
      "| --- | --- |",
      "| 1 | 2 |",
      "```query",
      "tag:foo",
      "```",
      "$$",
      "x^2",
      "$$",
      "```js",
      "const a = 1;",
      "```",
      "tail",
    ];
    expect(scanRenderedBlocks(lines)).toEqual([
      { kind: "line", startLineIndex: 0, endLineIndex: 0 },
      { kind: "line", startLineIndex: 1, endLineIndex: 1 },
      { kind: "table", startLineIndex: 2, endLineIndex: 4 },
      { kind: "query", startLineIndex: 5, endLineIndex: 7 },
      { kind: "math", startLineIndex: 8, endLineIndex: 10 },
      { kind: "code", startLineIndex: 11, endLineIndex: 13 },
      { kind: "line", startLineIndex: 14, endLineIndex: 14 },
    ]);
  });

  it("hides frontmatter lines as a single block", function () {
    const lines = ["---", "title: Note", "---", "body"];
    expect(scanRenderedBlocks(lines, { frontmatterLineCount: 3 })).toEqual([
      { kind: "frontmatter", startLineIndex: 0, endLineIndex: 2 },
      { kind: "line", startLineIndex: 3, endLineIndex: 3 },
    ]);
  });

  it("treats reference definition runs as blocks when provided", function () {
    const lines = ["text", "[ref]: https://example.com", "tail"];
    const referenceDefinitionStarts = new Map<number, number>([[1, 1]]);
    expect(scanRenderedBlocks(lines, { referenceDefinitionStarts })).toEqual([
      { kind: "line", startLineIndex: 0, endLineIndex: 0 },
      { kind: "reference", startLineIndex: 1, endLineIndex: 1 },
      { kind: "line", startLineIndex: 2, endLineIndex: 2 },
    ]);
  });

  it("covers every line exactly once", function () {
    const lines = ["a", "```", "unclosed fence", "still inside"];
    const blocks = scanRenderedBlocks(lines);
    expect(blocks[0]).toEqual({ kind: "line", startLineIndex: 0, endLineIndex: 0 });
    expect(blocks[1]).toEqual({ kind: "code", startLineIndex: 1, endLineIndex: 3 });
    expect(blocks.length).toBe(2);
  });
});

describe("renderedBlockContaining", function () {
  it("finds the block containing a line", function () {
    const blocks = scanRenderedBlocks(["a", "```", "b", "```", "c"]);
    expect(renderedBlockContaining(blocks, 0)?.kind).toBe("line");
    expect(renderedBlockContaining(blocks, 2)?.kind).toBe("code");
    expect(renderedBlockContaining(blocks, 4)?.kind).toBe("line");
    expect(renderedBlockContaining(blocks, 9)).toBeNull();
  });
});
