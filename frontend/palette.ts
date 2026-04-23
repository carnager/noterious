import { clearNode, renderEmpty } from "./dom";

export interface PaletteItem {
  title: string;
  meta?: string;
  snippet?: string;
  hint?: string;
  onSelect(): void;
}

export interface PaletteSection {
  title: string;
  items: PaletteItem[];
}

export function setPaletteOpen(shell: HTMLElement, input: HTMLInputElement, open: boolean): void {
  shell.classList.toggle("hidden", !open);
  if (open) {
    window.setTimeout(function () {
      input.focus();
      input.select();
    }, 0);
  }
}

export function resultButtons(container: HTMLElement): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll<HTMLButtonElement>(".search-result-item"));
}

export function updateSelection(container: HTMLElement, index: number): void {
  resultButtons(container).forEach(function (button, buttonIndex) {
    button.classList.toggle("active", buttonIndex === index);
  });
}

export function moveSelection(container: HTMLElement, currentIndex: number, delta: number): number {
  const buttons = resultButtons(container);
  if (!buttons.length) {
    return -1;
  }

  const nextIndex = currentIndex < 0
    ? (delta > 0 ? 0 : buttons.length - 1)
    : Math.max(0, Math.min(buttons.length - 1, currentIndex + delta));

  updateSelection(container, nextIndex);
  buttons[nextIndex].scrollIntoView({ block: "nearest" });
  return nextIndex;
}

export function triggerSelection(container: HTMLElement, currentIndex: number): void {
  const buttons = resultButtons(container);
  if (currentIndex >= 0 && currentIndex < buttons.length) {
    buttons[currentIndex].click();
  }
}

export function createSearchResultButton(item: PaletteItem): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "search-result-item";
  button.tabIndex = -1;
  button.addEventListener("mousedown", function (event) {
    event.preventDefault();
  });
  button.addEventListener("click", item.onSelect);

  const head = document.createElement("div");
  head.className = "search-result-head";

  const strong = document.createElement("strong");
  strong.textContent = item.title;
  head.appendChild(strong);

  if (item.hint) {
    const hintNode = document.createElement("span");
    hintNode.className = "search-result-hint";
    hintNode.textContent = item.hint;
    head.appendChild(hintNode);
  }

  button.appendChild(head);

  if (item.meta) {
    const small = document.createElement("small");
    small.textContent = item.meta;
    button.appendChild(small);
  }

  if (item.snippet) {
    const snippetNode = document.createElement("div");
    snippetNode.className = "search-result-snippet";
    snippetNode.textContent = item.snippet;
    button.appendChild(snippetNode);
  }

  return button;
}

export function renderPaletteSection(section: PaletteSection, showHeading: boolean): HTMLElement {
  const wrapper = document.createElement("section");
  wrapper.className = "search-result-section";

  if (showHeading) {
    const heading = document.createElement("h3");
    heading.textContent = section.title;
    wrapper.appendChild(heading);
  }

  if (!section.items.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "No matches.";
    wrapper.appendChild(empty);
    return wrapper;
  }

  const list = document.createElement("div");
  list.className = "search-result-list";
  section.items.forEach(function (item) {
    list.appendChild(createSearchResultButton(item));
  });
  wrapper.appendChild(list);
  return wrapper;
}

export function renderPaletteSections(
  container: HTMLElement,
  sections: PaletteSection[],
  emptyMessage: string
): number {
  clearNode(container);

  const nonEmptySections = sections.filter(function (section) {
    return section.items.length > 0;
  });

  if (!nonEmptySections.length) {
    renderEmpty(container, emptyMessage);
    return -1;
  }

  const showHeadings = nonEmptySections.length > 1;
  nonEmptySections.forEach(function (section) {
    container.appendChild(renderPaletteSection(section, showHeadings));
  });

  return resultButtons(container).length ? 0 : -1;
}

export function pageLeafName(pagePath: string): string {
  const parts = String(pagePath || "").split("/");
  return parts[parts.length - 1] || pagePath;
}
