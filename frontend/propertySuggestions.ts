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
