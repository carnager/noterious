import { clearNode } from "./dom";
import { markdownLinkForDocument } from "./documents";
import { normalizePageDraftPath } from "./commands";
import { pageLeafName } from "./palette";
import { resultButtons } from "./palette";
import type { DocumentRecord, PageSummary, SlashCommand, SlashMenuContext } from "./types";

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

function replaceSlashToken(lineText: string, _commandName: string, replacement: string): string {
  const source = String(lineText || "");
  const pattern = /(?:^|\s)\/[a-z0-9-]*\s*$/i;
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

function todayDate(): string {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

function currentTime(): string {
  const now = new Date();
  return [
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
  ].join(":");
}

function appendField(lineText: string, commandName: string, fieldText: string): string {
  const source = replaceSlashToken(lineText, commandName, "").trimEnd();
  return source ? (source + " " + fieldText) : fieldText;
}

interface SlashTrigger {
  query: string;
  args: string;
}

function clampTableDimension(value: number, fallback: number, max: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(1, Math.min(max, Math.floor(value)));
}

function parseTableDimensions(rawArgs: string): { columns: number; rows: number } | null {
  const args = String(rawArgs || "").trim();
  if (!args) {
    return { columns: 2, rows: 1 };
  }
  const parts = args.split(/\s+/).filter(Boolean);
  if (!parts.length || parts.length > 2 || !parts.every(function (part) {
    return /^\d+$/.test(part);
  })) {
    return null;
  }
  return {
    columns: clampTableDimension(Number(parts[0]), 2, 20),
    rows: clampTableDimension(parts[1] ? Number(parts[1]) : 1, 1, 50),
  };
}

function defaultTableHeaders(columns: number): string[] {
  if (columns <= 1) {
    return ["Column"];
  }
  if (columns === 2) {
    return ["Column", "Value"];
  }
  return Array.from({ length: columns }, function (_value, index) {
    return "Column " + String(index + 1);
  });
}

function buildMarkdownTable(columns: number, rows: number): string {
  const safeColumns = clampTableDimension(columns, 2, 20);
  const safeRows = clampTableDimension(rows, 1, 50);
  const header = defaultTableHeaders(safeColumns);
  const separator = header.map(function () {
    return "---";
  });
  const blankRow = header.map(function () {
    return "";
  });
  const lines = [
    "| " + header.join(" | ") + " |",
    "| " + separator.join(" | ") + " |",
  ];
  for (let row = 0; row < safeRows; row += 1) {
    lines.push("| " + blankRow.join(" | ") + " |");
  }
  return lines.join("\n") + "\n";
}

function commandSupportsSlashArgs(command: SlashCommand, args: string): boolean {
  if (command.id === "table") {
    return parseTableDimensions(args) !== null;
  }
  if (command.id === "query") {
    return Boolean(String(args || "").trim());
  }
  return false;
}

function slashCommandCatalog(): SlashCommand[] {
  return [
    {
      id: "task",
      title: "Insert task",
      description: "Turn the current line into a checkbox item.",
      keywords: "todo checkbox checklist",
      hint: "/task",
      apply: function (lineText: string) {
        return prefixLine(lineText, "task", "- [ ] ");
      },
    },
    {
      id: "bullet",
      title: "Insert bullet list",
      description: "Turn the current line into a bullet list item.",
      keywords: "list unordered dash",
      hint: "/bullet",
      apply: function (lineText: string) {
        return prefixLine(lineText, "bullet", "- ");
      },
    },
    {
      id: "number",
      title: "Insert numbered list",
      description: "Turn the current line into a numbered list item.",
      keywords: "list ordered numbered",
      hint: "/number",
      apply: function (lineText: string) {
        return prefixLine(lineText, "number", "1. ");
      },
    },
    {
      id: "h1",
      title: "Heading 1",
      description: "Insert a level 1 heading.",
      keywords: "header title heading",
      hint: "/h1",
      apply: function (lineText: string) {
        return prefixLine(lineText, "h1", "# ");
      },
    },
    {
      id: "h2",
      title: "Heading 2",
      description: "Insert a level 2 heading.",
      keywords: "header heading",
      hint: "/h2",
      apply: function (lineText: string) {
        return prefixLine(lineText, "h2", "## ");
      },
    },
    {
      id: "h3",
      title: "Heading 3",
      description: "Insert a level 3 heading.",
      keywords: "header heading",
      hint: "/h3",
      apply: function (lineText: string) {
        return prefixLine(lineText, "h3", "### ");
      },
    },
    {
      id: "quote",
      title: "Insert blockquote",
      description: "Turn the current line into a blockquote.",
      keywords: "blockquote cite",
      hint: "/quote",
      apply: function (lineText: string) {
        return prefixLine(lineText, "quote", "> ");
      },
    },
    {
      id: "code",
      title: "Insert code block",
      description: "Replace the current line with a fenced code block.",
      keywords: "fence snippet",
      hint: "/code",
      apply: function () {
        return "```\n\n```";
      },
    },
    {
      id: "callout",
      title: "Insert callout",
      description: "Replace the current line with an Obsidian-style callout.",
      keywords: "note tip warning admonition",
      hint: "/callout",
      apply: function () {
        return "> [!note]\n> ";
      },
    },
    {
      id: "table",
      title: "Insert table",
      description: "Replace the current line with a markdown table. Use /table 3 4 for 3 columns and 4 rows.",
      keywords: "table grid columns rows",
      hint: "/table [cols] [rows]",
      apply: function (lineText: string) {
        const trigger = parseSlashTrigger(lineText);
        const dimensions = parseTableDimensions(trigger ? trigger.args : "");
        return buildMarkdownTable(dimensions ? dimensions.columns : 2, dimensions ? dimensions.rows : 1);
      },
      caret: function (updatedLine: string) {
        return updatedLine.length;
      },
    },
    {
      id: "query",
      title: "Generate query",
      description: "Ask the AI copilot to draft a markdown query block from plain language.",
      keywords: "ai query search filter report workbench copilot",
      hint: "/query <intent>",
      apply: function (lineText: string) {
        return replaceSlashToken(lineText, "query", "").replace(/\s+$/, "");
      },
      caret: function (updatedLine: string) {
        return updatedLine.length;
      },
    },
    {
      id: "file",
      title: "Upload file",
      description: "Open the file picker and upload into the current note's folder.",
      keywords: "upload attachment document image media asset",
      hint: "/file",
      apply: function (lineText: string) {
        return replaceSlashToken(lineText, "file", "").replace(/\s+$/, "");
      },
      caret: function (updatedLine: string) {
        return updatedLine.length;
      },
    },
    {
      id: "due",
      title: "Insert due date",
      description: "Append a due field with today's date.",
      keywords: "task due date schedule deadline",
      hint: "/due",
      apply: function (lineText: string) {
        return appendField(lineText, "due", "[due: " + todayDate() + "]");
      },
    },
    {
      id: "remind",
      title: "Insert reminder",
      description: "Append a remind field with the current time.",
      keywords: "task remind reminder notify notification",
      hint: "/remind",
      apply: function (lineText: string) {
        return appendField(lineText, "remind", "[remind: " + currentTime() + "]");
      },
    },
  ];
}

function parseSlashTrigger(text: string): SlashTrigger | null {
  const raw = String(text || "");
  const trimmed = raw.trimEnd();
  const match = trimmed.match(/(?:^|\s)\/([a-z0-9-]*)(?:\s+(.*))?$/i);
  if (!match) {
    return null;
  }
  return {
    query: String(match[1] || "").toLowerCase(),
    args: String(match[2] || ""),
  };
}

export function slashCommandsForText(text: string): SlashCommand[] {
  const trigger = parseSlashTrigger(text);
  if (!trigger) {
    return [];
  }

  const commands = slashCommandCatalog().filter(function (command) {
    return slashSearchTokens(command).some(function (token) {
      return token.indexOf(trigger.query) === 0 || fuzzyMatch(token, trigger.query);
    });
  });

  if (!trigger.args.trim()) {
    return commands;
  }
  return commands.filter(function (command) {
    return commandSupportsSlashArgs(command, trigger.args);
  });
}

interface WikilinkTrigger {
  start: number;
  end: number;
  query: string;
  embed: boolean;
}

interface DocumentTrigger {
  alias: string;
  query: string;
}

function findWikilinkTrigger(lineText: string, caretInLine: number): WikilinkTrigger | null {
  const source = String(lineText || "");
  const safeCaret = Math.max(0, Math.min(source.length, caretInLine));
  const beforeCaret = source.slice(0, safeCaret);
  const match = beforeCaret.match(/(!?)\[\[([^\]\n]*)$/);
  if (!match) {
    return null;
  }
  const afterCaret = source.slice(safeCaret);
  const nextClose = afterCaret.indexOf("]]");
  const nextOpen = afterCaret.indexOf("[[");
  if (nextClose >= 0 && (nextOpen === -1 || nextClose < nextOpen)) {
    return null;
  }
  return {
    start: beforeCaret.length - match[0].length,
    end: beforeCaret.length,
    query: String(match[2] || "").trim().toLowerCase(),
    embed: match[1] === "!",
  };
}

function findDocumentTrigger(lineText: string): DocumentTrigger | null {
  const trimmed = String(lineText || "").trim();
  const match = trimmed.match(/^\/([a-z-]+)(?:\s+(.*))?$/i);
  if (!match) {
    return null;
  }
  const alias = String(match[1] || "").toLowerCase();
  if (["doc", "docs", "document", "documents", "attach"].indexOf(alias) === -1) {
    return null;
  }
  return {
    alias,
    query: String(match[2] || "").trim().toLowerCase(),
  };
}

function scorePage(page: PageSummary, query: string): number {
  const path = String(page.path || "").toLowerCase();
  const leaf = pageLeafName(page.path).toLowerCase();
  const title = String(page.title || "").toLowerCase();
  if (!query) {
    return page.updatedAt ? Date.parse(page.updatedAt) || 0 : 0;
  }
  return (
    (path === query ? 5000 : 0) +
    (leaf === query ? 4500 : 0) +
    (leaf.startsWith(query) ? 3200 : 0) +
    (path.startsWith(query) ? 2800 : 0) +
    (title.startsWith(query) ? 2400 : 0) +
    (path.indexOf(query) >= 0 ? 1200 : 0) +
    (title.indexOf(query) >= 0 ? 900 : 0)
  );
}

export function wikilinkCommandsForContext(
  lineText: string,
  caretInLine: number,
  pages: PageSummary[]
): SlashCommand[] {
  const trigger = findWikilinkTrigger(lineText, caretInLine);
  if (!trigger) {
    return [];
  }

  const matches = pages
    .filter(function (page) {
      if (!trigger.query) {
        return true;
      }
      const haystack = [page.path, page.title || ""].join(" ").toLowerCase();
      return haystack.indexOf(trigger.query) >= 0;
    })
    .sort(function (left, right) {
      return scorePage(right, trigger.query) - scorePage(left, trigger.query);
    })
    .slice(0, 12);

  const normalizedDraftPath = normalizePageDraftPath(trigger.query);
  const hasExactMatch = normalizedDraftPath
    ? pages.some(function (page) {
        return String(page.path || "").toLowerCase() === normalizedDraftPath.toLowerCase();
      })
    : false;

  const createCommands: SlashCommand[] = normalizedDraftPath && !hasExactMatch
    ? [{
        id: "create:" + normalizedDraftPath,
        title: "Create note",
        description: normalizedDraftPath,
        keywords: "create new note page",
        hint: "Enter",
        apply: function (sourceLine: string): string {
          const replacement = (trigger.embed ? "![[": "[[") + normalizedDraftPath + "]]";
          return String(sourceLine || "").slice(0, trigger.start) + replacement + String(sourceLine || "").slice(trigger.end);
        },
        caret: function (): number {
          const replacement = (trigger.embed ? "![[": "[[") + normalizedDraftPath + "]]";
          return trigger.start + replacement.length;
        },
      }]
    : [];

  return matches.map(function (page): SlashCommand {
    const replacement = (trigger.embed ? "![[": "[[") + page.path + "]]";
    const titleLeaf = pageLeafName(page.path);
    return {
      id: page.path,
      title: titleLeaf,
      description: page.title && page.title !== titleLeaf
        ? page.path + " · " + page.title
        : page.path,
      hint: trigger.embed ? "![[": "[[",
      apply: function (sourceLine: string): string {
        return String(sourceLine || "").slice(0, trigger.start) + replacement + String(sourceLine || "").slice(trigger.end);
      },
      caret: function (): number {
        return trigger.start + replacement.length;
      },
    };
  }).concat(createCommands);
}

export function documentCommandsForText(text: string, documents: DocumentRecord[], currentPagePath: string): SlashCommand[] {
  const trigger = findDocumentTrigger(text);
  if (!trigger) {
    return [];
  }

  const matches = documents
    .filter(function (document) {
      if (!trigger.query) {
        return true;
      }
      const haystack = [document.name, document.contentType].join(" ").toLowerCase();
      return haystack.indexOf(trigger.query) >= 0;
    })
    .slice()
    .sort(function (left, right) {
      const leftCreated = left.createdAt ? Date.parse(left.createdAt) || 0 : 0;
      const rightCreated = right.createdAt ? Date.parse(right.createdAt) || 0 : 0;
      return rightCreated - leftCreated;
    })
    .slice(0, 12);

  return matches.map(function (document): SlashCommand {
      const link = markdownLinkForDocument(document, currentPagePath);
    return {
      id: document.id,
      title: document.name,
      description: document.contentType || "document",
      hint: "/" + trigger.alias,
      apply: function (): string {
        return link;
      },
      caret: function (): number {
        return link.length;
      },
    };
  });
}

export function closeSlashMenu(state: SlashMenuState, elements: SlashMenuElements): void {
  state.slashOpen = false;
  state.slashSelectionIndex = -1;
  state.slashContext = null;
  elements.slashMenu.classList.add("hidden");
  elements.slashMenu.style.visibility = "";
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
    hint.textContent = command.hint || ("/" + command.id);
    head.appendChild(hint);
    button.appendChild(head);

    const description = document.createElement("small");
    description.textContent = command.description;
    button.appendChild(description);

    elements.slashMenuResults.appendChild(button);
  });

  const preferredLeft = Math.max(12, Number(context.left) || 0);
  const preferredTop = Math.max(12, Number(context.top) || 0);
  elements.slashMenu.style.visibility = "hidden";
  elements.slashMenu.classList.remove("hidden");
  const menuWidth = elements.slashMenu.offsetWidth || 320;
  const menuHeight = elements.slashMenu.offsetHeight || 240;
  const viewportWidth = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
  const viewportHeight = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
  const horizontalPadding = 12;
  const verticalPadding = 12;
  const clampedLeft = Math.max(
    horizontalPadding,
    Math.min(preferredLeft, viewportWidth - menuWidth - horizontalPadding)
  );
  let positionedTop = preferredTop;
  if (preferredTop + menuHeight > viewportHeight - verticalPadding) {
    positionedTop = Math.max(verticalPadding, preferredTop - menuHeight - 12);
  }
  positionedTop = Math.max(
    verticalPadding,
    Math.min(positionedTop, viewportHeight - menuHeight - verticalPadding)
  );
  elements.slashMenu.style.left = clampedLeft + "px";
  elements.slashMenu.style.top = positionedTop + "px";
  elements.slashMenu.style.visibility = "";
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

  const editorRect = editor.getBoundingClientRect();
  openSlashMenu(state, elements, commands, {
    editor: context.editor || editor,
    commands,
    left: Math.max(0, typeof context.left === "number" ? context.left : editorRect.left),
    top: Math.max(0, typeof context.top === "number" ? context.top : (editorRect.bottom + 4)),
    type: context.type,
    lineIndex: context.lineIndex,
  }, onApplySelection);
}

export function openSlashMenuWithCommands(
  state: SlashMenuState,
  elements: SlashMenuElements,
  editor: HTMLElement,
  commands: SlashCommand[],
  context: Omit<SlashMenuContext, "commands">,
  onApplySelection: () => void
): void {
  if (!commands.length) {
    closeSlashMenu(state, elements);
    return;
  }

  const editorRect = editor.getBoundingClientRect();
  openSlashMenu(state, elements, commands, {
    editor: context.editor || editor,
    commands,
    left: Math.max(0, typeof context.left === "number" ? context.left : editorRect.left),
    top: Math.max(0, typeof context.top === "number" ? context.top : (editorRect.bottom + 4)),
    type: context.type,
    lineIndex: context.lineIndex,
  }, onApplySelection);
}

export function queryIntentForText(text: string): string {
  const match = String(text || "").trim().match(/^\/query\s+(.+)$/i);
  return match ? String(match[1] || "").trim() : "";
}
