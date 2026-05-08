import { describe, expect, it } from "vitest";

import { extractHeadingAnchors, parsePageAnchorTarget, resolveHeadingAnchorLine, resolveHeadingAnchorLineInMarkdown, slugifyHeadingAnchor } from "./pageAnchors";
import type { HeadingRecord } from "./types";

describe("page anchor helpers", function () {
  it("parses page links with markdown paths and same-page anchors", function () {
    expect(parsePageAnchorTarget("notes/alpha.md#ship-it")).toEqual({
      pagePath: "notes/alpha",
      anchor: "ship-it",
    });
    expect(parsePageAnchorTarget("#Ship It", "notes/alpha")).toEqual({
      pagePath: "notes/alpha",
      anchor: "Ship It",
    });
  });

  it("slugifies heading text like the backend TOC extractor", function () {
    expect(slugifyHeadingAnchor("Ship It / Today")).toBe("ship-it-today");
    expect(slugifyHeadingAnchor("  Already-slugged  ")).toBe("already-slugged");
  });

  it("resolves anchors by exact anchor, slugged heading text, and decoded fragments", function () {
    const toc: HeadingRecord[] = [
      { level: 1, text: "Alpha", anchor: "alpha", line: 1 },
      { level: 2, text: "Ship It", anchor: "ship-it", line: 8 },
      { level: 2, text: "Ship It", anchor: "ship-it-2", line: 14 },
    ];

    expect(resolveHeadingAnchorLine(toc, "ship-it")).toBe(8);
    expect(resolveHeadingAnchorLine(toc, "Ship It")).toBe(8);
    expect(resolveHeadingAnchorLine(toc, "ship-it-2")).toBe(14);
    expect(resolveHeadingAnchorLine(toc, "Ship%20It")).toBe(8);
    expect(resolveHeadingAnchorLine(toc, "missing")).toBeNull();
  });

  it("extracts heading anchors from live markdown while skipping frontmatter", function () {
    const markdown = [
      "---",
      "title: Alpha",
      "---",
      "",
      "# Alpha",
      "## Ship It",
      "## Ship It",
    ].join("\n");

    expect(extractHeadingAnchors(markdown)).toEqual([
      { level: 1, text: "Alpha", anchor: "alpha", line: 5 },
      { level: 2, text: "Ship It", anchor: "ship-it", line: 6 },
      { level: 2, text: "Ship It", anchor: "ship-it-2", line: 7 },
    ]);
    expect(resolveHeadingAnchorLineInMarkdown(markdown, "ship-it-2")).toBe(7);
  });
});
