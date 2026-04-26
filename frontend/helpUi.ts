import { clearNode } from "./dom";
import { hotkeyLabel } from "./hotkeys";
import type { Preferences as ClientPreferences } from "./types";

export interface HelpUiElements {
  helpShortcutCore: HTMLDivElement;
  helpShortcutEditor: HTMLDivElement;
}

function shortcutRow(label: string, hotkey: string): HTMLDivElement {
  const row = document.createElement("div");
  row.className = "shortcut-row";

  const title = document.createElement("span");
  title.textContent = label;
  row.appendChild(title);

  const keys = document.createElement("span");
  keys.className = "shortcut-keys";
  hotkeyLabel(hotkey).split("+").forEach(function (part) {
    const key = document.createElement("kbd");
    key.textContent = part;
    keys.appendChild(key);
  });
  row.appendChild(keys);
  return row;
}

export function renderHelpShortcuts(els: HelpUiElements, preferences: ClientPreferences): void {
  clearNode(els.helpShortcutCore);
  clearNode(els.helpShortcutEditor);

  [
    ["Quick Switcher", preferences.hotkeys.quickSwitcher],
    ["Full Search", preferences.hotkeys.globalSearch],
    ["Command Palette", preferences.hotkeys.commandPalette],
    ["Open Daily Note", preferences.hotkeys.quickNote],
    ["Back", "Alt+Left"],
    ["Forward", "Alt+Right"],
    ["Save Current Note", preferences.hotkeys.saveCurrentPage],
    ["Toggle Raw Mode", preferences.hotkeys.toggleRawMode],
    ["Open Help", preferences.hotkeys.help],
  ].forEach(function (entry) {
    els.helpShortcutCore.appendChild(shortcutRow(entry[0], entry[1]));
  });

  [
    ["Toggle Task Done", preferences.hotkeys.toggleTaskDone],
    ["Slash Commands", "/"],
    ["Open Link Under Caret", "Shift+Enter"],
    ["Close Menus or Modals", "Esc"],
  ].forEach(function (entry) {
    els.helpShortcutEditor.appendChild(shortcutRow(entry[0], entry[1]));
  });
}
