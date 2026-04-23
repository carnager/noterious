import { clearNode } from "./dom";
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

export function slashCommandsForText(text: string): SlashCommand[] {
  const raw = String(text || "");
  const trimmed = raw.trim();
  const match = trimmed.match(/(?:^|\s)\/([a-z]+)$/i);
  if (!match) {
    return [];
  }
  const query = String(match[1] || "").toLowerCase();
  const commands = [
    {
      id: "task",
      title: "Task",
      description: "Turn this line into a task",
      matches: function () {
        return "task".indexOf(query) === 0;
      },
      apply: function (lineText: string) {
        const source = String(lineText || "");
        const remainder = source
          .replace(/(?:^|\s)\/task\s*$/i, "")
          .trim();
        return "- [ ] " + remainder;
      },
    },
  ];
  return commands.filter(function (command) {
    return command.matches();
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
  Array.from(elements.slashMenuResults.querySelectorAll<HTMLElement>(".slash-menu-item")).forEach(function (item, index) {
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
    button.className = "slash-menu-item" + (index === state.slashSelectionIndex ? " active" : "");
    button.addEventListener("mousedown", function (event) {
      event.preventDefault();
    });
    button.addEventListener("click", onApplySelection);
    const title = document.createElement("strong");
    title.textContent = "/" + command.id;
    const description = document.createElement("small");
    description.textContent = command.description;
    button.appendChild(title);
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
  const items = Array.from(elements.slashMenuResults.querySelectorAll(".slash-menu-item"));
  if (!items.length) {
    return;
  }
  const nextIndex = Math.max(0, Math.min(items.length - 1, state.slashSelectionIndex + delta));
  state.slashSelectionIndex = nextIndex;
  updateSlashSelection(state, elements);
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
