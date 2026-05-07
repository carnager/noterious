import { GFM, parser as markdownParser } from "@lezer/markdown";
import type { TreeCursor } from "@lezer/common";

export interface MarkdownInlineNode {
  name: string;
  from: number;
  to: number;
  children: MarkdownInlineNode[];
}

export interface MarkdownInlineSpecialSpan {
  kind: "wiki_link" | "wiki_image";
  from: number;
  to: number;
  raw: string;
  target: string;
  label: string;
}

export interface MarkdownInlineLinkInfo {
  labelFrom: number;
  labelTo: number;
  urlFrom: number;
  urlTo: number;
}

export interface MarkdownReferenceDefinition {
  label: string;
  target: string;
  title: string;
  from: number;
  to: number;
}

export interface MarkdownResolvedLinkInfo {
  labelFrom: number;
  labelTo: number;
  target: string;
  title: string;
  urlFrom?: number;
  urlTo?: number;
  referenceLabel?: string;
}

const configuredMarkdownParser = markdownParser.configure([GFM]);

function buildInlineNode(cursor: TreeCursor): MarkdownInlineNode {
  const node: MarkdownInlineNode = {
    name: cursor.name,
    from: cursor.from,
    to: cursor.to,
    children: [],
  };

  if (cursor.firstChild()) {
    do {
      node.children.push(buildInlineNode(cursor));
    } while (cursor.nextSibling());
    cursor.parent();
  }

  return node;
}

export function parseInlineMarkdownTree(source: string): MarkdownInlineNode {
  return buildInlineNode(configuredMarkdownParser.parse(String(source || "")).cursor());
}

function walkMarkdownNodes(node: MarkdownInlineNode, visit: (node: MarkdownInlineNode) => void): void {
  visit(node);
  for (let index = 0; index < node.children.length; index += 1) {
    walkMarkdownNodes(node.children[index], visit);
  }
}

export function normalizeMarkdownLinkLabel(label: string): string {
  return String(label || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function markdownLabelText(source: string, node: MarkdownInlineNode): string {
  const text = String(source || "");
  const from = node.from < node.to && text[node.from] === "[" ? node.from + 1 : node.from;
  const to = node.to > from && text[node.to - 1] === "]" ? node.to - 1 : node.to;
  return text.slice(from, to);
}

export function markdownReferenceDefinitions(source: string): Map<string, MarkdownReferenceDefinition> {
  const text = String(source || "");
  const root = parseInlineMarkdownTree(text);
  const definitions = new Map<string, MarkdownReferenceDefinition>();

  walkMarkdownNodes(root, function (node) {
    if (node.name !== "LinkReference") {
      return;
    }

    const labelNode = node.children.find(function (child) {
      return child.name === "LinkLabel";
    });
    const urlNode = node.children.find(function (child) {
      return child.name === "URL";
    });
    const titleNode = node.children.find(function (child) {
      return child.name === "LinkTitle";
    });
    if (!labelNode || !urlNode) {
      return;
    }

    const label = markdownLabelText(text, labelNode);
    const normalized = normalizeMarkdownLinkLabel(label);
    if (!normalized) {
      return;
    }

    definitions.set(normalized, {
      label,
      target: text.slice(urlNode.from, urlNode.to).trim(),
      title: titleNode
        ? text.slice(titleNode.from + 1, Math.max(titleNode.from + 1, titleNode.to - 1)).trim()
        : "",
      from: node.from,
      to: node.to,
    });
  });

  return definitions;
}

export function findMarkdownInlineSpecialSpans(source: string): MarkdownInlineSpecialSpan[] {
  const text = String(source || "");
  const spans: MarkdownInlineSpecialSpan[] = [];
  const pattern = /!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]|\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
  let match: RegExpExecArray | null = null;

  while ((match = pattern.exec(text)) !== null) {
    if (match[1] !== undefined) {
      spans.push({
        kind: "wiki_image",
        from: match.index,
        to: match.index + match[0].length,
        raw: match[0],
        target: String(match[1] || "").trim(),
        label: String(match[2] || "").trim(),
      });
      continue;
    }

    spans.push({
      kind: "wiki_link",
      from: match.index,
      to: match.index + match[0].length,
      raw: match[0],
      target: String(match[3] || "").trim(),
      label: String(match[4] || "").trim(),
    });
  }

  return spans;
}

export function markdownInlineLinkInfo(node: MarkdownInlineNode): MarkdownInlineLinkInfo | null {
  if (node.name !== "Link" && node.name !== "Image") {
    return null;
  }

  const urlNode = node.children.find(function (child) {
    return child.name === "URL";
  });
  if (!urlNode) {
    return null;
  }

  const marksBeforeUrl = node.children.filter(function (child) {
    return child.name === "LinkMark" && child.to <= urlNode.from;
  });
  if (marksBeforeUrl.length < 2) {
    return null;
  }

  const openingMark = marksBeforeUrl[0];
  const closingLabelMark = marksBeforeUrl[marksBeforeUrl.length - 2];
  if (closingLabelMark.from < openingMark.to) {
    return null;
  }

  return {
    labelFrom: openingMark.to,
    labelTo: closingLabelMark.from,
    urlFrom: urlNode.from,
    urlTo: urlNode.to,
  };
}

export function markdownResolvedLinkInfo(
  node: MarkdownInlineNode,
  source: string,
  referenceDefinitions?: Map<string, MarkdownReferenceDefinition> | null
): MarkdownResolvedLinkInfo | null {
  const direct = markdownInlineLinkInfo(node);
  if (direct) {
    return {
      labelFrom: direct.labelFrom,
      labelTo: direct.labelTo,
      target: String(source || "").slice(direct.urlFrom, direct.urlTo).trim(),
      title: "",
      urlFrom: direct.urlFrom,
      urlTo: direct.urlTo,
    };
  }

  if (node.name !== "Link" && node.name !== "Image") {
    return null;
  }

  const labelNode = node.children.find(function (child) {
    return child.name === "LinkLabel";
  });
  const linkMarks = node.children.filter(function (child) {
    return child.name === "LinkMark";
  });
  if (!labelNode || linkMarks.length < 2 || !referenceDefinitions) {
    return null;
  }

  const openingMark = linkMarks[0];
  const closingLabelMark = linkMarks[linkMarks.length - 1];
  if (closingLabelMark.from < openingMark.to) {
    return null;
  }

  const referenceLabel = markdownLabelText(source, labelNode);
  const definition = referenceDefinitions.get(normalizeMarkdownLinkLabel(referenceLabel));
  if (!definition || !definition.target) {
    return null;
  }

  return {
    labelFrom: openingMark.to,
    labelTo: closingLabelMark.from,
    target: definition.target,
    title: definition.title,
    referenceLabel,
  };
}

function visibleTextFromNode(node: MarkdownInlineNode, source: string, rangeFrom: number, rangeTo: number): string {
  if (rangeTo <= rangeFrom) {
    return "";
  }

  switch (node.name) {
    case "LinkMark":
    case "EmphasisMark":
    case "StrikethroughMark":
    case "CodeMark":
    case "HeaderMark":
    case "QuoteMark":
    case "ListMark":
    case "TaskMarker":
      return "";
    case "Escape":
      return String(source || "").slice(rangeFrom + 1, rangeTo);
    case "Link": {
      const info = markdownInlineLinkInfo(node);
      if (!info) {
        break;
      }
      return visibleTextFromChildren(node, source, info.labelFrom, info.labelTo);
    }
    case "Image": {
      const info = markdownInlineLinkInfo(node);
      if (!info) {
        break;
      }
      return visibleTextFromChildren(node, source, info.labelFrom, info.labelTo);
    }
  }

  if (!node.children.length) {
    return String(source || "").slice(rangeFrom, rangeTo);
  }

  return visibleTextFromChildren(node, source, rangeFrom, rangeTo);
}

export function visibleTextFromChildren(node: MarkdownInlineNode, source: string, rangeFrom: number, rangeTo: number): string {
  if (rangeTo <= rangeFrom) {
    return "";
  }

  let result = "";
  let cursor = rangeFrom;
  for (let index = 0; index < node.children.length; index += 1) {
    const child = node.children[index];
    if (child.to <= rangeFrom || child.from >= rangeTo) {
      continue;
    }
    if (cursor < child.from) {
      result += String(source || "").slice(cursor, Math.min(child.from, rangeTo));
    }
    const childFrom = Math.max(child.from, rangeFrom);
    const childTo = Math.min(child.to, rangeTo);
    result += visibleTextFromNode(child, source, childFrom, childTo);
    cursor = child.to;
  }

  if (cursor < rangeTo) {
    result += String(source || "").slice(cursor, rangeTo);
  }

  return result;
}

export function visibleTextFromInlineRange(source: string, node: MarkdownInlineNode, rangeFrom: number, rangeTo: number): string {
  return visibleTextFromChildren(node, String(source || ""), rangeFrom, rangeTo);
}
