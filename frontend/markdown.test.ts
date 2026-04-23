import { describe, expect, it } from "vitest";

import {
  bodyPositionFromRawOffset,
  inferMarkdownTitle,
  parseFrontmatter,
  parseQueryFenceOptions,
  rawOffsetForBodyPosition,
  renderInline,
  splitFrontmatter,
  wikiLinkAtCaret,
} from "./markdown";

describe("markdown helpers", function () {
  it("splits and parses frontmatter lists and scalars", function () {
    const markdown = [
      "---",
      "title: Alpha",
      "published: true",
      "tags:",
      "  - work",
      "  - ops",
      "---",
      "# Alpha",
      "",
      "Body",
    ].join("\n");

    expect(splitFrontmatter(markdown)).toEqual({
      frontmatter: "---\ntitle: Alpha\npublished: true\ntags:\n  - work\n  - ops\n---\n",
      body: "# Alpha\n\nBody",
    });
    expect(parseFrontmatter(markdown)).toEqual({
      title: "Alpha",
      published: true,
      tags: ["work", "ops"],
    });
  });

  it("infers a title from frontmatter before headings", function () {
    const markdown = "---\ntitle: Frontmatter Title\n---\n# Heading Title\n";
    expect(inferMarkdownTitle(markdown, { path: "notes/example" })).toBe("Frontmatter Title");
  });

  it("renders wiki links while escaping raw HTML", function () {
    expect(renderInline('hello [[notes/alpha|Alpha]] <script>alert(1)</script>')).toBe(
      'hello <button type="button" class="wiki-link" data-page-link="notes/alpha">Alpha</button> &lt;script&gt;alert(1)&lt;/script&gt;'
    );
  });

  it("finds a wiki link at the caret position", function () {
    expect(wikiLinkAtCaret("before [[notes/alpha|Alpha]] after", 12)).toEqual({
      target: "notes/alpha",
      label: "Alpha",
    });
    expect(wikiLinkAtCaret("before [[notes/alpha|Alpha]] after", 2)).toBeNull();
  });

  it("round-trips between body positions and raw offsets", function () {
    const markdown = "---\ntitle: Alpha\n---\n# Heading\nSecond line";
    const offset = rawOffsetForBodyPosition(markdown, 1, 3);
    expect(bodyPositionFromRawOffset(markdown, offset)).toEqual({
      lineIndex: 1,
      caret: 3,
    });
  });

  it("parses fenced query options with quoted values", function () {
    expect(parseQueryFenceOptions("```query empty=\"Nothing here\" id=test\nfrom tasks\n```")).toEqual({
      empty: "Nothing here",
      id: "test",
    });
  });
});
