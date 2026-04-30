import { clearNode } from "./dom";
import { analyzeHotkeys, detectHotkeyPlatform, hotkeyDefinitions, hotkeyDefaultGuidance } from "./hotkeys";
import type { AppSettings as SettingsModel, FrontmatterKind, MetaResponse, NoteTemplate, NoteTemplateField, ThemeRecord } from "./types";
import type { Hotkeys } from "./types";

export type SettingsSection = "appearance" | "templates" | "notifications" | "vault";

export interface SettingsUiState {
  settingsSection: SettingsSection;
  settingsLoaded: boolean;
  topLevelFoldersAsVaults: boolean;
  themeLibraryLoaded: boolean;
  themeLibrary: ThemeRecord[];
  settingsTemplateDrafts: NoteTemplate[];
  settings: SettingsModel;
  serverMeta: MetaResponse | null;
}

export interface SettingsUiElements {
  settingsEyebrow: HTMLElement;
  settingsTitle: HTMLElement;
  settingsNavAppearance: HTMLButtonElement;
  settingsNavTemplates: HTMLButtonElement;
  settingsNavNotifications: HTMLButtonElement;
  settingsNavVault: HTMLButtonElement;
  settingsGroupServer: HTMLElement;
  settingsGroupSession: HTMLElement;
  settingsGroupTemplates: HTMLElement;
  settingsGroupUserNotifications: HTMLElement;
  saveSettings: HTMLButtonElement;
  settingsVaultPath: HTMLInputElement;
  settingsNtfyInterval: HTMLInputElement;
  settingsBackupVaultPath: HTMLInputElement;
  settingsBackupDataDir: HTMLInputElement;
  settingsBackupDatabase: HTMLInputElement;
  settingsBackupDownload: HTMLButtonElement;
  settingsBackupNote: HTMLElement;
  settingsUserNtfyTopicUrl: HTMLInputElement;
  settingsUserNtfyToken: HTMLInputElement;
  settingsUserTopLevelVaults: HTMLInputElement;
  settingsFontFamily: HTMLSelectElement;
  settingsFontSize: HTMLSelectElement;
  settingsDateTimeFormat: HTMLSelectElement;
  settingsTheme: HTMLSelectElement;
  settingsThemeUpload: HTMLButtonElement;
  settingsThemeDelete: HTMLButtonElement;
  settingsThemeUploadInput: HTMLInputElement;
  settingsThemeHelp: HTMLElement;
  settingsQuickSwitcher: HTMLInputElement;
  settingsGlobalSearch: HTMLInputElement;
  settingsCommandPalette: HTMLInputElement;
  settingsQuickNote: HTMLInputElement;
  settingsHelp: HTMLInputElement;
  settingsSaveCurrentPage: HTMLInputElement;
  settingsToggleRawMode: HTMLInputElement;
  settingsToggleTaskDone: HTMLInputElement;
  settingsTemplateList: HTMLDivElement;
  settingsTemplateAdd: HTMLButtonElement;
  settingsTemplateHelp: HTMLElement;
  settingsStatus: HTMLElement;
}

export function defaultSettingsSection(): SettingsSection {
  return "appearance";
}

export function availableSettingsSections(): SettingsSection[] {
  return ["appearance", "notifications", "vault"];
}

export function normalizeSettingsSection(state: SettingsUiState): void {
  if (!availableSettingsSections().includes(state.settingsSection)) {
    state.settingsSection = defaultSettingsSection();
  }
}

export function renderSettingsModal(state: SettingsUiState, els: SettingsUiElements): void {
  normalizeSettingsSection(state);

  els.settingsEyebrow.textContent = "";
  els.settingsTitle.textContent = "Settings";

  const activeSection = state.settingsSection;
  const navButtons: Array<{ button: HTMLButtonElement; section: SettingsSection }> = [
    { button: els.settingsNavAppearance, section: "appearance" },
    { button: els.settingsNavTemplates, section: "templates" },
    { button: els.settingsNavNotifications, section: "notifications" },
    { button: els.settingsNavVault, section: "vault" },
  ];

  navButtons.forEach(function (entry) {
    const visible = availableSettingsSections().includes(entry.section);
    entry.button.classList.toggle("hidden", !visible);
    entry.button.classList.toggle("active", visible && activeSection === entry.section);
    entry.button.setAttribute("aria-current", visible && activeSection === entry.section ? "page" : "false");
  });

  els.settingsGroupSession.classList.toggle("hidden", activeSection !== "appearance");
  els.settingsGroupTemplates.classList.toggle("hidden", activeSection !== "templates");
  els.settingsGroupUserNotifications.classList.toggle("hidden", activeSection !== "notifications");
  els.settingsGroupServer.classList.toggle("hidden", activeSection !== "vault");
  els.saveSettings.classList.remove("hidden");
  els.saveSettings.textContent = "Save Settings";
}

function templateFieldDefaultValue(field: NoteTemplateField): string {
  if (field.kind === "bool") {
    return Boolean(field.defaultValue) ? "true" : "false";
  }
  if (field.kind === "list" || field.kind === "tags") {
    return Array.isArray(field.defaultValue) ? field.defaultValue.join(", ") : "";
  }
  return String(field.defaultValue || "");
}

function templateDefaultPlaceholder(kind: FrontmatterKind): string {
  if (kind === "tags") {
    return "client, berlin";
  }
  if (kind === "list") {
    return "work, private";
  }
  if (kind === "bool") {
    return "Unchecked by default";
  }
  if (kind === "date") {
    return "{{title}} or 2026-04-27";
  }
  if (kind === "datetime") {
    return "2026-04-27 09:00";
  }
  if (kind === "notification") {
    return "2026-04-27 09:00";
  }
  return "{{title}}";
}

function renderTemplateDefaultInput(field: NoteTemplateField, templateID: string, fieldIndex: number): HTMLElement {
  if (field.kind === "bool") {
    const row = document.createElement("label");
    row.className = "settings-template-checkbox";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = Boolean(field.defaultValue);
    checkbox.setAttribute("data-template-id", templateID);
    checkbox.setAttribute("data-template-field-index", String(fieldIndex));
    checkbox.setAttribute("data-template-field-input", "default-bool");
    row.appendChild(checkbox);

    const label = document.createElement("span");
    label.textContent = "Checked by default";
    row.appendChild(label);
    return row;
  }

  const input = document.createElement("input");
  input.type = "text";
  input.className = "settings-template-default-input";
  input.value = templateFieldDefaultValue(field);
  input.placeholder = templateDefaultPlaceholder(field.kind);
  input.autocomplete = "off";
  input.setAttribute("autocorrect", "off");
  input.setAttribute("autocapitalize", "none");
  input.spellcheck = false;
  input.setAttribute("data-template-id", templateID);
  input.setAttribute("data-template-field-index", String(fieldIndex));
  input.setAttribute("data-template-field-input", "default");
  return input;
}

function renderTemplateDrafts(state: SettingsUiState, els: SettingsUiElements): void {
  clearNode(els.settingsTemplateList);

  const templates = Array.isArray(state.settingsTemplateDrafts) ? state.settingsTemplateDrafts : [];
  els.settingsTemplateHelp.textContent = "Templates appear in the quick switcher when you type a new note name. Use {{title}} inside defaults to reuse the page title.";

  if (!templates.length) {
    const empty = document.createElement("div");
    empty.className = "settings-template-empty";
    empty.textContent = "No templates yet. Add one for contacts, meeting notes, or any recurring note shape.";
    els.settingsTemplateList.appendChild(empty);
    return;
  }

  templates.forEach(function (template) {
    const card = document.createElement("section");
    card.className = "settings-template-card";
    card.setAttribute("data-template-id", template.id);

    const head = document.createElement("div");
    head.className = "settings-template-head";

    const title = document.createElement("div");
    title.className = "settings-template-title";

    const strong = document.createElement("strong");
    strong.textContent = template.name || "Untitled template";
    title.appendChild(strong);

    const meta = document.createElement("span");
    meta.textContent = template.folder
      ? ("Creates notes under " + template.folder + "/")
      : "Creates notes wherever you type them.";
    title.appendChild(meta);
    head.appendChild(title);

    const removeTemplate = document.createElement("button");
    removeTemplate.type = "button";
    removeTemplate.className = "settings-template-remove";
    removeTemplate.textContent = "Remove";
    removeTemplate.setAttribute("data-template-action", "remove-template");
    removeTemplate.setAttribute("data-template-id", template.id);
    head.appendChild(removeTemplate);

    card.appendChild(head);

    const shell = document.createElement("div");
    shell.className = "modal-fields settings-template-shell";

    const nameField = document.createElement("label");
    nameField.className = "search";
    const nameLabel = document.createElement("span");
    nameLabel.textContent = "Template Name";
    nameField.appendChild(nameLabel);
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.value = template.name || "";
    nameInput.placeholder = "Contact";
    nameInput.autocomplete = "off";
    nameInput.setAttribute("autocorrect", "off");
    nameInput.setAttribute("autocapitalize", "words");
    nameInput.spellcheck = false;
    nameInput.setAttribute("data-template-id", template.id);
    nameInput.setAttribute("data-template-input", "name");
    nameField.appendChild(nameInput);
    shell.appendChild(nameField);

    const folderField = document.createElement("label");
    folderField.className = "search";
    const folderLabel = document.createElement("span");
    folderLabel.textContent = "Folder";
    folderField.appendChild(folderLabel);
    const folderInput = document.createElement("input");
    folderInput.type = "text";
    folderInput.value = template.folder || "";
    folderInput.placeholder = "contacts";
    folderInput.autocomplete = "off";
    folderInput.setAttribute("autocorrect", "off");
    folderInput.setAttribute("autocapitalize", "none");
    folderInput.spellcheck = false;
    folderInput.setAttribute("data-template-id", template.id);
    folderInput.setAttribute("data-template-input", "folder");
    folderField.appendChild(folderInput);
    shell.appendChild(folderField);

    const fieldsBlock = document.createElement("div");
    fieldsBlock.className = "modal-field-wide settings-template-fields";

    const fieldsTitle = document.createElement("div");
    fieldsTitle.className = "settings-template-fields-head";
    const fieldsStrong = document.createElement("strong");
    fieldsStrong.textContent = "Properties";
    fieldsTitle.appendChild(fieldsStrong);
    const fieldsCopy = document.createElement("span");
    fieldsCopy.textContent = "Choose the frontmatter keys and types this template should create.";
    fieldsTitle.appendChild(fieldsCopy);
    fieldsBlock.appendChild(fieldsTitle);

    const fieldList = document.createElement("div");
    fieldList.className = "settings-template-field-list";
    if (!template.fields.length) {
      const empty = document.createElement("div");
      empty.className = "settings-template-field-empty";
      empty.textContent = "No properties yet.";
      fieldList.appendChild(empty);
    } else {
      template.fields.forEach(function (field, fieldIndex) {
        const row = document.createElement("div");
        row.className = "settings-template-field-row";
        row.setAttribute("data-template-id", template.id);
        row.setAttribute("data-template-field-index", String(fieldIndex));

        const keyInput = document.createElement("input");
        keyInput.type = "text";
        keyInput.className = "settings-template-field-key";
        keyInput.value = field.key || "";
        keyInput.placeholder = "vorname";
        keyInput.autocomplete = "off";
        keyInput.setAttribute("autocorrect", "off");
        keyInput.setAttribute("autocapitalize", "none");
        keyInput.spellcheck = false;
        keyInput.setAttribute("data-template-id", template.id);
        keyInput.setAttribute("data-template-field-index", String(fieldIndex));
        keyInput.setAttribute("data-template-field-input", "key");
        row.appendChild(keyInput);

        const kindSelect = document.createElement("select");
        kindSelect.className = "settings-template-field-kind";
        kindSelect.setAttribute("data-template-id", template.id);
        kindSelect.setAttribute("data-template-field-index", String(fieldIndex));
        kindSelect.setAttribute("data-template-field-input", "kind");
        [
          ["text", "Text"],
          ["tags", "Tags"],
          ["list", "List"],
          ["bool", "Checkbox"],
          ["date", "Date"],
          ["datetime", "Date & time"],
          ["notification", "Notification"],
        ].forEach(function ([value, label]) {
          const option = document.createElement("option");
          option.value = value;
          option.textContent = label;
          if (field.kind === value) {
            option.selected = true;
          }
          kindSelect.appendChild(option);
        });
        row.appendChild(kindSelect);

        row.appendChild(renderTemplateDefaultInput(field, template.id, fieldIndex));

        const removeField = document.createElement("button");
        removeField.type = "button";
        removeField.className = "settings-template-field-remove";
        removeField.textContent = "×";
        removeField.title = "Remove property";
        removeField.setAttribute("aria-label", "Remove property");
        removeField.setAttribute("data-template-action", "remove-field");
        removeField.setAttribute("data-template-id", template.id);
        removeField.setAttribute("data-template-field-index", String(fieldIndex));
        row.appendChild(removeField);

        fieldList.appendChild(row);
      });
    }
    fieldsBlock.appendChild(fieldList);

    const addField = document.createElement("button");
    addField.type = "button";
    addField.className = "settings-template-add-field";
    addField.textContent = "Add Property";
    addField.setAttribute("data-template-action", "add-field");
    addField.setAttribute("data-template-id", template.id);
    fieldsBlock.appendChild(addField);

    shell.appendChild(fieldsBlock);
    card.appendChild(shell);
    els.settingsTemplateList.appendChild(card);
  });
}

export function renderSettingsForm(state: SettingsUiState, els: SettingsUiElements): void {
  renderSettingsModal(state, els);

  const serverFields: Array<HTMLInputElement | HTMLSelectElement | HTMLButtonElement> = [
    els.settingsVaultPath,
    els.settingsNtfyInterval,
    els.settingsBackupDownload,
  ];
  const userFields: Array<HTMLInputElement | HTMLSelectElement> = [
    els.settingsUserNtfyTopicUrl,
    els.settingsUserNtfyToken,
    els.settingsUserTopLevelVaults,
    els.settingsFontFamily,
    els.settingsFontSize,
    els.settingsDateTimeFormat,
    els.settingsTheme,
    els.settingsQuickSwitcher,
    els.settingsGlobalSearch,
    els.settingsCommandPalette,
    els.settingsQuickNote,
    els.settingsHelp,
    els.settingsSaveCurrentPage,
    els.settingsToggleRawMode,
    els.settingsToggleTaskDone,
  ];

  serverFields.forEach(function (field) {
    field.disabled = !state.settingsLoaded;
  });
  userFields.forEach(function (field) {
    field.disabled = false;
  });
  els.settingsThemeUpload.disabled = false;
  els.settingsThemeDelete.disabled = false;
  els.settingsTemplateAdd.disabled = !state.settingsLoaded;
  renderTemplateDrafts(state, els);

  if (!state.settingsLoaded) {
    els.saveSettings.disabled = true;
    els.settingsStatus.textContent = "";
    return;
  }

  els.saveSettings.disabled = false;
  els.settingsVaultPath.value = state.settings.vault.vaultPath || "";
  els.settingsNtfyInterval.value = state.settings.notifications.ntfyInterval || "1m";
  const runtimeVaultPath = state.serverMeta && state.serverMeta.runtimeVault
    ? String(state.serverMeta.runtimeVault.vaultPath || "").trim()
    : "";
  const dataDir = state.serverMeta ? String(state.serverMeta.dataDir || "").trim() : "";
  const database = state.serverMeta ? String(state.serverMeta.database || "").trim() : "";
  els.settingsBackupVaultPath.value = runtimeVaultPath || "(unknown)";
  els.settingsBackupDataDir.value = dataDir || "(unknown)";
  els.settingsBackupDatabase.value = database || "(unknown)";
  els.settingsBackupDownload.disabled = !state.serverMeta;
  els.settingsBackupNote.textContent = database
    ? "Back up the vault root and the full data dir. The SQLite index can be rebuilt, but page history, trash, themes, auth state, and other server-managed files live under the data dir."
    : "Back up the vault root and the full data dir. The vault is not the whole deployment state.";
  els.settingsUserNtfyTopicUrl.value = state.settings.userNotifications.ntfyTopicUrl || "";
  els.settingsUserNtfyToken.value = state.settings.userNotifications.ntfyToken || "";
  els.settingsUserTopLevelVaults.checked = state.topLevelFoldersAsVaults;
  renderThemeOptions(state, els);
  els.settingsFontFamily.value = state.settings.preferences.ui.fontFamily || "mono";
  els.settingsFontSize.value = state.settings.preferences.ui.fontSize || "16";
  els.settingsDateTimeFormat.value = state.settings.preferences.ui.dateTimeFormat || "browser";
  els.settingsTheme.value = state.settings.preferences.ui.themeId || "noterious-night";
  const selectedTheme = state.themeLibrary.find(function (theme) {
    return theme.id === els.settingsTheme.value;
  }) || null;
  const themeControlsDisabled = !state.themeLibraryLoaded && state.themeLibrary.length === 0;
  els.settingsTheme.disabled = themeControlsDisabled;
  els.settingsThemeUpload.disabled = themeControlsDisabled;
  els.settingsThemeDelete.disabled = themeControlsDisabled || !selectedTheme || selectedTheme.source !== "custom";
  els.settingsThemeHelp.textContent = "Built-in themes are always available. Upload JSON token themes to add custom ones.";
  els.settingsQuickSwitcher.value = state.settings.preferences.hotkeys.quickSwitcher || "";
  els.settingsGlobalSearch.value = state.settings.preferences.hotkeys.globalSearch || "";
  els.settingsCommandPalette.value = state.settings.preferences.hotkeys.commandPalette || "";
  els.settingsQuickNote.value = state.settings.preferences.hotkeys.quickNote || "";
  els.settingsHelp.value = state.settings.preferences.hotkeys.help || "";
  els.settingsSaveCurrentPage.value = state.settings.preferences.hotkeys.saveCurrentPage || "";
  els.settingsToggleRawMode.value = state.settings.preferences.hotkeys.toggleRawMode || "";
  els.settingsToggleTaskDone.value = state.settings.preferences.hotkeys.toggleTaskDone || "";
  renderSettingsHotkeyHints(els, state.settings.preferences.hotkeys);
}

function hotkeyInputByID(els: SettingsUiElements, hotkeyID: keyof Hotkeys): HTMLInputElement {
  switch (hotkeyID) {
    case "quickSwitcher":
      return els.settingsQuickSwitcher;
    case "globalSearch":
      return els.settingsGlobalSearch;
    case "commandPalette":
      return els.settingsCommandPalette;
    case "quickNote":
      return els.settingsQuickNote;
    case "help":
      return els.settingsHelp;
    case "saveCurrentPage":
      return els.settingsSaveCurrentPage;
    case "toggleRawMode":
      return els.settingsToggleRawMode;
    case "toggleTaskDone":
      return els.settingsToggleTaskDone;
  }
}

function ensureHotkeyHintNode(input: HTMLInputElement): HTMLParagraphElement | null {
  const container = input.closest("label");
  if (!container) {
    return null;
  }
  let hint = container.querySelector(".settings-hotkey-meta") as HTMLParagraphElement | null;
  if (!hint) {
    hint = document.createElement("p");
    hint.className = "settings-hotkey-meta";
    container.appendChild(hint);
  }
  return hint;
}

export function renderSettingsHotkeyHints(els: SettingsUiElements, hotkeys: Hotkeys): void {
  const platform = detectHotkeyPlatform();
  const analysis = analyzeHotkeys(hotkeys, platform);

  hotkeyDefinitions().forEach(function (definition) {
    const input = hotkeyInputByID(els, definition.id);
    const hint = ensureHotkeyHintNode(input);
    const entry = analysis[definition.id];
    const lines = [
      definition.optional
        ? "Optional. Press a shortcut to record it, or type it manually if the browser steals the combo."
        : "Press a shortcut to record it, or type it manually if the browser steals the combo.",
      hotkeyDefaultGuidance(entry, platform),
    ];

    let severity = "";
    if (entry.blockedReason) {
      lines.push(entry.blockedReason);
      severity = "danger";
    } else if (entry.browserWarning) {
      lines.push(entry.browserWarning);
      severity = "warn";
    }

    input.placeholder = definition.optional ? "Not set" : "Press shortcut";
    input.classList.add("settings-hotkey-input");
    input.title = lines.join(" ");
    if (severity) {
      input.dataset.severity = severity;
    } else {
      delete input.dataset.severity;
    }

    if (!hint) {
      return;
    }
    hint.textContent = lines.join(" ");
    hint.dataset.severity = severity;
  });
}

function renderThemeOptions(state: SettingsUiState, els: SettingsUiElements): void {
  const selectedValue = els.settingsTheme.value || state.settings.preferences.ui.themeId || "noterious-night";
  els.settingsTheme.textContent = "";
  const themes = Array.isArray(state.themeLibrary) ? state.themeLibrary.slice() : [];
  themes.sort(function (left, right) {
    if (left.source !== right.source) {
      return left.source === "builtin" ? -1 : 1;
    }
    return left.name.localeCompare(right.name);
  });
  themes.forEach(function (theme) {
    const option = document.createElement("option");
    option.value = theme.id;
    option.textContent = theme.source === "custom" ? theme.name + " (Custom)" : theme.name;
    els.settingsTheme.appendChild(option);
  });
  if (themes.length === 0) {
    const option = document.createElement("option");
    option.value = "noterious-night";
    option.textContent = "Noterious Night";
    els.settingsTheme.appendChild(option);
  }
  els.settingsTheme.value = themes.some(function (theme) {
    return theme.id === selectedValue;
  }) ? selectedValue : "noterious-night";
}
