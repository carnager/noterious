import { clearNode } from "./dom";
import { resultButtons } from "./palette";
import type { SlashCommand, SlashMenuContext } from "./types";

export interface SlashMenuState {
  slashOpen: boolean;
  slashSelectionIndex: number;
  slashContext: SlashMenuContext | null;
}

export interface SlashMenuElements {
  slashMenu: HTMLElement;
  slashMenuResults: HTMLDivElement;
  noteLayout: HTMLElement;
}

function fuzzyMatch(haystack: string, query: string): boolean {
  const source = String(haystack || "").toLowerCase();
  const target = String(query || "").toLowerCase().trim();
  if (!target) {
    return true;
  }
  let index = 0;
  for (let i = 0; i < source.length && index < target.length; i += 1) {
    if (source[i] === target[index]) {
      index += 1;
    }
  }
  return index === target.length;
}

function slashSearchTokens(command: SlashCommand): string[] {
  return [command.id, command.title, command.keywords || ""]
    .join(" ")
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map(function (token) {
      return token.trim();
    })
    .filter(Boolean);
}

function replaceSlashToken(lineText: string, commandName: string, replacement: string): string {
  const source = String(lineText || "");
  const pattern = new RegExp("(?:^|\\s)\\/" + commandName + "\\s*$", "i");
  const updated = source.replace(pattern, "");
  if (!updated.trim()) {
    return replacement;
  }
  return updated.replace(/\s+$/, "") + " " + replacement;
}

function prefixLine(lineText: string, commandName: string, prefix: string): string {
  const source = replaceSlashToken(lineText, commandName, "").trim();
  return source ? prefix + source : prefix;
}

function slashCommandCatalog(): SlashCommand[] {
  return [
    {
      id: "task",
      title: "Insert task",
      description: "Turn the current line into a checkbox item.",
      keywords: "todo checkbox checklist",
      apply: function (lineText: string) {
        return prefixLine(lineText, "task", "- [ ] ");
      },
    },
    {
      id: "bullet",
      title: "Insert bullet list",
      description: "Turn the current line into a bullet list item.",
      keywords: "list unordered dash",
      apply: function (lineText: string) {
        return prefixLine(lineText, "bullet", "- ");
      },
    },
    {
      id: "number",
      title: "Insert numbered list",
      description: "Turn the current line into a numbered list item.",
      keywords: "list ordered numbered",
      apply: function (lineText: string) {
        return prefixLine(lineText, "number", "1. ");
      },
    },
    {
      id: "h1",
      title: "Heading 1",
      description: "Insert a level 1 heading.",
      keywords: "header title heading",
      apply: function (lineText: string) {
        return prefixLine(lineText, "h1", "# ");
      },
    },
    {
      id: "h2",
      title: "Heading 2",
      description: "Insert a level 2 heading.",
      keywords: "header heading",
      apply: function (lineText: string) {
        return prefixLine(lineText, "h2", "## ");
      },
    },
    {
      id: "h3",
      title: "Heading 3",
      description: "Insert a level 3 heading.",
      keywords: "header heading",
      apply: function (lineText: string) {
        return prefixLine(lineText, "h3", "### ");
      },
    },
    {
      id: "quote",
      title: "Insert blockquote",
      description: "Turn the current line into a blockquote.",
      keywords: "blockquote cite",
      apply: function (lineText: string) {
        return prefixLine(lineText, "quote", "> ");
      },
    },
    {
      id: "code",
      title: "Insert code block",
      description: "Replace the current line with a fenced code block.",
      keywords: "fence snippet",
      apply: function () {
        return "```\n\n```";
      },
    },
    {
      id: "callout",
      title: "Insert callout",
      description: "Replace the current line with an Obsidian-style callout.",
      keywords: "note tip warning admonition",
      apply: function () {
        return "> [!note]\n> ";
      },
    },
  ];
}

function parseSlashQuery(text: string): string | null {
  const raw = String(text || "");
  const trimmed = raw.trimEnd();
  const match = trimmed.match(/(?:^|\s)\/([a-z0-9-]*)$/i);
  if (!match) {
    return null;
  }
  return String(match[1] || "").toLowerCase();
}

export function slashCommandsForText(text: string): SlashCommand[] {
  const query = parseSlashQuery(text);
  if (query === null) {
    return [];
  }

  return slashCommandCatalog().filter(function (command) {
    return slashSearchTokens(command).some(function (token) {
      return token.indexOf(query) === 0 || fuzzyMatch(token, query);
    });
  });
}

export function closeSlashMenu(state: SlashMenuState, elements: SlashMenuElements): void {
  state.slashOpen = false;
  state.slashSelectionIndex = -1;
  state.slashContext = null;
  elements.slashMenu.classList.add("hidden");
  clearNode(elements.slashMenuResults);
}

function updateSlashSelection(state: SlashMenuState, elements: SlashMenuElements): void {
  if (!state.slashOpen) {
    return;
  }
  resultButtons(elements.slashMenuResults).forEach(function (item, index) {
    item.classList.toggle("active", index === state.slashSelectionIndex);
  });
}

function openSlashMenu(
  state: SlashMenuState,
  elements: SlashMenuElements,
  commands: SlashCommand[],
  context: SlashMenuContext,
  onApplySelection: () => void
): void {
  if (!commands.length) {
    closeSlashMenu(state, elements);
    return;
  }
  state.slashOpen = true;
  state.slashSelectionIndex = 0;
  state.slashContext = context;
  clearNode(elements.slashMenuResults);

  commands.forEach(function (command, index) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "search-result-item slash-menu-item" + (index === state.slashSelectionIndex ? " active" : "");
    button.tabIndex = -1;
    button.addEventListener("mousedown", function (event) {
      event.preventDefault();
    });
    button.addEventListener("click", onApplySelection);

    const head = document.createElement("div");
    head.className = "search-result-head";

    const title = document.createElement("strong");
    title.textContent = command.title;
    head.appendChild(title);

    const hint = document.createElement("span");
    hint.className = "search-result-hint";
    hint.textContent = "/" + command.id;
    head.appendChild(hint);
    button.appendChild(head);

    const description = document.createElement("small");
    description.textContent = command.description;
    button.appendChild(description);

    elements.slashMenuResults.appendChild(button);
  });

  elements.slashMenu.style.left = (context.left || 0) + "px";
  elements.slashMenu.style.top = (context.top || 0) + "px";
  elements.slashMenu.classList.remove("hidden");
}

export function moveSlashSelection(state: SlashMenuState, elements: SlashMenuElements, delta: number): void {
  if (!state.slashOpen) {
    return;
  }
  const items = resultButtons(elements.slashMenuResults);
  if (!items.length) {
    return;
  }
  const nextIndex = Math.max(0, Math.min(items.length - 1, state.slashSelectionIndex + delta));
  state.slashSelectionIndex = nextIndex;
  updateSlashSelection(state, elements);
  items[nextIndex].scrollIntoView({ block: "nearest" });
}

export function maybeOpenSlashMenu(
  state: SlashMenuState,
  elements: SlashMenuElements,
  editor: HTMLElement,
  lineText: string,
  context: Omit<SlashMenuContext, "commands">,
  onApplySelection: () => void
): void {
  const commands = slashCommandsForText(lineText);
  if (!commands.length) {
    closeSlashMenu(state, elements);
    return;
  }

  const noteRect = elements.noteLayout.getBoundingClientRect();
  const editorRect = editor.getBoundingClientRect();
  openSlashMenu(state, elements, commands, {
    editor: context.editor || editor,
    commands,
    left: Math.max(0, typeof context.left === "number" ? context.left : (editorRect.left - noteRect.left)),
    top: Math.max(0, typeof context.top === "number" ? context.top : (editorRect.bottom - noteRect.top + 4)),
    type: context.type,
    lineIndex: context.lineIndex,
  }, onApplySelection);
}
