import { renderPaletteSections, type PaletteItem, type PaletteSection } from "./palette";
import type { DocumentRecord, ServerDocumentSettings } from "./types";

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

function decodeMarkdownPathSegments(value: string): string {
  const source = String(value || "");
  if (!source.includes("%")) {
    return source;
  }
  return source
    .split("/")
    .map(function (segment) {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    })
    .join("/");
}

function unwrapMarkdownLinkTarget(value: string): string {
  const text = String(value || "").trim();
  if (text.startsWith("<") && text.endsWith(">") && text.length >= 2) {
    return text.slice(1, -1).trim();
  }
  return text;
}

function normalizedMarkdownLinkTarget(value: string): string {
  const unwrapped = unwrapMarkdownLinkTarget(String(value || "").trim());
  const withoutSuffix = unwrapped.replace(/[?#].*$/, "");
  return decodeMarkdownPathSegments(unwrapMarkdownLinkTarget(withoutSuffix));
}

function markdownLinkTarget(value: string, suffix = ""): string {
  const target = String(value || "").trim();
  const extra = String(suffix || "");
  if (!target) {
    return "";
  }
  const combined = target + extra;
  if (/[()\s]/.test(target)) {
    return "<" + combined.replace(/</g, "%3C").replace(/>/g, "%3E") + ">";
  }
  return combined;
}

function stripPathSuffixes(value: string): string {
  return normalizePath(normalizedMarkdownLinkTarget(value));
}

function pathDirectory(path: string): string {
  const normalized = normalizePath(path);
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length <= 1) {
    return "";
  }
  return parts.slice(0, -1).join("/");
}

function pageDirectory(pagePath: string): string {
  return pathDirectory(normalizePath(pagePath).replace(/\.md$/i, ""));
}

function normalizedDocumentSettings(settings?: Partial<ServerDocumentSettings> | null): ServerDocumentSettings {
  const placement = String(settings && settings.uploadPlacement || "").trim();
  const subfolder = normalizePath(String(settings && settings.uploadSubfolder || "")).replace(/^\/+|\/+$/g, "");
  const folder = normalizePath(String(settings && settings.uploadFolder || "")).replace(/^\/+|\/+$/g, "");
  return {
    uploadPlacement: placement === "vault-root" || placement === "note-subfolder" || placement === "specific-folder"
      ? placement
      : "same-folder",
    uploadSubfolder: subfolder || "_files",
    uploadFolder: folder,
  };
}

export function documentUploadDirectory(currentPagePath: string, settings?: Partial<ServerDocumentSettings> | null): string {
  const pageDir = pageDirectory(currentPagePath);
  const documentSettings = normalizedDocumentSettings(settings);
  if (documentSettings.uploadPlacement === "vault-root") {
    return "";
  }
  if (documentSettings.uploadPlacement === "note-subfolder") {
    return pageDir ? (pageDir + "/" + documentSettings.uploadSubfolder) : documentSettings.uploadSubfolder;
  }
  if (documentSettings.uploadPlacement === "specific-folder") {
    return documentSettings.uploadFolder;
  }
  return pageDir;
}

export function documentUploadTargetLabel(currentPagePath: string, settings?: Partial<ServerDocumentSettings> | null): string {
  const directory = documentUploadDirectory(currentPagePath, settings);
  return directory ? (directory + "/") : "vault root";
}

export function documentUploadHint(
  currentPagePath: string,
  noteOpen: boolean,
  settings?: Partial<ServerDocumentSettings> | null
): string {
  if (!noteOpen) {
    return "Open a note to upload new files into the configured attachment location. Without a note, selecting a document opens the file instead of inserting a link.";
  }
  const documentSettings = normalizedDocumentSettings(settings);
  const directory = documentUploadDirectory(currentPagePath, documentSettings);
  if (documentSettings.uploadPlacement === "vault-root") {
    return "New uploads for this note go to the vault root.";
  }
  if (documentSettings.uploadPlacement === "note-subfolder") {
    return "New uploads for this note go to the configured subfolder: " + directory + "/.";
  }
  if (documentSettings.uploadPlacement === "specific-folder") {
    return directory
      ? ("New uploads for this note go to the chosen folder: " + directory + "/.")
      : "New uploads for this note go to the chosen folder once you configure one.";
  }
  return directory
    ? ("New uploads for this note go to the same folder: " + directory + "/.")
    : "New uploads for this note go to the vault root.";
}

export function documentUploadFolderSuggestions(
  folders: string[],
  documents: DocumentRecord[],
  currentValue = ""
): string[] {
  const suggestions = new Set<string>();

  folders.forEach(function (folder) {
    const normalized = normalizePath(folder).replace(/^\/+|\/+$/g, "");
    if (normalized) {
      suggestions.add(normalized);
    }
  });

  documents.forEach(function (document) {
    const directory = pathDirectory(document.path).replace(/^\/+|\/+$/g, "");
    if (directory) {
      suggestions.add(directory);
    }
  });

  const current = normalizePath(currentValue).replace(/^\/+|\/+$/g, "");
  if (current) {
    suggestions.add(current);
  }

  return Array.from(suggestions).sort(function (left, right) {
    return left.localeCompare(right, undefined, {
      numeric: true,
      sensitivity: "base",
    });
  });
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
  const target = normalizePath(normalizedMarkdownLinkTarget(linkTarget));
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

export function rewriteDocumentLinksInMarkdown(
  rawMarkdown: string,
  currentPagePath: string,
  fromDocumentPath: string,
  toDocumentPath: string,
): { markdown: string; changed: boolean } {
  const sourcePage = normalizePath(currentPagePath).replace(/\.md$/i, "");
  const fromNormalized = normalizePath(fromDocumentPath);
  const toNormalized = normalizePath(toDocumentPath);
  if (!sourcePage || !fromNormalized || !toNormalized || fromNormalized === toNormalized) {
    return { markdown: String(rawMarkdown || ""), changed: false };
  }

  let changed = false;
  let rewritten = String(rawMarkdown || "").replace(/(!?)\[\[([^\]|#]+)(#[^\]|]+)?(\|[^\]]+)?\]\]/g, function (match, bang: string, target: string, anchor: string, label: string) {
    const resolved = resolveDocumentPath(sourcePage, String(target || ""));
    if (!resolved || resolved !== fromNormalized) {
      return match;
    }
    changed = true;
    const nextTarget = relativeDocumentPath(sourcePage, toNormalized);
    return String(bang || "") + "[[" + nextTarget + String(anchor || "") + String(label || "") + "]]";
  });

  rewritten = rewritten.replace(/(!?)\[([^\]]*)\]\(([^)#]+?)(#[^)]+)?\)/g, function (match, bang: string, label: string, target: string, anchor: string) {
    const resolved = resolveDocumentPath(sourcePage, String(target || ""));
    if (!resolved || resolved !== fromNormalized) {
      return match;
    }
    changed = true;
    const nextTarget = markdownLinkTarget(relativeDocumentPath(sourcePage, toNormalized), String(anchor || ""));
    return String(bang || "") + "[" + String(label || "") + "](" + nextTarget + ")";
  });

  return {
    markdown: rewritten,
    changed: changed,
  };
}

function pathLeaf(path: string): string {
  const parts = normalizePath(path).split("/");
  return parts[parts.length - 1] || path;
}

export function documentPathLeaf(path: string): string {
  return pathLeaf(path);
}

export function documentDownloadURL(path: string): string {
  return "/api/documents/download?path=" + encodeURIComponent(normalizePath(path));
}

export function inlineDocumentURL(path: string): string {
  return documentDownloadURL(path) + "&inline=1";
}

export function isImagePath(path: string): boolean {
  return /\.(avif|bmp|gif|ico|jpe?g|png|svg|webp)$/i.test(stripPathSuffixes(path));
}

export function isImageContentType(contentType: string): boolean {
  return /^image\//i.test(String(contentType || "").trim());
}

export function documentEmbedsInline(document: Pick<DocumentRecord, "contentType" | "name" | "path">): boolean {
  return isImageContentType(document.contentType) || isImagePath(document.path || document.name);
}

export function markdownLinkForDocument(document: DocumentRecord, currentPagePath: string): string {
  const label = String(document.name || "").replace(/]/g, "\\]");
  const target = markdownLinkTarget(relativeDocumentPath(currentPagePath, document.path));
  if (documentEmbedsInline(document)) {
    return "![" + label + "](" + target + ")";
  }
  return "[" + label + "](" + target + ")";
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

function usageMeta(document: DocumentRecord): string {
  if (!document.usageKnown) {
    return "";
  }
  const count = Number(document.referenceCount || 0);
  return count > 0
    ? ("Used in " + String(count) + " note" + (count === 1 ? "" : "s"))
    : "Unused";
}

function documentMeta(document: DocumentRecord): string {
  return [
    document.path,
    document.contentType,
    document.size ? (Math.round(document.size / 102.4) / 10) + " KB" : "",
    usageMeta(document),
  ].filter(Boolean).join(" · ");
}

function paletteItemForDocument(document: DocumentRecord, onSelectDocument: (document: DocumentRecord) => void): PaletteItem {
  return {
    title: document.name,
    meta: documentMeta(document),
    onSelect: function () {
      onSelectDocument(document);
    },
  };
}

export function buildDocumentSections(options: Omit<RenderDocumentsOptions, "container">): PaletteSection[] {
  const query = String(options.inputValue || "").trim();
  const filtered = options.documents
    .filter(function (document) {
      return matchesDocument(document, query);
    })
    .sort(function (left, right) {
      return scoreDocument(right, query) - scoreDocument(left, query);
    });

  if (query) {
    return [{
      title: "Matching Documents",
      items: filtered.slice(0, 30).map(function (document) {
        return paletteItemForDocument(document, options.onSelectDocument);
      }),
    }];
  }

  const unused = filtered.filter(function (document) {
    return document.usageKnown && Number(document.referenceCount || 0) === 0;
  });
  const recentUsed = filtered.filter(function (document) {
    return !document.usageKnown || Number(document.referenceCount || 0) > 0;
  });

  const sections: PaletteSection[] = [];
  if (unused.length) {
    sections.push({
      title: "Unused Uploads",
      items: unused.slice(0, 12).map(function (document) {
        return paletteItemForDocument(document, options.onSelectDocument);
      }),
    });
  }
  if (recentUsed.length || !sections.length) {
    sections.push({
      title: "Recent Documents",
      items: recentUsed.slice(0, 20).map(function (document) {
        return paletteItemForDocument(document, options.onSelectDocument);
      }),
    });
  }
  return sections;
}

export function renderDocumentsResults(options: RenderDocumentsOptions): number {
  return renderPaletteSections(options.container, buildDocumentSections(options), "No matching documents.");
}
