export function requiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error('Missing required UI element "' + id + '"');
  }
  return element as T;
}

export function optionalElement<T extends HTMLElement>(id: string): T | null {
  const element = document.getElementById(id);
  return element ? (element as T) : null;
}

export function optionalQuery<T extends Element>(selector: string): T | null {
  const element = document.querySelector(selector);
  return element ? (element as T) : null;
}

export function clearNode(node: Element): void {
  while (node.firstChild) {
    node.removeChild(node.firstChild);
  }
}

export function renderEmpty(node: Element, message: string): void {
  clearNode(node);
  const empty = document.createElement("div");
  empty.className = "empty";
  empty.textContent = message;
  node.appendChild(empty);
}

export function focusWithoutScroll(node: { focus: (options?: FocusOptions) => void } | null | undefined): void {
  if (!node || typeof node.focus !== "function") {
    return;
  }
  try {
    node.focus({ preventScroll: true });
  } catch (_error) {
    node.focus();
  }
}
