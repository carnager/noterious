import type { FrontmatterKind, PageSummary } from "./types";
import { filterPagesByScope } from "./pageViews";

function supportsPropertyValueSuggestions(kind: FrontmatterKind): boolean {
  return kind === "text" || kind === "list" || kind === "tags";
}

export function collectPropertyValueSuggestions(
  pages: PageSummary[],
  scopePrefix: string,
  selectedPage: string,
  key: string,
  kind: FrontmatterKind,
): string[] {
  const normalizedKey = String(key || "").trim();
  if (!normalizedKey || !supportsPropertyValueSuggestions(kind)) {
    return [];
  }

  const counts = new Map<string, number>();
  filterPagesByScope(pages, scopePrefix).forEach(function (page) {
    if (!page || page.path === selectedPage || !page.frontmatter) {
      return;
    }
    const rawValue = page.frontmatter[normalizedKey];
    if (kind === "text") {
      if (typeof rawValue !== "string") {
        return;
      }
      const candidate = rawValue.trim();
      if (!candidate) {
        return;
      }
      counts.set(candidate, (counts.get(candidate) || 0) + 1);
      return;
    }
    if (!Array.isArray(rawValue)) {
      return;
    }
    rawValue.forEach(function (entry) {
      const candidate = String(entry || "").trim();
      if (!candidate) {
        return;
      }
      counts.set(candidate, (counts.get(candidate) || 0) + 1);
    });
  });

  return Array.from(counts.entries())
    .sort(function (left, right) {
      const countDelta = right[1] - left[1];
      if (countDelta !== 0) {
        return countDelta;
      }
      return left[0].localeCompare(right[0]);
    })
    .map(function (entry) {
      return entry[0];
    })
    .slice(0, 8);
}

export function filterPropertyValueSuggestions(
  suggestions: string[],
  query: string,
  excludedValues: string[] = [],
): string[] {
  const normalizedQuery = String(query || "").trim().toLowerCase();
  const excluded = new Set((Array.isArray(excludedValues) ? excludedValues : []).map(function (value) {
    return String(value || "").trim().toLowerCase();
  }).filter(Boolean));

  const candidates = new Map<string, string>();
  (Array.isArray(suggestions) ? suggestions : []).forEach(function (value) {
    const text = String(value || "").trim();
    if (!text) {
      return;
    }
    const normalized = text.toLowerCase();
    if (excluded.has(normalized) || candidates.has(normalized)) {
      return;
    }
    candidates.set(normalized, text);
  });

  const ranked = Array.from(candidates.values()).filter(function (value) {
    if (!normalizedQuery) {
      return true;
    }
    return value.toLowerCase().indexOf(normalizedQuery) >= 0;
  }).sort(function (left, right) {
    const leftValue = left.toLowerCase();
    const rightValue = right.toLowerCase();
    const leftStarts = normalizedQuery ? leftValue.startsWith(normalizedQuery) : false;
    const rightStarts = normalizedQuery ? rightValue.startsWith(normalizedQuery) : false;
    if (leftStarts !== rightStarts) {
      return leftStarts ? -1 : 1;
    }
    const leftExact = normalizedQuery ? leftValue === normalizedQuery : false;
    const rightExact = normalizedQuery ? rightValue === normalizedQuery : false;
    if (leftExact !== rightExact) {
      return leftExact ? 1 : -1;
    }
    const lengthDelta = left.length - right.length;
    if (lengthDelta !== 0) {
      return lengthDelta;
    }
    return left.localeCompare(right);
  });

  if (normalizedQuery && ranked.length === 1 && ranked[0].toLowerCase() === normalizedQuery) {
    return [];
  }
  return ranked.slice(0, 6);
}

export function movePropertySuggestionIndex(current: number, delta: number, length: number): number {
  if (length <= 0) {
    return -1;
  }
  if (current < 0) {
    return delta > 0 ? 0 : length - 1;
  }
  return Math.max(0, Math.min(length - 1, current + delta));
}
