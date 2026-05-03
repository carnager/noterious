import type { Hotkeys } from "./types";

export interface HotkeyEvent {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

export type HotkeyID = keyof Hotkeys;
export type HotkeyScope = "global" | "editor";
export type HotkeyOS = "mac" | "windows" | "linux" | "other";

export interface HotkeyPlatform {
  os: HotkeyOS;
  isMac: boolean;
}

export interface HotkeyDefinition {
  id: HotkeyID;
  label: string;
  scope: HotkeyScope;
  optional: boolean;
  defaultCandidates: string[];
}

export interface HotkeyAnalysisEntry {
  definition: HotkeyDefinition;
  binding: string;
  duplicateIDs: HotkeyID[];
  browserWarning: string;
  defaultBinding: string;
  blockedReason: string;
  isSafeBinding: boolean;
  usesDefaultBinding: boolean;
}

const hotkeyDefinitionsByID: Record<HotkeyID, HotkeyDefinition> = {
  quickSwitcher: {
    id: "quickSwitcher",
    label: "Quick Switcher",
    scope: "global",
    optional: false,
    defaultCandidates: ["Mod+Shift+L", "Mod+.", "Mod+K"],
  },
  globalSearch: {
    id: "globalSearch",
    label: "Full Search",
    scope: "global",
    optional: false,
    defaultCandidates: ["Mod+Shift+F", "Mod+Shift+K"],
  },
  commandPalette: {
    id: "commandPalette",
    label: "Command Palette",
    scope: "global",
    optional: false,
    defaultCandidates: ["Mod+Shift+Y", "Mod+Shift+P"],
  },
  quickNote: {
    id: "quickNote",
    label: "Open Daily Note",
    scope: "global",
    optional: true,
    defaultCandidates: ["Mod+Shift+D", ""],
  },
  help: {
    id: "help",
    label: "Open Help",
    scope: "global",
    optional: false,
    defaultCandidates: ["Mod+Shift+H", "F1"],
  },
  saveCurrentPage: {
    id: "saveCurrentPage",
    label: "Save Current Note",
    scope: "global",
    optional: false,
    defaultCandidates: ["Mod+S"],
  },
  toggleRawMode: {
    id: "toggleRawMode",
    label: "Toggle Raw Mode",
    scope: "global",
    optional: false,
    defaultCandidates: ["Mod+E", "Mod+Shift+E"],
  },
  toggleTaskDone: {
    id: "toggleTaskDone",
    label: "Toggle Task Done",
    scope: "editor",
    optional: false,
    defaultCandidates: ["Mod+Enter"],
  },
};

const hotkeyOrder: HotkeyID[] = [
  "quickSwitcher",
  "globalSearch",
  "commandPalette",
  "quickNote",
  "help",
  "saveCurrentPage",
  "toggleRawMode",
  "toggleTaskDone",
];

const modifierKeys = new Set(["mod", "meta", "ctrl", "alt", "shift"]);

const shiftedSymbolKeys = new Set([
  "?",
  "!",
  "@",
  "#",
  "$",
  "%",
  "^",
  "&",
  "*",
  "(",
  ")",
  "_",
  "+",
  "{",
  "}",
  "|",
  ":",
  "\"",
  "<",
  ">",
  "~",
]);

const reservedHotkeys: Array<{
  bindings: string[];
  message: string;
  os?: HotkeyOS[];
}> = [
  {
    bindings: ["Mod+K", "Mod+L"],
    message: "Common browser shortcut for focusing the address bar or search field.",
  },
  {
    bindings: ["Mod+T", "Mod+W", "Mod+N", "Mod+Shift+N", "Mod+Shift+T"],
    message: "Common browser shortcut for opening, closing, or restoring tabs and windows.",
  },
  {
    bindings: ["Mod+F", "Mod+G", "Mod+Shift+G", "Mod+H", "Mod+J", "Mod+Y"],
    message: "Common browser shortcut for find, history, or downloads.",
  },
  {
    bindings: ["Mod+R", "Mod+Shift+R", "F5"],
    message: "Common browser shortcut for reload or hard refresh.",
  },
  {
    bindings: ["Mod+O", "Mod+P"],
    message: "Common browser shortcut for open file or print.",
  },
  {
    bindings: ["Mod+Shift+P", "Mod+Shift+A", "Mod+Shift+C", "Mod+Shift+I", "Mod+Shift+J", "Mod+Shift+K"],
    message: "Common browser shortcut for private windows, extensions, or developer tools.",
  },
  {
    bindings: ["Mod+Comma", "Mod+,"],
    message: "Common macOS/browser shortcut for preferences.",
    os: ["mac"],
  },
  {
    bindings: ["Mod+Q"],
    message: "Common macOS shortcut for quitting the browser.",
    os: ["mac"],
  },
];

function normalizeToken(token: string): string {
  return String(token || "").trim().toLowerCase();
}

function normalizeKeyName(value: string): string {
  const token = normalizeToken(value);
  switch (token) {
    case "mod":
      return "mod";
    case "cmd":
    case "command":
    case "meta":
      return "meta";
    case "ctrl":
    case "control":
      return "ctrl";
    case "alt":
    case "option":
      return "alt";
    case "shift":
      return "shift";
    case "esc":
      return "escape";
    case "return":
      return "enter";
    case "spacebar":
    case "space":
      return "space";
    case "left":
      return "arrowleft";
    case "right":
      return "arrowright";
    case "up":
      return "arrowup";
    case "down":
      return "arrowdown";
    case "slash":
      return "/";
    case "question":
      return "?";
    case "period":
      return ".";
    case "comma":
      return ",";
    case "semicolon":
      return ";";
    case "colon":
      return ":";
    case "apostrophe":
    case "quote":
      return "'";
    case "doublequote":
      return "\"";
    case "backquote":
      return "`";
    default:
      return token;
  }
}

function formatKeyToken(value: string): string {
  const token = normalizeKeyName(value);
  switch (token) {
    case "mod":
      return "Mod";
    case "meta":
      return "Meta";
    case "ctrl":
      return "Ctrl";
    case "alt":
      return "Alt";
    case "shift":
      return "Shift";
    case "escape":
      return "Escape";
    case "enter":
      return "Enter";
    case "space":
      return "Space";
    case "tab":
      return "Tab";
    case "backspace":
      return "Backspace";
    case "delete":
      return "Delete";
    case "arrowleft":
      return "ArrowLeft";
    case "arrowright":
      return "ArrowRight";
    case "arrowup":
      return "ArrowUp";
    case "arrowdown":
      return "ArrowDown";
    default:
      if (!token) {
        return "";
      }
      return token.length === 1 ? token.toUpperCase() : token.charAt(0).toUpperCase() + token.slice(1);
  }
}

function displayTokenLabel(value: string, platform: HotkeyPlatform): string {
  const token = normalizeKeyName(value);
  switch (token) {
    case "mod":
      return platform.isMac ? "Cmd" : "Ctrl";
    case "meta":
      return "Cmd";
    case "ctrl":
      return "Ctrl";
    case "alt":
      return platform.isMac ? "Option" : "Alt";
    case "shift":
      return "Shift";
    case "escape":
      return "Esc";
    case "arrowleft":
      return "Left";
    case "arrowright":
      return "Right";
    case "arrowup":
      return "Up";
    case "arrowdown":
      return "Down";
    default:
      return formatKeyToken(token);
  }
}

export function detectHotkeyPlatform(): HotkeyPlatform {
  const nav = typeof navigator !== "undefined" ? navigator : null;
  const platformSource = String(
    ((nav as unknown as { userAgentData?: { platform?: string } } | null)?.userAgentData?.platform) ||
      nav?.platform ||
      nav?.userAgent ||
      ""
  );
  const token = platformSource.toLowerCase();
  if (token.includes("mac") || token.includes("iphone") || token.includes("ipad")) {
    return { os: "mac", isMac: true };
  }
  if (token.includes("win")) {
    return { os: "windows", isMac: false };
  }
  if (token.includes("linux") || token.includes("x11")) {
    return { os: "linux", isMac: false };
  }
  return { os: "other", isMac: false };
}

export function hotkeyDefinitions(): HotkeyDefinition[] {
  return hotkeyOrder.map(function (id) {
    return hotkeyDefinitionsByID[id];
  });
}

export function canonicalizeHotkey(value: string): string {
  const binding = String(value || "").trim();
  if (!binding) {
    return "";
  }

  const modifiers = {
    mod: false,
    meta: false,
    ctrl: false,
    alt: false,
    shift: false,
  };
  let key = "";

  binding.split("+").map(normalizeKeyName).filter(Boolean).forEach(function (token) {
    if (token === "mod" || token === "meta" || token === "ctrl" || token === "alt" || token === "shift") {
      modifiers[token] = true;
      return;
    }
    key = token;
  });

  const tokens: string[] = [];
  if (modifiers.mod) {
    tokens.push("Mod");
  }
  if (modifiers.meta) {
    tokens.push("Meta");
  }
  if (modifiers.ctrl) {
    tokens.push("Ctrl");
  }
  if (modifiers.alt) {
    tokens.push("Alt");
  }
  if (modifiers.shift) {
    tokens.push("Shift");
  }
  if (key) {
    tokens.push(formatKeyToken(key));
  }
  return tokens.join("+");
}

export function hotkeyLabel(value: string, platform: HotkeyPlatform = detectHotkeyPlatform()): string {
  return canonicalizeHotkey(value)
    .split("+")
    .filter(Boolean)
    .map(function (part) {
      return displayTokenLabel(part, platform);
    })
    .join("+");
}

export function hotkeyFromEvent(event: HotkeyEvent, platform: HotkeyPlatform = detectHotkeyPlatform()): string {
  const key = normalizeKeyName(event.key);
  if (!key || modifierKeys.has(key)) {
    return "";
  }

  const tokens: string[] = [];
  if (platform.isMac) {
    if (event.metaKey) {
      tokens.push("Mod");
    }
    if (event.ctrlKey) {
      tokens.push("Ctrl");
    }
  } else {
    if (event.ctrlKey) {
      tokens.push("Mod");
    }
    if (event.metaKey) {
      tokens.push("Meta");
    }
  }
  if (event.altKey) {
    tokens.push("Alt");
  }
  if (event.shiftKey && !shiftedSymbolKeys.has(key)) {
    tokens.push("Shift");
  }
  tokens.push(formatKeyToken(key));
  return canonicalizeHotkey(tokens.join("+"));
}

export function likelyBrowserReservedMessage(
  binding: string,
  platform: HotkeyPlatform = detectHotkeyPlatform(),
): string {
  const normalized = canonicalizeHotkey(binding);
  if (!normalized) {
    return "";
  }
  const match = reservedHotkeys.find(function (entry) {
    if (entry.os && entry.os.indexOf(platform.os) < 0) {
      return false;
    }
    return entry.bindings.some(function (candidate) {
      return canonicalizeHotkey(candidate) === normalized;
    });
  });
  return match ? match.message : "";
}

function chooseDefaultBinding(definition: HotkeyDefinition, platform: HotkeyPlatform): string {
  const candidates = definition.defaultCandidates.map(canonicalizeHotkey);
  const safeCandidate = candidates.find(function (binding) {
    if (!binding) {
      return true;
    }
    return !likelyBrowserReservedMessage(binding, platform);
  });
  return safeCandidate || candidates[0] || "";
}

export function defaultHotkeys(platform: HotkeyPlatform = detectHotkeyPlatform()): Hotkeys {
  return {
    quickSwitcher: chooseDefaultBinding(hotkeyDefinitionsByID.quickSwitcher, platform),
    globalSearch: chooseDefaultBinding(hotkeyDefinitionsByID.globalSearch, platform),
    commandPalette: chooseDefaultBinding(hotkeyDefinitionsByID.commandPalette, platform),
    quickNote: chooseDefaultBinding(hotkeyDefinitionsByID.quickNote, platform),
    help: chooseDefaultBinding(hotkeyDefinitionsByID.help, platform),
    saveCurrentPage: chooseDefaultBinding(hotkeyDefinitionsByID.saveCurrentPage, platform),
    toggleRawMode: chooseDefaultBinding(hotkeyDefinitionsByID.toggleRawMode, platform),
    toggleTaskDone: chooseDefaultBinding(hotkeyDefinitionsByID.toggleTaskDone, platform),
  };
}

export function analyzeHotkeys(
  hotkeys: Hotkeys,
  platform: HotkeyPlatform = detectHotkeyPlatform(),
): Record<HotkeyID, HotkeyAnalysisEntry> {
  const bindings = {
    quickSwitcher: canonicalizeHotkey(hotkeys.quickSwitcher),
    globalSearch: canonicalizeHotkey(hotkeys.globalSearch),
    commandPalette: canonicalizeHotkey(hotkeys.commandPalette),
    quickNote: canonicalizeHotkey(hotkeys.quickNote),
    help: canonicalizeHotkey(hotkeys.help),
    saveCurrentPage: canonicalizeHotkey(hotkeys.saveCurrentPage),
    toggleRawMode: canonicalizeHotkey(hotkeys.toggleRawMode),
    toggleTaskDone: canonicalizeHotkey(hotkeys.toggleTaskDone),
  };

  const bindingIndex: Record<string, HotkeyID[]> = {};
  hotkeyOrder.forEach(function (id) {
    const binding = bindings[id];
    if (!binding) {
      return;
    }
    if (!bindingIndex[binding]) {
      bindingIndex[binding] = [];
    }
    bindingIndex[binding].push(id);
  });

  return hotkeyOrder.reduce(function (acc, id) {
    const definition = hotkeyDefinitionsByID[id];
    const binding = bindings[id];
    const duplicateIDs = binding ? (bindingIndex[binding] || []).filter(function (otherID) {
      return otherID !== id;
    }) : [];
    const browserWarning = likelyBrowserReservedMessage(binding, platform);
    const defaultBinding = chooseDefaultBinding(definition, platform);
    const blockedReason = duplicateIDs.length
      ? "Conflicts with " + duplicateIDs.map(function (otherID) {
        return hotkeyDefinitionsByID[otherID].label;
      }).join(", ") + "."
      : browserWarning
        ? "Likely intercepted by the browser or OS before Noterious can see it."
        : "";
    const isSafeBinding = Boolean(binding) && !duplicateIDs.length && !browserWarning;
    acc[id] = {
      definition: definition,
      binding: binding,
      duplicateIDs: duplicateIDs,
      browserWarning: browserWarning,
      defaultBinding: defaultBinding,
      blockedReason: blockedReason,
      isSafeBinding: isSafeBinding,
      usesDefaultBinding: Boolean(binding) && binding === defaultBinding,
    };
    return acc;
  }, {} as Record<HotkeyID, HotkeyAnalysisEntry>);
}

export function hotkeyDefaultGuidance(
  entry: HotkeyAnalysisEntry,
  platform: HotkeyPlatform = detectHotkeyPlatform(),
): string {
  if (!entry.defaultBinding) {
    return "No default shortcut.";
  }
  const label = hotkeyLabel(entry.defaultBinding, platform);
  if (!entry.binding || entry.usesDefaultBinding) {
    return "Default: " + label + ".";
  }
  if (entry.isSafeBinding) {
    return "Built-in default: " + label + ".";
  }
  return "Safer default: " + label + ".";
}

export function hotkeyValidationErrors(
  hotkeys: Hotkeys,
  platform: HotkeyPlatform = detectHotkeyPlatform(),
): string[] {
  const analysis = analyzeHotkeys(hotkeys, platform);
  return hotkeyOrder.reduce(function (errors, id) {
    const entry = analysis[id];
    if (!entry.binding || !entry.blockedReason) {
      return errors;
    }
    errors.push(entry.definition.label + ": " + entry.blockedReason);
    return errors;
  }, [] as string[]);
}

export function hotkeyProducesText(hotkey: string): boolean {
  const binding = canonicalizeHotkey(hotkey);
  if (!binding) {
    return false;
  }

  const tokens = binding.split("+").map(normalizeKeyName).filter(Boolean);
  let modifierCount = 0;
  let key = "";

  tokens.forEach(function (token) {
    if (token === "mod" || token === "meta" || token === "ctrl" || token === "alt" || token === "shift") {
      modifierCount += 1;
      return;
    }
    key = token;
  });

  if (!key || modifierCount > 0) {
    return false;
  }

  return key.length === 1 || key === "space" || key === "enter" || key === "tab";
}

export function matchesHotkey(hotkey: string, event: HotkeyEvent): boolean {
  const binding = canonicalizeHotkey(hotkey);
  if (!binding) {
    return false;
  }

  const tokens = binding.split("+").map(normalizeKeyName).filter(Boolean);
  const modifiers = {
    meta: false,
    ctrl: false,
    alt: false,
    shift: false,
  };
  let explicitShift = false;
  let key = "";

  tokens.forEach(function (token) {
    if (token === "mod") {
      modifiers.meta = true;
      modifiers.ctrl = true;
      return;
    }
    if (token === "meta" || token === "ctrl" || token === "alt" || token === "shift") {
      modifiers[token] = true;
      if (token === "shift") {
        explicitShift = true;
      }
      return;
    }
    key = token;
  });

  if (tokens.indexOf("mod") >= 0) {
    if (!(event.metaKey || event.ctrlKey)) {
      return false;
    }
  } else {
    if (event.metaKey !== modifiers.meta) {
      return false;
    }
    if (event.ctrlKey !== modifiers.ctrl) {
      return false;
    }
  }

  if (event.altKey !== modifiers.alt) {
    return false;
  }
  if (explicitShift && event.shiftKey !== modifiers.shift) {
    return false;
  }

  const eventKey = normalizeKeyName(event.key);
  if (!key) {
    return true;
  }
  if (!explicitShift && event.shiftKey && /^[a-z0-9]$/i.test(key)) {
    return false;
  }
  return eventKey === key;
}
