import type { AppSettings as SettingsModel, ThemeRecord } from "./types";

export type SettingsSection = "appearance" | "notifications" | "vault";

export interface SettingsUiState {
  settingsSection: SettingsSection;
  settingsLoaded: boolean;
  topLevelFoldersAsVaults: boolean;
  themeLibraryLoaded: boolean;
  themeLibrary: ThemeRecord[];
  settings: SettingsModel;
}

export interface SettingsUiElements {
  settingsEyebrow: HTMLElement;
  settingsTitle: HTMLElement;
  settingsNavAppearance: HTMLButtonElement;
  settingsNavNotifications: HTMLButtonElement;
  settingsNavVault: HTMLButtonElement;
  settingsGroupServer: HTMLElement;
  settingsGroupSession: HTMLElement;
  settingsGroupUserNotifications: HTMLElement;
  saveSettings: HTMLButtonElement;
  settingsVaultPath: HTMLInputElement;
  settingsNtfyInterval: HTMLInputElement;
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
  els.settingsGroupUserNotifications.classList.toggle("hidden", activeSection !== "notifications");
  els.settingsGroupServer.classList.toggle("hidden", activeSection !== "vault");
  els.saveSettings.classList.remove("hidden");
  els.saveSettings.textContent = "Save Settings";
}

export function renderSettingsForm(state: SettingsUiState, els: SettingsUiElements): void {
  renderSettingsModal(state, els);

  const serverFields: Array<HTMLInputElement | HTMLSelectElement> = [
    els.settingsVaultPath,
    els.settingsNtfyInterval,
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

  if (!state.settingsLoaded) {
    els.saveSettings.disabled = true;
    els.settingsStatus.textContent = "";
    return;
  }

  els.saveSettings.disabled = false;
  els.settingsVaultPath.value = state.settings.vault.vaultPath || "";
  els.settingsNtfyInterval.value = state.settings.notifications.ntfyInterval || "1m";
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
