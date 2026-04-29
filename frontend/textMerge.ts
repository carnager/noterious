export class TextMergeConflictError extends Error {
  constructor(message = "automatic merge found overlapping edits") {
    super(message);
    this.name = "TextMergeConflictError";
  }
}

interface Edit {
  baseStart: number;
  baseEnd: number;
  newLines: string[];
}

export function mergeText(base: string, local: string, remote: string): string {
  if (local === remote) {
    return local;
  }
  if (remote === base) {
    return local;
  }
  if (local === base) {
    return remote;
  }

  const baseLines = splitLines(base);
  const localEdits = diffEdits(baseLines, splitLines(local));
  const remoteEdits = diffEdits(baseLines, splitLines(remote));

  if (!localEdits.length) {
    return remote;
  }
  if (!remoteEdits.length) {
    return local;
  }

  return joinLines(mergeEdits(baseLines, localEdits, remoteEdits));
}

function splitLines(text: string): string[] {
  const lines: string[] = [];
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== "\n") {
      continue;
    }
    lines.push(text.slice(start, index));
    start = index + 1;
  }
  lines.push(text.slice(start));
  return lines;
}

function joinLines(lines: string[]): string {
  if (!lines.length) {
    return "";
  }
  return lines.join("\n");
}

function diffEdits(base: string[], variant: string[]): Edit[] {
  const n = base.length;
  const m = variant.length;
  const lcs = Array.from({ length: n + 1 }, function () {
    return Array.from({ length: m + 1 }, function () {
      return 0;
    });
  });

  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      if (base[i] === variant[j]) {
        lcs[i][j] = lcs[i + 1][j + 1] + 1;
        continue;
      }
      lcs[i][j] = Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const edits: Edit[] = [];
  let i = 0;
  let j = 0;
  let active = false;
  let start = 0;
  let replacement: string[] = [];

  const flush = function (baseEnd: number): void {
    if (!active) {
      return;
    }
    edits.push({
      baseStart: start,
      baseEnd,
      newLines: replacement.slice(),
    });
    active = false;
    replacement = [];
  };

  while (i < n || j < m) {
    if (i < n && j < m && base[i] === variant[j]) {
      flush(i);
      i += 1;
      j += 1;
      continue;
    }
    if (!active) {
      active = true;
      start = i;
    }
    if (j < m && (i === n || lcs[i][j + 1] >= lcs[i + 1][j])) {
      replacement.push(variant[j]);
      j += 1;
      continue;
    }
    if (i < n) {
      i += 1;
    }
  }
  flush(i);

  return edits;
}

function mergeEdits(base: string[], localEdits: Edit[], remoteEdits: Edit[]): string[] {
  const merged: string[] = [];
  let cursor = 0;
  let localIndex = 0;
  let remoteIndex = 0;

  while (cursor < base.length || localIndex < localEdits.length || remoteIndex < remoteEdits.length) {
    let nextStart = base.length;
    if (localIndex < localEdits.length && localEdits[localIndex].baseStart < nextStart) {
      nextStart = localEdits[localIndex].baseStart;
    }
    if (remoteIndex < remoteEdits.length && remoteEdits[remoteIndex].baseStart < nextStart) {
      nextStart = remoteEdits[remoteIndex].baseStart;
    }

    if (cursor < nextStart) {
      merged.push(...base.slice(cursor, nextStart));
      cursor = nextStart;
    }

    const localEdit = localIndex < localEdits.length && localEdits[localIndex].baseStart === cursor
      ? localEdits[localIndex]
      : null;
    const remoteEdit = remoteIndex < remoteEdits.length && remoteEdits[remoteIndex].baseStart === cursor
      ? remoteEdits[remoteIndex]
      : null;

    if (!localEdit && !remoteEdit) {
      if (cursor < base.length) {
        merged.push(...base.slice(cursor));
        cursor = base.length;
        continue;
      }
      return merged;
    }

    if (localEdit && remoteEdit) {
      if (editsEqual(localEdit, remoteEdit)) {
        merged.push(...localEdit.newLines);
        cursor = Math.max(cursor, Math.max(localEdit.baseEnd, remoteEdit.baseEnd));
        localIndex += 1;
        remoteIndex += 1;
        continue;
      }
      if (localEdit.baseStart === localEdit.baseEnd && remoteEdit.baseStart < remoteEdit.baseEnd) {
        merged.push(...localEdit.newLines, ...remoteEdit.newLines);
        cursor = remoteEdit.baseEnd;
        localIndex += 1;
        remoteIndex += 1;
        continue;
      }
      if (remoteEdit.baseStart === remoteEdit.baseEnd && localEdit.baseStart < localEdit.baseEnd) {
        merged.push(...remoteEdit.newLines, ...localEdit.newLines);
        cursor = localEdit.baseEnd;
        localIndex += 1;
        remoteIndex += 1;
        continue;
      }
      throw new TextMergeConflictError();
    }

    if (localEdit) {
      if (remoteIndex < remoteEdits.length && remoteEdits[remoteIndex].baseStart < localEdit.baseEnd) {
        throw new TextMergeConflictError();
      }
      merged.push(...localEdit.newLines);
      cursor = localEdit.baseEnd;
      localIndex += 1;
      continue;
    }

    if (localIndex < localEdits.length && localEdits[localIndex].baseStart < (remoteEdit as Edit).baseEnd) {
      throw new TextMergeConflictError();
    }
    merged.push(...(remoteEdit as Edit).newLines);
    cursor = (remoteEdit as Edit).baseEnd;
    remoteIndex += 1;
  }

  return merged;
}

function editsEqual(left: Edit, right: Edit): boolean {
  if (left.baseStart !== right.baseStart || left.baseEnd !== right.baseEnd || left.newLines.length !== right.newLines.length) {
    return false;
  }
  for (let index = 0; index < left.newLines.length; index += 1) {
    if (left.newLines[index] !== right.newLines[index]) {
      return false;
    }
  }
  return true;
}
