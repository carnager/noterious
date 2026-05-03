import { describe, expect, it } from "vitest";

import {
  analyzeHotkeys,
  canonicalizeHotkey,
  defaultHotkeys,
  hotkeyDefaultGuidance,
  hotkeyFromEvent,
  hotkeyLabel,
  hotkeyProducesText,
  matchesHotkey,
} from "./hotkeys";

const macPlatform = {
  os: "mac",
  isMac: true,
} as const;

const windowsPlatform = {
  os: "windows",
  isMac: false,
} as const;

describe("hotkeys", function () {
  it("formats labels for display per platform", function () {
    expect(hotkeyLabel("Mod+Shift+K", windowsPlatform)).toBe("Ctrl+Shift+K");
    expect(hotkeyLabel("Mod+Shift+K", macPlatform)).toBe("Cmd+Shift+K");
    expect(hotkeyLabel("?")).toBe("?");
  });

  it("canonicalizes free-form bindings", function () {
    expect(canonicalizeHotkey(" shift + mod + k ")).toBe("Mod+Shift+K");
    expect(canonicalizeHotkey("comma")).toBe(",");
  });

  it("matches modifier hotkeys", function () {
    expect(matchesHotkey("Mod+K", {
      key: "k",
      metaKey: false,
      ctrlKey: true,
      altKey: false,
      shiftKey: false,
    })).toBe(true);
    expect(matchesHotkey("Mod+K", {
      key: "K",
      metaKey: false,
      ctrlKey: true,
      altKey: false,
      shiftKey: true,
    })).toBe(false);
  });

  it("allows symbol hotkeys like question mark", function () {
    expect(matchesHotkey("?", {
      key: "?",
      metaKey: false,
      ctrlKey: false,
      altKey: false,
      shiftKey: true,
    })).toBe(true);
  });

  it("captures bindings from keyboard events", function () {
    expect(hotkeyFromEvent({
      key: "L",
      metaKey: false,
      ctrlKey: true,
      altKey: false,
      shiftKey: true,
    }, windowsPlatform)).toBe("Mod+Shift+L");

    expect(hotkeyFromEvent({
      key: "k",
      metaKey: true,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
    }, macPlatform)).toBe("Mod+K");
  });

  it("chooses safer defaults than the old browser-colliding set", function () {
    const defaults = defaultHotkeys(windowsPlatform);
    expect(defaults.quickSwitcher).toBe("Mod+Shift+L");
    expect(defaults.globalSearch).toBe("Mod+Shift+F");
    expect(defaults.commandPalette).toBe("Mod+Shift+Y");
    expect(defaults.quickNote).toBe("Mod+Shift+D");
    expect(defaults.help).toBe("Mod+Shift+H");
    expect(defaults.toggleRawMode).toBe("Mod+E");
  });

  it("reports duplicate bindings and likely browser collisions", function () {
    const analysis = analyzeHotkeys({
      quickSwitcher: "Mod+K",
      globalSearch: "Mod+K",
      commandPalette: "Mod+Shift+Y",
      quickNote: "",
      help: "Mod+Shift+H",
      saveCurrentPage: "Mod+S",
      toggleRawMode: "Mod+E",
      toggleTaskDone: "Mod+Enter",
    }, windowsPlatform);

    expect(analysis.quickSwitcher.duplicateIDs).toEqual(["globalSearch"]);
    expect(analysis.globalSearch.duplicateIDs).toEqual(["quickSwitcher"]);
    expect(analysis.quickSwitcher.browserWarning).toContain("address bar");
    expect(analysis.commandPalette.browserWarning).toBe("");
  });

  it("describes defaults based on whether the current binding is already safe", function () {
    const defaults = analyzeHotkeys({
      quickSwitcher: "Mod+Shift+L",
      globalSearch: "Mod+Alt+F",
      commandPalette: "Mod+Shift+P",
      quickNote: "Mod+Shift+D",
      help: "Mod+Shift+H",
      saveCurrentPage: "Mod+S",
      toggleRawMode: "Mod+E",
      toggleTaskDone: "Mod+Enter",
    }, windowsPlatform);

    expect(hotkeyDefaultGuidance(defaults.quickSwitcher, windowsPlatform)).toBe("Default: Ctrl+Shift+L.");
    expect(hotkeyDefaultGuidance(defaults.globalSearch, windowsPlatform)).toBe("Built-in default: Ctrl+Shift+F.");
    expect(hotkeyDefaultGuidance(defaults.commandPalette, windowsPlatform)).toBe("Safer default: Ctrl+Shift+Y.");
    expect(hotkeyDefaultGuidance(defaults.quickNote, windowsPlatform)).toBe("Default: Ctrl+Shift+D.");
    expect(hotkeyDefaultGuidance(defaults.help, windowsPlatform)).toBe("Default: Ctrl+Shift+H.");
    expect(hotkeyDefaultGuidance(defaults.toggleRawMode, windowsPlatform)).toBe("Default: Ctrl+E.");
  });

  it("recognizes which hotkeys would type text in an editor", function () {
    expect(hotkeyProducesText("?")).toBe(true);
    expect(hotkeyProducesText("Enter")).toBe(true);
    expect(hotkeyProducesText("Mod+Shift+?")).toBe(false);
    expect(hotkeyProducesText("F1")).toBe(false);
  });
});
