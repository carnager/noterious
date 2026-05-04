import { normalizePageDraftPath, pageTitleFromPath } from "./commands";

export interface PathDialogSuggestion {
  value: string;
  label: string;
  meta?: string;
}

export interface PathDialogAssist {
  normalizedInput: string;
  targetPath: string;
  error: string;
  helper: string;
  helperTone: "neutral" | "warn";
  suggestions: PathDialogSuggestion[];
}

export interface BuildPathDialogAssistOptions {
  kind: "note" | "folder";
  action: "create" | "rename";
  input: string;
  sourcePath?: string;
  baseFolder?: string;
  scopePrefix?: string;
  pages: string[];
  folders: string[];
}

function normalizePath(path: string): string {
  return normalizePageDraftPath(path || "");
}

function pathSet(paths: string[]): Set<string> {
  return new Set((Array.isArray(paths) ? paths : []).map(function (path) {
    return normalizePath(path).toLowerCase();
  }).filter(Boolean));
}

function joinPath(parent: string, child: string): string {
  const normalizedParent = normalizePath(parent);
  const normalizedChild = normalizePath(child);
  if (!normalizedParent) {
    return normalizedChild;
  }
  if (!normalizedChild) {
    return normalizedParent;
  }
  return normalizedParent + "/" + normalizedChild;
}

function parentFolder(path: string): string {
  const normalized = normalizePath(path);
  const slash = normalized.lastIndexOf("/");
  return slash >= 0 ? normalized.slice(0, slash) : "";
}

function applyScopePrefix(path: string, scopePrefix: string): string {
  const normalizedPath = normalizePath(path);
  const normalizedScope = normalizePath(scopePrefix);
  if (!normalizedPath) {
    return "";
  }
  if (!normalizedScope || normalizedPath === normalizedScope || normalizedPath.startsWith(normalizedScope + "/")) {
    return normalizedPath;
  }
  return normalizedScope + "/" + normalizedPath;
}

function pathWithinScope(path: string, scopePrefix: string): boolean {
  const normalizedPath = normalizePath(path);
  const normalizedScope = normalizePath(scopePrefix);
  if (!normalizedPath) {
    return false;
  }
  if (!normalizedScope) {
    return true;
  }
  return normalizedPath === normalizedScope || normalizedPath.startsWith(normalizedScope + "/");
}

function displayPathWithinScope(path: string, scopePrefix: string): string {
  const normalizedPath = normalizePath(path);
  const normalizedScope = normalizePath(scopePrefix);
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

function samePath(left: string, right: string): boolean {
  return normalizePath(left).toLowerCase() === normalizePath(right).toLowerCase();
}

function folderDepth(path: string): number {
  const normalized = normalizePath(path);
  if (!normalized) {
    return 0;
  }
  return normalized.split("/").length;
}

function sortedUniqueFolders(folders: string[]): string[] {
  return Array.from(new Set((Array.isArray(folders) ? folders : []).map(normalizePath).filter(Boolean))).sort(function (left, right) {
    const depthDelta = folderDepth(left) - folderDepth(right);
    if (depthDelta !== 0) {
      return depthDelta;
    }
    return left.localeCompare(right);
  });
}

function filterFoldersForScope(folders: string[], scopePrefix: string): string[] {
  return sortedUniqueFolders(folders).filter(function (folder) {
    return pathWithinScope(folder, scopePrefix);
  });
}

function buildCreateSuggestions(baseFolder: string, scopePrefix: string, folders: string[]): PathDialogSuggestion[] {
  const canonicalBase = applyScopePrefix(baseFolder, scopePrefix);
  return filterFoldersForScope(folders, scopePrefix).filter(function (folder) {
    if (canonicalBase) {
      return folder.startsWith(canonicalBase + "/");
    }
    return true;
  }).map(function (folder) {
    const relative = canonicalBase ? folder.slice(canonicalBase.length + 1) : displayPathWithinScope(folder, scopePrefix);
    return {
      value: relative ? (relative + "/") : "",
      label: relative ? (relative + "/") : "",
      meta: canonicalBase ? folder : "",
    };
  }).filter(function (suggestion) {
    return Boolean(suggestion.value);
  });
}

function buildRenameSuggestions(
  kind: "note" | "folder",
  sourcePath: string,
  scopePrefix: string,
  folders: string[],
): PathDialogSuggestion[] {
  const sourceLeaf = pageTitleFromPath(sourcePath);
  const normalizedScope = normalizePath(scopePrefix);
  const scopedFolders = filterFoldersForScope(folders, scopePrefix);
  const rootCandidate = normalizedScope || "";
  const candidates = [rootCandidate].concat(scopedFolders).filter(function (folder, index, list) {
    if (kind === "folder") {
      const normalizedFolder = normalizePath(folder);
      const normalizedSource = normalizePath(sourcePath);
      if (normalizedFolder && (samePath(normalizedFolder, normalizedSource) || normalizedFolder.startsWith(normalizedSource + "/"))) {
        return false;
      }
    }
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
        ? (folder ? (folder === normalizedScope ? "Scope root" : "Within current scope") : "Vault root")
        : (folder ? folder : "Vault root"),
    };
  }).filter(function (suggestion) {
    return !samePath(suggestion.value, sourcePath);
  });
}

function filterSuggestions(input: string, suggestions: PathDialogSuggestion[]): PathDialogSuggestion[] {
  const query = normalizePath(input).toLowerCase();
  const source = Array.isArray(suggestions) ? suggestions : [];
  const filtered = source.filter(function (suggestion) {
    if (!query) {
      return true;
    }
    return suggestion.value.toLowerCase().indexOf(query) >= 0 || suggestion.label.toLowerCase().indexOf(query) >= 0;
  });
  if (filtered.length === 0 && query.indexOf("/") >= 0) {
    const folderPrefix = query.slice(0, query.lastIndexOf("/") + 1);
    return source.filter(function (suggestion) {
      return suggestion.value.toLowerCase().indexOf(folderPrefix) >= 0 || suggestion.label.toLowerCase().indexOf(folderPrefix) >= 0;
    }).slice(0, 6);
  }
  return filtered.slice(0, 6);
}

export function buildPathDialogAssist(options: BuildPathDialogAssistOptions): PathDialogAssist {
  const kind = options.kind;
  const action = options.action;
  const normalizedInput = normalizePath(options.input);
  const normalizedScope = normalizePath(options.scopePrefix || "");
  const normalizedSource = normalizePath(options.sourcePath || "");
  const normalizedBaseFolder = normalizePath(options.baseFolder || "");
  const pages = pathSet(options.pages);
  const folderList = sortedUniqueFolders(options.folders);
  const folders = pathSet(folderList);

  const emptyError = kind === "note" ? "Enter a note name." : "Enter a folder name.";

  let targetPath = "";
  if (normalizedInput) {
    if (action === "create") {
      targetPath = applyScopePrefix(joinPath(normalizedBaseFolder, normalizedInput), normalizedScope);
    } else if (normalizedInput.indexOf("/") >= 0) {
      targetPath = normalizedInput;
    } else {
      targetPath = joinPath(parentFolder(normalizedSource), normalizedInput);
    }
  }

  let error = "";
  if (!normalizedInput) {
    error = emptyError;
  } else if (action === "rename" && normalizedSource && samePath(targetPath, normalizedSource)) {
    error = "No change yet.";
  } else if (kind === "folder" && action === "rename" && normalizedSource && targetPath.startsWith(normalizedSource + "/")) {
    error = "A folder cannot be moved into itself.";
  } else if (pages.has(targetPath.toLowerCase()) && !(action === "rename" && kind === "note" && samePath(targetPath, normalizedSource))) {
    error = 'A note already exists at "' + targetPath + '".';
  } else if (folders.has(targetPath.toLowerCase()) && !(action === "rename" && kind === "folder" && samePath(targetPath, normalizedSource))) {
    error = 'A folder already exists at "' + targetPath + '".';
  }

  let helper = "";
  let helperTone: "neutral" | "warn" = "neutral";
  if (!error && targetPath) {
    const movingToNewParent = action === "rename" && parentFolder(targetPath) !== parentFolder(normalizedSource);
    if (action === "create") {
      helper = "Will create " + kind + ' at "' + targetPath + '".';
    } else {
      helper = movingToNewParent
        ? ("Will move " + kind + ' to "' + targetPath + '".')
        : ("Will rename " + kind + ' to "' + targetPath + '".');
      if (normalizedScope && targetPath.indexOf("/") >= 0 && !pathWithinScope(targetPath, normalizedScope)) {
        helper += " This will move it out of the current scope.";
        helperTone = "warn";
      }
    }
  }

  const suggestionPool = action === "create"
    ? buildCreateSuggestions(normalizedBaseFolder, normalizedScope, folderList)
    : buildRenameSuggestions(kind, normalizedSource, normalizedScope, folderList);

  return {
    normalizedInput: normalizedInput,
    targetPath: targetPath,
    error: error,
    helper: helper,
    helperTone: helperTone,
    suggestions: filterSuggestions(normalizedInput, suggestionPool),
  };
}
