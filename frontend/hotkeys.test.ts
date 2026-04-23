import { describe, expect, it } from "vitest";

import { hotkeyLabel, matchesHotkey } from "./hotkeys";

describe("hotkeys", function () {
  it("formats labels for display", function () {
    expect(hotkeyLabel("Mod+Shift+K")).toBe("Ctrl+Shift+K");
    expect(hotkeyLabel("?")).toBe("?");
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
});
