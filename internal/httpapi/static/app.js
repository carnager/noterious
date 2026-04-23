"use strict";
(() => {
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __esm = (fn, res) => function __init() {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  };
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };

  // frontend/dom.ts
  function requiredElement(id) {
    const element = document.getElementById(id);
    if (!element) {
      throw new Error('Missing required UI element "' + id + '"');
    }
    return element;
  }
  function optionalElement(id) {
    const element = document.getElementById(id);
    return element ? element : null;
  }
  function optionalQuery(selector) {
    const element = document.querySelector(selector);
    return element ? element : null;
  }
  function clearNode(node) {
    while (node.firstChild) {
      node.removeChild(node.firstChild);
    }
  }
  function renderEmpty(node, message) {
    clearNode(node);
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = message;
    node.appendChild(empty);
  }
  function focusWithoutScroll(node) {
    if (!node || typeof node.focus !== "function") {
      return;
    }
    try {
      node.focus({ preventScroll: true });
    } catch (_error) {
      node.focus();
    }
  }
  var init_dom = __esm({
    "frontend/dom.ts"() {
      "use strict";
    }
  });

  // frontend/palette.ts
  function setPaletteOpen(shell, input, open) {
    shell.classList.toggle("hidden", !open);
    if (open) {
      window.setTimeout(function() {
        input.focus();
        input.select();
      }, 0);
    }
  }
  function resultButtons(container) {
    return Array.from(container.querySelectorAll(".search-result-item"));
  }
  function updateSelection(container, index) {
    resultButtons(container).forEach(function(button, buttonIndex) {
      button.classList.toggle("active", buttonIndex === index);
    });
  }
  function moveSelection(container, currentIndex, delta) {
    const buttons = resultButtons(container);
    if (!buttons.length) {
      return -1;
    }
    const nextIndex = currentIndex < 0 ? delta > 0 ? 0 : buttons.length - 1 : Math.max(0, Math.min(buttons.length - 1, currentIndex + delta));
    updateSelection(container, nextIndex);
    buttons[nextIndex].scrollIntoView({ block: "nearest" });
    return nextIndex;
  }
  function triggerSelection(container, currentIndex) {
    const buttons = resultButtons(container);
    if (currentIndex >= 0 && currentIndex < buttons.length) {
      buttons[currentIndex].click();
    }
  }
  function createSearchResultButton(item) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "search-result-item";
    button.tabIndex = -1;
    button.addEventListener("mousedown", function(event) {
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
  function renderPaletteSection(section, showHeading) {
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
    section.items.forEach(function(item) {
      list.appendChild(createSearchResultButton(item));
    });
    wrapper.appendChild(list);
    return wrapper;
  }
  function renderPaletteSections(container, sections, emptyMessage) {
    clearNode(container);
    const nonEmptySections = sections.filter(function(section) {
      return section.items.length > 0;
    });
    if (!nonEmptySections.length) {
      renderEmpty(container, emptyMessage);
      return -1;
    }
    const showHeadings = nonEmptySections.length > 1;
    nonEmptySections.forEach(function(section) {
      container.appendChild(renderPaletteSection(section, showHeadings));
    });
    return resultButtons(container).length ? 0 : -1;
  }
  function pageLeafName(pagePath) {
    const parts = String(pagePath || "").split("/");
    return parts[parts.length - 1] || pagePath;
  }
  var init_palette = __esm({
    "frontend/palette.ts"() {
      "use strict";
      init_dom();
    }
  });

  // frontend/commands.ts
  function normalizePageDraftPath(value) {
    return String(value || "").trim().replace(/\\/g, "/").replace(/\.md$/i, "").replace(/^\/+/, "").replace(/\/+/g, "/");
  }
  function pageTitleFromPath(pagePath) {
    return pageLeafName(pagePath);
  }
  function buildCommandEntries(options) {
    const commands = [
      {
        title: options.sourceOpen ? "Close Raw Mode" : "Open Raw Mode",
        meta: "Editor",
        keywords: "raw mode markdown source editor",
        hint: "Ctrl+E",
        run: options.onToggleSource
      },
      {
        title: "Global Search",
        meta: "Search",
        keywords: "search find global",
        hint: "Ctrl+K",
        run: options.onOpenSearch
      },
      {
        title: "Focus Files",
        meta: "Rail",
        keywords: "files pages rail sidebar",
        run: function() {
          options.onFocusRail("files");
        }
      },
      {
        title: "Focus Context",
        meta: "Rail",
        keywords: "context backlinks links queries rail",
        run: function() {
          options.onFocusRail("context");
        }
      },
      {
        title: "Focus Tasks",
        meta: "Rail",
        keywords: "tasks rail",
        run: function() {
          options.onFocusRail("tasks");
        }
      },
      {
        title: "Focus Tags",
        meta: "Rail",
        keywords: "tags rail",
        run: function() {
          options.onFocusRail("tags");
        }
      },
      {
        title: options.railOpen ? "Close Sidebar" : "Open Sidebar",
        meta: "Layout",
        keywords: "sidebar rail drawer",
        run: options.onToggleRail
      }
    ];
    if (options.currentHomePage) {
      commands.push({
        title: "Open Home Page",
        meta: options.currentHomePage,
        keywords: "home start page default landing",
        run: function() {
          options.onOpenHomePage(options.currentHomePage);
        }
      });
    }
    if (options.selectedPage) {
      const selectedIsHomePage = Boolean(
        options.currentHomePage && options.currentHomePage.toLowerCase() === String(options.selectedPage).toLowerCase()
      );
      commands.push({
        title: selectedIsHomePage ? "Home Page Already Set" : "Set Home Page",
        meta: options.selectedPage,
        keywords: "home start page default landing",
        hint: selectedIsHomePage ? "Current" : "",
        run: function() {
          if (!selectedIsHomePage) {
            options.onSetHomePage(options.selectedPage);
          }
        }
      });
      commands.push({
        title: "Delete Page",
        meta: options.selectedPage,
        keywords: "delete remove page note file",
        hint: "Del",
        run: function() {
          options.onDeletePage(options.selectedPage);
        }
      });
    }
    if (options.currentHomePage) {
      commands.push({
        title: "Clear Home Page",
        meta: options.currentHomePage,
        keywords: "home start page default landing reset clear",
        run: options.onClearHomePage
      });
    }
    return commands;
  }
  function buildCommandPaletteSections(options) {
    const query = String(options.inputValue || "").trim().toLowerCase();
    const rawQuery = String(options.inputValue || "").trim();
    const normalizedDraftPath = normalizePageDraftPath(rawQuery);
    const commands = buildCommandEntries(options).filter(function(command) {
      if (!query) {
        return true;
      }
      return [command.title, command.meta, command.keywords].join(" ").toLowerCase().indexOf(query) >= 0;
    });
    const pageExists = normalizedDraftPath ? options.pages.some(function(page) {
      return String(page.path || "").toLowerCase() === normalizedDraftPath.toLowerCase();
    }) : false;
    const moveCommands = options.selectedPage && normalizedDraftPath && !pageExists && normalizedDraftPath.toLowerCase() !== String(options.selectedPage).toLowerCase() ? [{
      title: "Move Page",
      meta: options.selectedPage + " \u2192 " + normalizedDraftPath,
      keywords: "move rename page note file",
      hint: "Enter",
      run: function() {
        options.onMovePage(options.selectedPage, normalizedDraftPath);
      }
    }] : [];
    const createCommands = normalizedDraftPath && !pageExists ? [{
      title: "Create Page",
      meta: normalizedDraftPath,
      keywords: "new page create note file",
      hint: "Enter",
      run: function() {
        options.onCreatePage(normalizedDraftPath);
      }
    }] : [];
    const pages = options.pages.filter(function(page) {
      if (!query) {
        return true;
      }
      return [page.path, page.title || "", (page.tags || []).join(" ")].join(" ").toLowerCase().indexOf(query) >= 0;
    }).slice(0, 20);
    return [
      {
        title: "Move",
        items: moveCommands.map(function(command) {
          return {
            title: command.title,
            meta: command.meta,
            hint: command.hint || "",
            onSelect: command.run
          };
        })
      },
      {
        title: "Create",
        items: createCommands.map(function(command) {
          return {
            title: command.title,
            meta: command.meta,
            hint: command.hint || "",
            onSelect: command.run
          };
        })
      },
      {
        title: "Commands",
        items: commands.map(function(command) {
          return {
            title: command.title,
            meta: command.meta,
            hint: command.hint || "",
            onSelect: command.run
          };
        })
      },
      {
        title: "Pages",
        items: pages.map(function(page) {
          const leaf = pageLeafName(page.path);
          const title = page.title && page.title !== leaf ? page.title : "";
          return {
            title: leaf,
            meta: [page.path, title].concat(page.tags && page.tags.length ? [page.tags.join(", ")] : []).filter(Boolean).join(" \xB7 "),
            onSelect: function() {
              options.onOpenPage(page.path);
            }
          };
        })
      }
    ];
  }
  function renderCommandPaletteResults(options) {
    return renderPaletteSections(options.container, buildCommandPaletteSections(options), "No matches.");
  }
  var init_commands = __esm({
    "frontend/commands.ts"() {
      "use strict";
      init_palette();
    }
  });

  // frontend/http.ts
  async function fetchJSON(url, options) {
    const response = await fetch(url, options);
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || "Request failed: " + response.status);
    }
    return response.json();
  }
  var init_http = __esm({
    "frontend/http.ts"() {
      "use strict";
    }
  });

  // frontend/markdown.ts
  function splitFrontmatter(markdown) {
    const source = String(markdown || "").replace(/\r\n/g, "\n");
    if (!source.startsWith("---\n")) {
      return { frontmatter: "", body: source };
    }
    const closing = source.indexOf("\n---\n", 4);
    if (closing === -1) {
      return { frontmatter: "", body: source };
    }
    return {
      frontmatter: source.slice(0, closing + 5),
      body: source.slice(closing + 5)
    };
  }
  function parseFrontmatterScalar(raw) {
    const text = String(raw || "").trim();
    if (!text) {
      return "";
    }
    if (text.startsWith('"') && text.endsWith('"') || text.startsWith("'") && text.endsWith("'")) {
      return text.slice(1, -1);
    }
    if (text === "true") {
      return true;
    }
    if (text === "false") {
      return false;
    }
    if (text.startsWith("[") && text.endsWith("]")) {
      return text.slice(1, -1).split(",").map((part) => parseFrontmatterScalar(part)).flat().filter((part) => !(typeof part === "string" && !part.trim()));
    }
    return text;
  }
  function parseFrontmatter(markdown) {
    const split = splitFrontmatter(markdown);
    if (!split.frontmatter) {
      return {};
    }
    const lines = split.frontmatter.replace(/^---\n/, "").replace(/\n---\n?$/, "").split("\n");
    const result = {};
    let pendingListKey = "";
    lines.forEach((line) => {
      if (!String(line || "").trim()) {
        return;
      }
      if (pendingListKey && /^\s*-\s+/.test(line)) {
        const existing = result[pendingListKey];
        const values = Array.isArray(existing) ? existing.slice() : [];
        values.push(parseFrontmatterScalar(line.replace(/^\s*-\s+/, "")));
        result[pendingListKey] = values;
        return;
      }
      pendingListKey = "";
      const match = line.match(/^([A-Za-z0-9_-]+):(?:\s*(.*))?$/);
      if (!match) {
        return;
      }
      const key = match[1];
      const rawValue = typeof match[2] === "string" ? match[2] : "";
      if (!rawValue.trim()) {
        result[key] = "";
        pendingListKey = key;
        return;
      }
      result[key] = parseFrontmatterScalar(rawValue);
    });
    return result;
  }
  function editableBody(markdown) {
    return splitFrontmatter(markdown).body;
  }
  function inferMarkdownTitle(markdown, fallbackPage) {
    const frontmatter = parseFrontmatter(markdown);
    if (frontmatter.title && String(frontmatter.title).trim()) {
      return String(frontmatter.title).trim();
    }
    const body = editableBody(markdown);
    const match = body.match(/^#{1,6}\s+(.+)$/m);
    if (match && match[1]) {
      return String(match[1]).trim();
    }
    if (fallbackPage) {
      return fallbackPage.title || fallbackPage.page || fallbackPage.path || "";
    }
    return "";
  }
  function rawOffsetForBodyPosition(markdown, lineIndex, caret) {
    const split = splitFrontmatter(markdown);
    const body = split.body;
    const lines = body.split("\n");
    const clampedLine = Math.max(0, Math.min(Number(lineIndex) || 0, Math.max(0, lines.length - 1)));
    let offset = split.frontmatter.length;
    for (let index = 0; index < clampedLine; index += 1) {
      offset += lines[index].length + 1;
    }
    const lineText = lines[clampedLine] || "";
    offset += Math.max(0, Math.min(Number(caret) || 0, lineText.length));
    return offset;
  }
  function rawOffsetForLineNumber(markdown, lineNumber) {
    const source = String(markdown || "").replace(/\r\n/g, "\n");
    const lines = source.split("\n");
    const target = Math.max(1, Math.min(Number(lineNumber) || 1, Math.max(1, lines.length)));
    let offset = 0;
    for (let index = 1; index < target; index += 1) {
      offset += (lines[index - 1] || "").length + 1;
    }
    return offset;
  }
  function rawOffsetForTaskLine(markdown, lineNumber) {
    const baseOffset = rawOffsetForLineNumber(markdown, lineNumber);
    const source = String(markdown || "").replace(/\r\n/g, "\n");
    const lines = source.split("\n");
    const target = Math.max(1, Math.min(Number(lineNumber) || 1, Math.max(1, lines.length)));
    const lineText = String(lines[target - 1] || "");
    const match = lineText.match(/^(\s*-\s+\[[ xX]\]\s+)/);
    if (!match) {
      return baseOffset;
    }
    return baseOffset + match[1].length;
  }
  function parseQueryFenceOptions(source) {
    const lines = String(source || "").replace(/\r\n/g, "\n").split("\n");
    const firstLine = String(lines[0] || "").trim();
    if (!/^```query(?:\s|$)/i.test(firstLine)) {
      return {};
    }
    const options = {};
    const tail = firstLine.replace(/^```query\s*/i, "");
    const pattern = /([A-Za-z0-9_-]+)=("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^\s]+)/g;
    let match = null;
    while ((match = pattern.exec(tail)) !== null) {
      const key = String(match[1] || "").trim();
      let value = String(match[2] || "").trim();
      if (value.startsWith('"') && value.endsWith('"') || value.startsWith("'") && value.endsWith("'")) {
        value = value.slice(1, -1);
      }
      options[key] = value;
    }
    return options;
  }
  function escapeHTML(value) {
    return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function wikiLinkAtCaret(line, caret) {
    const source = String(line || "");
    const pattern = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
    let match = null;
    while ((match = pattern.exec(source)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      if (caret >= start && caret <= end) {
        return {
          target: String(match[1] || "").trim(),
          label: String(match[2] || match[1] || "").trim()
        };
      }
    }
    return null;
  }
  var init_markdown = __esm({
    "frontend/markdown.ts"() {
      "use strict";
    }
  });

  // frontend/details.ts
  async function toggleTaskDone(task) {
    await fetchJSON("/api/tasks/" + encodeURIComponent(task.ref), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        state: task.done ? "todo" : "done",
        due: task.due || "",
        remind: task.remind || "",
        who: task.who || []
      })
    });
  }
  async function loadPageDetailData(pagePath, encodePath, pendingPageTaskRef, pendingPageLineFocus) {
    const [page, derived] = await Promise.all([
      fetchJSON("/api/pages/" + encodePath(pagePath)),
      fetchJSON("/api/pages/" + encodePath(pagePath) + "/derived")
    ]);
    let targetLine = pendingPageLineFocus;
    if (pendingPageTaskRef) {
      const matchedTask = Array.isArray(page.tasks) ? page.tasks.find(function(task) {
        return String(task.ref || "") === pendingPageTaskRef;
      }) : null;
      if (matchedTask && matchedTask.line) {
        targetLine = matchedTask.line;
      }
    }
    const markdown = page.rawMarkdown || "";
    const focusOffset = pendingPageTaskRef || pendingPageLineFocus ? pendingPageTaskRef ? rawOffsetForTaskLine(markdown, targetLine || 1) : rawOffsetForLineNumber(markdown, targetLine || 1) : null;
    return {
      page,
      derived,
      focusOffset
    };
  }
  async function loadSavedQueryDetailData(name) {
    const savedQuery = await fetchJSON("/api/queries/" + encodeURIComponent(name));
    const workbench = await fetchJSON("/api/queries/" + encodeURIComponent(name) + "/workbench", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ previewLimit: 8 })
    });
    return {
      savedQuery,
      workbench: workbench.workbench
    };
  }
  function buildTaskSavePayload(taskText, taskState, taskDue, taskRemind, taskWho, serializeDateTimeValue2) {
    return {
      text: taskText.trim(),
      state: taskState,
      due: taskDue.trim(),
      remind: serializeDateTimeValue2(taskRemind),
      who: taskWho.split(",").map(function(part) {
        return part.trim();
      }).filter(Boolean)
    };
  }
  async function saveTask(ref, payload) {
    await fetchJSON("/api/tasks/" + encodeURIComponent(ref), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  }
  async function savePageMarkdown(pagePath, markdownToSave, encodePath) {
    return fetchJSON("/api/pages/" + encodePath(pagePath), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rawMarkdown: markdownToSave })
    });
  }
  var init_details = __esm({
    "frontend/details.ts"() {
      "use strict";
      init_http();
      init_markdown();
    }
  });

  // frontend/editorState.ts
  function markdownEditorAPI(state) {
    return state.markdownEditorApi || null;
  }
  function markdownEditorValue(state, elements) {
    const api = markdownEditorAPI(state);
    return api ? api.getValue() : elements.markdownEditor.value;
  }
  function setMarkdownEditorValue(state, elements, value) {
    const api = markdownEditorAPI(state);
    if (api) {
      api.setValue(value);
      return;
    }
    elements.markdownEditor.value = value;
  }
  function markdownEditorSelectionStart(state, elements) {
    const api = markdownEditorAPI(state);
    return api ? api.getSelectionStart() : elements.markdownEditor.selectionStart || 0;
  }
  function markdownEditorSelectionEnd(state, elements) {
    const api = markdownEditorAPI(state);
    return api ? api.getSelectionEnd() : elements.markdownEditor.selectionEnd || 0;
  }
  function setMarkdownEditorSelection(state, elements, anchor, head, reveal) {
    const api = markdownEditorAPI(state);
    if (api) {
      api.setSelectionRange(anchor, typeof head === "number" ? head : anchor, Boolean(reveal));
      return;
    }
    elements.markdownEditor.setSelectionRange(anchor, typeof head === "number" ? head : anchor);
  }
  function focusMarkdownEditor(state, elements, options) {
    const api = markdownEditorAPI(state);
    if (api) {
      api.focus(options);
      return;
    }
    focusWithoutScroll(elements.markdownEditor);
  }
  function markdownEditorScrollTop(state, elements) {
    const api = markdownEditorAPI(state);
    return api ? api.getScrollTop() : elements.markdownEditor.scrollTop;
  }
  function setMarkdownEditorScrollTop(state, elements, value) {
    const api = markdownEditorAPI(state);
    if (api) {
      api.setScrollTop(value);
      return;
    }
    elements.markdownEditor.scrollTop = value;
  }
  function markdownEditorHasFocus(state, elements) {
    const api = markdownEditorAPI(state);
    return api ? api.hasFocus() : document.activeElement === elements.markdownEditor;
  }
  function markdownEditorCaretRect(state) {
    const api = markdownEditorAPI(state);
    return api && typeof api.getCaretRect === "function" ? api.getCaretRect() : null;
  }
  function markdownEditorSetRenderMode(state, enabled) {
    const api = markdownEditorAPI(state);
    if (api && typeof api.setRenderMode === "function") {
      api.setRenderMode(Boolean(enabled));
    }
  }
  function markdownEditorSetQueryBlocks(state, blocks) {
    const api = markdownEditorAPI(state);
    if (api && typeof api.setQueryBlocks === "function") {
      api.setQueryBlocks(blocks);
    }
  }
  function markdownEditorSetTasks(state, tasks) {
    const api = markdownEditorAPI(state);
    if (api && typeof api.setTasks === "function") {
      api.setTasks(tasks);
    }
  }
  function currentRawLineContext(state, elements) {
    const value = markdownEditorValue(state, elements);
    const start = markdownEditorSelectionStart(state, elements);
    const end = markdownEditorSelectionEnd(state, elements);
    const lineStart = value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
    const lineEndIndex = value.indexOf("\n", end);
    const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex;
    return {
      value,
      selectionStart: start,
      selectionEnd: end,
      lineStart,
      lineEnd,
      lineText: value.slice(lineStart, lineEnd),
      caretInLine: Math.max(0, start - lineStart)
    };
  }
  function captureEditorFocusSpec(state, elements) {
    if (markdownEditorHasFocus(state, elements)) {
      state.restoreFocusSpec = {
        mode: "editor",
        offset: markdownEditorSelectionStart(state, elements)
      };
    }
  }
  function blockingOverlayOpen(elements) {
    return Boolean(
      !elements.taskModalShell.classList.contains("hidden") || !elements.searchModalShell.classList.contains("hidden") || !elements.commandModalShell.classList.contains("hidden")
    );
  }
  function restoreEditorFocus(state, elements, selectedPage) {
    if (!selectedPage || !state.restoreFocusSpec) {
      return;
    }
    if (blockingOverlayOpen(elements)) {
      return;
    }
    const focusSpec = state.restoreFocusSpec;
    state.restoreFocusSpec = null;
    window.requestAnimationFrame(function() {
      if (focusSpec.mode === "editor") {
        const value = markdownEditorValue(state, elements);
        const offset = Math.max(0, Math.min(Number(focusSpec.offset) || 0, value.length));
        focusMarkdownEditor(state, elements, { preventScroll: true });
        setMarkdownEditorSelection(state, elements, offset, offset);
      }
    });
  }
  var init_editorState = __esm({
    "frontend/editorState.ts"() {
      "use strict";
      init_dom();
    }
  });

  // frontend/noteView.ts
  function currentPageView(currentPage, currentMarkdown) {
    if (!currentPage) {
      return null;
    }
    const liveFrontmatter = parseFrontmatter(currentMarkdown);
    const title = inferMarkdownTitle(currentMarkdown, currentPage);
    return Object.assign({}, currentPage, {
      frontmatter: liveFrontmatter,
      title: title || currentPage.title || currentPage.page || currentPage.path || ""
    });
  }
  function queryResultLinkSpec(columns, row) {
    if (!Array.isArray(columns) || !row) {
      return null;
    }
    const pagePath = row.path || row.__pagePath;
    if (!pagePath) {
      return null;
    }
    if (columns.indexOf("vorname") !== -1 && columns.indexOf("nachname") !== -1) {
      const first = String(row.vorname || "").trim();
      const last = String(row.nachname || "").trim();
      const label = [first, last].filter(Boolean).join(" ").trim();
      if (label) {
        return {
          mode: "synthetic",
          column: "__page_link__",
          label: "Name",
          text: label,
          hiddenColumns: ["path", "vorname", "nachname"]
        };
      }
    }
    const directCandidates = ["title", "name", "vorname", "nachname"];
    for (let index = 0; index < directCandidates.length; index += 1) {
      const candidate = directCandidates[index];
      if (columns.indexOf(candidate) !== -1 && row[candidate]) {
        return {
          mode: "column",
          columns: ["title", "name"].indexOf(candidate) !== -1 ? [candidate] : ["nachname", "vorname"].filter(function(field) {
            return columns.indexOf(field) !== -1 && Boolean(row[field]);
          }),
          hiddenColumns: columns.indexOf("path") !== -1 ? ["path"] : []
        };
      }
    }
    return null;
  }
  function renderQueryResultCell(column, value) {
    if (column === "path" && value) {
      const pagePath = String(value);
      return '<button type="button" class="wiki-link" data-page-link="' + escapeHTML(pagePath) + '">' + escapeHTML(pagePath) + "</button>";
    }
    const isPhoneLikeColumn = /(^|_)(phone|telefon|tel)(_|$)/i.test(column);
    const splitPhoneLines = function(input) {
      return input.split(/\r?\n|[;,](?=\s*\+?\d|\s*\(?\d)/).map(function(part) {
        return part.trim();
      }).filter(Boolean);
    };
    if (Array.isArray(value)) {
      const items = (isPhoneLikeColumn ? value.flatMap(function(item) {
        return splitPhoneLines(String(item));
      }) : value.map(String)).filter(Boolean);
      if (!items.length) {
        return '<span class="query-result-empty">\u2014</span>';
      }
      return '<div class="query-result-lines">' + items.map(function(item) {
        return '<span class="query-result-line">' + escapeHTML(String(item)) + "</span>";
      }).join("") + "</div>";
    }
    if (isPhoneLikeColumn && typeof value === "string") {
      const lines = splitPhoneLines(value);
      if (lines.length > 1) {
        return '<div class="query-result-lines">' + lines.map(function(line) {
          return '<span class="query-result-line">' + escapeHTML(line) + "</span>";
        }).join("") + "</div>";
      }
    }
    if (value === null || typeof value === "undefined" || value === "") {
      return '<span class="query-result-empty">\u2014</span>';
    }
    if (typeof value === "boolean") {
      return value ? "true" : "false";
    }
    return escapeHTML(String(value));
  }
  function queryResultDisplayColumns(columns, rows) {
    if (!Array.isArray(columns)) {
      return [];
    }
    const sampleRow = Array.isArray(rows) && rows.length ? rows[0] : null;
    const linkSpec = queryResultLinkSpec(columns, sampleRow);
    if (!linkSpec) {
      return columns.slice();
    }
    if (linkSpec.mode === "synthetic") {
      return [String(linkSpec.column)].concat(columns.filter(function(column) {
        return linkSpec.hiddenColumns.indexOf(column) === -1;
      }));
    }
    return columns.filter(function(column) {
      return linkSpec.hiddenColumns.indexOf(column) === -1;
    });
  }
  function queryResultColumnLabel(column, columns, row) {
    const linkSpec = queryResultLinkSpec(columns, row);
    if (linkSpec && linkSpec.mode === "synthetic" && column === linkSpec.column) {
      return linkSpec.label;
    }
    return column;
  }
  function renderQueryResultDisplayCell(column, row, columns) {
    const linkSpec = queryResultLinkSpec(columns, row);
    const pagePathValue = row ? row.path || row.__pagePath : "";
    const pageLineValue = row ? row.__pageLine : "";
    if (linkSpec && pagePathValue) {
      const pagePath = String(pagePathValue);
      if (linkSpec.mode === "synthetic" && column === linkSpec.column) {
        return '<button type="button" class="wiki-link query-cell-link" data-page-link="' + escapeHTML(pagePath) + '">' + escapeHTML(linkSpec.text) + "</button>";
      }
      if (linkSpec.mode === "column" && Array.isArray(linkSpec.columns) && linkSpec.columns.indexOf(column) !== -1) {
        return '<button type="button" class="wiki-link query-cell-link" data-page-link="' + escapeHTML(pagePath) + '">' + escapeHTML(String(row?.[column])) + "</button>";
      }
    }
    if (column === "text" && pagePathValue) {
      const pagePath = String(pagePathValue);
      const lineAttr = pageLineValue !== null && typeof pageLineValue !== "undefined" ? ' data-page-line="' + escapeHTML(String(pageLineValue)) + '"' : "";
      const refValue = row && row.__taskRef ? String(row.__taskRef) : "";
      const refAttr = refValue ? ' data-task-ref="' + escapeHTML(refValue) + '"' : "";
      return '<button type="button" class="wiki-link query-cell-link" data-page-link="' + escapeHTML(pagePath) + '"' + lineAttr + refAttr + ">" + escapeHTML(String(row ? row[column] || "" : "")) + "</button>";
    }
    return renderQueryResultCell(column, row ? row[column] : void 0);
  }
  function renderEmbeddedQueryBlock(block) {
    if (!block) {
      return null;
    }
    const options = parseQueryFenceOptions(block.source || "");
    if (block.error) {
      return '<div class="embedded-query embedded-query-error"><small>' + escapeHTML(block.error) + "</small></div>";
    }
    const columns = Array.isArray(block.result?.columns) ? block.result.columns : [];
    const rows = Array.isArray(block.result?.rows) ? block.result.rows : [];
    const displayColumns = queryResultDisplayColumns(columns, rows);
    if (!rows.length) {
      return '<div class="embedded-query embedded-query-empty"><small>' + escapeHTML(options.empty || "No results.") + "</small></div>";
    }
    if (displayColumns.length === 1) {
      return '<div class="embedded-query embedded-query-list"><ul>' + rows.map(function(row) {
        return "<li>" + renderQueryResultDisplayCell(displayColumns[0], row, columns) + "</li>";
      }).join("") + "</ul></div>";
    }
    return '<div class="embedded-query embedded-query-table"><table><thead><tr>' + displayColumns.map(function(column) {
      return "<th>" + escapeHTML(queryResultColumnLabel(column, columns, rows[0] || null)) + "</th>";
    }).join("") + "</tr></thead><tbody>" + rows.map(function(row) {
      return "<tr>" + displayColumns.map(function(column) {
        return "<td>" + renderQueryResultDisplayCell(column, row, columns) + "</td>";
      }).join("") + "</tr>";
    }).join("") + "</tbody></table></div>";
  }
  function renderedQueryBlocksForEditor(derived) {
    if (!derived || !Array.isArray(derived.queryBlocks)) {
      return [];
    }
    return derived.queryBlocks.map(function(block) {
      return {
        source: block.source || "",
        html: renderEmbeddedQueryBlock(block) || '<div class="embedded-query embedded-query-empty"><small>No results.</small></div>'
      };
    });
  }
  function renderedTasksForEditor(page) {
    if (!page || !Array.isArray(page.tasks)) {
      return [];
    }
    return page.tasks.map(function(task) {
      return {
        line: task.line,
        ref: task.ref || "",
        text: task.text || "",
        done: Boolean(task.done),
        due: task.due || "",
        remind: task.remind || "",
        who: Array.isArray(task.who) ? task.who.slice() : []
      };
    });
  }
  var init_noteView = __esm({
    "frontend/noteView.ts"() {
      "use strict";
      init_markdown();
    }
  });

  // frontend/pageViews.ts
  function ensureExpandedPageAncestors(path, expandedPageFolders) {
    const parts = String(path || "").split("/");
    let key = "";
    for (let index = 0; index < parts.length - 1; index += 1) {
      key = key ? key + "/" + parts[index] : parts[index];
      expandedPageFolders[key] = true;
    }
  }
  function buildPageTree(pages) {
    const root = { folders: {}, pages: [] };
    pages.forEach(function(page) {
      const segments = String(page.path || "").split("/");
      let cursor = root;
      for (let index = 0; index < segments.length - 1; index += 1) {
        const segment = segments[index];
        if (!cursor.folders[segment]) {
          cursor.folders[segment] = { key: segments.slice(0, index + 1).join("/"), name: segment, folders: {}, pages: [] };
        }
        cursor = cursor.folders[segment];
      }
      cursor.pages.push(page);
    });
    return root;
  }
  function renderPageTreeNode(node, depth, expandedPageFolders, selectedPage, onToggleFolder, onSelectPage) {
    const group = document.createElement("div");
    group.className = depth === 0 ? "page-tree-root" : "page-tree-children";
    Object.keys(node.folders).sort().forEach(function(name) {
      const folder = node.folders[name];
      const item = document.createElement("div");
      item.className = "page-tree-node page-tree-folder";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "page-tree-toggle";
      button.setAttribute("aria-expanded", expandedPageFolders[folder.key] ? "true" : "false");
      button.addEventListener("click", function() {
        onToggleFolder(folder.key);
      });
      const chevron = document.createElement("span");
      chevron.className = "page-tree-chevron";
      chevron.textContent = expandedPageFolders[folder.key] ? "\u25BE" : "\u25B8";
      const icon = document.createElement("span");
      icon.className = "page-tree-icon";
      icon.textContent = expandedPageFolders[folder.key] ? "\u{1F4C2}" : "\u{1F4C1}";
      const label = document.createElement("span");
      label.className = "page-tree-label";
      label.textContent = folder.name;
      button.appendChild(chevron);
      button.appendChild(icon);
      button.appendChild(label);
      item.appendChild(button);
      if (expandedPageFolders[folder.key]) {
        item.appendChild(renderPageTreeNode(folder, depth + 1, expandedPageFolders, selectedPage, onToggleFolder, onSelectPage));
      }
      group.appendChild(item);
    });
    node.pages.slice().sort(function(left, right) {
      return String(left.path).localeCompare(String(right.path));
    }).forEach(function(page) {
      const leafName = String(page.path || "").split("/").slice(-1)[0] || page.path;
      const item = document.createElement("div");
      item.className = "page-tree-node page-tree-leaf";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "page-tree-page";
      if (selectedPage === page.path) {
        button.classList.add("active");
      }
      button.addEventListener("click", function() {
        onSelectPage(page.path);
      });
      const icon = document.createElement("span");
      icon.className = "page-tree-icon";
      icon.textContent = "\u2022";
      const label = document.createElement("span");
      label.className = "page-tree-label";
      label.textContent = leafName;
      button.appendChild(icon);
      button.appendChild(label);
      item.appendChild(button);
      group.appendChild(item);
    });
    return group;
  }
  function renderPagesTree(container, pages, selectedPage, expandedPageFolders, pageSearchQuery, onToggleFolder, onSelectPage) {
    clearNode(container);
    if (!pages.length) {
      renderEmpty(container, "No indexed pages match the current search.");
      return;
    }
    if (pageSearchQuery) {
      const expanded = {};
      pages.forEach(function(page) {
        const parts = String(page.path || "").split("/");
        let key = "";
        for (let index = 0; index < parts.length - 1; index += 1) {
          key = key ? key + "/" + parts[index] : parts[index];
          expanded[key] = true;
        }
      });
      Object.keys(expanded).forEach(function(key) {
        expandedPageFolders[key] = true;
      });
    }
    container.appendChild(renderPageTreeNode(buildPageTree(pages), 0, expandedPageFolders, selectedPage, onToggleFolder, onSelectPage));
  }
  function renderPageTasks(container, tasks, onOpenTask) {
    clearNode(container);
    if (!tasks || !tasks.length) {
      renderEmpty(container, "No indexed tasks on this page.");
      return;
    }
    tasks.forEach(function(task) {
      const item = document.createElement("div");
      item.className = "page-task-item";
      const button = document.createElement("button");
      button.type = "button";
      button.addEventListener("click", function() {
        onOpenTask(task);
      });
      const title = document.createElement("strong");
      title.textContent = task.text || task.ref;
      button.appendChild(title);
      const meta = document.createElement("div");
      meta.className = "page-task-meta";
      [
        task.done ? "done" : "open",
        task.due ? "due " + task.due : "no due",
        task.remind ? "remind " + task.remind : "",
        task.who && task.who.length ? task.who.join(", ") : ""
      ].filter(Boolean).forEach(function(part) {
        const token = document.createElement("span");
        token.className = "token";
        if (part.indexOf("no due") === 0) {
          token.classList.add("warn");
        }
        token.textContent = part;
        meta.appendChild(token);
      });
      button.appendChild(meta);
      item.appendChild(button);
      container.appendChild(item);
    });
  }
  function renderPageContext(container, currentPage, currentDerived) {
    clearNode(container);
    if (!currentPage || !currentDerived) {
      renderEmpty(container, "Select a page to see backlinks, links, and query blocks.");
      return;
    }
    const cards = [
      {
        title: "Backlinks",
        body: currentDerived.backlinks && currentDerived.backlinks.length ? currentDerived.backlinks.slice(0, 4).map(function(item) {
          return item.sourcePage || "unknown";
        }).join(", ") : "No backlinks yet."
      },
      {
        title: "Outgoing Links",
        body: currentPage.links && currentPage.links.length ? currentPage.links.slice(0, 4).map(function(item) {
          return item.targetPage || "unknown";
        }).join(", ") : "No outgoing links."
      },
      {
        title: "Embedded Queries",
        body: currentDerived.queryBlocks && currentDerived.queryBlocks.length ? String(currentDerived.queryBlocks.length) + " cached block(s)" : "No query blocks."
      }
    ];
    cards.forEach(function(card) {
      const item = document.createElement("div");
      item.className = "context-item";
      const strong = document.createElement("strong");
      strong.textContent = card.title;
      const small = document.createElement("small");
      small.textContent = card.body;
      item.appendChild(strong);
      item.appendChild(small);
      container.appendChild(item);
    });
  }
  function renderPageTags(container, frontmatter) {
    clearNode(container);
    if (!frontmatter) {
      renderEmpty(container, "Select a page to see tags.");
      return;
    }
    const tags = Array.isArray(frontmatter.tags) ? frontmatter.tags.map(String) : frontmatter.tags ? [String(frontmatter.tags)] : [];
    if (!tags.length) {
      renderEmpty(container, "No tags on this page.");
      return;
    }
    tags.forEach(function(tag) {
      const chip = document.createElement("span");
      chip.className = "tag-chip";
      chip.textContent = tag;
      container.appendChild(chip);
    });
  }
  var init_pageViews = __esm({
    "frontend/pageViews.ts"() {
      "use strict";
      init_dom();
    }
  });

  // frontend/properties.ts
  function inferFrontmatterKind(value) {
    if (Array.isArray(value)) {
      return "list";
    }
    if (typeof value === "boolean") {
      return "bool";
    }
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return "date";
    }
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(value)) {
      return "datetime";
    }
    return "text";
  }
  function normalizeDateTimeValue(value) {
    return String(value || "").replace(" ", "T").slice(0, 16);
  }
  function serializeDateTimeValue(value) {
    return String(value || "").replace("T", " ").trim();
  }
  function displayFrontmatterValue(value) {
    if (Array.isArray(value)) {
      return value.join(", ");
    }
    if (typeof value === "boolean") {
      return value ? "true" : "false";
    }
    return value === null || typeof value === "undefined" ? "" : String(value);
  }
  function makePropertyDraft(key, value, originalKey) {
    const kind = inferFrontmatterKind(value);
    return {
      originalKey: originalKey || key || "",
      key: key || "",
      kind,
      text: kind === "list" ? "" : displayFrontmatterValue(value),
      list: Array.isArray(value) ? value.map(String) : []
    };
  }
  function coercePropertyValue(kind, value) {
    if (kind === "list") {
      if (Array.isArray(value)) {
        return value.slice();
      }
      const textValue = displayFrontmatterValue(value).trim();
      return textValue ? [textValue] : [];
    }
    if (kind === "bool") {
      if (typeof value === "boolean") {
        return value;
      }
      return String(displayFrontmatterValue(value)).toLowerCase() === "true";
    }
    if (kind === "date") {
      return String(displayFrontmatterValue(value) || "").slice(0, 10);
    }
    if (kind === "datetime") {
      return normalizeDateTimeValue(value);
    }
    return displayFrontmatterValue(value);
  }
  function propertyDraftValue(draft) {
    if (!draft) {
      return "";
    }
    if (draft.kind === "list") {
      return draft.list.slice();
    }
    if (draft.kind === "bool") {
      return draft.text === "true";
    }
    return String(draft.text || "").trim();
  }
  function propertyMenuKey(row) {
    return row ? row.key : "__new__";
  }
  function propertyTypeIcon(kind) {
    if (kind === "list") {
      return "\u2630";
    }
    if (kind === "bool") {
      return "\u2611";
    }
    if (kind === "date" || kind === "datetime") {
      return "\u25EB";
    }
    return "\u2261";
  }
  function propertyKeyIcon(row) {
    const key = String(row.key || "").toLowerCase();
    if (key === "tags") {
      return "#";
    }
    if (key.indexOf("date") >= 0 || key.indexOf("birth") >= 0 || key.indexOf("remind") >= 0 || key === "datum") {
      return "\u25EB";
    }
    if (key.indexOf("who") >= 0 || key.indexOf("person") >= 0 || key.indexOf("name") >= 0 || key === "anwesend" || key === "vorname" || key === "nachname") {
      return "\u25CC";
    }
    return propertyTypeIcon(inferFrontmatterKind(row.rawValue));
  }
  function appendPropertyKeyContent(target, row, keyText) {
    const icon = document.createElement("span");
    icon.className = "property-key-icon";
    icon.textContent = propertyKeyIcon(row);
    target.appendChild(icon);
    const label = document.createElement("span");
    label.className = "property-key-label";
    label.textContent = keyText;
    target.appendChild(label);
  }
  function renderPropertyTypeMenu(shell, row, options) {
    const menu = document.createElement("div");
    menu.className = "property-type-menu";
    [
      ["text", "Text"],
      ["list", "List"],
      ["bool", "Checkbox"],
      ["date", "Date"],
      ["datetime", "Date & time"]
    ].forEach(function(parts) {
      const option = document.createElement("button");
      option.type = "button";
      option.className = "property-type-option";
      const icon = document.createElement("span");
      icon.className = "property-menu-icon";
      icon.textContent = propertyTypeIcon(parts[0]);
      option.appendChild(icon);
      const label = document.createElement("span");
      label.textContent = parts[1];
      option.appendChild(label);
      option.addEventListener("click", function() {
        options.onApplyKind(parts[0], row);
      });
      menu.appendChild(option);
    });
    if (row) {
      const rename = document.createElement("button");
      rename.type = "button";
      rename.className = "property-type-option";
      const renameIcon = document.createElement("span");
      renameIcon.className = "property-menu-icon";
      renameIcon.textContent = "\u270E";
      rename.appendChild(renameIcon);
      const renameLabel = document.createElement("span");
      renameLabel.textContent = "Rename";
      rename.appendChild(renameLabel);
      rename.addEventListener("click", function() {
        options.onStartRenameProperty(row);
      });
      menu.appendChild(rename);
      const separator = document.createElement("div");
      separator.className = "property-type-separator";
      menu.appendChild(separator);
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "property-type-option danger";
      const removeIcon = document.createElement("span");
      removeIcon.className = "property-menu-icon";
      removeIcon.textContent = "\u232B";
      remove.appendChild(removeIcon);
      const removeLabel = document.createElement("span");
      removeLabel.textContent = "Remove";
      remove.appendChild(removeLabel);
      remove.addEventListener("click", function() {
        options.onRemoveProperty(row.key);
      });
      menu.appendChild(remove);
    }
    shell.appendChild(menu);
  }
  function renderExistingPropertyValueEditor(row, options) {
    const kind = inferFrontmatterKind(row.rawValue);
    const value = document.createElement("div");
    value.className = "property-value property-inline-editor";
    if (kind === "list") {
      const listValue = Array.isArray(row.rawValue) ? row.rawValue : [];
      const chips = document.createElement("div");
      chips.className = "property-chip-list editable";
      listValue.forEach(function(entry, index) {
        const chip = document.createElement("span");
        chip.className = "property-chip";
        const label = document.createElement("span");
        label.textContent = String(entry);
        chip.appendChild(label);
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "property-chip-remove";
        remove.textContent = "\xD7";
        remove.addEventListener("click", function() {
          const next = listValue.slice();
          next.splice(index, 1);
          options.onSaveExistingProperty(row.key, next).catch(function(error) {
            options.onSetNoteStatus("Property save failed: " + error.message);
          });
        });
        chip.appendChild(remove);
        chips.appendChild(chip);
      });
      value.appendChild(chips);
      const addInput = document.createElement("input");
      addInput.type = "text";
      addInput.className = "property-inline-input";
      addInput.placeholder = "Add list item";
      addInput.addEventListener("keydown", function(event) {
        if (event.key === "Enter" || event.key === ",") {
          event.preventDefault();
          const nextValue = addInput.value.trim();
          if (!nextValue) {
            return;
          }
          options.onSaveExistingProperty(row.key, listValue.concat([nextValue])).catch(function(error) {
            options.onSetNoteStatus("Property save failed: " + error.message);
          });
        }
      });
      value.appendChild(addInput);
      return value;
    }
    if (kind === "bool") {
      const boolLabel = document.createElement("label");
      boolLabel.className = "property-inline-bool";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = Boolean(row.rawValue);
      checkbox.addEventListener("change", function() {
        options.onSaveExistingProperty(row.key, checkbox.checked).catch(function(error) {
          options.onSetNoteStatus("Property save failed: " + error.message);
        });
      });
      boolLabel.appendChild(checkbox);
      value.appendChild(boolLabel);
      return value;
    }
    const input = document.createElement("input");
    input.className = "property-inline-input";
    input.type = kind === "date" ? "date" : kind === "datetime" ? "datetime-local" : "text";
    input.value = kind === "datetime" ? normalizeDateTimeValue(row.rawValue) : String(row.rawValue || "");
    input.placeholder = kind === "datetime" ? "2026-04-07T14:45" : "";
    const commit = function() {
      const nextValue = input.value;
      const normalizedCurrent = kind === "datetime" ? normalizeDateTimeValue(row.rawValue) : String(row.rawValue || "");
      if (nextValue === normalizedCurrent) {
        return;
      }
      options.onSaveExistingProperty(row.key, nextValue).catch(function(error) {
        options.onSetNoteStatus("Property save failed: " + error.message);
      });
    };
    input.addEventListener("blur", commit);
    input.addEventListener("keydown", function(event) {
      if (event.key === "Enter") {
        event.preventDefault();
        input.blur();
      }
    });
    value.appendChild(input);
    return value;
  }
  function renderPropertyEditorRow(container, row, options) {
    const draft = options.propertyDraft || makePropertyDraft(row ? row.key : "", row ? row.rawValue : "", row ? row.key : "__new__");
    const item = document.createElement("div");
    item.className = "property-row editing";
    const commit = function() {
      options.onSaveDraft().catch(function(error) {
        options.onSetNoteStatus("Property save failed: " + error.message);
      });
    };
    const cancel = function() {
      options.onCancelDraft();
    };
    const keyShell = document.createElement("div");
    keyShell.className = "property-key-shell";
    const keyInput = document.createElement("input");
    keyInput.type = "text";
    keyInput.className = "property-inline-input property-inline-key";
    keyInput.placeholder = "property";
    keyInput.value = draft.key;
    keyInput.addEventListener("input", function() {
      options.onSetDraft({ ...draft, key: keyInput.value });
    });
    keyShell.appendChild(keyInput);
    const kindButton = document.createElement("button");
    kindButton.type = "button";
    kindButton.className = "property-kind-button";
    kindButton.textContent = draft.kind;
    kindButton.addEventListener("click", function() {
      options.onToggleTypeMenu(propertyMenuKey(row));
    });
    keyShell.appendChild(kindButton);
    if (options.propertyTypeMenuKey === propertyMenuKey(row)) {
      renderPropertyTypeMenu(keyShell, row, options);
    }
    const value = document.createElement("div");
    value.className = "property-value property-inline-editor";
    if (draft.kind === "list") {
      const chips = document.createElement("div");
      chips.className = "property-chip-list editable";
      draft.list.forEach(function(entry, index) {
        const chip = document.createElement("span");
        chip.className = "property-chip";
        const label = document.createElement("span");
        label.textContent = entry;
        chip.appendChild(label);
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "property-chip-remove";
        remove.textContent = "\xD7";
        remove.addEventListener("click", function() {
          const nextList = draft.list.slice();
          nextList.splice(index, 1);
          options.onSetDraft({ ...draft, list: nextList });
          options.onRefresh();
        });
        chip.appendChild(remove);
        chips.appendChild(chip);
      });
      value.appendChild(chips);
      const addInput = document.createElement("input");
      addInput.type = "text";
      addInput.className = "property-inline-input";
      addInput.placeholder = "Add list item";
      addInput.addEventListener("keydown", function(event) {
        if (event.key === "Enter" || event.key === ",") {
          event.preventDefault();
          const next = addInput.value.trim();
          if (!next) {
            return;
          }
          options.onSetDraft({ ...draft, list: draft.list.concat([next]) });
          options.onRefresh();
        }
      });
      value.appendChild(addInput);
    } else if (draft.kind === "bool") {
      const boolLabel = document.createElement("label");
      boolLabel.className = "property-inline-bool";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = draft.text === "true";
      checkbox.addEventListener("change", function() {
        options.onSetDraft({ ...draft, text: checkbox.checked ? "true" : "false" });
      });
      boolLabel.appendChild(checkbox);
      value.appendChild(boolLabel);
    } else {
      const input = document.createElement("input");
      input.className = "property-inline-input";
      input.type = draft.kind === "date" ? "date" : draft.kind === "datetime" ? "datetime-local" : "text";
      input.value = draft.kind === "datetime" ? normalizeDateTimeValue(draft.text) : String(draft.text || "");
      input.placeholder = draft.kind === "datetime" ? "2026-04-07T14:45" : "";
      input.addEventListener("input", function() {
        options.onSetDraft({ ...draft, text: input.value });
      });
      value.appendChild(input);
    }
    const actions = document.createElement("div");
    actions.className = "property-row-actions";
    const save = document.createElement("button");
    save.type = "button";
    save.className = "property-action";
    save.textContent = "Save";
    save.addEventListener("click", commit);
    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.className = "property-action";
    cancelButton.textContent = "Cancel";
    cancelButton.addEventListener("click", cancel);
    actions.appendChild(save);
    actions.appendChild(cancelButton);
    item.appendChild(keyShell);
    item.appendChild(value);
    item.appendChild(actions);
    container.appendChild(item);
    item.addEventListener("keydown", function(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        cancel();
        return;
      }
      if (event.key === "Enter") {
        const target = event.target instanceof HTMLElement ? event.target : null;
        const isListAdder = target instanceof HTMLInputElement && target.placeholder === "Add list item";
        if (isListAdder) {
          return;
        }
        if (target && target.classList.contains("property-kind-button")) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        commit();
      }
    });
    window.setTimeout(function() {
      const input = keyShell.querySelector(".property-inline-key");
      if (input) {
        input.focus();
        if (row) {
          input.setSelectionRange(0, input.value.length);
        }
      }
    }, 0);
  }
  function renderPageProperties(options) {
    clearNode(options.container);
    options.container.style.removeProperty("--property-key-width");
    if (!options.pageFrontmatter) {
      renderEmpty(options.container, "Select a page to see properties.");
      return;
    }
    const pageFrontmatter = options.pageFrontmatter;
    const rows = [];
    Object.keys(pageFrontmatter).sort().forEach(function(key) {
      const value = pageFrontmatter[key];
      if (value === null || value === "" || typeof value === "undefined") {
        return;
      }
      rows.push({
        key,
        value: Array.isArray(value) ? value.join(", ") : String(value),
        rawValue: value
      });
    });
    if (!rows.length && options.editingPropertyKey !== "__new__") {
      renderEmpty(options.container, "No frontmatter on this page.");
      return;
    }
    rows.forEach(function(row) {
      if (options.editingPropertyKey === row.key) {
        renderPropertyEditorRow(options.container, row, options);
        return;
      }
      const item = document.createElement("div");
      item.className = "property-row";
      const keyShell = document.createElement("div");
      keyShell.className = "property-key-shell";
      const key = document.createElement("button");
      key.type = "button";
      key.className = "property-key property-inline-trigger property-name-button";
      appendPropertyKeyContent(key, row, row.key);
      key.addEventListener("click", function() {
        options.onToggleTypeMenu(propertyMenuKey(row));
      });
      keyShell.appendChild(key);
      if (options.propertyTypeMenuKey === propertyMenuKey(row)) {
        renderPropertyTypeMenu(keyShell, row, options);
      }
      const valueNode = renderExistingPropertyValueEditor(row, options);
      item.appendChild(keyShell);
      item.appendChild(valueNode);
      options.container.appendChild(item);
    });
    if (options.editingPropertyKey === "__new__") {
      renderPropertyEditorRow(options.container, null, options);
    }
    window.requestAnimationFrame(function() {
      const buttons = Array.from(options.container.querySelectorAll(".property-name-button"));
      if (!buttons.length) {
        return;
      }
      const width = Math.max.apply(null, buttons.map(function(node) {
        const rectWidth = Math.ceil(node.getBoundingClientRect().width);
        const scrollWidth = Math.ceil(node.scrollWidth || 0);
        return Math.max(rectWidth, scrollWidth);
      }));
      if (width > 0) {
        options.container.style.setProperty("--property-key-width", width + 6 + "px");
      }
    });
  }
  var init_properties = __esm({
    "frontend/properties.ts"() {
      "use strict";
      init_dom();
    }
  });

  // frontend/queryTree.ts
  function renderSavedQueryTree(container, queryTree, selectedSavedQuery, onSelectSavedQuery) {
    clearNode(container);
    if (!queryTree.length) {
      renderEmpty(container, "No saved queries match the current search.");
      return;
    }
    queryTree.forEach(function(bucket) {
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
      (bucket.queries || []).forEach(function(savedQuery) {
        const item = document.createElement("div");
        item.className = "tree-item";
        const button = document.createElement("button");
        button.type = "button";
        if (selectedSavedQuery === savedQuery.name) {
          button.classList.add("active");
        }
        button.addEventListener("click", function() {
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
  var init_queryTree = __esm({
    "frontend/queryTree.ts"() {
      "use strict";
      init_dom();
    }
  });

  // frontend/routing.ts
  function parseURLState(href) {
    const url = new URL(href);
    return {
      page: url.searchParams.get("page") || "",
      query: url.searchParams.get("query") || ""
    };
  }
  function buildSelectionURL(href, selectedPage, selectedSavedQuery) {
    const url = new URL(href);
    if (selectedPage) {
      url.searchParams.set("page", selectedPage);
    } else {
      url.searchParams.delete("page");
    }
    if (selectedSavedQuery) {
      url.searchParams.set("query", selectedSavedQuery);
    } else {
      url.searchParams.delete("query");
    }
    return url;
  }
  function applyURLState(options) {
    const urlState = parseURLState(options.href);
    if (urlState.page) {
      options.onNavigateToPage(urlState.page, true);
      return;
    }
    if (urlState.query) {
      options.onSelectSavedQuery(urlState.query);
      return;
    }
    const homePage = String(options.currentHomePage || "").trim();
    if (homePage && options.pages.some(function(page) {
      return String(page.path || "").toLowerCase() === homePage.toLowerCase();
    })) {
      options.onNavigateToPage(homePage, true);
      return;
    }
    options.onRenderIdle();
  }
  function navigateToPageSelection(options) {
    if (!options.pagePath) {
      return;
    }
    const parsedLine = Number(options.lineNumber);
    const pendingLine = Number.isFinite(parsedLine) && parsedLine > 0 ? parsedLine : null;
    options.onSetPendingFocus(pendingLine, String(options.taskRef || "").trim());
    options.onSelectPage(options.pagePath);
    options.onExpandAncestors(options.pagePath);
    options.onSyncURL(Boolean(options.replace));
    options.onRenderPages();
    options.onRenderSavedQueryTree();
    options.onLoadPageDetail(options.pagePath);
  }
  var init_routing = __esm({
    "frontend/routing.ts"() {
      "use strict";
    }
  });

  // frontend/search.ts
  function buildGlobalSearchSections(options) {
    const counts = options.payload && options.payload.counts ? options.payload.counts : { total: 0 };
    if (!counts.total) {
      return [];
    }
    const pageItems = options.payload.pages || [];
    const taskItems = options.payload.tasks || [];
    const queryItems = options.payload.queries || [];
    return [
      {
        title: "Pages",
        items: pageItems.map(function(item) {
          const leaf = pageLeafName(item.path);
          const title = item.title && item.title !== leaf ? item.title : "";
          return {
            title: leaf,
            meta: [item.path, title, item.match].filter(Boolean).join(" \xB7 "),
            snippet: item.snippet || "",
            onSelect: function() {
              options.onClose();
              if (item.line) {
                options.onOpenPageAtLine(item.path, item.line);
                return;
              }
              options.onOpenPage(item.path);
            }
          };
        })
      },
      {
        title: "Tasks",
        items: taskItems.map(function(item) {
          return {
            title: item.text || item.ref,
            meta: [item.page, item.line ? "line " + item.line : ""].filter(Boolean).join(" \xB7 "),
            snippet: item.snippet || "",
            onSelect: function() {
              options.onClose();
              options.onOpenPageAtTask(item.page, item.ref, item.line);
            }
          };
        })
      },
      {
        title: "Saved Queries",
        items: queryItems.map(function(item) {
          return {
            title: item.title || item.name,
            meta: [item.name, item.folder, item.match].filter(Boolean).join(" \xB7 "),
            snippet: item.snippet || "",
            onSelect: function() {
              options.onClose();
              options.onOpenSavedQuery(item.name);
            }
          };
        })
      }
    ];
  }
  function renderGlobalSearchResults(options) {
    return renderPaletteSections(options.container, buildGlobalSearchSections(options), "No results.");
  }
  var init_search = __esm({
    "frontend/search.ts"() {
      "use strict";
      init_palette();
    }
  });

  // frontend/slashMenu.ts
  function slashCommandsForText(text) {
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
        matches: function() {
          return "task".indexOf(query) === 0;
        },
        apply: function(lineText) {
          const source = String(lineText || "");
          const remainder = source.replace(/(?:^|\s)\/task\s*$/i, "").trim();
          return "- [ ] " + remainder;
        }
      }
    ];
    return commands.filter(function(command) {
      return command.matches();
    });
  }
  function closeSlashMenu(state, elements) {
    state.slashOpen = false;
    state.slashSelectionIndex = -1;
    state.slashContext = null;
    elements.slashMenu.classList.add("hidden");
    clearNode(elements.slashMenuResults);
  }
  function updateSlashSelection(state, elements) {
    if (!state.slashOpen) {
      return;
    }
    Array.from(elements.slashMenuResults.querySelectorAll(".slash-menu-item")).forEach(function(item, index) {
      item.classList.toggle("active", index === state.slashSelectionIndex);
    });
  }
  function openSlashMenu(state, elements, commands, context, onApplySelection) {
    if (!commands.length) {
      closeSlashMenu(state, elements);
      return;
    }
    state.slashOpen = true;
    state.slashSelectionIndex = 0;
    state.slashContext = context;
    clearNode(elements.slashMenuResults);
    commands.forEach(function(command, index) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "slash-menu-item" + (index === state.slashSelectionIndex ? " active" : "");
      button.addEventListener("mousedown", function(event) {
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
  function moveSlashSelection(state, elements, delta) {
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
  function maybeOpenSlashMenu(state, elements, editor, lineText, context, onApplySelection) {
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
      left: Math.max(0, typeof context.left === "number" ? context.left : editorRect.left - noteRect.left),
      top: Math.max(0, typeof context.top === "number" ? context.top : editorRect.bottom - noteRect.top + 4),
      type: context.type,
      lineIndex: context.lineIndex
    }, onApplySelection);
  }
  var init_slashMenu = __esm({
    "frontend/slashMenu.ts"() {
      "use strict";
      init_dom();
    }
  });

  // frontend/app.ts
  var require_app = __commonJS({
    "frontend/app.ts"() {
      init_commands();
      init_details();
      init_dom();
      init_editorState();
      init_http();
      init_markdown();
      init_noteView();
      init_palette();
      init_pageViews();
      init_properties();
      init_queryTree();
      init_routing();
      init_search();
      init_slashMenu();
      (function() {
        const HOME_PAGE_STORAGE_KEY = "noterious.homePage";
        const state = {
          selectedPage: "",
          selectedSavedQuery: "",
          pages: [],
          tasks: [],
          queryTree: [],
          selectedSavedQueryPayload: null,
          eventSource: null,
          refreshTimer: null,
          autosaveTimer: null,
          searchTimer: null,
          commandTimer: null,
          searchSelectionIndex: -1,
          commandSelectionIndex: -1,
          currentPage: null,
          currentDerived: null,
          currentMarkdown: "",
          originalMarkdown: "",
          currentTask: null,
          editingPropertyKey: "",
          propertyTypeMenuKey: "",
          propertyDraft: null,
          editingBlockKey: "",
          pendingBlockFocusKey: "",
          pendingEditSeed: "",
          debugOpen: false,
          railOpen: false,
          railTab: "files",
          sourceOpen: false,
          configHomePage: "",
          homePage: "",
          markdownEditorApi: null,
          windowBlurred: false,
          restoreFocusSpec: null,
          expandedPageFolders: {},
          suppressActiveBlur: false,
          slashOpen: false,
          slashSelectionIndex: -1,
          slashContext: null,
          pendingPageLineFocus: null,
          pendingPageTaskRef: ""
        };
        const els = {
          metaStrip: optionalElement("meta-strip"),
          pageSearch: requiredElement("page-search"),
          pageList: requiredElement("page-list"),
          pageTaskList: requiredElement("page-task-list"),
          pageTags: requiredElement("page-tags"),
          pageContext: requiredElement("page-context"),
          pageProperties: requiredElement("page-properties"),
          addProperty: requiredElement("add-property"),
          propertyActions: optionalQuery(".property-actions"),
          querySearch: requiredElement("query-search"),
          queryTree: requiredElement("query-tree"),
          detailKind: requiredElement("detail-kind"),
          detailTitle: requiredElement("detail-title"),
          detailPath: requiredElement("detail-path"),
          noteHeading: requiredElement("note-heading"),
          noteStatus: requiredElement("note-status"),
          markdownEditor: requiredElement("markdown-editor"),
          structuredView: requiredElement("structured-view"),
          derivedView: requiredElement("derived-view"),
          rawView: requiredElement("raw-view"),
          queryEditor: requiredElement("query-editor"),
          queryOutput: requiredElement("query-output"),
          eventStatus: requiredElement("event-status"),
          eventLog: requiredElement("event-log"),
          rail: requiredElement("rail"),
          railTabFiles: requiredElement("rail-tab-files"),
          railTabContext: requiredElement("rail-tab-context"),
          railTabTasks: requiredElement("rail-tab-tasks"),
          railTabTags: requiredElement("rail-tab-tags"),
          railPanelFiles: requiredElement("rail-panel-files"),
          railPanelContext: requiredElement("rail-panel-context"),
          railPanelTasks: requiredElement("rail-panel-tasks"),
          railPanelTags: requiredElement("rail-panel-tags"),
          noteLayout: requiredElement("note-layout"),
          toggleRail: requiredElement("toggle-rail"),
          openSearch: requiredElement("open-search"),
          reloadPages: optionalElement("reload-pages"),
          reloadQueries: optionalElement("reload-queries"),
          toggleDebug: optionalElement("toggle-debug"),
          debugDrawer: requiredElement("debug-drawer"),
          loadSelectedQuery: requiredElement("load-selected-query"),
          formatQuery: requiredElement("format-query"),
          runQuery: requiredElement("run-query"),
          taskModalShell: requiredElement("task-modal-shell"),
          taskModalTitle: requiredElement("task-modal-title"),
          taskText: requiredElement("task-text"),
          taskState: requiredElement("task-state"),
          taskDue: requiredElement("task-due"),
          taskRemind: requiredElement("task-remind"),
          taskWho: requiredElement("task-who"),
          taskModalMeta: requiredElement("task-modal-meta"),
          closeTaskModal: requiredElement("close-task-modal"),
          cancelTask: requiredElement("cancel-task"),
          saveTask: requiredElement("save-task"),
          searchModalShell: requiredElement("search-modal-shell"),
          closeSearchModal: requiredElement("close-search-modal"),
          globalSearchInput: requiredElement("global-search-input"),
          globalSearchResults: requiredElement("global-search-results"),
          commandModalShell: requiredElement("command-modal-shell"),
          closeCommandModal: requiredElement("close-command-modal"),
          commandPaletteInput: requiredElement("command-palette-input"),
          commandPaletteResults: requiredElement("command-palette-results"),
          slashMenu: requiredElement("slash-menu"),
          slashMenuResults: requiredElement("slash-menu-results")
        };
        function setMetaPills(values) {
          const metaStrip = els.metaStrip;
          if (!metaStrip) {
            return;
          }
          metaStrip.textContent = "";
          values.forEach(function(value) {
            const pill = document.createElement("div");
            pill.className = "pill";
            pill.textContent = value;
            metaStrip.appendChild(pill);
          });
        }
        function debounceRefresh() {
          window.clearTimeout(state.refreshTimer ?? void 0);
          state.refreshTimer = window.setTimeout(function() {
            loadPages();
            loadSavedQueryTree();
            if (!markdownEditorHasFocus(state, els)) {
              refreshCurrentDetail(false);
            }
          }, 250);
        }
        function clearAutosaveTimer() {
          if (!state.autosaveTimer) {
            return;
          }
          window.clearTimeout(state.autosaveTimer);
          state.autosaveTimer = null;
        }
        function pretty(value) {
          return JSON.stringify(value, null, 2);
        }
        function errorMessage(error) {
          return error instanceof Error ? error.message : String(error);
        }
        function encodePath(path) {
          return path.split("/").map(encodeURIComponent).join("/");
        }
        function getStoredHomePage() {
          try {
            return normalizePageDraftPath(window.localStorage.getItem(HOME_PAGE_STORAGE_KEY) || "");
          } catch (_error) {
            return "";
          }
        }
        function writeStoredHomePage(pagePath) {
          const normalized = normalizePageDraftPath(pagePath);
          try {
            if (normalized) {
              window.localStorage.setItem(HOME_PAGE_STORAGE_KEY, normalized);
            } else {
              window.localStorage.removeItem(HOME_PAGE_STORAGE_KEY);
            }
          } catch (_error) {
          }
        }
        function setHomePage(pagePath) {
          const normalized = normalizePageDraftPath(pagePath);
          state.homePage = normalized;
          writeStoredHomePage(normalized);
        }
        function clearHomePage() {
          state.homePage = normalizePageDraftPath(state.configHomePage || "");
          writeStoredHomePage("");
        }
        function currentHomePage() {
          return normalizePageDraftPath(state.homePage || state.configHomePage || "");
        }
        function syncURLState(replace) {
          const url = buildSelectionURL(window.location.href, state.selectedPage, state.selectedSavedQuery);
          if (replace) {
            window.history.replaceState({}, "", url);
          } else {
            window.history.pushState({}, "", url);
          }
        }
        function applyURLState2() {
          applyURLState({
            href: window.location.href,
            currentHomePage: currentHomePage(),
            pages: state.pages,
            onNavigateToPage: navigateToPage,
            onSelectSavedQuery: function(name) {
              state.selectedSavedQuery = name;
              state.selectedPage = "";
              renderPages();
              renderSavedQueryTree2();
              loadSavedQueryDetail(name);
            },
            onRenderIdle: function() {
              renderPages();
              renderSavedQueryTree2();
            }
          });
        }
        function navigateToPage(pagePath, replace) {
          navigateToPageSelection({
            pagePath,
            replace,
            onExpandAncestors: function(path) {
              ensureExpandedPageAncestors(path, state.expandedPageFolders);
            },
            onSetPendingFocus: function(lineNumber, taskRef) {
              state.pendingPageLineFocus = lineNumber;
              state.pendingPageTaskRef = taskRef;
            },
            onSelectPage: function(path) {
              state.selectedPage = path;
              state.selectedSavedQuery = "";
            },
            onSyncURL: syncURLState,
            onRenderPages: renderPages,
            onRenderSavedQueryTree: renderSavedQueryTree2,
            onLoadPageDetail: function(path) {
              loadPageDetail(path, true);
            }
          });
        }
        function navigateToPageAtLine(pagePath, lineNumber, replace) {
          navigateToPageSelection({
            pagePath,
            lineNumber,
            replace,
            onExpandAncestors: function(path) {
              ensureExpandedPageAncestors(path, state.expandedPageFolders);
            },
            onSetPendingFocus: function(nextLineNumber, taskRef) {
              state.pendingPageLineFocus = nextLineNumber;
              state.pendingPageTaskRef = taskRef;
            },
            onSelectPage: function(path) {
              state.selectedPage = path;
              state.selectedSavedQuery = "";
            },
            onSyncURL: syncURLState,
            onRenderPages: renderPages,
            onRenderSavedQueryTree: renderSavedQueryTree2,
            onLoadPageDetail: function(path) {
              loadPageDetail(path, true);
            }
          });
        }
        function navigateToPageAtTask(pagePath, taskRef, lineNumber, replace) {
          navigateToPageSelection({
            pagePath,
            lineNumber,
            taskRef,
            replace,
            onExpandAncestors: function(path) {
              ensureExpandedPageAncestors(path, state.expandedPageFolders);
            },
            onSetPendingFocus: function(nextLineNumber, nextTaskRef) {
              state.pendingPageLineFocus = nextLineNumber;
              state.pendingPageTaskRef = nextTaskRef;
            },
            onSelectPage: function(path) {
              state.selectedPage = path;
              state.selectedSavedQuery = "";
            },
            onSyncURL: syncURLState,
            onRenderPages: renderPages,
            onRenderSavedQueryTree: renderSavedQueryTree2,
            onLoadPageDetail: function(path) {
              loadPageDetail(path, true);
            }
          });
        }
        function on(node, eventName, handler) {
          if (!node) {
            return;
          }
          node.addEventListener(eventName, handler);
        }
        function applySlashSelection() {
          if (!state.slashOpen || !state.slashContext) {
            closeSlashMenu(state, els);
            return false;
          }
          const commands = state.slashContext.commands || [];
          const command = commands[state.slashSelectionIndex] || commands[0];
          if (!command) {
            closeSlashMenu(state, els);
            return false;
          }
          const rawContext = currentRawLineContext(state, els);
          const updated = command.apply(rawContext.lineText);
          const nextValue = rawContext.value.slice(0, rawContext.lineStart) + updated + rawContext.value.slice(rawContext.lineEnd);
          const scrollTop = markdownEditorScrollTop(state, els);
          setMarkdownEditorValue(state, els, nextValue);
          state.currentMarkdown = nextValue;
          els.rawView.textContent = state.currentMarkdown;
          scheduleAutosave();
          const caret = rawContext.lineStart + updated.length;
          focusMarkdownEditor(state, els, { preventScroll: true });
          setMarkdownEditorSelection(state, els, caret, caret);
          setMarkdownEditorScrollTop(state, els, scrollTop);
          closeSlashMenu(state, els);
          return true;
        }
        function currentPageView2() {
          return currentPageView(state.currentPage, state.currentMarkdown);
        }
        function refreshLivePageChrome() {
          const page = currentPageView2();
          if (!page) {
            return;
          }
          const fallbackPath = page.page || page.path || state.selectedPage || "";
          els.detailPath.textContent = fallbackPath;
          els.detailTitle.textContent = page.title || fallbackPath;
          els.noteHeading.textContent = page.title || fallbackPath;
          renderPageTags2();
          renderPageProperties2();
        }
        function updateMarkdownBodyRange(start, end, replacement) {
          const split = splitFrontmatter(state.currentMarkdown);
          const bodyLines = split.body.split("\n");
          const replacementLines = String(replacement || "").replace(/\r\n/g, "\n").split("\n");
          bodyLines.splice(start, end - start, ...replacementLines);
          state.currentMarkdown = split.frontmatter + bodyLines.join("\n");
        }
        function firstEditableLineIndex(markdown) {
          const lines = editableBody(markdown).split("\n");
          if (!lines.length) {
            return 0;
          }
          for (let index = 0; index < lines.length; index += 1) {
            if (String(lines[index] || "").trim() !== "") {
              return index;
            }
          }
          return 0;
        }
        function replaceEditableBody(body) {
          const split = splitFrontmatter(state.currentMarkdown);
          state.currentMarkdown = split.frontmatter + String(body || "").replace(/\r\n/g, "\n");
        }
        function focusEditorAtBodyPosition(lineIndex, caret) {
          const offset = rawOffsetForBodyPosition(state.currentMarkdown, lineIndex, caret);
          window.setTimeout(function() {
            focusMarkdownEditor(state, els, { preventScroll: true });
            setMarkdownEditorSelection(state, els, offset, offset);
          }, 0);
        }
        function isQueryFenceBlock(markdown) {
          const lines = String(markdown || "").split("\n");
          return lines.length > 0 && /^```query(?:\s|$)/i.test(lines[0].trim());
        }
        function hasUnsavedPageChanges() {
          return Boolean(state.selectedPage && state.currentPage && state.currentMarkdown !== state.originalMarkdown);
        }
        function setNoteStatus(message) {
          els.noteStatus.textContent = message;
        }
        function renderNoteStudio() {
          const page = currentPageView2();
          if (!page) {
            setMarkdownEditorValue(state, els, "");
            setNoteStatus("Select a page to edit and preview markdown.");
            return;
          }
          setMarkdownEditorValue(state, els, state.currentMarkdown);
          if (state.markdownEditorApi && state.markdownEditorApi.host) {
            state.markdownEditorApi.host.classList.remove("hidden");
            markdownEditorSetRenderMode(state, !state.sourceOpen);
            markdownEditorSetQueryBlocks(state, renderedQueryBlocksForEditor(state.currentDerived));
            markdownEditorSetTasks(state, renderedTasksForEditor(page));
          }
          if (els.pageProperties) {
            els.pageProperties.classList.toggle("hidden", state.sourceOpen);
          }
          if (els.propertyActions) {
            els.propertyActions.classList.toggle("hidden", state.sourceOpen);
          }
          els.rawView.textContent = state.currentMarkdown;
          refreshLivePageChrome();
          if (hasUnsavedPageChanges()) {
            setNoteStatus("Unsaved local edits on " + state.selectedPage + ".");
            scheduleAutosave();
          } else {
            clearAutosaveTimer();
            setNoteStatus("Editing " + state.selectedPage + " directly.");
          }
        }
        function scheduleAutosave() {
          if (!state.selectedPage || !state.currentPage || !hasUnsavedPageChanges()) {
            clearAutosaveTimer();
            return;
          }
          clearAutosaveTimer();
          state.autosaveTimer = window.setTimeout(function() {
            saveCurrentPage();
          }, 700);
        }
        function renderPageTasks2(tasks) {
          renderPageTasks(els.pageTaskList, Array.isArray(tasks) ? tasks : [], openTaskModal);
        }
        function renderPageContext2() {
          renderPageContext(els.pageContext, state.currentPage, state.currentDerived);
        }
        function renderPageTags2() {
          const page = currentPageView2();
          renderPageTags(els.pageTags, page ? page.frontmatter : null);
        }
        function clearPropertyDraft() {
          state.editingPropertyKey = "";
          state.propertyTypeMenuKey = "";
          state.propertyDraft = null;
        }
        function setPropertyDraft(key, value, originalKey) {
          state.editingPropertyKey = originalKey || key || "__new__";
          state.propertyDraft = makePropertyDraft(key, value, originalKey);
        }
        function propertyMenuKey2(row) {
          return row ? row.key : "__new__";
        }
        function togglePropertyTypeMenu(menuKey) {
          state.propertyTypeMenuKey = state.propertyTypeMenuKey === menuKey ? "" : menuKey;
          renderPageProperties2();
        }
        function applyPropertyKind(kind, row) {
          const menuKey = propertyMenuKey2(row);
          if (!row) {
            if (!state.propertyDraft || state.editingPropertyKey !== menuKey) {
              setPropertyDraft("", "", "__new__");
            }
            const draft = state.propertyDraft;
            if (!draft) {
              return;
            }
            draft.kind = kind;
            if (kind === "list" && !Array.isArray(draft.list)) {
              draft.list = [];
            }
            if (kind === "bool") {
              draft.text = draft.text === "true" ? "true" : "false";
            }
            state.propertyTypeMenuKey = "";
            renderPageProperties2();
            return;
          }
          state.propertyTypeMenuKey = "";
          patchCurrentPageFrontmatter({
            frontmatter: {
              set: {
                [row.key]: coercePropertyValue(kind, row.rawValue)
              }
            }
          }).catch(function(error) {
            setNoteStatus("Property type change failed: " + error.message);
          });
        }
        function dismissPropertyUI() {
          if (!state.propertyDraft && !state.propertyTypeMenuKey) {
            return;
          }
          clearPropertyDraft();
          renderPageProperties2();
        }
        async function patchCurrentPageFrontmatter(payload) {
          if (!state.selectedPage || !state.currentPage) {
            return;
          }
          await fetchJSON("/api/pages/" + encodePath(state.selectedPage), {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
          await Promise.all([loadPages(), loadPageDetail(state.selectedPage, true)]);
        }
        function startAddProperty() {
          setPropertyDraft("", "", "__new__");
          renderPageProperties2();
        }
        async function removeProperty(key) {
          if (!key) {
            return;
          }
          await patchCurrentPageFrontmatter({
            frontmatter: {
              remove: [key]
            }
          });
          clearPropertyDraft();
        }
        function startRenameProperty(row) {
          if (!row) {
            return;
          }
          setPropertyDraft(row.key, row.rawValue, row.key);
          state.propertyTypeMenuKey = "";
          renderPageProperties2();
        }
        async function savePropertyEdit() {
          const key = state.propertyDraft ? String(state.propertyDraft.key || "").trim() : "";
          if (!key) {
            setNoteStatus("Frontmatter key is required.");
            return;
          }
          const value = propertyDraftValue(state.propertyDraft);
          const setPayload = {};
          setPayload[key] = value;
          const remove = state.editingPropertyKey && state.editingPropertyKey !== key ? [state.editingPropertyKey] : [];
          await patchCurrentPageFrontmatter({
            frontmatter: {
              set: setPayload,
              remove
            }
          });
          clearPropertyDraft();
        }
        function saveExistingPropertyValue(key, value) {
          return patchCurrentPageFrontmatter({
            frontmatter: {
              set: {
                [key]: value
              }
            }
          });
        }
        function renderPageProperties2() {
          const page = currentPageView2();
          renderPageProperties({
            container: els.pageProperties,
            pageFrontmatter: page ? page.frontmatter : null,
            editingPropertyKey: state.editingPropertyKey,
            propertyTypeMenuKey: state.propertyTypeMenuKey,
            propertyDraft: state.propertyDraft,
            onToggleTypeMenu: togglePropertyTypeMenu,
            onApplyKind: applyPropertyKind,
            onRemoveProperty: function(key) {
              removeProperty(key).catch(function(error) {
                setNoteStatus("Property delete failed: " + error.message);
              });
            },
            onStartRenameProperty: startRenameProperty,
            onSaveExistingProperty: saveExistingPropertyValue,
            onSetDraft: function(draft) {
              state.propertyDraft = draft;
            },
            onRefresh: renderPageProperties2,
            onSaveDraft: savePropertyEdit,
            onCancelDraft: function() {
              clearPropertyDraft();
              renderPageProperties2();
            },
            onSetNoteStatus: setNoteStatus
          });
        }
        function clearPageSelection() {
          clearAutosaveTimer();
          state.selectedPage = "";
          state.selectedSavedQuery = "";
          state.currentPage = null;
          state.currentDerived = null;
          state.currentMarkdown = "";
          state.originalMarkdown = "";
          state.currentTask = null;
          clearPropertyDraft();
          syncURLState(true);
          els.detailPath.textContent = "Select a page";
          els.noteHeading.textContent = "Waiting for selection";
          closeTaskModal();
          renderNoteStudio();
          renderPageTasks2([]);
          renderPageTags2();
          renderPageContext2();
          renderPageProperties2();
        }
        function setStructuredViews(kind, title, structured, derived, raw) {
          els.detailKind.textContent = kind;
          els.detailTitle.textContent = title;
          els.structuredView.textContent = pretty(structured);
          els.derivedView.textContent = pretty(derived);
          els.rawView.textContent = raw || "";
        }
        async function loadMeta() {
          try {
            const meta = await fetchJSON("/api/meta");
            state.configHomePage = normalizePageDraftPath(meta.homePage || "");
            state.homePage = getStoredHomePage() || state.configHomePage;
            setMetaPills([
              "Listening " + meta.listenAddr,
              "Vault " + meta.vaultPath,
              "DB " + meta.database,
              "Time " + meta.serverTime
            ]);
          } catch (error) {
            setMetaPills(["Meta error", errorMessage(error)]);
          }
        }
        async function loadPages() {
          const params = new URLSearchParams();
          const query = els.pageSearch.value.trim();
          if (query) {
            params.set("q", query);
          }
          try {
            const payload = await fetchJSON("/api/pages" + (params.toString() ? "?" + params.toString() : ""));
            state.pages = payload.pages || [];
            renderPages();
          } catch (error) {
            renderEmpty(els.pageList, errorMessage(error));
          }
        }
        function renderPages() {
          if (state.selectedPage) {
            ensureExpandedPageAncestors(state.selectedPage, state.expandedPageFolders);
          }
          renderPagesTree(
            els.pageList,
            state.pages,
            state.selectedPage,
            state.expandedPageFolders,
            els.pageSearch.value.trim(),
            function(folderKey) {
              state.expandedPageFolders[folderKey] = !state.expandedPageFolders[folderKey];
              renderPages();
            },
            function(pagePath) {
              navigateToPage(pagePath, false);
            }
          );
        }
        async function loadSavedQueryTree() {
          const params = new URLSearchParams();
          const query = els.querySearch.value.trim();
          if (query) {
            params.set("q", query);
          }
          try {
            const payload = await fetchJSON("/api/queries/tree" + (params.toString() ? "?" + params.toString() : ""));
            state.queryTree = payload.folders || [];
            renderSavedQueryTree2();
          } catch (error) {
            renderEmpty(els.queryTree, errorMessage(error));
          }
        }
        function renderSavedQueryTree2() {
          renderSavedQueryTree(els.queryTree, state.queryTree, state.selectedSavedQuery, function(name) {
            state.selectedSavedQuery = name;
            state.selectedPage = "";
            syncURLState(false);
            renderPages();
            renderSavedQueryTree2();
            loadSavedQueryDetail(name);
          });
        }
        function findCurrentTask(ref) {
          if (!state.currentPage || !state.currentPage.tasks) {
            return null;
          }
          return state.currentPage.tasks.find(function(task) {
            return task.ref === ref;
          }) || null;
        }
        async function toggleTaskDone2(task) {
          if (!task || !task.ref) {
            return;
          }
          try {
            await toggleTaskDone(task);
            await Promise.all([state.selectedPage ? loadPageDetail(state.selectedPage, true) : Promise.resolve()]);
          } catch (error) {
            setNoteStatus("Task toggle failed: " + errorMessage(error));
          }
        }
        async function loadPageDetail(pagePath, force) {
          if (!force && hasUnsavedPageChanges()) {
            setNoteStatus("Unsaved local edits on " + state.selectedPage + ". Autosave pending.");
            return;
          }
          try {
            const loaded = await loadPageDetailData(
              pagePath,
              encodePath,
              state.pendingPageTaskRef,
              state.pendingPageLineFocus
            );
            const page = loaded.page;
            const derived = loaded.derived;
            state.currentPage = page;
            state.currentDerived = derived;
            state.currentMarkdown = page.rawMarkdown || "";
            state.originalMarkdown = page.rawMarkdown || "";
            clearAutosaveTimer();
            state.currentTask = null;
            clearPropertyDraft();
            state.selectedSavedQueryPayload = null;
            els.detailPath.textContent = page.page || page.path || pagePath;
            els.noteHeading.textContent = page.title || page.page || pagePath;
            setStructuredViews(
              "Page",
              page.title || page.page,
              {
                page: page.page,
                title: page.title,
                frontmatter: page.frontmatter,
                links: page.links,
                tasks: page.tasks
              },
              {
                toc: derived.toc,
                backlinks: derived.backlinks,
                linkCounts: derived.linkCounts,
                taskCounts: derived.taskCounts,
                queryBlocks: derived.queryBlocks
              },
              page.rawMarkdown || ""
            );
            renderNoteStudio();
            if (state.markdownEditorApi && !blockingOverlayOpen(els)) {
              if (loaded.focusOffset !== null) {
                state.pendingPageLineFocus = null;
                state.pendingPageTaskRef = "";
                window.requestAnimationFrame(function() {
                  focusMarkdownEditor(state, els, { preventScroll: true });
                  setMarkdownEditorSelection(state, els, loaded.focusOffset, loaded.focusOffset, true);
                  window.requestAnimationFrame(function() {
                    focusMarkdownEditor(state, els, { preventScroll: true });
                    setMarkdownEditorSelection(state, els, loaded.focusOffset, loaded.focusOffset, true);
                  });
                });
              } else {
                focusEditorAtBodyPosition(firstEditableLineIndex(state.currentMarkdown), 0);
              }
            } else if (state.sourceOpen && !blockingOverlayOpen(els)) {
              window.setTimeout(function() {
                if (els.markdownEditor) {
                  focusMarkdownEditor(state, els, { preventScroll: true });
                  const caret = rawOffsetForBodyPosition(state.currentMarkdown, firstEditableLineIndex(state.currentMarkdown), 0);
                  setMarkdownEditorSelection(state, els, caret, caret);
                }
              }, 0);
            }
            renderPageTasks2(page.tasks || []);
            renderPageTags2();
            renderPageContext2();
            renderPageProperties2();
          } catch (error) {
            clearPageSelection();
            els.detailKind.textContent = "Page";
            els.detailTitle.textContent = pagePath;
            els.structuredView.textContent = errorMessage(error);
            els.derivedView.textContent = "";
            els.rawView.textContent = "";
          }
        }
        async function loadSavedQueryDetail(name) {
          clearPageSelection();
          try {
            const detail = await loadSavedQueryDetailData(name);
            const savedQuery = detail.savedQuery;
            state.selectedSavedQueryPayload = savedQuery;
            els.detailPath.textContent = savedQuery.name || name;
            els.noteHeading.textContent = savedQuery.title || savedQuery.name || name;
            setStructuredViews("Saved Query", savedQuery.title || savedQuery.name, savedQuery, detail.workbench, savedQuery.query || "");
            setNoteStatus("Viewing saved query details. Select a page to edit notes.");
            renderPageContext2();
            renderPageProperties2();
          } catch (error) {
            state.selectedSavedQueryPayload = null;
            els.detailKind.textContent = "Saved Query";
            els.detailTitle.textContent = name;
            els.structuredView.textContent = errorMessage(error);
            els.derivedView.textContent = "";
            els.rawView.textContent = "";
            setNoteStatus("Select a page to edit and preview markdown.");
            renderPageContext2();
          }
        }
        function refreshCurrentDetail(force) {
          if (state.selectedPage) {
            if (!force && markdownEditorHasFocus(state, els)) {
              return;
            }
            loadPageDetail(state.selectedPage, force);
            return;
          }
          if (state.selectedSavedQuery) {
            loadSavedQueryDetail(state.selectedSavedQuery);
          }
        }
        function addEventLine(type, data, warn) {
          const item = document.createElement("div");
          item.className = "event-item";
          if (warn) {
            item.classList.add("warn");
          }
          const strong = document.createElement("strong");
          strong.textContent = type;
          const small = document.createElement("small");
          small.textContent = (/* @__PURE__ */ new Date()).toLocaleTimeString();
          const pre = document.createElement("pre");
          pre.className = "code-block";
          pre.textContent = typeof data === "string" ? data : pretty(data);
          item.appendChild(strong);
          item.appendChild(small);
          item.appendChild(pre);
          els.eventLog.prepend(item);
          while (els.eventLog.childNodes.length > 12) {
            const lastChild = els.eventLog.lastChild;
            if (!lastChild) {
              break;
            }
            els.eventLog.removeChild(lastChild);
          }
        }
        async function runQueryWorkbench() {
          const query = els.queryEditor.value.trim();
          if (!query) {
            els.queryOutput.textContent = "Enter a query first.";
            return;
          }
          els.queryOutput.textContent = "Running query workbench...";
          try {
            const payload = await fetchJSON("/api/query/workbench", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                query,
                previewLimit: 10
              })
            });
            els.queryOutput.textContent = pretty(payload);
          } catch (error) {
            els.queryOutput.textContent = errorMessage(error);
          }
        }
        async function formatQueryText() {
          const query = els.queryEditor.value.trim();
          if (!query) {
            els.queryOutput.textContent = "Enter a query first.";
            return;
          }
          els.queryOutput.textContent = "Formatting query...";
          try {
            const payload = await fetchJSON("/api/query/format", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ query })
            });
            els.queryOutput.textContent = pretty(payload);
            if (payload.valid && payload.formatted) {
              els.queryEditor.value = payload.formatted;
            }
          } catch (error) {
            els.queryOutput.textContent = errorMessage(error);
          }
        }
        function loadSelectedQueryIntoEditor() {
          if (state.selectedSavedQueryPayload && state.selectedSavedQueryPayload.query) {
            els.queryEditor.value = state.selectedSavedQueryPayload.query;
            els.queryOutput.textContent = "Loaded selected saved query into the editor.";
            return;
          }
          if (els.rawView.textContent && els.detailKind.textContent === "Saved Query") {
            els.queryEditor.value = els.rawView.textContent;
            els.queryOutput.textContent = "Loaded visible saved query text into the editor.";
            return;
          }
          els.queryOutput.textContent = "Select a saved query first, or type directly into the editor.";
        }
        function openTaskModal(task) {
          state.currentTask = task;
          els.taskModalTitle.textContent = task.text || task.ref;
          els.taskText.value = task.text || "";
          els.taskState.value = task.done ? "done" : "todo";
          els.taskDue.value = task.due || "";
          els.taskRemind.value = normalizeDateTimeValue(task.remind || "");
          els.taskWho.value = task.who && task.who.length ? task.who.join(", ") : "";
          const meta = [
            task.page || "",
            task.ref || "",
            task.line ? "line " + task.line : "",
            task.done ? "done" : "open"
          ].filter(Boolean);
          els.taskModalMeta.textContent = meta.join(" \xB7 ");
          els.taskModalShell.classList.remove("hidden");
        }
        function closeTaskModal() {
          state.currentTask = null;
          els.taskModalShell.classList.add("hidden");
        }
        function setSearchOpen(open) {
          setPaletteOpen(els.searchModalShell, els.globalSearchInput, open);
        }
        function closeSearchModal() {
          setSearchOpen(false);
        }
        function searchResultButtons() {
          return resultButtons(els.globalSearchResults);
        }
        function commandResultButtons() {
          return resultButtons(els.commandPaletteResults);
        }
        function updateSearchSelection() {
          updateSelection(els.globalSearchResults, state.searchSelectionIndex);
        }
        function updateCommandSelection() {
          updateSelection(els.commandPaletteResults, state.commandSelectionIndex);
        }
        function moveSearchSelection(delta) {
          state.searchSelectionIndex = moveSelection(els.globalSearchResults, state.searchSelectionIndex, delta);
        }
        function moveCommandSelection(delta) {
          state.commandSelectionIndex = moveSelection(els.commandPaletteResults, state.commandSelectionIndex, delta);
        }
        function triggerSearchSelection() {
          triggerSelection(els.globalSearchResults, state.searchSelectionIndex);
        }
        function triggerCommandSelection() {
          triggerSelection(els.commandPaletteResults, state.commandSelectionIndex);
        }
        function setCommandPaletteOpen(open) {
          setPaletteOpen(els.commandModalShell, els.commandPaletteInput, open);
        }
        function closeCommandPalette() {
          setCommandPaletteOpen(false);
        }
        function renderGlobalSearchResults2(payload) {
          state.searchSelectionIndex = renderGlobalSearchResults({
            container: els.globalSearchResults,
            payload,
            onClose: closeSearchModal,
            onOpenPage: function(pagePath) {
              navigateToPage(pagePath, false);
            },
            onOpenPageAtLine: function(pagePath, lineNumber) {
              navigateToPageAtLine(pagePath, lineNumber, false);
            },
            onOpenPageAtTask: function(pagePath, taskRef, lineNumber) {
              navigateToPageAtTask(pagePath, taskRef, lineNumber, false);
            },
            onOpenSavedQuery: function(name) {
              state.selectedSavedQuery = name;
              state.selectedPage = "";
              syncURLState(false);
              renderPages();
              renderSavedQueryTree2();
              loadSavedQueryDetail(name);
            }
          });
          if (state.searchSelectionIndex >= 0) {
            updateSearchSelection();
          }
          if (els.searchModalShell && !els.searchModalShell.classList.contains("hidden") && els.globalSearchInput) {
            window.requestAnimationFrame(function() {
              if (document.activeElement !== els.globalSearchInput) {
                els.globalSearchInput.focus({ preventScroll: true });
              }
            });
          }
        }
        async function runGlobalSearch() {
          if (!els.globalSearchInput || !els.globalSearchResults) {
            return;
          }
          const query = els.globalSearchInput.value.trim();
          if (!query) {
            renderEmpty(els.globalSearchResults, "Type to search pages, tasks, and saved queries.");
            return;
          }
          els.globalSearchResults.textContent = "Searching\u2026";
          try {
            const payload = await fetchJSON("/api/search?q=" + encodeURIComponent(query));
            renderGlobalSearchResults2(payload);
          } catch (error) {
            els.globalSearchResults.textContent = errorMessage(error);
          }
        }
        function scheduleGlobalSearch() {
          window.clearTimeout(state.searchTimer ?? void 0);
          state.searchTimer = window.setTimeout(runGlobalSearch, 120);
        }
        async function createPage(pagePath) {
          const normalized = normalizePageDraftPath(pagePath);
          if (!normalized) {
            return;
          }
          const leaf = pageTitleFromPath(normalized);
          const initialMarkdown = leaf ? "# " + leaf + "\n" : "";
          await fetchJSON("/api/pages/" + encodePath(normalized), {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ rawMarkdown: initialMarkdown })
          });
          await loadPages();
          navigateToPage(normalized, false);
        }
        async function deletePage(pagePath) {
          const normalized = normalizePageDraftPath(pagePath);
          if (!normalized) {
            return;
          }
          if (!window.confirm('Delete page "' + normalized + '"?')) {
            return;
          }
          await fetchJSON("/api/pages/" + encodePath(normalized), {
            method: "DELETE"
          });
          if (currentHomePage().toLowerCase() === normalized.toLowerCase()) {
            clearHomePage();
          }
          if (state.selectedPage === normalized) {
            clearPageSelection();
          }
          await loadPages();
        }
        async function movePage(pagePath, targetPage) {
          const fromPath = normalizePageDraftPath(pagePath);
          const toPath = normalizePageDraftPath(targetPage);
          if (!fromPath || !toPath || fromPath === toPath) {
            return;
          }
          const payload = await fetchJSON("/api/pages/" + encodePath(fromPath) + "/move", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ targetPage: toPath })
          });
          if (currentHomePage().toLowerCase() === fromPath.toLowerCase()) {
            setHomePage(toPath);
          }
          await loadPages();
          navigateToPage(payload.page || toPath, false);
        }
        function renderCommandPaletteResults2() {
          state.commandSelectionIndex = renderCommandPaletteResults({
            container: els.commandPaletteResults,
            inputValue: els.commandPaletteInput ? els.commandPaletteInput.value : "",
            pages: state.pages,
            selectedPage: state.selectedPage,
            sourceOpen: state.sourceOpen,
            railOpen: state.railOpen,
            currentHomePage: currentHomePage(),
            onToggleSource: function() {
              setSourceOpen(!state.sourceOpen);
            },
            onOpenSearch: function() {
              setSearchOpen(true);
              scheduleGlobalSearch();
            },
            onFocusRail: function(tab) {
              setRailTab(tab);
              if (window.matchMedia("(max-width: 1180px)").matches) {
                setRailOpen(true);
              }
            },
            onToggleRail: function() {
              setRailOpen(!state.railOpen);
            },
            onOpenHomePage: function(pagePath) {
              navigateToPage(pagePath, false);
            },
            onSetHomePage: function(pagePath) {
              setHomePage(pagePath);
              closeCommandPalette();
              renderCommandPaletteResults2();
              setNoteStatus("Home page set to " + pagePath + ".");
            },
            onDeletePage: function(pagePath) {
              closeCommandPalette();
              deletePage(pagePath).catch(function(error) {
                setNoteStatus("Delete page failed: " + errorMessage(error));
              });
            },
            onClearHomePage: function() {
              clearHomePage();
              closeCommandPalette();
              renderCommandPaletteResults2();
              setNoteStatus(state.configHomePage ? "Home page reset to configured default." : "Home page cleared.");
            },
            onMovePage: function(pagePath, targetPage) {
              closeCommandPalette();
              movePage(pagePath, targetPage).catch(function(error) {
                setNoteStatus("Move page failed: " + errorMessage(error));
              });
            },
            onCreatePage: function(pagePath) {
              closeCommandPalette();
              createPage(pagePath).catch(function(error) {
                setNoteStatus("Create page failed: " + errorMessage(error));
              });
            },
            onOpenPage: function(pagePath) {
              closeCommandPalette();
              navigateToPage(pagePath, false);
            }
          });
          if (state.commandSelectionIndex >= 0) {
            updateCommandSelection();
          }
          if (els.commandModalShell && !els.commandModalShell.classList.contains("hidden") && els.commandPaletteInput) {
            window.requestAnimationFrame(function() {
              if (document.activeElement !== els.commandPaletteInput) {
                els.commandPaletteInput.focus({ preventScroll: true });
              }
            });
          }
        }
        function scheduleCommandPaletteRefresh() {
          window.clearTimeout(state.commandTimer ?? void 0);
          state.commandTimer = window.setTimeout(renderCommandPaletteResults2, 50);
        }
        function setSourceOpen(open) {
          const nextOpen = Boolean(open);
          if (state.sourceOpen === nextOpen) {
            return;
          }
          const scrollTop = markdownEditorScrollTop(state, els);
          const selectionStart = markdownEditorSelectionStart(state, els);
          const selectionEnd = markdownEditorSelectionEnd(state, els);
          state.sourceOpen = nextOpen;
          markdownEditorSetRenderMode(state, !state.sourceOpen);
          if (els.pageProperties) {
            els.pageProperties.classList.toggle("hidden", state.sourceOpen);
          }
          if (els.propertyActions) {
            els.propertyActions.classList.toggle("hidden", state.sourceOpen);
          }
          if (els.markdownEditor) {
            els.markdownEditor.classList.add("hidden");
          }
          if (state.markdownEditorApi && state.markdownEditorApi.host) {
            state.markdownEditorApi.host.classList.remove("hidden");
          }
          window.setTimeout(function() {
            focusMarkdownEditor(state, els, { preventScroll: true });
            setMarkdownEditorSelection(state, els, selectionStart, selectionEnd);
            setMarkdownEditorScrollTop(state, els, scrollTop);
          }, 0);
        }
        function setDebugOpen(open) {
          state.debugOpen = Boolean(open);
          els.debugDrawer.classList.toggle("hidden", !state.debugOpen);
          if (els.toggleDebug) {
            els.toggleDebug.classList.toggle("active", state.debugOpen);
          }
        }
        function setRailOpen(open) {
          state.railOpen = Boolean(open);
          if (els.rail) {
            els.rail.classList.toggle("open", state.railOpen);
          }
          if (els.toggleRail) {
            els.toggleRail.classList.toggle("active", state.railOpen);
          }
        }
        function setRailTab(tab) {
          state.railTab = ["files", "context", "tasks", "tags"].indexOf(tab) >= 0 ? tab : "files";
          if (els.railTabFiles) {
            els.railTabFiles.classList.toggle("active", state.railTab === "files");
          }
          if (els.railTabContext) {
            els.railTabContext.classList.toggle("active", state.railTab === "context");
          }
          if (els.railTabTasks) {
            els.railTabTasks.classList.toggle("active", state.railTab === "tasks");
          }
          if (els.railTabTags) {
            els.railTabTags.classList.toggle("active", state.railTab === "tags");
          }
          if (els.railPanelFiles) {
            els.railPanelFiles.classList.toggle("hidden", state.railTab !== "files");
          }
          if (els.railPanelContext) {
            els.railPanelContext.classList.toggle("hidden", state.railTab !== "context");
          }
          if (els.railPanelTasks) {
            els.railPanelTasks.classList.toggle("hidden", state.railTab !== "tasks");
          }
          if (els.railPanelTags) {
            els.railPanelTags.classList.toggle("hidden", state.railTab !== "tags");
          }
        }
        async function saveCurrentTask() {
          if (!state.currentTask) {
            return;
          }
          const payload = buildTaskSavePayload(
            els.taskText.value,
            els.taskState.value,
            els.taskDue.value,
            els.taskRemind.value,
            els.taskWho.value,
            serializeDateTimeValue
          );
          els.taskModalMeta.textContent = "Saving task\u2026";
          try {
            await saveTask(state.currentTask.ref, payload);
            closeTaskModal();
            await Promise.all([state.selectedPage ? loadPageDetail(state.selectedPage, true) : Promise.resolve()]);
          } catch (error) {
            els.taskModalMeta.textContent = "Save failed: " + errorMessage(error);
          }
        }
        async function saveCurrentPage() {
          if (!state.selectedPage || !state.currentPage) {
            return;
          }
          if (!hasUnsavedPageChanges()) {
            clearAutosaveTimer();
            return;
          }
          clearAutosaveTimer();
          const markdownToSave = state.currentMarkdown;
          setNoteStatus("Saving " + state.selectedPage + "...");
          try {
            const payload = await savePageMarkdown(state.selectedPage, markdownToSave, encodePath);
            state.currentPage = payload;
            state.originalMarkdown = payload.rawMarkdown || markdownToSave;
            if (state.currentMarkdown === markdownToSave) {
              state.currentMarkdown = payload.rawMarkdown || markdownToSave;
            }
            setNoteStatus("Saved " + state.selectedPage + ".");
            await loadPages();
            if (!markdownEditorHasFocus(state, els)) {
              await loadPageDetail(state.selectedPage, true);
            }
          } catch (error) {
            setNoteStatus("Save failed: " + errorMessage(error));
            if (hasUnsavedPageChanges()) {
              scheduleAutosave();
            }
          }
        }
        function connectEvents() {
          if (state.eventSource) {
            state.eventSource.close();
          }
          const source = new EventSource("/api/events");
          state.eventSource = source;
          const markLive = function(label, live) {
            els.eventStatus.textContent = label;
            els.eventStatus.classList.toggle("live", live);
          };
          source.onopen = function() {
            markLive("live", true);
            addEventLine("sse.open", { ok: true }, false);
          };
          source.onerror = function() {
            markLive("reconnecting", false);
            addEventLine("sse.error", { reconnecting: true }, true);
          };
          [
            "page.changed",
            "page.deleted",
            "derived.changed",
            "task.changed",
            "query.changed",
            "query-block.changed"
          ].forEach(function(eventName) {
            source.addEventListener(eventName, function(event) {
              let payload = {};
              const messageEvent = event;
              try {
                payload = JSON.parse(messageEvent.data);
              } catch (error) {
                payload = { raw: messageEvent.data };
              }
              addEventLine(eventName, payload, false);
              debounceRefresh();
            });
          });
        }
        function wireEvents() {
          on(els.pageSearch, "input", loadPages);
          on(els.querySearch, "input", loadSavedQueryTree);
          on(els.reloadPages, "click", loadPages);
          on(els.reloadQueries, "click", loadSavedQueryTree);
          on(els.addProperty, "click", startAddProperty);
          on(els.toggleRail, "click", function() {
            if (window.matchMedia("(max-width: 1180px)").matches) {
              setRailOpen(!state.railOpen);
            }
          });
          on(els.openSearch, "click", function() {
            setSearchOpen(true);
            scheduleGlobalSearch();
          });
          on(els.closeCommandModal, "click", closeCommandPalette);
          on(els.commandPaletteInput, "input", scheduleCommandPaletteRefresh);
          on(els.railTabFiles, "click", function() {
            setRailTab("files");
          });
          on(els.railTabContext, "click", function() {
            setRailTab("context");
          });
          on(els.railTabTasks, "click", function() {
            setRailTab("tasks");
          });
          on(els.railTabTags, "click", function() {
            setRailTab("tags");
          });
          on(els.toggleDebug, "click", function() {
            setDebugOpen(!state.debugOpen);
          });
          on(els.loadSelectedQuery, "click", loadSelectedQueryIntoEditor);
          on(els.formatQuery, "click", formatQueryText);
          on(els.runQuery, "click", runQueryWorkbench);
          on(els.markdownEditor, "input", function() {
            state.currentMarkdown = els.markdownEditor.value;
            const rawContext = currentRawLineContext(state, els);
            const slashAnchor = state.markdownEditorApi && state.markdownEditorApi.host ? state.markdownEditorApi.host : els.markdownEditor;
            const caretRect = markdownEditorCaretRect(state);
            const noteRect = els.noteLayout ? els.noteLayout.getBoundingClientRect() : { left: 0, top: 0 };
            maybeOpenSlashMenu(state, els, slashAnchor, rawContext.lineText, {
              type: "raw",
              left: caretRect ? Math.max(0, caretRect.left - noteRect.left) : void 0,
              top: caretRect ? Math.max(0, caretRect.bottom - noteRect.top + 6) : void 0
            }, applySlashSelection);
            if (state.currentPage) {
              els.rawView.textContent = state.currentMarkdown;
              refreshLivePageChrome();
            }
            if (state.currentPage) {
              setNoteStatus("Unsaved local edits on " + state.selectedPage + ".");
              scheduleAutosave();
            }
          });
          const handleMarkdownEditorKeydown = function(rawEvent) {
            const event = rawEvent;
            if (event.key === "Enter" && event.shiftKey) {
              const rawContext = currentRawLineContext(state, els);
              const link = wikiLinkAtCaret(rawContext.lineText, rawContext.caretInLine);
              if (link && link.target) {
                event.preventDefault();
                closeSlashMenu(state, els);
                navigateToPage(link.target, false);
                return;
              }
            }
            if (event.key === "Escape" && state.slashOpen) {
              closeSlashMenu(state, els);
              event.preventDefault();
              return;
            }
            if (event.key === "ArrowUp" && state.slashOpen) {
              event.preventDefault();
              moveSlashSelection(state, els, -1);
              return;
            }
            if (event.key === "ArrowDown" && state.slashOpen) {
              event.preventDefault();
              moveSlashSelection(state, els, 1);
              return;
            }
            if (event.key === "Enter" && state.slashOpen) {
              event.preventDefault();
              applySlashSelection();
            }
          };
          on(els.markdownEditor, "keydown", handleMarkdownEditorKeydown);
          if (state.markdownEditorApi) {
            state.markdownEditorApi.onKeydown(handleMarkdownEditorKeydown);
          }
          on(els.closeTaskModal, "click", closeTaskModal);
          on(els.cancelTask, "click", closeTaskModal);
          on(els.saveTask, "click", saveCurrentTask);
          on(els.closeSearchModal, "click", closeSearchModal);
          on(els.globalSearchInput, "input", scheduleGlobalSearch);
          on(els.globalSearchInput, "keydown", function(rawEvent) {
            const event = rawEvent;
            if (event.key === "ArrowDown") {
              event.preventDefault();
              moveSearchSelection(1);
              return;
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              moveSearchSelection(-1);
              return;
            }
            if (event.key === "Enter") {
              const buttons = searchResultButtons();
              if (buttons.length && state.searchSelectionIndex >= 0) {
                event.preventDefault();
                triggerSearchSelection();
              }
            }
          });
          on(els.commandPaletteInput, "keydown", function(rawEvent) {
            const event = rawEvent;
            if (event.key === "ArrowDown") {
              event.preventDefault();
              moveCommandSelection(1);
              return;
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              moveCommandSelection(-1);
              return;
            }
            if (event.key === "Enter") {
              const buttons = commandResultButtons();
              if (buttons.length && state.commandSelectionIndex >= 0) {
                event.preventDefault();
                triggerCommandSelection();
              }
            }
          });
          on(els.taskModalShell, "click", function(event) {
            if (event.target === els.taskModalShell) {
              closeTaskModal();
            }
          });
          on(els.searchModalShell, "click", function(event) {
            if (event.target === els.searchModalShell) {
              closeSearchModal();
            }
          });
          on(els.commandModalShell, "click", function(event) {
            if (event.target === els.commandModalShell) {
              closeCommandPalette();
            }
          });
          document.addEventListener("mousedown", function(event) {
            const target = event.target instanceof Element ? event.target : null;
            const withinProperties = target ? target.closest("#page-properties") || target.closest("#add-property") : null;
            if (!withinProperties) {
              dismissPropertyUI();
            }
            if (!target || !target.closest("#slash-menu")) {
              closeSlashMenu(state, els);
            }
            if (state.railOpen && els.rail && els.toggleRail) {
              const withinRail = target ? target.closest("#rail") || target.closest("#toggle-rail") : null;
              if (!withinRail && window.matchMedia("(max-width: 1180px)").matches) {
                setRailOpen(false);
              }
            }
          });
          window.addEventListener("keydown", function(event) {
            if (event.key === "Escape" && !els.taskModalShell.classList.contains("hidden")) {
              closeTaskModal();
              return;
            }
            if (event.key === "Escape" && els.searchModalShell && !els.searchModalShell.classList.contains("hidden")) {
              closeSearchModal();
              return;
            }
            if (event.key === "Escape" && els.commandModalShell && !els.commandModalShell.classList.contains("hidden")) {
              closeCommandPalette();
              return;
            }
            if (event.key === "Escape" && (state.propertyDraft || state.propertyTypeMenuKey)) {
              dismissPropertyUI();
              const active = document.activeElement;
              if (active && typeof active.blur === "function") {
                active.blur();
              }
              event.preventDefault();
              return;
            }
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s" && state.selectedPage) {
              event.preventDefault();
              saveCurrentPage();
            }
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "e" && state.selectedPage) {
              event.preventDefault();
              setSourceOpen(!state.sourceOpen);
            }
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
              event.preventDefault();
              setSearchOpen(true);
              scheduleGlobalSearch();
            }
            if ((event.metaKey || event.ctrlKey) && event.key === "/") {
              event.preventDefault();
              setCommandPaletteOpen(true);
              renderCommandPaletteResults2();
            }
          });
          window.addEventListener("blur", function() {
            state.windowBlurred = true;
            captureEditorFocusSpec(state, els);
          });
          window.addEventListener("focus", function() {
            state.windowBlurred = false;
            restoreEditorFocus(state, els, state.selectedPage);
          });
          document.addEventListener("visibilitychange", function() {
            if (document.hidden) {
              state.windowBlurred = true;
              captureEditorFocusSpec(state, els);
              return;
            }
            state.windowBlurred = false;
            restoreEditorFocus(state, els, state.selectedPage);
          });
          window.addEventListener("popstate", function() {
            applyURLState2();
          });
        }
        async function boot() {
          if (window.NoteriousCodeEditor && els.markdownEditor) {
            state.markdownEditorApi = window.NoteriousCodeEditor.create(els.markdownEditor);
            const markdownEditorApi = state.markdownEditorApi;
            if (!markdownEditorApi) {
              return;
            }
            on(markdownEditorApi.host, "click", function(event) {
              const eventTarget = event.target instanceof Element ? event.target : null;
              const target = eventTarget ? eventTarget.closest("[data-page-link]") : null;
              if (!target) {
                return;
              }
              event.preventDefault();
              const page = String(target.getAttribute("data-page-link") || "").trim();
              const line = String(target.getAttribute("data-page-line") || "").trim();
              const taskRef = String(target.getAttribute("data-task-ref") || "").trim();
              if (!page) {
                return;
              }
              if (taskRef) {
                navigateToPageAtTask(page, taskRef, Number(line), false);
                return;
              }
              if (line) {
                navigateToPageAtLine(page, Number(line), false);
                return;
              }
              navigateToPage(page, false);
            });
            on(markdownEditorApi.host, "noterious:page-link", function(event) {
              const detail = event.detail || {};
              const page = detail.page ? String(detail.page) : "";
              const line = detail.line ? Number(detail.line) : 0;
              const taskRef = detail.taskRef ? String(detail.taskRef) : "";
              if (page) {
                if (taskRef) {
                  navigateToPageAtTask(page, taskRef, line, false);
                  return;
                }
                if (line > 0) {
                  navigateToPageAtLine(page, line, false);
                  return;
                }
                navigateToPage(page, false);
              }
            });
            on(markdownEditorApi.host, "noterious:task-toggle", function(event) {
              const detail = event.detail || {};
              const bodyLineNumber = Number(detail.lineNumber) || 0;
              if (!state.currentPage || !state.currentPage.tasks || !bodyLineNumber) {
                return;
              }
              const split = splitFrontmatter(state.currentMarkdown);
              const frontmatterLineCount = split.frontmatter ? split.frontmatter.split("\n").length - 1 : 0;
              const rawLineNumber = frontmatterLineCount + bodyLineNumber;
              const task = state.currentPage.tasks.find(function(item) {
                return Number(item.line) === rawLineNumber;
              });
              if (task) {
                toggleTaskDone2(task);
              }
            });
            on(markdownEditorApi.host, "noterious:task-open", function(event) {
              const detail = event.detail || {};
              const ref = detail.ref ? String(detail.ref) : "";
              const task = ref ? findCurrentTask(ref) : null;
              if (task) {
                openTaskModal(task);
              }
            });
          }
          setDebugOpen(false);
          setRailTab("files");
          setRailOpen(false);
          setSourceOpen(false);
          renderNoteStudio();
          renderPageTasks2([]);
          renderPageContext2();
          renderPageProperties2();
          wireEvents();
          await Promise.all([loadMeta(), loadPages(), loadSavedQueryTree()]);
          applyURLState2();
          connectEvents();
        }
        boot();
      })();
    }
  });
  require_app();
})();
