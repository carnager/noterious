import { normalizePageDraftPath, pageTitleFromPath } from "./commands";
import { splitFrontmatter } from "./markdown";
import type {
  FrontmatterKind,
  FrontmatterMap,
  FrontmatterValue,
  NoteTemplate,
  NoteTemplateField,
  PageSummary,
} from "./types";

export const templateFolderName = "_templates";
export const templateMarkerKey = "_template";
export const templateLabelKey = "_template_label";
export const templateFolderKey = "_template_folder";
export const templateListKey = "_template_list";
export const templateTagsKey = "_template_tags";
export const templateBoolKey = "_template_bool";
export const templateDateKey = "_template_date";
export const templateDateTimeKey = "_template_datetime";
export const templateNotificationKey = "_template_notification";

const templateMetadataKeys = new Set<string>([
  templateMarkerKey,
  templateLabelKey,
  templateFolderKey,
  templateListKey,
  templateTagsKey,
  templateBoolKey,
  templateDateKey,
  templateDateTimeKey,
  templateNotificationKey,
]);

function isNotificationTemplateFieldKey(key: string | null | undefined): boolean {
  const normalized = String(key || "").trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  return normalized === "notification" ||
    normalized === "notify" ||
    normalized === "remind" ||
    normalized === "reminder" ||
    /(^|[_-])(notify|notification|remind|reminder)([_-]|$)/i.test(normalized);
}

function templateSlug(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeTemplateFolder(value: string): string {
  return normalizePageDraftPath(value).replace(/\/+$/g, "");
}

export function isTemplateMetadataKey(key: string): boolean {
  return templateMetadataKeys.has(String(key || "").trim());
}

function uniqueTemplateID(seed: string, used: Set<string>, fallbackIndex: number): string {
  const base = templateSlug(seed) || ("template-" + String(fallbackIndex + 1));
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = base + "-" + String(suffix);
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

function normalizeTemplateFieldDefault(kind: FrontmatterKind, value: unknown): FrontmatterValue {
  if (kind === "bool") {
    if (typeof value === "string") {
      return value.trim().toLowerCase() === "true";
    }
    return Boolean(value);
  }

  if (kind === "list" || kind === "tags") {
    const items = Array.isArray(value)
      ? value
      : (typeof value === "string" ? value.split(",") : []);
    return items
      .map(function (entry) {
        return String(entry || "").trim();
      })
      .filter(Boolean);
  }

  return value === null || typeof value === "undefined" ? "" : String(value);
}

export function coerceTemplateFieldDefaultValue(kind: FrontmatterKind, value: unknown): FrontmatterValue {
  return normalizeTemplateFieldDefault(kind, value);
}

function emptyTemplateFieldValue(kind: FrontmatterKind): FrontmatterValue {
  return kind === "list" || kind === "tags"
    ? []
    : (kind === "bool" ? false : "");
}

function normalizeTemplateFieldKind(value: unknown): FrontmatterKind {
  switch (String(value || "").trim()) {
    case "list":
    case "tags":
    case "bool":
    case "date":
    case "datetime":
    case "notification":
      return String(value || "").trim() as FrontmatterKind;
    default:
      return "text";
  }
}

function normalizeTemplateField(input: unknown): NoteTemplateField | null {
  const source = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const key = String(source.key || "").trim();
  const kind = normalizeTemplateFieldKind(source.kind);
  const defaultValue = normalizeTemplateFieldDefault(
    kind,
    Object.prototype.hasOwnProperty.call(source, "defaultValue")
      ? source.defaultValue
      : emptyTemplateFieldValue(kind)
  );

  if (!key || isTemplateMetadataKey(key)) {
    return null;
  }

  return {
    key,
    kind,
    defaultValue,
  };
}

export function cloneNoteTemplates(input: NoteTemplate[]): NoteTemplate[] {
  return (Array.isArray(input) ? input : []).map(function (template) {
    return {
      id: String(template.id || "").trim(),
      name: String(template.name || "").trim(),
      folder: normalizeTemplateFolder(template.folder || ""),
      fields: (Array.isArray(template.fields) ? template.fields : []).map(function (field) {
        const normalized = normalizeTemplateField(field);
        return normalized || {
          key: "",
          kind: "text" as FrontmatterKind,
          defaultValue: "",
        };
      }).filter(function (field) {
        return Boolean(field.key);
      }),
    };
  });
}

export function normalizeNoteTemplates(input: unknown): NoteTemplate[] {
  const source = Array.isArray(input) ? input : [];
  const usedIDs = new Set<string>();

  return source.map(function (entry, index) {
    const record = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
    const name = String(record.name || "").trim();
    const folder = normalizeTemplateFolder(String(record.folder || "").trim());
    const fields = (Array.isArray(record.fields) ? record.fields : [])
      .map(normalizeTemplateField)
      .filter(function (field): field is NoteTemplateField {
        return Boolean(field);
      });

    if (!name && !folder && !fields.length) {
      return null;
    }

    const normalizedName = name || ("Template " + String(index + 1));
    const idSeed = String(record.id || "").trim() || normalizedName;

    return {
      id: uniqueTemplateID(idSeed, usedIDs, index),
      name: normalizedName,
      folder,
      fields,
    };
  }).filter(function (template): template is NoteTemplate {
    return Boolean(template);
  });
}

export function createBlankTemplateField(): NoteTemplateField {
  return {
    key: "",
    kind: "text",
    defaultValue: "",
  };
}

export function createBlankNoteTemplate(seed?: string): NoteTemplate {
  const base = templateSlug(seed || "template") || "template";
  const suffix = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const usedIDs = new Set<string>();
  return {
    id: uniqueTemplateID(base + "-" + suffix, usedIDs, 0),
    name: seed || "New Template",
    folder: "",
    fields: [createBlankTemplateField()],
  };
}

function replaceTemplatePlaceholders(value: string, pagePath: string): string {
  const title = pageTitleFromPath(pagePath);
  return String(value || "")
    .replace(/\{\{\s*title\s*\}\}/gi, title)
    .replace(/\{\{\s*path\s*\}\}/gi, pagePath);
}

function templatePathInfo(pagePath: string): { scopePrefix: string; relativePath: string } | null {
  const normalizedPath = normalizePageDraftPath(pagePath);
  if (!normalizedPath) {
    return null;
  }
  if (normalizedPath.startsWith(templateFolderName + "/")) {
    return {
      scopePrefix: "",
      relativePath: normalizedPath.slice(templateFolderName.length + 1),
    };
  }

  const parts = normalizedPath.split("/");
  if (parts.length >= 3 && parts[1] === templateFolderName) {
    return {
      scopePrefix: parts[0],
      relativePath: parts.slice(2).join("/"),
    };
  }

  return null;
}

function defaultTemplateFolderFromPath(pagePath: string): string {
  const info = templatePathInfo(pagePath);
  if (!info) {
    return "";
  }
  const parts = info.relativePath.split("/").filter(Boolean);
  if (parts.length <= 1) {
    return "";
  }
  return normalizeTemplateFolder(parts.slice(0, -1).join("/"));
}

function templateScopeMatches(pagePath: string, scopePrefix?: string): boolean {
  const info = templatePathInfo(pagePath);
  if (!info) {
    return false;
  }
  const normalizedScope = normalizePageDraftPath(scopePrefix || "");
  if (!normalizedScope) {
    return info.scopePrefix === "";
  }
  return info.scopePrefix === "" || info.scopePrefix === normalizedScope;
}

function stringEntriesFromFrontmatterValue(value: FrontmatterValue | null | undefined): string[] {
  if (Array.isArray(value)) {
    return value
      .map(function (entry) {
        return String(entry || "").trim();
      })
      .filter(Boolean);
  }
  const text = String(value || "").trim();
  if (!text) {
    return [];
  }
  return text
    .split(",")
    .map(function (entry) {
      return entry.trim();
    })
    .filter(Boolean);
}

function templateKindHintsFromFrontmatter(frontmatter: FrontmatterMap | null | undefined): Record<string, FrontmatterKind> {
  const source = frontmatter || {};
  const result: Record<string, FrontmatterKind> = {};

  [
    [templateTagsKey, "tags"],
    [templateListKey, "list"],
    [templateBoolKey, "bool"],
    [templateDateKey, "date"],
    [templateDateTimeKey, "datetime"],
    [templateNotificationKey, "notification"],
  ].forEach(function ([key, kind]) {
    stringEntriesFromFrontmatterValue(source[key]).forEach(function (fieldKey) {
      result[fieldKey] = kind as FrontmatterKind;
    });
  });

  return result;
}

function inferTemplateFieldKind(
  value: FrontmatterValue,
  key: string,
  hintedKind?: FrontmatterKind
): FrontmatterKind {
  if (Array.isArray(value)) {
    return hintedKind === "tags" || String(key || "").trim().toLowerCase() === "tags" ? "tags" : "list";
  }
  if (typeof value === "boolean") {
    return "bool";
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return hintedKind === "notification" || isNotificationTemplateFieldKey(key) ? "notification" : "date";
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(value)) {
    return hintedKind === "notification" || isNotificationTemplateFieldKey(key) ? "notification" : "datetime";
  }
  if ((value === null || typeof value === "undefined" || String(value).trim() === "") && hintedKind) {
    return hintedKind;
  }
  if (isNotificationTemplateFieldKey(key) && (value === null || typeof value === "undefined" || String(value).trim() === "")) {
    return "notification";
  }
  if (String(key || "").trim().toLowerCase() === "tags") {
    return "tags";
  }
  return "text";
}

function templateFieldsFromFrontmatter(frontmatter: FrontmatterMap | null | undefined): NoteTemplateField[] {
  const source = frontmatter || {};
  const kindHints = templateKindHintsFromFrontmatter(source);

  return Object.keys(source)
    .filter(function (key) {
      return !isTemplateMetadataKey(key);
    })
    .map(function (key) {
      const kind = inferTemplateFieldKind(source[key], key, kindHints[key]);
      return {
        key: String(key || "").trim(),
        kind,
        defaultValue: normalizeTemplateFieldDefault(kind, source[key]),
      };
    })
    .filter(function (field) {
      return Boolean(field.key);
    });
}

function renderFrontmatterEntry(lines: string[], key: string, value: FrontmatterValue): void {
  if (Array.isArray(value)) {
    if (!value.length) {
      lines.push(key + ": []");
      return;
    }
    lines.push(key + ":");
    value.forEach(function (entry) {
      lines.push("  - " + renderFrontmatterScalar(String(entry)));
    });
    return;
  }

  lines.push(key + ": " + renderFrontmatterScalar(value));
}

function renderTemplateFrontmatterLines(pagePath: string, template: NoteTemplate): string[] {
  const lines: string[] = [];

  template.fields.forEach(function (field) {
    const key = String(field.key || "").trim();
    if (!key || isTemplateMetadataKey(key)) {
      return;
    }

    renderFrontmatterEntry(lines, key, templateFieldDefaultValue(field, pagePath));
  });

  return lines;
}

function frontmatterValueHasContent(kind: FrontmatterKind, value: FrontmatterValue | null | undefined): boolean {
  if (kind === "list" || kind === "tags") {
    return stringEntriesFromFrontmatterValue(value).length > 0;
  }

  if (kind === "bool") {
    return typeof value === "boolean";
  }

  return String(value || "").trim() !== "";
}

function templateFieldShouldGuideInput(field: NoteTemplateField): boolean {
  const kind = field.kind;
  if (kind === "date" || kind === "datetime" || kind === "notification") {
    return true;
  }

  const key = String(field.key || "").trim().toLowerCase();
  if (!key) {
    return false;
  }

  if (key === "vorname" || key === "nachname" || key === "firstname" || key === "lastname" || key === "first_name" || key === "last_name") {
    return true;
  }

  return /(^|[_-])(phone|telefon|tel|mobile|mobil|handy)([_-]|$)/.test(key);
}

export function templateFieldNeedsGuidedInput(field: NoteTemplateField, pagePath: string): boolean {
  const key = String(field.key || "").trim();
  if (!key || isTemplateMetadataKey(key) || field.kind === "bool" || !templateFieldShouldGuideInput(field)) {
    return false;
  }
  return !frontmatterValueHasContent(field.kind, templateFieldDefaultValue(field, pagePath));
}

export function templateFieldsNeedingInput(template: NoteTemplate, pagePath: string): NoteTemplateField[] {
  return (Array.isArray(template.fields) ? template.fields : []).filter(function (field) {
    return templateFieldNeedsGuidedInput(field, pagePath);
  });
}

export function templateFieldHasValue(field: NoteTemplateField, frontmatter: FrontmatterMap | null | undefined): boolean {
  const key = String(field.key || "").trim();
  if (!key || isTemplateMetadataKey(key)) {
    return true;
  }
  return frontmatterValueHasContent(field.kind, frontmatter ? frontmatter[key] : undefined);
}

export function remainingTemplateFields(
  fields: NoteTemplateField[],
  frontmatter: FrontmatterMap | null | undefined,
): NoteTemplateField[] {
  return (Array.isArray(fields) ? fields : []).filter(function (field) {
    return !templateFieldHasValue(field, frontmatter);
  });
}

export function templateFieldKindHints(fields: NoteTemplateField[]): Record<string, FrontmatterKind> {
  return Object.fromEntries(
    (Array.isArray(fields) ? fields : [])
      .map(function (field) {
        return [String(field.key || "").trim(), field.kind] as [string, FrontmatterKind];
      })
      .filter(function ([key]) {
        return Boolean(key);
      })
  );
}

export function noteTemplateFromPage(page: Pick<PageSummary, "path" | "title" | "frontmatter">): NoteTemplate | null {
  const info = templatePathInfo(page.path);
  if (!info || !info.relativePath) {
    return null;
  }

  const frontmatter = page.frontmatter || {};
  const label = String(frontmatter[templateLabelKey] || page.title || pageTitleFromPath(info.relativePath)).trim();
  const folder = normalizeTemplateFolder(String(frontmatter[templateFolderKey] || defaultTemplateFolderFromPath(page.path) || "").trim());

  return {
    id: normalizePageDraftPath(page.path),
    name: label || pageTitleFromPath(info.relativePath),
    folder,
    fields: templateFieldsFromFrontmatter(frontmatter),
  };
}

export function allNoteTemplatesFromPages(pages: PageSummary[]): NoteTemplate[] {
  return (Array.isArray(pages) ? pages : [])
    .map(noteTemplateFromPage)
    .filter(function (template): template is NoteTemplate {
      return Boolean(template);
    })
    .sort(function (left, right) {
      return [left.name, left.id].join("\n").localeCompare([right.name, right.id].join("\n"));
    });
}

export function noteTemplatesFromPages(pages: PageSummary[], scopePrefix?: string): NoteTemplate[] {
  return allNoteTemplatesFromPages(pages).filter(function (template) {
    return templateScopeMatches(template.id, scopePrefix);
  });
}

export function templateFieldDefaultValue(field: NoteTemplateField, pagePath: string): FrontmatterValue {
  if (field.kind === "bool") {
    return Boolean(field.defaultValue);
  }

  if (field.kind === "list" || field.kind === "tags") {
    return (Array.isArray(field.defaultValue) ? field.defaultValue : [])
      .map(function (entry) {
        return replaceTemplatePlaceholders(String(entry), pagePath).trim();
      })
      .filter(Boolean);
  }

  const textValue = replaceTemplatePlaceholders(String(field.defaultValue || ""), pagePath);
  if (!textValue && String(field.key || "").trim().toLowerCase() === "title") {
    return pageTitleFromPath(pagePath);
  }
  return textValue;
}

function renderFrontmatterScalar(value: string | boolean): string {
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  return JSON.stringify(String(value || ""));
}

export function buildPagePathFromTemplate(template: NoteTemplate, draftPath: string): string {
  const normalizedDraft = normalizePageDraftPath(draftPath);
  if (!normalizedDraft) {
    return "";
  }
  const normalizedFolder = normalizeTemplateFolder(template.folder || "");
  if (!normalizedFolder) {
    return normalizedDraft;
  }
  if (normalizedDraft === normalizedFolder || normalizedDraft.startsWith(normalizedFolder + "/")) {
    return normalizedDraft;
  }
  return normalizedFolder + "/" + normalizedDraft;
}

export function buildMarkdownFromTemplate(pagePath: string, template: NoteTemplate, templateMarkdown?: string): string {
  const frontmatterLines = renderTemplateFrontmatterLines(pagePath, template);
  const split = typeof templateMarkdown === "string" ? splitFrontmatter(templateMarkdown) : { frontmatter: "", body: "" };
  const bodySource = typeof templateMarkdown === "string"
    ? (split.frontmatter ? split.body : String(templateMarkdown || "").replace(/\r\n/g, "\n"))
    : "";
  const body = replaceTemplatePlaceholders(bodySource, pagePath);
  const fallbackTitle = pageTitleFromPath(pagePath);
  const fallbackBody = fallbackTitle ? ("# " + fallbackTitle + "\n") : "";
  const content = body || fallbackBody;

  return ["---"].concat(frontmatterLines, ["---"]).join("\n") + "\n" + content;
}

export function resolveNoteTemplate(templates: NoteTemplate[], marker: unknown): NoteTemplate | null {
  const templateID = String(marker || "").trim();
  if (!templateID) {
    return null;
  }
  return (Array.isArray(templates) ? templates : []).find(function (template) {
    return String(template.id || "").trim() === templateID;
  }) || null;
}

export function templatePropertyKindHints(
  frontmatter: FrontmatterMap | null | undefined,
  templates: NoteTemplate[]
): Record<string, FrontmatterKind> {
  const directHints = templateKindHintsFromFrontmatter(frontmatter);
  if (Object.keys(directHints).length) {
    return directHints;
  }

  const template = resolveNoteTemplate(templates, frontmatter ? frontmatter[templateMarkerKey] : "");
  if (!template) {
    return {};
  }

  return Object.fromEntries(
    template.fields
      .map(function (field) {
        return [String(field.key || "").trim(), field.kind] as [string, FrontmatterKind];
      })
      .filter(function ([key]) {
        return Boolean(key);
      })
  );
}

export function templateFieldSummary(template: NoteTemplate, limit?: number): string {
  const maxItems = Math.max(1, Number(limit) || 4);
  const keys = template.fields
    .map(function (field) {
      return String(field.key || "").trim();
    })
    .filter(Boolean);

  if (!keys.length) {
    return "No predefined properties.";
  }

  if (keys.length <= maxItems) {
    return keys.join(" · ");
  }

  return keys.slice(0, maxItems).join(" · ") + " +" + String(keys.length - maxItems);
}
