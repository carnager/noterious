import { cloneNoteTemplates, normalizeNoteTemplates } from "./noteTemplates";
import { canonicalizeHotkey, defaultHotkeys } from "./hotkeys";
import type { Preferences as ClientPreferences } from "./types";

export const clientPreferencesStorageKey = "noterious.client-preferences";

const legacyDefaultHotkeyValues = {
  quickSwitcher: "Mod+K",
  globalSearch: "Mod+Shift+K",
  commandPalette: "Mod+Shift+P",
  quickNote: "",
  help: "?",
  saveCurrentPage: "Mod+S",
  toggleRawMode: "Mod+E",
  toggleTaskDone: "Mod+Enter",
};

function usesLegacyDefaultHotkeys(hotkeys: ClientPreferences["hotkeys"]): boolean {
  return Object.entries(legacyDefaultHotkeyValues).every(function ([key, value]) {
    const hotkeyID = key as keyof ClientPreferences["hotkeys"];
    return canonicalizeHotkey(hotkeys[hotkeyID]) === canonicalizeHotkey(value);
  });
}

export function defaultClientPreferences(): ClientPreferences {
  return {
    hotkeys: defaultHotkeys(),
    ui: {
      fontFamily: "mono",
      fontSize: "16",
      dateTimeFormat: "browser",
      themeId: "noterious-night",
    },
    vaults: {
      topLevelFoldersAsVaults: false,
      rootHomePage: "",
      scopeHomePages: {},
    },
    templates: [],
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
      themeId: input.ui.themeId,
    },
    vaults: {
      topLevelFoldersAsVaults: Boolean(input.vaults.topLevelFoldersAsVaults),
      rootHomePage: String(input.vaults.rootHomePage || "").trim(),
      scopeHomePages: Object.fromEntries(
        Object.entries(input.vaults.scopeHomePages || {}).map(function ([key, value]) {
          return [String(key || "").trim(), String(value || "").trim()];
        }).filter(function ([key, value]) {
          return Boolean(key || value);
        })
      ),
    },
    templates: cloneNoteTemplates(input.templates),
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
  const templatesSource = Array.isArray(source.templates) ? source.templates : [];
  const scopeHomePagesSource = vaultsSource.scopeHomePages && typeof vaultsSource.scopeHomePages === "object"
    ? vaultsSource.scopeHomePages as Record<string, unknown>
    : {};

  const fontFamily = String(uiSource.fontFamily ?? defaults.ui.fontFamily).trim();
  const fontSize = String(uiSource.fontSize ?? defaults.ui.fontSize).trim();
  const dateTimeFormat = String(uiSource.dateTimeFormat ?? defaults.ui.dateTimeFormat).trim();
  const themeId = String(uiSource.themeId ?? defaults.ui.themeId).trim();
  const normalizedHotkeys = {
    quickSwitcher: typeof hotkeysSource.quickSwitcher === "string" ? canonicalizeHotkey(hotkeysSource.quickSwitcher) : defaults.hotkeys.quickSwitcher,
    globalSearch: typeof hotkeysSource.globalSearch === "string" ? canonicalizeHotkey(hotkeysSource.globalSearch) : defaults.hotkeys.globalSearch,
    commandPalette: typeof hotkeysSource.commandPalette === "string" ? canonicalizeHotkey(hotkeysSource.commandPalette) : defaults.hotkeys.commandPalette,
    quickNote: typeof hotkeysSource.quickNote === "string" ? canonicalizeHotkey(hotkeysSource.quickNote) : defaults.hotkeys.quickNote,
    help: typeof hotkeysSource.help === "string" ? canonicalizeHotkey(hotkeysSource.help) : defaults.hotkeys.help,
    saveCurrentPage: typeof hotkeysSource.saveCurrentPage === "string" ? canonicalizeHotkey(hotkeysSource.saveCurrentPage) : defaults.hotkeys.saveCurrentPage,
    toggleRawMode: typeof hotkeysSource.toggleRawMode === "string" ? canonicalizeHotkey(hotkeysSource.toggleRawMode) : defaults.hotkeys.toggleRawMode,
    toggleTaskDone: typeof hotkeysSource.toggleTaskDone === "string" ? canonicalizeHotkey(hotkeysSource.toggleTaskDone) : defaults.hotkeys.toggleTaskDone,
  };

  return {
    hotkeys: usesLegacyDefaultHotkeys(normalizedHotkeys) ? defaultHotkeys() : normalizedHotkeys,
    ui: {
      fontFamily: fontFamily === "sans" || fontFamily === "serif" ? fontFamily : "mono",
      fontSize: ["14", "15", "16", "17", "18", "19", "20"].includes(fontSize) ? fontSize : defaults.ui.fontSize,
      dateTimeFormat: dateTimeFormat === "iso" || dateTimeFormat === "de" ? dateTimeFormat : "browser",
      themeId: themeId || defaults.ui.themeId,
    },
    vaults: {
      topLevelFoldersAsVaults: Boolean(vaultsSource.topLevelFoldersAsVaults),
      rootHomePage: typeof vaultsSource.rootHomePage === "string" ? vaultsSource.rootHomePage.trim() : "",
      scopeHomePages: Object.fromEntries(
        Object.entries(scopeHomePagesSource).map(function ([key, value]) {
          return [String(key || "").trim(), String(value || "").trim()];
        }).filter(function ([key, value]) {
          return Boolean(key || value);
        })
      ),
    },
    templates: normalizeNoteTemplates(templatesSource),
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
