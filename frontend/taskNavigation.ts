const taskInlineDatePattern = /\[(due|remind):\s*[^\]]+?\]|\b(due|remind)::\s*[^\s]+(?:\s+\d{2}:\d{2})?/g;

function taskLineMatch(text: string): RegExpMatchArray | null {
  return String(text || "").match(/^(\s*)-\s+\[[ xX]\]\s+/);
}

export function taskPrefixLength(text: string): number {
  const match = taskLineMatch(text);
  return match ? match[0].length : 0;
}

export function taskLineHasInlineDate(text: string): boolean {
  const match = taskLineMatch(text);
  if (!match) {
    return false;
  }
  const body = String(text || "").slice(match[0].length);
  const pattern = new RegExp(taskInlineDatePattern.source, taskInlineDatePattern.flags);
  return pattern.test(body);
}

export function renderedTaskVisibleColumn(text: string, rawColumn: number): number {
  return Math.max(0, Number(rawColumn) || 0) - taskPrefixLength(text);
}

export function renderedTaskRawColumn(text: string, visibleColumn: number): number {
  return Math.max(0, Number(visibleColumn) || 0) + taskPrefixLength(text);
}
