import { clearNode, renderEmpty } from "./dom";
import type { SavedQueryTreeFolder } from "./types";

export function renderSavedQueryTree(
  container: HTMLDivElement,
  queryTree: SavedQueryTreeFolder[],
  selectedSavedQuery: string,
  onSelectSavedQuery: (name: string) => void
): void {
  clearNode(container);
  if (!queryTree.length) {
    renderEmpty(container, "No saved queries match the current search.");
    return;
  }

  queryTree.forEach(function (bucket) {
    const block = document.createElement("div");
    block.className = "folder-block";

    const head = document.createElement("div");
    head.className = "folder-head";
    const title = document.createElement("strong");
    title.textContent = bucket.folder || "(root)";
    const count = document.createElement("small");
    count.textContent = String(bucket.count) + " query" + (bucket.count === 1 ? "" : "ies");
    head.appendChild(title);
    head.appendChild(count);
    block.appendChild(head);

    const body = document.createElement("div");
    body.className = "folder-body";

    (bucket.queries || []).forEach(function (savedQuery) {
      const item = document.createElement("div");
      item.className = "tree-item";
      const button = document.createElement("button");
      button.type = "button";
      if (selectedSavedQuery === savedQuery.name) {
        button.classList.add("active");
      }
      button.addEventListener("click", function () {
        onSelectSavedQuery(savedQuery.name);
      });

      const strong = document.createElement("strong");
      strong.textContent = savedQuery.title || savedQuery.name;
      const small = document.createElement("small");
      const parts = [savedQuery.name];
      if (savedQuery.tags && savedQuery.tags.length) {
        parts.push("[" + savedQuery.tags.join(", ") + "]");
      }
      small.textContent = parts.join(" ");
      button.appendChild(strong);
      button.appendChild(small);
      item.appendChild(button);
      body.appendChild(item);
    });

    block.appendChild(body);
    container.appendChild(block);
  });
}
