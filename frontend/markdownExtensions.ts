import { get as getEmojiCharacter } from "node-emoji";

export interface MarkdownFootnoteDefinition {
  label: string;
  displayLabel: string;
  content: string;
  prefixLength?: number;
  from: number;
  to: number;
}

export interface MarkdownAbbreviationDefinition {
  label: string;
  title: string;
  prefixLength?: number;
  from: number;
  to: number;
}

export interface MarkdownFootnoteReferenceMatch {
  label: string;
  displayLabel: string;
}

export interface MarkdownPrefixMatch {
  prefixLength: number;
  indentLength: number;
}

export interface MarkdownAbbreviationUsageSpan {
  from: number;
  to: number;
  label: string;
  title: string;
}

function escapePattern(value: string): string {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeMarkdownFootnoteLabel(label: string): string {
  return String(label || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function isAbbreviationBoundary(text: string, index: number): boolean {
  if (index < 0 || index >= text.length) {
    return true;
  }
  return !/[A-Za-z0-9]/.test(text[index]);
}

export function isMarkdownFootnoteLabel(label: string): boolean {
  return /^\^/.test(String(label || "").trim());
}

export function markdownFootnoteDisplayLabel(label: string): string {
  return String(label || "").trim().replace(/^\^/, "");
}

export function markdownFootnoteDefinitionMatch(text: string, startOffset = 0): MarkdownFootnoteDefinition | null {
  const source = String(text || "").slice(Math.max(0, Number(startOffset) || 0));
  const match = source.match(/^\[\^([^\]\n]+)\]:(\s*)(.*)$/);
  if (!match) {
    return null;
  }

  const label = String(match[1] || "").trim();
  const prefixLength = String(match[0] || "").length - String(match[3] || "").length;
  return {
    label,
    displayLabel: markdownFootnoteDisplayLabel(label),
    content: String(match[3] || ""),
    prefixLength,
    from: startOffset,
    to: startOffset + prefixLength,
  };
}

export function markdownFootnoteDefinitions(source: string): Map<string, MarkdownFootnoteDefinition> {
  const text = String(source || "").replace(/\r\n/g, "\n");
  const definitions = new Map<string, MarkdownFootnoteDefinition>();
  const lines = text.split("\n");
  let offset = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = String(lines[index] || "");
    const match = markdownFootnoteDefinitionMatch(line);
    if (match) {
      const normalized = normalizeMarkdownFootnoteLabel(match.label);
      if (normalized) {
        definitions.set(normalized, {
          label: match.label,
          displayLabel: match.displayLabel,
          content: match.content,
          prefixLength: match.prefixLength,
          from: offset,
          to: offset + line.length,
        });
      }
    }
    offset += line.length + 1;
  }

  return definitions;
}

export function markdownFootnoteReferenceMatch(text: string): MarkdownFootnoteReferenceMatch | null {
  const match = String(text || "").match(/^\[\^([^\]\n]+)\]$/);
  if (!match) {
    return null;
  }

  const label = String(match[1] || "").trim();
  return {
    label,
    displayLabel: markdownFootnoteDisplayLabel(label),
  };
}

export function markdownAbbreviationDefinitionMatch(text: string, startOffset = 0): MarkdownAbbreviationDefinition | null {
  const source = String(text || "").slice(Math.max(0, Number(startOffset) || 0));
  const match = source.match(/^\*\[([^\]\n]+)\]:(\s*)(.*)$/);
  if (!match) {
    return null;
  }

  const prefixLength = String(match[0] || "").length - String(match[3] || "").length;
  return {
    label: String(match[1] || "").trim(),
    title: String(match[3] || ""),
    prefixLength,
    from: startOffset,
    to: startOffset + prefixLength,
  };
}

export function markdownAbbreviationDefinitions(source: string): Map<string, MarkdownAbbreviationDefinition> {
  const text = String(source || "").replace(/\r\n/g, "\n");
  const definitions = new Map<string, MarkdownAbbreviationDefinition>();
  const lines = text.split("\n");
  let offset = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = String(lines[index] || "");
    const match = markdownAbbreviationDefinitionMatch(line);
    if (match && match.label) {
      definitions.set(match.label, {
        label: match.label,
        title: match.title,
        prefixLength: match.prefixLength,
        from: offset,
        to: offset + line.length,
      });
    }
    offset += line.length + 1;
  }

  return definitions;
}

export function findMarkdownAbbreviationUsageSpans(
  source: string,
  definitions?: Map<string, MarkdownAbbreviationDefinition> | null
): MarkdownAbbreviationUsageSpan[] {
  if (!definitions || !definitions.size) {
    return [];
  }

  const text = String(source || "");
  const spans: MarkdownAbbreviationUsageSpan[] = [];
  const labels = Array.from(definitions.keys()).sort(function (a, b) {
    return b.length - a.length || a.localeCompare(b);
  });

  for (let index = 0; index < labels.length; index += 1) {
    const label = labels[index];
    const definition = definitions.get(label);
    if (!definition || !label) {
      continue;
    }

    const pattern = new RegExp(escapePattern(label), "g");
    let match: RegExpExecArray | null = null;
    while ((match = pattern.exec(text)) !== null) {
      const from = match.index;
      const to = from + label.length;
      if (!isAbbreviationBoundary(text, from - 1) || !isAbbreviationBoundary(text, to)) {
        continue;
      }
      spans.push({
        from,
        to,
        label,
        title: definition.title,
      });
    }
  }

  spans.sort(function (a, b) {
    return a.from - b.from || b.to - a.to;
  });

  const deduped: MarkdownAbbreviationUsageSpan[] = [];
  for (let index = 0; index < spans.length; index += 1) {
    const candidate = spans[index];
    const previous = deduped[deduped.length - 1];
    if (previous && candidate.from < previous.to) {
      continue;
    }
    deduped.push(candidate);
  }

  return deduped;
}

export function markdownDefinitionListPrefixMatch(text: string, startOffset = 0): MarkdownPrefixMatch | null {
  const source = String(text || "").slice(Math.max(0, Number(startOffset) || 0));
  const match = source.match(/^(\s*):(\s+)/);
  if (!match) {
    return null;
  }

  return {
    prefixLength: match[0].length,
    indentLength: match[1].length,
  };
}

export function isMarkdownDefinitionTermLine(text: string, nextText: string, startOffset = 0): boolean {
  const source = String(text || "").slice(Math.max(0, Number(startOffset) || 0));
  if (!source.trim()) {
    return false;
  }

  if (!markdownDefinitionListPrefixMatch(nextText, startOffset) || markdownDefinitionListPrefixMatch(text, startOffset)) {
    return false;
  }

  if (/^(#{1,6}\s+|```+|~~~+|<[^>]+>|\s*[-+*]\s+|\s*\d+[.)]\s+|\s*-\s+\[[ xX]\]\s+)/.test(source)) {
    return false;
  }

  return true;
}

export function markdownEmojiCharacter(shortcode: string): string {
  const text = String(shortcode || "").trim();
  if (!/^:[A-Za-z0-9_]+:$/.test(text)) {
    return text;
  }

  const emoji = getEmojiCharacter(text.slice(1, -1));
  return emoji || text;
}
