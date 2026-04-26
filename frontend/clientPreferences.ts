import type { Preferences as ClientPreferences } from "./types";

export const clientPreferencesStorageKey = "noterious.client-preferences";

export function defaultClientPreferences(): ClientPreferences {
  return {
    hotkeys: {
      quickSwitcher: "Mod+K",
      globalSearch: "Mod+Shift+K",
      commandPalette: "Mod+Shift+P",
      quickNote: "",
      help: "?",
      saveCurrentPage: "Mod+S",
      toggleRawMode: "Mod+E",
      toggleTaskDone: "Mod+Enter",
    },
    ui: {
      fontFamily: "mono",
      fontSize: "16",
      dateTimeFormat: "browser",
    },
    vaults: {
      topLevelFoldersAsVaults: false,
    },
  };
}

export function cloneClientPreferences(input: ClientPreferences): ClientPreferences {
  return {
    hotkeys: {
      quickSwitcher: input.hotkeys.quickSwitcher,
      globalSearch: input.hotkeys.globalSearch,
      commandPalette: input.hotkeys.commandPalette,
      quickNote: input.hotkeys.quickNote,
      help: input.hotkeys.help,
      saveCurrentPage: input.hotkeys.saveCurrentPage,
      toggleRawMode: input.hotkeys.toggleRawMode,
      toggleTaskDone: input.hotkeys.toggleTaskDone,
    },
    ui: {
      fontFamily: input.ui.fontFamily,
      fontSize: input.ui.fontSize,
      dateTimeFormat: input.ui.dateTimeFormat,
    },
    vaults: {
      topLevelFoldersAsVaults: Boolean(input.vaults.topLevelFoldersAsVaults),
    },
  };
}

export function normalizeClientPreferences(input: unknown): ClientPreferences {
  const defaults = defaultClientPreferences();
  const source = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const hotkeysSource = source.hotkeys && typeof source.hotkeys === "object"
    ? source.hotkeys as Record<string, unknown>
    : {};
  const uiSource = source.ui && typeof source.ui === "object"
    ? source.ui as Record<string, unknown>
    : {};
  const vaultsSource = source.vaults && typeof source.vaults === "object"
    ? source.vaults as Record<string, unknown>
    : {};

  const fontFamily = String(uiSource.fontFamily ?? defaults.ui.fontFamily).trim();
  const fontSize = String(uiSource.fontSize ?? defaults.ui.fontSize).trim();
  const dateTimeFormat = String(uiSource.dateTimeFormat ?? defaults.ui.dateTimeFormat).trim();

  return {
    hotkeys: {
      quickSwitcher: typeof hotkeysSource.quickSwitcher === "string" ? hotkeysSource.quickSwitcher.trim() : defaults.hotkeys.quickSwitcher,
      globalSearch: typeof hotkeysSource.globalSearch === "string" ? hotkeysSource.globalSearch.trim() : defaults.hotkeys.globalSearch,
      commandPalette: typeof hotkeysSource.commandPalette === "string" ? hotkeysSource.commandPalette.trim() : defaults.hotkeys.commandPalette,
      quickNote: typeof hotkeysSource.quickNote === "string" ? hotkeysSource.quickNote.trim() : defaults.hotkeys.quickNote,
      help: typeof hotkeysSource.help === "string" ? hotkeysSource.help.trim() : defaults.hotkeys.help,
      saveCurrentPage: typeof hotkeysSource.saveCurrentPage === "string" ? hotkeysSource.saveCurrentPage.trim() : defaults.hotkeys.saveCurrentPage,
      toggleRawMode: typeof hotkeysSource.toggleRawMode === "string" ? hotkeysSource.toggleRawMode.trim() : defaults.hotkeys.toggleRawMode,
      toggleTaskDone: typeof hotkeysSource.toggleTaskDone === "string" ? hotkeysSource.toggleTaskDone.trim() : defaults.hotkeys.toggleTaskDone,
    },
    ui: {
      fontFamily: fontFamily === "sans" || fontFamily === "serif" ? fontFamily : "mono",
      fontSize: ["14", "15", "16", "17", "18", "19", "20"].includes(fontSize) ? fontSize : defaults.ui.fontSize,
      dateTimeFormat: dateTimeFormat === "iso" || dateTimeFormat === "de" ? dateTimeFormat : "browser",
    },
    vaults: {
      topLevelFoldersAsVaults: Boolean(vaultsSource.topLevelFoldersAsVaults),
    },
  };
}

export function loadStoredClientPreferences(): ClientPreferences {
  try {
    const raw = window.localStorage.getItem(clientPreferencesStorageKey);
    if (!raw) {
      return defaultClientPreferences();
    }
    return normalizeClientPreferences(JSON.parse(raw));
  } catch (_error) {
    return defaultClientPreferences();
  }
}

export function saveStoredClientPreferences(preferences: ClientPreferences): void {
  try {
    window.localStorage.setItem(clientPreferencesStorageKey, JSON.stringify(preferences));
  } catch (_error) {
    // Ignore storage failures and continue with in-memory preferences.
  }
}
