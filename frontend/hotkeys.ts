export interface HotkeyEvent {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

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
    case "slash":
      return "/";
    case "question":
      return "?";
    default:
      return token;
  }
}

export function hotkeyLabel(value: string): string {
  return String(value || "")
    .split("+")
    .map(function (part) {
      const token = normalizeKeyName(part);
      switch (token) {
        case "mod":
          return "Ctrl";
        case "meta":
          return "Cmd";
        case "ctrl":
          return "Ctrl";
        case "alt":
          return "Alt";
        case "shift":
          return "Shift";
        case "escape":
          return "Esc";
        default:
          return token.length === 1 ? token.toUpperCase() : token.charAt(0).toUpperCase() + token.slice(1);
      }
    })
    .join("+");
}

export function matchesHotkey(hotkey: string, event: HotkeyEvent): boolean {
  const binding = String(hotkey || "").trim();
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
