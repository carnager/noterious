import type { PathDialogSuggestion } from "./pathAssist";

export interface DocumentPathDialogAssist {
  normalizedInput: string;
  targetPath: string;
  error: string;
  helper: string;
  helperTone: "neutral" | "warn";
  suggestions: PathDialogSuggestion[];
}

export interface BuildDocumentPathDialogAssistOptions {
  input: string;
  sourcePath: string;
  scopePrefix?: string;
  documents: string[];
  folders: string[];
}

function collapseDashes(value: string): string {
  let result = "";
  let lastDash = false;
  for (const character of value) {
    if (character === "-") {
      if (lastDash) {
        continue;
      }
      lastDash = true;
      result += character;
      continue;
    }
    lastDash = false;
    result += character;
  }
  return result;
}

function sanitizeDocumentName(value: string): string {
  const trimmed = String(value || "").trim().replace(/\x00/g, "");
  if (!trimmed || trimmed === ".") {
    return "";
  }
  const lastDot = trimmed.lastIndexOf(".");
  const extension = lastDot > 0 ? trimmed.slice(lastDot + 1) : "";
  const base = lastDot > 0 ? trimmed.slice(0, lastDot) : trimmed;
  let normalizedBase = "";
  for (const character of base) {
    if (/[\p{L}\p{N}]/u.test(character)) {
      normalizedBase += character.toLowerCase();
    } else if (character === "." || character === "_" || character === "-") {
      normalizedBase += character;
    } else if (/\s/u.test(character)) {
      normalizedBase += "-";
    } else {
      normalizedBase += "-";
    }
  }
  normalizedBase = collapseDashes(normalizedBase).replace(/^[.\-_]+|[.\-_]+$/g, "");
  if (!normalizedBase) {
    normalizedBase = "document";
  }

  const normalizedExtension = extension
    .split("")
    .filter(function (character) {
      return /[A-Za-z0-9]/.test(character);
    })
    .join("")
    .toLowerCase();
  return normalizedExtension ? (normalizedBase + "." + normalizedExtension) : normalizedBase;
}

function normalizeFolderPath(value: string): string {
  const segments = String(value || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+/g, "/")
    .split("/")
    .map(function (segment) {
      return segment.trim();
    })
    .filter(Boolean);
  if (!segments.length || segments.some(function (segment) { return segment === "." || segment === ".."; })) {
    return "";
  }
  return segments.join("/");
}

function joinPath(parent: string, child: string): string {
  const normalizedParent = normalizeFolderPath(parent);
  const normalizedChild = normalizeFolderPath(child);
  if (!normalizedParent) {
    return normalizedChild;
  }
  if (!normalizedChild) {
    return normalizedParent;
  }
  return normalizedParent + "/" + normalizedChild;
}

function pathLeaf(value: string): string {
  const normalized = normalizeFolderPath(value);
  const slash = normalized.lastIndexOf("/");
  return slash >= 0 ? normalized.slice(slash + 1) : normalized;
}

function parentFolder(value: string): string {
  const normalized = normalizeFolderPath(value);
  const slash = normalized.lastIndexOf("/");
  return slash >= 0 ? normalized.slice(0, slash) : "";
}

function pathExtension(value: string): string {
  const leaf = pathLeaf(value);
  const dot = leaf.lastIndexOf(".");
  return dot > 0 ? leaf.slice(dot) : "";
}

function normalizeDocumentDraftPath(value: string, sourcePath?: string): string {
  const rawSegments = String(value || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+/g, "/")
    .split("/")
    .map(function (segment) {
      return segment.trim();
    })
    .filter(Boolean);
  if (!rawSegments.length || rawSegments.some(function (segment) { return segment === "." || segment === ".."; })) {
    return "";
  }
  const segments = rawSegments.slice(0, -1);
  let leaf = rawSegments[rawSegments.length - 1] || "";
  if (leaf.indexOf(".") < 0) {
    const extension = pathExtension(sourcePath || "");
    if (extension) {
      leaf += extension;
    }
  }
  leaf = sanitizeDocumentName(leaf);
  if (!leaf) {
    return "";
  }
  return segments.concat(leaf).join("/");
}

function samePath(left: string, right: string): boolean {
  return normalizeFolderPath(left).toLowerCase() === normalizeFolderPath(right).toLowerCase();
}

function pathWithinScope(path: string, scopePrefix: string): boolean {
  const normalizedPath = normalizeFolderPath(path);
  const normalizedScope = normalizeFolderPath(scopePrefix);
  if (!normalizedPath) {
    return false;
  }
  if (!normalizedScope) {
    return true;
  }
  return normalizedPath === normalizedScope || normalizedPath.startsWith(normalizedScope + "/");
}

function displayPathWithinScope(path: string, scopePrefix: string): string {
  const normalizedPath = normalizeFolderPath(path);
  const normalizedScope = normalizeFolderPath(scopePrefix);
  if (!normalizedPath || !normalizedScope) {
    return normalizedPath;
  }
  if (normalizedPath === normalizedScope) {
    return "";
  }
  if (normalizedPath.startsWith(normalizedScope + "/")) {
    return normalizedPath.slice(normalizedScope.length + 1);
  }
  return normalizedPath;
}

function sortedUniqueFolders(folders: string[]): string[] {
  return Array.from(new Set((Array.isArray(folders) ? folders : []).map(normalizeFolderPath).filter(Boolean))).sort();
}

function filterFoldersForScope(folders: string[], scopePrefix: string): string[] {
  return sortedUniqueFolders(folders).filter(function (folder) {
    return pathWithinScope(folder, scopePrefix);
  });
}

function filterSuggestions(input: string, suggestions: PathDialogSuggestion[]): PathDialogSuggestion[] {
  const query = normalizeFolderPath(input).toLowerCase();
  const source = Array.isArray(suggestions) ? suggestions : [];
  const filtered = source.filter(function (suggestion) {
    if (!query) {
      return true;
    }
    return suggestion.value.toLowerCase().indexOf(query) >= 0 || suggestion.label.toLowerCase().indexOf(query) >= 0;
  });
  if (!filtered.length && query.indexOf("/") >= 0) {
    const folderPrefix = query.slice(0, query.lastIndexOf("/") + 1);
    return source.filter(function (suggestion) {
      return suggestion.value.toLowerCase().indexOf(folderPrefix) >= 0 || suggestion.label.toLowerCase().indexOf(folderPrefix) >= 0;
    }).slice(0, 6);
  }
  return filtered.slice(0, 6);
}

function buildRenameSuggestions(sourcePath: string, scopePrefix: string, folders: string[]): PathDialogSuggestion[] {
  const sourceLeaf = pathLeaf(sourcePath);
  const normalizedScope = normalizeFolderPath(scopePrefix);
  const scopedFolders = filterFoldersForScope(folders, scopePrefix);
  const rootCandidate = normalizedScope || "";
  const candidates = [rootCandidate].concat(scopedFolders).filter(function (folder, index, list) {
    return list.findIndex(function (candidate) {
      return samePath(candidate, folder);
    }) === index;
  });

  return candidates.map(function (folder) {
    const value = folder ? (folder + "/" + sourceLeaf) : sourceLeaf;
    const labelPrefix = normalizedScope ? displayPathWithinScope(folder, normalizedScope) : folder;
    return {
      value: value,
      label: labelPrefix ? (labelPrefix + "/" + sourceLeaf) : sourceLeaf,
      meta: normalizedScope
        ? (folder === normalizedScope ? "Scope root" : "Within current scope")
        : (folder ? folder : "Vault root"),
    };
  }).filter(function (suggestion) {
    return !samePath(suggestion.value, sourcePath);
  });
}

function pathSet(paths: string[]): Set<string> {
  return new Set((Array.isArray(paths) ? paths : []).map(function (value) {
    return normalizeFolderPath(value).toLowerCase();
  }).filter(Boolean));
}

export function buildDocumentPathDialogAssist(options: BuildDocumentPathDialogAssistOptions): DocumentPathDialogAssist {
  const normalizedSource = normalizeDocumentDraftPath(options.sourcePath || "");
  const normalizedScope = normalizeFolderPath(options.scopePrefix || "");
  const normalizedInput = normalizeDocumentDraftPath(options.input || "", normalizedSource);
  const documents = pathSet(options.documents);
  const folders = pathSet(options.folders);

  let targetPath = "";
  if (normalizedInput) {
    targetPath = normalizedInput.indexOf("/") >= 0
      ? normalizedInput
      : joinPath(parentFolder(normalizedSource), normalizedInput);
  }

  let error = "";
  if (!normalizedInput) {
    error = "Enter a file name.";
  } else if (samePath(targetPath, normalizedSource)) {
    error = "No change yet.";
  } else if (documents.has(targetPath.toLowerCase())) {
    error = 'A file already exists at "' + targetPath + '".';
  } else if (folders.has(targetPath.toLowerCase())) {
    error = 'A folder already exists at "' + targetPath + '".';
  }

  let helper = "";
  let helperTone: "neutral" | "warn" = "neutral";
  if (!error && targetPath) {
    const movingToNewParent = parentFolder(targetPath) !== parentFolder(normalizedSource);
    helper = movingToNewParent
      ? ('Will move file to "' + targetPath + '".')
      : ('Will rename file to "' + targetPath + '".');
    if (normalizedScope && !pathWithinScope(targetPath, normalizedScope)) {
      helper += " This will move it out of the current scope.";
      helperTone = "warn";
    }
  }

  return {
    normalizedInput: normalizedInput,
    targetPath: targetPath,
    error: error,
    helper: helper,
    helperTone: helperTone,
    suggestions: filterSuggestions(normalizedInput, buildRenameSuggestions(normalizedSource, normalizedScope, options.folders)),
  };
}
