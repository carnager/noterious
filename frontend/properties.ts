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

export interface PropertyRow {
  key: string;
  value: string;
  rawValue: FrontmatterValue;
}

export interface RenderPagePropertiesOptions {
  container: HTMLDivElement;
  pageFrontmatter: FrontmatterMap | null;
  editingPropertyKey: string;
  propertyTypeMenuKey: string;
  propertyDraft: PropertyDraft | null;
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

export function inferFrontmatterKind(value: FrontmatterValue): FrontmatterKind {
  if (Array.isArray(value)) {
    return "list";
  }
  if (typeof value === "boolean") {
    return "bool";
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return "date";
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(value)) {
    return "datetime";
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

export function makePropertyDraft(key: string, value: FrontmatterValue, originalKey: string): PropertyDraft {
  const kind = inferFrontmatterKind(value);
  const text = kind === "date"
    ? formatEditableDateValue(String(value || ""))
    : (kind === "datetime" ? formatEditableDateTimeValue(String(value || "")) : displayFrontmatterValue(value));
  return {
    originalKey: originalKey || key || "",
    key: key || "",
    kind,
    text: kind === "list" ? "" : text,
    list: Array.isArray(value) ? value.map(String) : [],
  };
}

export function coercePropertyValue(kind: FrontmatterKind, value: FrontmatterValue): FrontmatterValue {
  if (kind === "list") {
    if (Array.isArray(value)) {
      return value.slice();
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
  if (kind === "datetime") {
    return normalizeDateTimeValue(value);
  }
  return displayFrontmatterValue(value);
}

export function propertyDraftValue(draft: PropertyDraft | null): FrontmatterValue {
  if (!draft) {
    return "";
  }
  if (draft.kind === "list") {
    return draft.list.slice();
  }
  if (draft.kind === "bool") {
    return draft.text === "true";
  }
  if (draft.kind === "date") {
    return parseEditableDateValue(String(draft.text || ""));
  }
  if (draft.kind === "datetime") {
    return parseEditableDateTimeValue(String(draft.text || ""));
  }
  return String(draft.text || "").trim();
}

function propertyMenuKey(row: PropertyRow | null): string {
  return row ? row.key : "__new__";
}

function propertyTypeIcon(kind: FrontmatterKind): string {
  if (kind === "list") {
    return "☰";
  }
  if (kind === "bool") {
    return "☑";
  }
  if (kind === "date" || kind === "datetime") {
    return "◫";
  }
  return "≡";
}

function propertyKeyIcon(row: PropertyRow): string {
  const key = String(row.key || "").toLowerCase();
  if (key === "tags") {
    return "#";
  }
  if (key.indexOf("date") >= 0 || key.indexOf("birth") >= 0 || key.indexOf("remind") >= 0 || key === "datum") {
    return "◫";
  }
  if (key.indexOf("who") >= 0 || key.indexOf("person") >= 0 || key.indexOf("name") >= 0 || key === "anwesend" || key === "vorname" || key === "nachname") {
    return "◌";
  }
  return propertyTypeIcon(inferFrontmatterKind(row.rawValue));
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

function renderPropertyValueNode(value: FrontmatterValue): HTMLElement {
  if (Array.isArray(value)) {
    const list = document.createElement("div");
    list.className = "property-chip-list";
    value.forEach(function (entry) {
      const chip = document.createElement("span");
      chip.className = "property-chip";
      chip.textContent = String(entry);
      list.appendChild(chip);
    });
    return list;
  }

  if (typeof value === "boolean") {
    const bool = document.createElement("span");
    bool.className = "property-bool";
    bool.textContent = value ? "☑ true" : "☐ false";
    return bool;
  }

  const text = document.createElement("span");
  const kind = inferFrontmatterKind(value);
  if (kind === "date") {
    text.textContent = formatDateValue(String(value || ""));
  } else if (kind === "datetime") {
    text.textContent = formatDateTimeValue(String(value || ""));
  } else {
    text.textContent = displayFrontmatterValue(value);
  }
  return text;
}

function renderPropertyTypeMenu(shell: HTMLElement, row: PropertyRow | null, options: RenderPagePropertiesOptions): void {
  const menu = document.createElement("div");
  menu.className = "property-type-menu";

  [
    ["text", "Text"],
    ["list", "List"],
    ["bool", "Checkbox"],
    ["date", "Date"],
    ["datetime", "Date & time"],
  ].forEach(function (parts) {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "property-type-option";
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

function renderExistingPropertyValueEditor(row: PropertyRow, options: RenderPagePropertiesOptions): HTMLElement {
  const kind = inferFrontmatterKind(row.rawValue);
  const value = document.createElement("div");
  value.className = "property-value property-inline-editor";

  if (kind === "list") {
    const listValue = Array.isArray(row.rawValue) ? row.rawValue : [];
    const chips = document.createElement("div");
    chips.className = "property-chip-list editable";
    listValue.forEach(function (entry, index) {
      const chip = document.createElement("span");
      chip.className = "property-chip";

      const label = document.createElement("span");
      label.textContent = String(entry);
      chip.appendChild(label);

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "property-chip-remove";
      remove.textContent = "×";
      remove.addEventListener("click", function () {
        const next = listValue.slice();
        next.splice(index, 1);
        options.onSaveExistingProperty(row.key, next).catch(function (error: Error) {
          options.onSetNoteStatus("Property save failed: " + error.message);
        });
      });
      chip.appendChild(remove);
      chips.appendChild(chip);
    });
    value.appendChild(chips);

    const addInput = document.createElement("input");
    addInput.type = "text";
    addInput.className = "property-inline-input";
    addInput.placeholder = "Add list item";
    addInput.addEventListener("keydown", function (event) {
      if (event.key === "Enter" || event.key === ",") {
        event.preventDefault();
        const nextValue = addInput.value.trim();
        if (!nextValue) {
          return;
        }
        options.onSaveExistingProperty(row.key, listValue.concat([nextValue])).catch(function (error: Error) {
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
  input.type = "text";
  input.value = kind === "date"
    ? formatEditableDateValue(String(row.rawValue || ""))
    : (kind === "datetime" ? formatEditableDateTimeValue(String(row.rawValue || "")) : String(row.rawValue || ""));
  input.placeholder = kind === "date"
    ? editableDatePlaceholder()
    : (kind === "datetime" ? editableDateTimePlaceholder() : "");

  const commit = function () {
    try {
      const rawValue = input.value;
      const nextValue = kind === "date"
        ? parseEditableDateValue(rawValue)
        : (kind === "datetime" ? parseEditableDateTimeValue(rawValue) : rawValue);
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
  const draft = options.propertyDraft || makePropertyDraft(row ? row.key : "", row ? row.rawValue : "", row ? row.key : "__new__");
  const item = document.createElement("div");
  item.className = "property-row editing";
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
  keyInput.placeholder = "property";
  keyInput.value = draft.key;
  keyInput.addEventListener("input", function () {
    options.onSetDraft({ ...draft, key: keyInput.value });
  });
  keyShell.appendChild(keyInput);

  const kindButton = document.createElement("button");
  kindButton.type = "button";
  kindButton.className = "property-kind-button";
  kindButton.textContent = draft.kind;
  kindButton.addEventListener("click", function () {
    options.onToggleTypeMenu(propertyMenuKey(row));
  });
  keyShell.appendChild(kindButton);

  if (options.propertyTypeMenuKey === propertyMenuKey(row)) {
    renderPropertyTypeMenu(keyShell, row, options);
  }

  const value = document.createElement("div");
  value.className = "property-value property-inline-editor";

  if (draft.kind === "list") {
    const chips = document.createElement("div");
    chips.className = "property-chip-list editable";
    draft.list.forEach(function (entry, index) {
      const chip = document.createElement("span");
      chip.className = "property-chip";

      const label = document.createElement("span");
      label.textContent = entry;
      chip.appendChild(label);

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "property-chip-remove";
      remove.textContent = "×";
      remove.addEventListener("click", function () {
        const nextList = draft.list.slice();
        nextList.splice(index, 1);
        options.onSetDraft({ ...draft, list: nextList });
        options.onRefresh();
      });
      chip.appendChild(remove);

      chips.appendChild(chip);
    });
    value.appendChild(chips);

    const addInput = document.createElement("input");
    addInput.type = "text";
    addInput.className = "property-inline-input";
    addInput.placeholder = "Add list item";
    addInput.addEventListener("keydown", function (event) {
      if (event.key === "Enter" || event.key === ",") {
        event.preventDefault();
        const next = addInput.value.trim();
        if (!next) {
          return;
        }
        options.onSetDraft({ ...draft, list: draft.list.concat([next]) });
        options.onRefresh();
      }
    });
    value.appendChild(addInput);
  } else if (draft.kind === "bool") {
    const boolLabel = document.createElement("label");
    boolLabel.className = "property-inline-bool";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = draft.text === "true";
    checkbox.addEventListener("change", function () {
      options.onSetDraft({ ...draft, text: checkbox.checked ? "true" : "false" });
    });
    boolLabel.appendChild(checkbox);
    value.appendChild(boolLabel);
  } else {
    const input = document.createElement("input");
    input.className = "property-inline-input";
    input.type = "text";
    input.value = String(draft.text || "");
    input.placeholder = draft.kind === "date"
      ? editableDatePlaceholder()
      : (draft.kind === "datetime" ? editableDateTimePlaceholder() : "");
    input.addEventListener("input", function () {
      options.onSetDraft({ ...draft, text: input.value });
    });
    value.appendChild(input);
  }

  const actions = document.createElement("div");
  actions.className = "property-row-actions";

  const save = document.createElement("button");
  save.type = "button";
  save.className = "property-action";
  save.textContent = "Save";
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
      const isListAdder = target instanceof HTMLInputElement && target.placeholder === "Add list item";
      if (isListAdder) {
        return;
      }
      if (target && target.classList.contains("property-kind-button")) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      commit();
    }
  });

  window.setTimeout(function () {
    const input = keyShell.querySelector<HTMLInputElement>(".property-inline-key");
    if (input) {
      input.focus();
      if (row) {
        input.setSelectionRange(0, input.value.length);
      }
    }
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
      if (value === null || value === "" || typeof value === "undefined") {
        return;
      }
      rows.push({
        key,
        value: Array.isArray(value) ? value.join(", ") : String(value),
        rawValue: value,
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
