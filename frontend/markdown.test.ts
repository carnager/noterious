import { describe, expect, it } from "vitest";
import { markdownReferenceDefinitions } from "./markdownInline";

import {
  bodyPositionFromRawOffset,
  frontmatterBodyStart,
  inferMarkdownTitle,
  markdownCodeFenceBlockAt,
  markdownTableBlockAt,
  parseFrontmatter,
  parseQueryFenceOptions,
  rawOffsetForBodyPosition,
  renderedBodyBoundaryStart,
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

  it("renders explicit image markdown as an inline image", function () {
    const html = renderInline("![cat.png](../Assets/cat.png)", {currentPagePath: "Notes/today"});
    expect(html).toContain('class="markdown-inline-image-link"');
    expect(html).toContain('class="markdown-inline-image"');
    expect(html).toContain("/api/documents/download?path=Assets%2Fcat.png&amp;inline=1");
  });

  it("renders dropped image-style markdown links as inline images", function () {
    const html = renderInline("[cat.png](../Assets/cat.png)", {currentPagePath: "Notes/today"});
    expect(html).toContain('class="markdown-inline-image-link"');
    expect(html).toContain('class="markdown-inline-image"');
  });

  it("renders relative document links as document anchors when page context is known", function () {
    const html = renderInline("[spec.pdf](../Docs/spec.pdf)", {currentPagePath: "Notes/today"});
    expect(html).toContain('class="markdown-document-link"');
    expect(html).toContain("/api/documents/download?path=Docs%2Fspec.pdf");
  });

  it("renders bare URLs as anchors", function () {
    expect(renderInline("Visit https://example.com/docs for details.")).toBe(
      'Visit <a href="https://example.com/docs" target="_blank" rel="noopener">https://example.com/docs</a> for details.'
    );
  });

  it("renders nested markdown inside standard link labels", function () {
    expect(renderInline("[**Bold** and _italic_](https://example.com)")).toBe(
      '<a href="https://example.com" target="_blank" rel="noopener"><strong>Bold</strong> and <em>italic</em></a>'
    );
  });

  it("renders internal markdown links as wiki buttons with formatted labels", function () {
    expect(renderInline("[**Alpha**](notes/alpha.md)")).toBe(
      '<button type="button" class="wiki-link" data-page-link="notes/alpha.md"><strong>Alpha</strong></button>'
    );
  });

  it("renders autolinks and escaped markdown markers", function () {
    expect(renderInline("<https://example.com> and escaped \\*stars\\*")).toBe(
      '<a href="https://example.com" target="_blank" rel="noopener">https://example.com</a> and escaped *stars*'
    );
  });

  it("renders nested emphasis and strikethrough", function () {
    expect(renderInline("***both*** ~~gone~~")).toBe(
      '<em><strong>both</strong></em> <del>gone</del>'
    );
  });

  it("renders reference-style links when definitions are provided", function () {
    const referenceDefinitions = markdownReferenceDefinitions([
      "[ref-link]: https://example.com/reference \"Reference Link\"",
      "[1]: https://example.com/numbered \"Numbered Reference\"",
    ].join("\n"));

    expect(renderInline("Use [this one][ref-link] or [this][1].", {referenceDefinitions})).toBe(
      'Use <a href="https://example.com/reference" target="_blank" rel="noopener">this one</a> or <a href="https://example.com/numbered" target="_blank" rel="noopener">this</a>.'
    );
  });

  it("renders allowed inline html tags and inline math", function () {
    expect(renderInline("This is <sub>sub</sub>, <sup>sup</sup>, <kbd>Ctrl</kbd>, <mark>hi</mark>, and $E = mc^2$.")).toBe(
      'This is <sub class="markdown-inline-sub">sub</sub>, <sup class="markdown-inline-sup">sup</sup>, <kbd class="markdown-inline-kbd">Ctrl</kbd>, <mark class="markdown-inline-mark">hi</mark>, and <span class="markdown-inline-math">E = mc^2</span>.'
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

  it("reports the body start offset after frontmatter", function () {
    const markdown = "---\ntitle: Alpha\n---\n# Heading\nSecond line";
    const offset = frontmatterBodyStart(markdown);

    expect(offset).toBe(splitFrontmatter(markdown).frontmatter.length);
    expect(markdown.slice(offset)).toBe("# Heading\nSecond line");
    expect(frontmatterBodyStart("# Heading\nSecond line")).toBe(0);
  });

  it("treats blank lines after frontmatter as rendered safe space", function () {
    const markdown = "---\ntitle: Alpha\n---\n\n## Heading\nSecond line";
    const blankOnly = "---\ntitle: Alpha\n---\n\n";
    const boundary = renderedBodyBoundaryStart(markdown);

    expect(markdown.slice(boundary)).toBe("## Heading\nSecond line");
    expect(renderedBodyBoundaryStart(blankOnly)).toBe(blankOnly.length);
    expect(renderedBodyBoundaryStart("## Heading\nSecond line")).toBe(0);
  });

  it("parses fenced query options with quoted values", function () {
    expect(parseQueryFenceOptions("```query empty=\"Nothing here\" id=test\nfrom tasks\n```")).toEqual({
      empty: "Nothing here",
      id: "test",
    });
  });

  it("renders markdown pipe tables into HTML", function () {
    const block = markdownTableBlockAt([
      "| Name | Page |",
      "| --- | --- |",
      "| Alpha | [[notes/alpha]] |",
      "",
    ], 0);

    expect(block?.endLineIndex).toBe(2);
    expect(block?.html).toContain("<table>");
    expect(block?.html).toContain("<th");
    expect(block?.html).toContain('data-table-cell="true"');
    expect(block?.html).toContain('data-page-link="notes/alpha"');
  });

  it("extracts fenced code blocks without fence markup", function () {
    const block = markdownCodeFenceBlockAt([
      "```ts linenos",
      "const alpha = 1;",
      "console.log(alpha);",
      "```",
    ], 0);

    expect(block).toEqual({
      startLineIndex: 0,
      endLineIndex: 3,
      fence: "```",
      info: "ts linenos",
      language: "ts",
      content: "const alpha = 1;\nconsole.log(alpha);",
      closed: true,
    });
  });

  it("keeps unclosed fenced code blocks open until the end", function () {
    const block = markdownCodeFenceBlockAt([
      "```go",
      "func main() {",
      "  println(\"hi\")",
      "}",
    ], 0);

    expect(block?.language).toBe("go");
    expect(block?.endLineIndex).toBe(3);
    expect(block?.content).toBe("func main() {\n  println(\"hi\")\n}");
    expect(block?.closed).toBe(false);
  });
});
