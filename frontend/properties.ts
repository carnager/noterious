import { clearNode, renderEmpty } from "./dom";
import {
  editableDatePlaceholder,
  editableDateTimePlaceholder,
  formatDateTimeValue,
  formatDateValue,
  formatEditableDateTimeValue,
  formatEditableDateValue,
  parseEditableDateTimeValue,
  parseEditableDateValue,
} from "./datetime";
import type {
  FrontmatterKind,
  FrontmatterMap,
  FrontmatterValue,
  PropertyDraft,
} from "./types";
import { isTemplateMetadataKey } from "./noteTemplates";

export interface PropertyRow {
  key: string;
  value: string;
  rawValue: FrontmatterValue;
  kindHint?: FrontmatterKind;
}

export interface RenderPagePropertiesOptions {
  container: HTMLDivElement;
  pageFrontmatter: FrontmatterMap | null;
  propertyKindHints: Record<string, FrontmatterKind>;
  editingPropertyKey: string;
  propertyTypeMenuKey: string;
  propertyDraft: PropertyDraft | null;
  propertyDraftFocusTarget: "key" | "value";
  onToggleTypeMenu(menuKey: string): void;
  onApplyKind(kind: FrontmatterKind, row: PropertyRow | null): void;
  onRemoveProperty(key: string): void;
  onStartRenameProperty(row: PropertyRow): void;
  onSaveExistingProperty(key: string, value: FrontmatterValue): Promise<void>;
  onSetDraft(draft: PropertyDraft): void;
  onRefresh(): void;
  onSaveDraft(): Promise<void>;
  onCancelDraft(): void;
  onSetNoteStatus(message: string): void;
}

function isTagPropertyKey(key: string | null | undefined): boolean {
  return String(key || "").trim().toLowerCase() === "tags";
}

function isNotificationPropertyKey(key: string | null | undefined): boolean {
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

export function inferFrontmatterKind(
  value: FrontmatterValue,
  key?: string,
  hintedKind?: FrontmatterKind
): FrontmatterKind {
  if (Array.isArray(value)) {
    return hintedKind === "tags" || isTagPropertyKey(key) ? "tags" : "list";
  }
  if (typeof value === "boolean") {
    return "bool";
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return hintedKind === "notification" || isNotificationPropertyKey(key) ? "notification" : "date";
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(value)) {
    return hintedKind === "notification" || isNotificationPropertyKey(key) ? "notification" : "datetime";
  }
  if ((value === null || typeof value === "undefined" || String(value).trim() === "") && hintedKind) {
    return hintedKind;
  }
  if (isNotificationPropertyKey(key) && (value === null || typeof value === "undefined" || String(value).trim() === "")) {
    return "notification";
  }
  if (isTagPropertyKey(key) && (value === null || typeof value === "undefined" || String(value).trim() === "")) {
    return "tags";
  }
  return "text";
}

export function normalizeDateTimeValue(value: FrontmatterValue | null | undefined): string {
  return String(value || "").replace(" ", "T").slice(0, 16);
}

export function serializeDateTimeValue(value: string): string {
  return String(value || "").replace("T", " ").trim();
}

export function displayFrontmatterValue(value: FrontmatterValue | null | undefined): string {
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  return value === null || typeof value === "undefined" ? "" : String(value);
}

function listEntriesFromValue(value: FrontmatterValue | null | undefined): string[] {
  if (Array.isArray(value)) {
    return value.map(String);
  }
  const textValue = displayFrontmatterValue(value).trim();
  return textValue ? [textValue] : [];
}

function normalizeTagEntry(value: string): string {
  return String(value || "").trim().replace(/^#+/, "");
}

function tagEntriesFromValue(value: FrontmatterValue | null | undefined): string[] {
  const values = Array.isArray(value)
    ? value.map(String)
    : [displayFrontmatterValue(value)];
  return values
    .map(function (entry) {
      return normalizeTagEntry(entry);
    })
    .filter(Boolean);
}

function propertySequenceEntries(kind: FrontmatterKind, value: FrontmatterValue | null | undefined): string[] {
  return kind === "tags" ? tagEntriesFromValue(value) : listEntriesFromValue(value);
}

function sequenceInputEntries(kind: FrontmatterKind, value: string): string[] {
  return String(value || "")
    .split(/[,\n]/)
    .map(function (entry) {
      return kind === "tags" ? normalizeTagEntry(entry) : String(entry || "").trim();
    })
    .filter(Boolean);
}

function draftSequenceEntries(draft: PropertyDraft): string[] {
  const base = propertySequenceEntries(draft.kind, draft.list);
  return base.concat(sequenceInputEntries(draft.kind, draft.text));
}

export function makePropertyDraft(
  key: string,
  value: FrontmatterValue,
  originalKey: string,
  hintedKind?: FrontmatterKind
): PropertyDraft {
  const kind = inferFrontmatterKind(value, key, hintedKind);
  const text = kind === "date"
    ? formatEditableDateValue(String(value || ""))
    : ((kind === "datetime" || kind === "notification") ? formatEditableDateTimeValue(String(value || "")) : displayFrontmatterValue(value));
  return {
    originalKey: originalKey || key || "",
    key: key || "",
    kind,
    text: kind === "list" || kind === "tags" ? "" : text,
    list: kind === "list" || kind === "tags" ? propertySequenceEntries(kind, value) : [],
  };
}

export function applyPropertyDraftKind(draft: PropertyDraft, kind: FrontmatterKind): PropertyDraft {
  const value = coercePropertyValue(kind, propertyDraftValue(draft), draft.key);
  const text = kind === "date"
    ? formatEditableDateValue(String(value || ""))
    : ((kind === "datetime" || kind === "notification") ? formatEditableDateTimeValue(String(value || "")) : displayFrontmatterValue(value));
  return {
    originalKey: draft.originalKey || draft.key,
    key: draft.key,
    kind,
    text: kind === "list" || kind === "tags" ? "" : text,
    list: kind === "list" || kind === "tags" ? propertySequenceEntries(kind, value) : [],
  };
}

export function coercePropertyValue(kind: FrontmatterKind, value: FrontmatterValue, key?: string): FrontmatterValue {
  if (kind === "tags" || (kind === "list" && isTagPropertyKey(key))) {
    return tagEntriesFromValue(value);
  }
  if (kind === "list") {
    if (Array.isArray(value)) {
      return value.map(String);
    }
    const textValue = displayFrontmatterValue(value).trim();
    return textValue ? [textValue] : [];
  }
  if (kind === "bool") {
    if (typeof value === "boolean") {
      return value;
    }
    return String(displayFrontmatterValue(value)).toLowerCase() === "true";
  }
  if (kind === "date") {
    return String(displayFrontmatterValue(value) || "").slice(0, 10);
  }
  if (kind === "datetime" || kind === "notification") {
    return serializeDateTimeValue(normalizeDateTimeValue(value));
  }
  return displayFrontmatterValue(value);
}

export function propertyDraftValue(draft: PropertyDraft | null): FrontmatterValue {
  if (!draft) {
    return "";
  }
  if (draft.kind === "list" || draft.kind === "tags") {
    return coercePropertyValue(draft.kind, draftSequenceEntries(draft), draft.key);
  }
  if (draft.kind === "bool") {
    return draft.text === "true";
  }
  if (draft.kind === "date") {
    return parseEditableDateValue(String(draft.text || ""));
  }
  if (draft.kind === "datetime" || draft.kind === "notification") {
    return parseEditableDateTimeValue(String(draft.text || ""));
  }
  return String(draft.text || "").trim();
}

function propertyMenuKey(row: PropertyRow | null): string {
  return row ? row.key : "__new__";
}

function propertyTypeIcon(kind: FrontmatterKind): string {
  if (kind === "tags") {
    return "#";
  }
  if (kind === "list") {
    return "☰";
  }
  if (kind === "bool") {
    return "☑";
  }
  if (kind === "notification") {
    return "◷";
  }
  if (kind === "date" || kind === "datetime") {
    return "◫";
  }
  return "≡";
}

function propertyKindLabel(kind: FrontmatterKind): string {
  if (kind === "tags") {
    return "Tags";
  }
  if (kind === "list") {
    return "List";
  }
  if (kind === "bool") {
    return "Checkbox";
  }
  if (kind === "date") {
    return "Date";
  }
  if (kind === "datetime") {
    return "Date & time";
  }
  if (kind === "notification") {
    return "Notify";
  }
  return "Text";
}

function propertyKeyIcon(row: PropertyRow): string {
  const kind = inferFrontmatterKind(row.rawValue, row.key, row.kindHint);
  if (kind !== "text") {
    return propertyTypeIcon(kind);
  }

  const key = String(row.key || "").toLowerCase();
  if (key === "tags") {
    return "#";
  }
  if (isNotificationPropertyKey(key)) {
    return propertyTypeIcon("notification");
  }
  if (key.indexOf("date") >= 0 || key.indexOf("birth") >= 0 || key.indexOf("remind") >= 0 || key === "datum") {
    return "◫";
  }
  if (key.indexOf("who") >= 0 || key.indexOf("person") >= 0 || key.indexOf("name") >= 0 || key === "anwesend" || key === "vorname" || key === "nachname") {
    return "◌";
  }
  return propertyTypeIcon(kind);
}

function appendPropertyKeyContent(target: HTMLElement, row: PropertyRow, keyText: string): void {
  const icon = document.createElement("span");
  icon.className = "property-key-icon";
  icon.textContent = propertyKeyIcon(row);
  target.appendChild(icon);

  const label = document.createElement("span");
  label.className = "property-key-label";
  label.textContent = keyText;
  target.appendChild(label);
}

function renderEmptyPropertyValueNode(): HTMLElement {
  const empty = document.createElement("span");
  empty.className = "property-empty-value";
  empty.textContent = "Empty";
  return empty;
}

function appendPropertyChip(
  container: HTMLElement,
  entry: string,
  kind: FrontmatterKind,
  onRemove?: () => void
): void {
  const chip = document.createElement("span");
  chip.className = "property-chip";
  if (kind === "tags") {
    chip.classList.add("tag");
  }

  const label = document.createElement("span");
  label.textContent = kind === "tags" ? "#" + entry : entry;
  chip.appendChild(label);

  if (onRemove) {
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "property-chip-remove";
    remove.textContent = "×";
    remove.addEventListener("click", onRemove);
    chip.appendChild(remove);
  }

  container.appendChild(chip);
}

function renderPropertyValueNode(value: FrontmatterValue, key?: string, kindHint?: FrontmatterKind): HTMLElement {
  const kind = inferFrontmatterKind(value, key, kindHint);
  if (Array.isArray(value) || kind === "tags") {
    const entries = propertySequenceEntries(kind, value);
    if (!entries.length) {
      return renderEmptyPropertyValueNode();
    }
    const list = document.createElement("div");
    list.className = "property-chip-list";
    entries.forEach(function (entry) {
      appendPropertyChip(list, entry, kind);
    });
    return list;
  }

  if (typeof value === "boolean") {
    const bool = document.createElement("span");
    bool.className = "property-bool";
    bool.textContent = value ? "☑ true" : "☐ false";
    return bool;
  }

  if (value === null || typeof value === "undefined" || String(value) === "") {
    return renderEmptyPropertyValueNode();
  }

  const text = document.createElement("span");
  if (kind === "date") {
    text.textContent = formatDateValue(String(value || ""));
  } else if (kind === "datetime" || kind === "notification") {
    text.textContent = formatDateTimeValue(String(value || ""));
  } else {
    text.textContent = displayFrontmatterValue(value);
  }
  return text;
}

function renderPropertyTypeMenu(shell: HTMLElement, row: PropertyRow | null, options: RenderPagePropertiesOptions): void {
  const menu = document.createElement("div");
  menu.className = "property-type-menu";
  const activeKind = row
    ? inferFrontmatterKind(row.rawValue, row.key, row.kindHint)
    : (options.propertyDraft ? options.propertyDraft.kind : "text");

  const typeOptions: Array<[FrontmatterKind, string]> = [
    ["text", "Text"],
    ["tags", "Tags"],
    ["list", "List"],
    ["bool", "Checkbox"],
    ["date", "Date"],
    ["datetime", "Date & time"],
    ["notification", "Notification"],
  ];

  typeOptions.forEach(function (parts) {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "property-type-option";
    if ((parts[0] as FrontmatterKind) === activeKind) {
      option.classList.add("active");
    }
    const icon = document.createElement("span");
    icon.className = "property-menu-icon";
    icon.textContent = propertyTypeIcon(parts[0] as FrontmatterKind);
    option.appendChild(icon);

    const label = document.createElement("span");
    label.textContent = parts[1];
    option.appendChild(label);
    option.addEventListener("click", function () {
      options.onApplyKind(parts[0] as FrontmatterKind, row);
    });
    menu.appendChild(option);
  });

  if (row) {
    const rename = document.createElement("button");
    rename.type = "button";
    rename.className = "property-type-option";
    const renameIcon = document.createElement("span");
    renameIcon.className = "property-menu-icon";
    renameIcon.textContent = "✎";
    rename.appendChild(renameIcon);
    const renameLabel = document.createElement("span");
    renameLabel.textContent = "Rename";
    rename.appendChild(renameLabel);
    rename.addEventListener("click", function () {
      options.onStartRenameProperty(row);
    });
    menu.appendChild(rename);

    const separator = document.createElement("div");
    separator.className = "property-type-separator";
    menu.appendChild(separator);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "property-type-option danger";
    const removeIcon = document.createElement("span");
    removeIcon.className = "property-menu-icon";
    removeIcon.textContent = "⌫";
    remove.appendChild(removeIcon);
    const removeLabel = document.createElement("span");
    removeLabel.textContent = "Remove";
    remove.appendChild(removeLabel);
    remove.addEventListener("click", function () {
      options.onRemoveProperty(row.key);
    });
    menu.appendChild(remove);
  }

  shell.appendChild(menu);
}

function setPropertyKindButtonContent(button: HTMLButtonElement, kind: FrontmatterKind): void {
  button.textContent = "";
  button.setAttribute("aria-label", "Property type: " + propertyKindLabel(kind));

  const icon = document.createElement("span");
  icon.className = "property-kind-icon";
  icon.textContent = propertyTypeIcon(kind);
  button.appendChild(icon);

  const label = document.createElement("span");
  label.className = "property-kind-label";
  label.textContent = propertyKindLabel(kind);
  button.appendChild(label);
}

function focusPropertyDraftValue(container: HTMLElement): HTMLElement | null {
  const target = container.querySelector<HTMLElement>("[data-property-value-input='true']");
  if (target && typeof target.focus === "function") {
    target.focus();
    return target;
  }
  return null;
}

function focusPropertyDraftKey(container: HTMLElement): HTMLInputElement | null {
  const input = container.querySelector<HTMLInputElement>(".property-inline-key");
  if (input) {
    input.focus();
    return input;
  }
  return null;
}

export function propertyScalarInputType(kind: FrontmatterKind): string {
  if (kind === "date") {
    return "date";
  }
  if (kind === "datetime" || kind === "notification") {
    return "datetime-local";
  }
  return "text";
}

export function propertyScalarInputValue(kind: FrontmatterKind, value: string): string {
  const text = String(value || "");
  if (!text) {
    return "";
  }

  const inputType = propertyScalarInputType(kind);
  if (inputType === "text") {
    if (kind === "date") {
      return formatEditableDateValue(text);
    }
    if (kind === "datetime" || kind === "notification") {
      return formatEditableDateTimeValue(text);
    }
    return text;
  }

  try {
    if (kind === "date") {
      return parseEditableDateValue(text);
    }
    if (kind === "datetime" || kind === "notification") {
      return normalizeDateTimeValue(parseEditableDateTimeValue(text));
    }
  } catch (_error) {
    return text;
  }

  return text;
}

function propertyListInputPlaceholder(kind: FrontmatterKind): string {
  return kind === "tags" ? "Add tag" : "Add item";
}

function propertyScalarInputPlaceholder(kind: FrontmatterKind, existing: boolean): string {
  if (kind === "date") {
    return editableDatePlaceholder();
  }
  if (kind === "datetime" || kind === "notification") {
    return editableDateTimePlaceholder();
  }
  return existing ? "Empty" : "Value";
}

function propertyListHint(kind: FrontmatterKind): string {
  return kind === "tags"
    ? "Press Enter or comma to add each tag."
    : "Press Enter or comma to add each item.";
}

function renderExistingPropertyValueEditor(row: PropertyRow, options: RenderPagePropertiesOptions): HTMLElement {
  const kind = inferFrontmatterKind(row.rawValue, row.key, row.kindHint);
  const value = document.createElement("div");
  value.className = "property-value property-inline-editor";

  if (kind === "list" || kind === "tags") {
    const listValue = propertySequenceEntries(kind, row.rawValue);
    const chips = document.createElement("div");
    chips.className = "property-chip-list editable";
    listValue.forEach(function (entry, index) {
      appendPropertyChip(chips, String(entry), kind, function () {
        const next = listValue.slice();
        next.splice(index, 1);
        options.onSaveExistingProperty(row.key, coercePropertyValue(kind, next, row.key)).catch(function (error: Error) {
          options.onSetNoteStatus("Property save failed: " + error.message);
        });
      });
    });
    value.appendChild(chips);

    const addInput = document.createElement("input");
    addInput.type = "text";
    addInput.className = "property-inline-input";
    addInput.placeholder = propertyListInputPlaceholder(kind);
    addInput.setAttribute("data-property-list-adder", "true");
    addInput.addEventListener("keydown", function (event) {
      if (event.key === "Enter" || event.key === ",") {
        event.preventDefault();
        const nextValue = addInput.value.trim();
        if (!nextValue) {
          return;
        }
        options.onSaveExistingProperty(row.key, coercePropertyValue(kind, listValue.concat([nextValue]), row.key)).catch(function (error: Error) {
          options.onSetNoteStatus("Property save failed: " + error.message);
        });
      }
    });
    value.appendChild(addInput);
    return value;
  }

  if (kind === "bool") {
    const boolLabel = document.createElement("label");
    boolLabel.className = "property-inline-bool";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = Boolean(row.rawValue);
    checkbox.addEventListener("change", function () {
      options.onSaveExistingProperty(row.key, checkbox.checked).catch(function (error: Error) {
        options.onSetNoteStatus("Property save failed: " + error.message);
      });
    });
    boolLabel.appendChild(checkbox);
    value.appendChild(boolLabel);
    return value;
  }

  const input = document.createElement("input");
  input.className = "property-inline-input";
  input.type = propertyScalarInputType(kind);
  input.value = propertyScalarInputValue(kind, String(row.rawValue || ""));
  input.placeholder = propertyScalarInputPlaceholder(kind, true);
  input.setAttribute("data-property-value-input", "true");

  const commit = function () {
    try {
      const rawValue = input.value;
      const nextValue = kind === "date"
        ? parseEditableDateValue(rawValue)
        : ((kind === "datetime" || kind === "notification") ? parseEditableDateTimeValue(rawValue) : rawValue);
      const normalizedCurrent = String(row.rawValue || "");
      if (nextValue === normalizedCurrent) {
        return;
      }
      options.onSaveExistingProperty(row.key, nextValue).catch(function (error: Error) {
        options.onSetNoteStatus("Property save failed: " + error.message);
      });
    } catch (error) {
      options.onSetNoteStatus("Property save failed: " + (error instanceof Error ? error.message : String(error)));
    }
  };

  input.addEventListener("blur", commit);
  input.addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
      event.preventDefault();
      input.blur();
    }
  });

  value.appendChild(input);
  return value;
}

function renderPropertyEditorRow(container: HTMLDivElement, row: PropertyRow | null, options: RenderPagePropertiesOptions): void {
  let draft = options.propertyDraft || makePropertyDraft(
    row ? row.key : "",
    row ? row.rawValue : "",
    row ? row.key : "__new__",
    row ? row.kindHint : undefined,
  );
  const item = document.createElement("div");
  item.className = "property-row editing";
  if (!row) {
    item.classList.add("property-row-create");
  }

  const setDraft = function (nextDraft: PropertyDraft): void {
    draft = {
      ...nextDraft,
      list: Array.isArray(nextDraft.list) ? nextDraft.list.slice() : [],
    };
    options.onSetDraft(draft);
  };
  const commit = function () {
    options.onSaveDraft().catch(function (error: Error) {
      options.onSetNoteStatus("Property save failed: " + error.message);
    });
  };
  const cancel = function () {
    options.onCancelDraft();
  };

  const keyShell = document.createElement("div");
  keyShell.className = "property-key-shell";

  const keyInput = document.createElement("input");
  keyInput.type = "text";
  keyInput.className = "property-inline-input property-inline-key";
  if (!row) {
    keyInput.classList.add("property-composer-input");
  }
  keyInput.placeholder = "Property name";
  keyInput.value = draft.key;
  keyInput.addEventListener("input", function () {
    setDraft({ ...draft, key: keyInput.value });
  });
  keyShell.appendChild(keyInput);

  const kindButton = document.createElement("button");
  kindButton.type = "button";
  kindButton.className = "property-kind-button";
  if (!row) {
    keyShell.classList.add("property-composer-shell");
    kindButton.classList.add("property-composer-kind");
  }
  setPropertyKindButtonContent(kindButton, draft.kind);
  kindButton.addEventListener("click", function () {
    options.onToggleTypeMenu(propertyMenuKey(row));
  });
  keyShell.appendChild(kindButton);

  if (options.propertyTypeMenuKey === propertyMenuKey(row)) {
    renderPropertyTypeMenu(keyShell, row, options);
  }

  const value = document.createElement("div");
  value.className = "property-value property-inline-editor";
  if (!row) {
    value.classList.add("property-composer-value");
  }

  if (draft.kind === "list" || draft.kind === "tags") {
    const listValue = propertySequenceEntries(draft.kind, draft.list);
    const chips = document.createElement("div");
    chips.className = "property-chip-list editable";
    listValue.forEach(function (entry, index) {
      appendPropertyChip(chips, entry, draft.kind, function () {
        const nextList = listValue.slice();
        nextList.splice(index, 1);
        setDraft({ ...draft, list: nextList });
        options.onRefresh();
      });
    });
    value.appendChild(chips);

    const addInput = document.createElement("input");
    addInput.type = "text";
    addInput.className = "property-inline-input";
    if (!row) {
      addInput.classList.add("property-composer-input");
    }
    addInput.value = String(draft.text || "");
    addInput.placeholder = propertyListInputPlaceholder(draft.kind);
    addInput.setAttribute("data-property-value-input", "true");
    addInput.setAttribute("data-property-list-adder", "true");
    addInput.addEventListener("input", function () {
      setDraft({ ...draft, text: addInput.value });
    });
    addInput.addEventListener("keydown", function (event) {
      if (event.key === "Enter" || event.key === ",") {
        event.preventDefault();
        const nextEntries = sequenceInputEntries(draft.kind, addInput.value);
        if (!nextEntries.length) {
          return;
        }
        setDraft({
          ...draft,
          text: "",
          list: listValue.concat(nextEntries),
        });
        options.onRefresh();
      }
    });
    value.appendChild(addInput);

    if (!row) {
      const hint = document.createElement("div");
      hint.className = "property-inline-hint";
      hint.textContent = propertyListHint(draft.kind);
      value.appendChild(hint);
    }
  } else if (draft.kind === "bool") {
    const boolLabel = document.createElement("label");
    boolLabel.className = "property-inline-bool";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = draft.text === "true";
    checkbox.setAttribute("data-property-value-input", "true");
    checkbox.addEventListener("change", function () {
      setDraft({ ...draft, text: checkbox.checked ? "true" : "false" });
    });
    boolLabel.appendChild(checkbox);
    if (!row) {
      const boolText = document.createElement("span");
      boolText.className = "property-inline-hint";
      boolText.textContent = checkbox.checked ? "Checked" : "Unchecked";
      boolLabel.appendChild(boolText);
      checkbox.addEventListener("change", function () {
        boolText.textContent = checkbox.checked ? "Checked" : "Unchecked";
      });
    }
    value.appendChild(boolLabel);
  } else {
    const input = document.createElement("input");
    input.className = "property-inline-input";
    if (!row) {
      input.classList.add("property-composer-input");
    }
    input.type = propertyScalarInputType(draft.kind);
    input.value = propertyScalarInputValue(draft.kind, String(draft.text || ""));
    input.placeholder = propertyScalarInputPlaceholder(draft.kind, Boolean(row));
    input.setAttribute("data-property-value-input", "true");
    input.addEventListener("input", function () {
      setDraft({ ...draft, text: input.value });
    });
    value.appendChild(input);
  }

  const actions = document.createElement("div");
  actions.className = "property-row-actions";
  if (!row) {
    actions.classList.add("property-composer-actions");
  }

  const save = document.createElement("button");
  save.type = "button";
  save.className = "property-action";
  if (!row) {
    save.classList.add("primary");
  }
  save.textContent = row ? "Save" : "Add";
  save.addEventListener("click", commit);

  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.className = "property-action";
  cancelButton.textContent = "Cancel";
  cancelButton.addEventListener("click", cancel);

  actions.appendChild(save);
  actions.appendChild(cancelButton);

  item.appendChild(keyShell);
  item.appendChild(value);
  item.appendChild(actions);
  container.appendChild(item);

  item.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      cancel();
      return;
    }
    if (event.key === "Enter") {
      const target = event.target instanceof HTMLElement ? event.target : null;
      const isListAdder = target instanceof HTMLInputElement && target.getAttribute("data-property-list-adder") === "true";
      if (isListAdder) {
        return;
      }
      if (target && target.closest("button")) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      commit();
    }
  });

  window.setTimeout(function () {
    if (row) {
      if (options.propertyDraftFocusTarget === "key") {
        const keyInput = focusPropertyDraftKey(item);
        if (keyInput) {
          keyInput.setSelectionRange(0, keyInput.value.length);
          return;
        }
      }
      const target = focusPropertyDraftValue(item);
      const valueInput = item.querySelector<HTMLInputElement>("[data-property-value-input='true']");
      if ((!target || target === valueInput) && valueInput && valueInput.type === "text") {
        valueInput.setSelectionRange(0, valueInput.value.length);
      }
      return;
    }

    if (String(draft.key || "").trim()) {
      const target = focusPropertyDraftValue(item);
      if (target instanceof HTMLInputElement && target.type === "text") {
        const position = target.value.length;
        target.setSelectionRange(position, position);
      }
      if (target) {
        return;
      }
    }

    const input = keyShell.querySelector<HTMLInputElement>(".property-inline-key");
    if (!input) {
      return;
    }
    input.focus();
  }, 0);
}

export function renderPageProperties(options: RenderPagePropertiesOptions): void {
  clearNode(options.container);
  options.container.style.removeProperty("--property-key-width");

  if (!options.pageFrontmatter) {
    renderEmpty(options.container, "Select a page to see properties.");
    return;
  }

  const pageFrontmatter = options.pageFrontmatter;
  const rows: PropertyRow[] = [];
  Object.keys(pageFrontmatter)
    .sort()
    .forEach(function (key) {
      const value = pageFrontmatter[key];
      if (typeof value === "undefined" || isTemplateMetadataKey(key)) {
        return;
      }
      rows.push({
        key,
        value: Array.isArray(value) ? value.join(", ") : String(value),
        rawValue: value,
        kindHint: options.propertyKindHints[key],
      });
    });

  if (!rows.length && options.editingPropertyKey !== "__new__") {
    renderEmpty(options.container, "No frontmatter on this page.");
    return;
  }

  rows.forEach(function (row) {
    if (options.editingPropertyKey === row.key) {
      renderPropertyEditorRow(options.container, row, options);
      return;
    }

    const item = document.createElement("div");
    item.className = "property-row";

    const keyShell = document.createElement("div");
    keyShell.className = "property-key-shell";

    const key = document.createElement("button");
    key.type = "button";
    key.className = "property-key property-inline-trigger property-name-button";
    appendPropertyKeyContent(key, row, row.key);
    key.addEventListener("click", function () {
      options.onToggleTypeMenu(propertyMenuKey(row));
    });
    keyShell.appendChild(key);

    if (options.propertyTypeMenuKey === propertyMenuKey(row)) {
      renderPropertyTypeMenu(keyShell, row, options);
    }

    const valueNode = renderExistingPropertyValueEditor(row, options);
    item.appendChild(keyShell);
    item.appendChild(valueNode);
    options.container.appendChild(item);
  });

  if (options.editingPropertyKey === "__new__") {
    renderPropertyEditorRow(options.container, null, options);
  }

  window.requestAnimationFrame(function () {
    const buttons = Array.from(options.container.querySelectorAll<HTMLElement>(".property-name-button"));
    if (!buttons.length) {
      return;
    }
    const width = Math.max.apply(null, buttons.map(function (node) {
      const rectWidth = Math.ceil(node.getBoundingClientRect().width);
      const scrollWidth = Math.ceil(node.scrollWidth || 0);
      return Math.max(rectWidth, scrollWidth);
    }));
    if (width > 0) {
      options.container.style.setProperty("--property-key-width", (width + 6) + "px");
    }
  });
}
