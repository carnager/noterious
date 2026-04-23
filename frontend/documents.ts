import { renderPaletteSections, type PaletteItem, type PaletteSection } from "./palette";
import type { DocumentRecord } from "./types";

export interface RenderDocumentsOptions {
  container: HTMLElement;
  inputValue: string;
  documents: DocumentRecord[];
  onSelectDocument(document: DocumentRecord): void;
}

function normalizePath(value: string): string {
  return String(value || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+/g, "/")
    .trim();
}

function pageDirectory(pagePath: string): string {
  const normalized = normalizePath(pagePath).replace(/\.md$/i, "");
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length <= 1) {
    return "";
  }
  return parts.slice(0, -1).join("/");
}

export function relativeDocumentPath(currentPagePath: string, documentPath: string): string {
  const fromDir = pageDirectory(currentPagePath);
  const toPath = normalizePath(documentPath);
  const fromParts = fromDir ? fromDir.split("/").filter(Boolean) : [];
  const toParts = toPath.split("/").filter(Boolean);

  let common = 0;
  while (common < fromParts.length && common < toParts.length && fromParts[common] === toParts[common]) {
    common += 1;
  }

  const upwards = new Array(fromParts.length - common).fill("..");
  const downwards = toParts.slice(common);
  const relative = upwards.concat(downwards).join("/");
  return relative || pathLeaf(toPath);
}

export function resolveDocumentPath(currentPagePath: string, linkTarget: string): string {
  const target = normalizePath(linkTarget);
  if (!target || /^[a-z]+:/i.test(target) || target.startsWith("#")) {
    return target;
  }
  const baseDir = pageDirectory(currentPagePath);
  const rawParts = (baseDir ? baseDir + "/" : "") + target;
  const resolved: string[] = [];
  rawParts.split("/").forEach(function (part) {
    if (!part || part === ".") {
      return;
    }
    if (part === "..") {
      resolved.pop();
      return;
    }
    resolved.push(part);
  });
  return resolved.join("/");
}

function pathLeaf(path: string): string {
  const parts = normalizePath(path).split("/");
  return parts[parts.length - 1] || path;
}

export function markdownLinkForDocument(document: DocumentRecord, currentPagePath: string): string {
  const label = String(document.name || "").replace(/]/g, "\\]");
  return "[" + label + "](" + relativeDocumentPath(currentPagePath, document.path) + ")";
}

function matchesDocument(document: DocumentRecord, query: string): boolean {
  const target = String(query || "").trim().toLowerCase();
  if (!target) {
    return true;
  }
  const haystack = [document.name, document.contentType].join(" ").toLowerCase();
  return haystack.indexOf(target) >= 0;
}

function scoreDocument(document: DocumentRecord, query: string): number {
  const target = String(query || "").trim().toLowerCase();
  const name = String(document.name || "").toLowerCase();
  if (!target) {
    return document.createdAt ? Date.parse(document.createdAt) || 0 : 0;
  }
  return (
    (name === target ? 4000 : 0) +
    (name.startsWith(target) ? 2800 : 0) +
    (name.indexOf(target) >= 0 ? 1200 : 0) +
    (document.createdAt ? (Date.parse(document.createdAt) || 0) / 1000000000000 : 0)
  );
}

export function buildDocumentSections(options: Omit<RenderDocumentsOptions, "container">): PaletteSection[] {
  const query = String(options.inputValue || "").trim();
  const items = options.documents
    .filter(function (document) {
      return matchesDocument(document, query);
    })
    .sort(function (left, right) {
      return scoreDocument(right, query) - scoreDocument(left, query);
    })
    .slice(0, query ? 30 : 20)
    .map(function (document): PaletteItem {
      return {
        title: document.name,
        meta: [document.path, document.contentType, document.size ? (Math.round(document.size / 102.4) / 10) + " KB" : ""].filter(Boolean).join(" · "),
        onSelect: function () {
          options.onSelectDocument(document);
        },
      };
    });

  return [{
    title: query ? "Matching Documents" : "Recent Documents",
    items,
  }];
}

export function renderDocumentsResults(options: RenderDocumentsOptions): number {
  return renderPaletteSections(options.container, buildDocumentSections(options), "No matching documents.");
}
