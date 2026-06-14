import type { NoteriousEditorApi } from "./types";

interface FormatToolbarOptions {
  // Whether formatting is currently allowed (editor present, not frozen/read-only).
  isActive(): boolean;
}

type InlineMarker = "**" | "_" | "~~" | "`";

// Strips any existing list / task / heading marker from the start of a line so
// toggling between block styles replaces rather than stacks them.
const LIST_MARKER = /^(\s*)(?:-\s+\[[ xX]\]\s+|[-*+]\s+|\d+\.\s+)/;
const HEADING_MARKER = /^(\s*)#{1,6}\s+/;

function lineBoundsForSelection(value: string, from: number, to: number): { start: number; end: number } {
  const start = value.lastIndexOf("\n", from - 1) + 1;
  // If the selection ends exactly on a line break, don't pull in the next line.
  const effectiveTo = to > from && value.charAt(to - 1) === "\n" ? to - 1 : to;
  let end = value.indexOf("\n", effectiveTo);
  if (end === -1) {
    end = value.length;
  }
  return { start, end };
}

export function setupFormatToolbar(api: NoteriousEditorApi, options: FormatToolbarOptions): () => void {
  const host = api.host;

  const toolbar = document.createElement("div");
  toolbar.className = "format-toolbar hidden";
  toolbar.setAttribute("role", "toolbar");
  toolbar.setAttribute("aria-label", "Text formatting");

  function applyInline(marker: InlineMarker): void {
    const from = api.getSelectionStart();
    const to = api.getSelectionEnd();
    if (from === to) {
      return;
    }
    const value = api.getValue();
    const selected = value.slice(from, to);
    const len = marker.length;

    if (selected.length >= len * 2 && selected.startsWith(marker) && selected.endsWith(marker)) {
      const inner = selected.slice(len, selected.length - len);
      api.replaceRange(from, to, inner);
      api.setSelectionRange(from, from + inner.length, true);
    } else if (value.slice(Math.max(0, from - len), from) === marker && value.slice(to, to + len) === marker) {
      api.replaceRange(from - len, to + len, selected);
      api.setSelectionRange(from - len, from - len + selected.length, true);
    } else {
      api.replaceRange(from, to, marker + selected + marker);
      api.setSelectionRange(from + len, from + len + selected.length, true);
    }
    api.focus();
  }

  function applyLinePrefix(prefix: string, strip: RegExp): void {
    const from = api.getSelectionStart();
    const to = api.getSelectionEnd();
    const value = api.getValue();
    const bounds = lineBoundsForSelection(value, from, to);
    const block = value.slice(bounds.start, bounds.end);
    const lines = block.split("\n");
    const allHavePrefix = lines.every(function (line) {
      return line.replace(/^\s*/, "").startsWith(prefix.trim() + (prefix.endsWith(" ") ? "" : "")) && strip.test(line);
    });
    const newLines = lines.map(function (line) {
      const indentMatch = /^(\s*)/.exec(line);
      const indent = indentMatch ? indentMatch[1] : "";
      const stripped = line.replace(strip, "$1");
      if (allHavePrefix) {
        return stripped;
      }
      return indent + prefix + stripped.slice(indent.length);
    });
    const newBlock = newLines.join("\n");
    api.replaceRange(bounds.start, bounds.end, newBlock);
    api.setSelectionRange(bounds.start, bounds.start + newBlock.length, true);
    api.focus();
  }

  function applyLink(): void {
    const from = api.getSelectionStart();
    const to = api.getSelectionEnd();
    const value = api.getValue();
    const text = value.slice(from, to) || "link";
    const inserted = "[" + text + "](url)";
    api.replaceRange(from, to, inserted);
    const urlStart = from + text.length + 3; // past "[text]("
    api.setSelectionRange(urlStart, urlStart + 3, true); // selects "url"
    api.focus();
  }

  const buttons: Array<{ label: string; title: string; run: () => void; className?: string }> = [
    { label: "B", title: "Bold", className: "format-toolbar-bold", run: function () { applyInline("**"); } },
    { label: "I", title: "Italic", className: "format-toolbar-italic", run: function () { applyInline("_"); } },
    { label: "S", title: "Strikethrough", className: "format-toolbar-strike", run: function () { applyInline("~~"); } },
    { label: "<>", title: "Inline code", run: function () { applyInline("`"); } },
    { label: "H", title: "Heading", run: function () { applyLinePrefix("## ", HEADING_MARKER); } },
    { label: "•", title: "Bullet list", run: function () { applyLinePrefix("- ", LIST_MARKER); } },
    { label: "☑", title: "Checklist", run: function () { applyLinePrefix("- [ ] ", LIST_MARKER); } },
    { label: "↗", title: "Link", run: applyLink },
  ];

  buttons.forEach(function (spec) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "format-toolbar-button" + (spec.className ? " " + spec.className : "");
    button.textContent = spec.label;
    button.title = spec.title;
    button.setAttribute("aria-label", spec.title);
    // Keep the editor selection while interacting with the toolbar.
    button.addEventListener("mousedown", function (event) {
      event.preventDefault();
    });
    button.addEventListener("click", function (event) {
      event.preventDefault();
      spec.run();
    });
    toolbar.appendChild(button);
  });

  document.body.appendChild(toolbar);

  let visible = false;
  let frame = 0;

  function hide(): void {
    if (!visible) {
      return;
    }
    visible = false;
    toolbar.classList.add("hidden");
  }

  function position(rect: DOMRect): void {
    toolbar.classList.remove("hidden");
    const width = toolbar.offsetWidth || 240;
    const height = toolbar.offsetHeight || 34;
    const gap = 8;
    let left = rect.left + rect.width / 2 - width / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
    let top = rect.top - height - gap;
    if (top < 8) {
      top = rect.bottom + gap; // flip below if no room above
    }
    toolbar.style.left = Math.round(left) + "px";
    toolbar.style.top = Math.round(top) + "px";
  }

  function update(): void {
    if (!options.isActive()) {
      hide();
      return;
    }
    const from = api.getSelectionStart();
    const to = api.getSelectionEnd();
    if (from === to) {
      hide();
      return;
    }
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      hide();
      return;
    }
    const range = selection.getRangeAt(0);
    if (!host.contains(range.commonAncestorContainer)) {
      hide();
      return;
    }
    const rect = range.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) {
      hide();
      return;
    }
    visible = true;
    position(rect);
  }

  function scheduleUpdate(): void {
    if (frame) {
      return;
    }
    frame = window.requestAnimationFrame(function () {
      frame = 0;
      update();
    });
  }

  function onSelectionChange(): void {
    scheduleUpdate();
  }
  function onScroll(): void {
    if (visible) {
      hide();
    }
  }

  document.addEventListener("selectionchange", onSelectionChange);
  window.addEventListener("scroll", onScroll, true);
  window.addEventListener("resize", onScroll);

  return function cleanup() {
    document.removeEventListener("selectionchange", onSelectionChange);
    window.removeEventListener("scroll", onScroll, true);
    window.removeEventListener("resize", onScroll);
    if (frame) {
      window.cancelAnimationFrame(frame);
    }
    toolbar.remove();
  };
}
