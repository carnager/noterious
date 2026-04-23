(function () {
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
    pendingPageTaskRef: "",
  };

  const els = {
    metaStrip: document.getElementById("meta-strip"),
    pageSearch: document.getElementById("page-search"),
    pageList: document.getElementById("page-list"),
    pageTaskList: document.getElementById("page-task-list"),
    pageTags: document.getElementById("page-tags"),
    pageContext: document.getElementById("page-context"),
    pageProperties: document.getElementById("page-properties"),
    addProperty: document.getElementById("add-property"),
    propertyActions: document.querySelector(".property-actions"),
    querySearch: document.getElementById("query-search"),
    queryTree: document.getElementById("query-tree"),
    detailKind: document.getElementById("detail-kind"),
    detailTitle: document.getElementById("detail-title"),
    detailPath: document.getElementById("detail-path"),
    noteHeading: document.getElementById("note-heading"),
    noteStatus: document.getElementById("note-status"),
    markdownEditor: document.getElementById("markdown-editor"),
    structuredView: document.getElementById("structured-view"),
    derivedView: document.getElementById("derived-view"),
    rawView: document.getElementById("raw-view"),
    queryEditor: document.getElementById("query-editor"),
    queryOutput: document.getElementById("query-output"),
    eventStatus: document.getElementById("event-status"),
    eventLog: document.getElementById("event-log"),
    rail: document.getElementById("rail"),
    railTabFiles: document.getElementById("rail-tab-files"),
    railTabContext: document.getElementById("rail-tab-context"),
    railTabTasks: document.getElementById("rail-tab-tasks"),
    railTabTags: document.getElementById("rail-tab-tags"),
    railPanelFiles: document.getElementById("rail-panel-files"),
    railPanelContext: document.getElementById("rail-panel-context"),
    railPanelTasks: document.getElementById("rail-panel-tasks"),
    railPanelTags: document.getElementById("rail-panel-tags"),
    noteLayout: document.getElementById("note-layout"),
    toggleRail: document.getElementById("toggle-rail"),
    openSearch: document.getElementById("open-search"),
    reloadPages: document.getElementById("reload-pages"),
    reloadQueries: document.getElementById("reload-queries"),
    toggleDebug: document.getElementById("toggle-debug"),
    debugDrawer: document.getElementById("debug-drawer"),
    loadSelectedQuery: document.getElementById("load-selected-query"),
    formatQuery: document.getElementById("format-query"),
    runQuery: document.getElementById("run-query"),
    taskModalShell: document.getElementById("task-modal-shell"),
    taskModalTitle: document.getElementById("task-modal-title"),
    taskText: document.getElementById("task-text"),
    taskState: document.getElementById("task-state"),
    taskDue: document.getElementById("task-due"),
    taskRemind: document.getElementById("task-remind"),
    taskWho: document.getElementById("task-who"),
    taskModalMeta: document.getElementById("task-modal-meta"),
    closeTaskModal: document.getElementById("close-task-modal"),
    cancelTask: document.getElementById("cancel-task"),
    saveTask: document.getElementById("save-task"),
    searchModalShell: document.getElementById("search-modal-shell"),
    closeSearchModal: document.getElementById("close-search-modal"),
    globalSearchInput: document.getElementById("global-search-input"),
    globalSearchResults: document.getElementById("global-search-results"),
    commandModalShell: document.getElementById("command-modal-shell"),
    closeCommandModal: document.getElementById("close-command-modal"),
    commandPaletteInput: document.getElementById("command-palette-input"),
    commandPaletteResults: document.getElementById("command-palette-results"),
    slashMenu: document.getElementById("slash-menu"),
    slashMenuResults: document.getElementById("slash-menu-results"),
  };

  function setMetaPills(values) {
    if (!els.metaStrip) {
      return;
    }
    els.metaStrip.textContent = "";
    values.forEach(function (value) {
      const pill = document.createElement("div");
      pill.className = "pill";
      pill.textContent = value;
      els.metaStrip.appendChild(pill);
    });
  }

  function debounceRefresh() {
    window.clearTimeout(state.refreshTimer);
    state.refreshTimer = window.setTimeout(function () {
      loadPages();
      loadSavedQueryTree();
      if (!markdownEditorHasFocus()) {
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

  async function fetchJSON(url, options) {
    const response = await fetch(url, options);
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || ("Request failed: " + response.status));
    }
    return response.json();
  }

  function pretty(value) {
    return JSON.stringify(value, null, 2);
  }

  function encodePath(path) {
    return path.split("/").map(encodeURIComponent).join("/");
  }

  function parseURLState() {
    const url = new URL(window.location.href);
    return {
      page: url.searchParams.get("page") || "",
      query: url.searchParams.get("query") || "",
    };
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
      // ignore storage failures
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

  function captureEditorFocusSpec() {
    if (els.markdownEditor && markdownEditorHasFocus()) {
      state.restoreFocusSpec = {
        mode: "editor",
        offset: markdownEditorSelectionStart(),
      };
    }
  }

  function restoreEditorFocus() {
    if (!state.selectedPage || !state.restoreFocusSpec) {
      return;
    }
    if (!els.taskModalShell.classList.contains("hidden") ||
      !els.searchModalShell.classList.contains("hidden") ||
      !els.commandModalShell.classList.contains("hidden")) {
      return;
    }

    const focusSpec = state.restoreFocusSpec;
    state.restoreFocusSpec = null;

    window.requestAnimationFrame(function () {
      if (focusSpec.mode === "editor" && els.markdownEditor) {
        const value = markdownEditorValue();
        const offset = Math.max(0, Math.min(Number(focusSpec.offset) || 0, value.length));
        focusMarkdownEditor({preventScroll: true});
        setMarkdownEditorSelection(offset, offset);
        return;
      }

    });
  }

  function blockingOverlayOpen() {
    return Boolean(
      (els.taskModalShell && !els.taskModalShell.classList.contains("hidden")) ||
      (els.searchModalShell && !els.searchModalShell.classList.contains("hidden")) ||
      (els.commandModalShell && !els.commandModalShell.classList.contains("hidden"))
    );
  }

  function syncURLState(replace) {
    const url = new URL(window.location.href);
    if (state.selectedPage) {
      url.searchParams.set("page", state.selectedPage);
    } else {
      url.searchParams.delete("page");
    }
    if (state.selectedSavedQuery) {
      url.searchParams.set("query", state.selectedSavedQuery);
    } else {
      url.searchParams.delete("query");
    }
    if (replace) {
      window.history.replaceState({}, "", url);
    } else {
      window.history.pushState({}, "", url);
    }
  }

  function applyURLState() {
    const urlState = parseURLState();
    if (urlState.page) {
      navigateToPage(urlState.page, true);
      return;
    }
    if (urlState.query) {
      state.selectedSavedQuery = urlState.query;
      state.selectedPage = "";
      renderPages();
      renderSavedQueryTree();
      loadSavedQueryDetail(urlState.query);
      return;
    }
    const homePage = currentHomePage();
    if (homePage && state.pages.some(function (page) {
      return String(page.path || "").toLowerCase() === homePage.toLowerCase();
    })) {
      navigateToPage(homePage, true);
      return;
    }
    renderPages();
    renderSavedQueryTree();
  }

  function navigateToPage(pagePath, replace) {
    if (!pagePath) {
      return;
    }
    state.pendingPageLineFocus = null;
    state.pendingPageTaskRef = "";
    state.selectedPage = pagePath;
    state.selectedSavedQuery = "";
    ensureExpandedPageAncestors(pagePath);
    syncURLState(Boolean(replace));
    renderPages();
    renderSavedQueryTree();
    loadPageDetail(pagePath, true);
  }

  function navigateToPageAtLine(pagePath, lineNumber, replace) {
    if (!pagePath) {
      return;
    }
    const parsedLine = Number(lineNumber);
    state.pendingPageLineFocus = Number.isFinite(parsedLine) && parsedLine > 0 ? parsedLine : null;
    state.pendingPageTaskRef = "";
    state.selectedPage = pagePath;
    state.selectedSavedQuery = "";
    ensureExpandedPageAncestors(pagePath);
    syncURLState(Boolean(replace));
    renderPages();
    renderSavedQueryTree();
    loadPageDetail(pagePath, true);
  }

  function navigateToPageAtTask(pagePath, taskRef, lineNumber, replace) {
    if (!pagePath) {
      return;
    }
    const parsedLine = Number(lineNumber);
    state.pendingPageLineFocus = Number.isFinite(parsedLine) && parsedLine > 0 ? parsedLine : null;
    state.pendingPageTaskRef = String(taskRef || "").trim();
    state.selectedPage = pagePath;
    state.selectedSavedQuery = "";
    ensureExpandedPageAncestors(pagePath);
    syncURLState(Boolean(replace));
    renderPages();
    renderSavedQueryTree();
    loadPageDetail(pagePath, true);
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

  function on(node, eventName, handler) {
    if (!node) {
      return;
    }
    node.addEventListener(eventName, handler);
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

  function markdownEditorAPI() {
    return state.markdownEditorApi || null;
  }

  function markdownEditorValue() {
    const api = markdownEditorAPI();
    return api ? api.getValue() : els.markdownEditor.value;
  }

  function setMarkdownEditorValue(value) {
    const api = markdownEditorAPI();
    if (api) {
      api.setValue(value);
      return;
    }
    els.markdownEditor.value = value;
  }

  function markdownEditorSelectionStart() {
    const api = markdownEditorAPI();
    return api ? api.getSelectionStart() : (els.markdownEditor.selectionStart || 0);
  }

  function markdownEditorSelectionEnd() {
    const api = markdownEditorAPI();
    return api ? api.getSelectionEnd() : (els.markdownEditor.selectionEnd || 0);
  }

  function setMarkdownEditorSelection(anchor, head, reveal) {
    const api = markdownEditorAPI();
    if (api) {
      api.setSelectionRange(anchor, typeof head === "number" ? head : anchor, Boolean(reveal));
      return;
    }
    els.markdownEditor.setSelectionRange(anchor, typeof head === "number" ? head : anchor);
  }

  function focusMarkdownEditor(options) {
    const api = markdownEditorAPI();
    if (api) {
      api.focus(options);
      return;
    }
    focusWithoutScroll(els.markdownEditor);
  }

  function markdownEditorScrollTop() {
    const api = markdownEditorAPI();
    return api ? api.getScrollTop() : els.markdownEditor.scrollTop;
  }

  function setMarkdownEditorScrollTop(value) {
    const api = markdownEditorAPI();
    if (api) {
      api.setScrollTop(value);
      return;
    }
    els.markdownEditor.scrollTop = value;
  }

  function markdownEditorHasFocus() {
    const api = markdownEditorAPI();
    return api ? api.hasFocus() : document.activeElement === els.markdownEditor;
  }

  function markdownEditorCaretRect() {
    const api = markdownEditorAPI();
    return api && typeof api.getCaretRect === "function" ? api.getCaretRect() : null;
  }

  function markdownEditorSetRenderMode(enabled) {
    const api = markdownEditorAPI();
    if (api && typeof api.setRenderMode === "function") {
      api.setRenderMode(Boolean(enabled));
    }
  }

  function markdownEditorSetQueryBlocks(blocks) {
    const api = markdownEditorAPI();
    if (api && typeof api.setQueryBlocks === "function") {
      api.setQueryBlocks(blocks);
    }
  }

  function markdownEditorSetTasks(tasks) {
    const api = markdownEditorAPI();
    if (api && typeof api.setTasks === "function") {
      api.setTasks(tasks);
    }
  }

  function currentRawLineContext() {
    const value = markdownEditorValue();
    const start = markdownEditorSelectionStart();
    const end = markdownEditorSelectionEnd();
    const lineStart = value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
    const lineEndIndex = value.indexOf("\n", end);
    const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex;
    return {
      value: value,
      selectionStart: start,
      selectionEnd: end,
      lineStart: lineStart,
      lineEnd: lineEnd,
      lineText: value.slice(lineStart, lineEnd),
      caretInLine: Math.max(0, start - lineStart),
    };
  }

  function createSelectableItem(title, subtitle, active, onClick) {
    const wrapper = document.createElement("div");
    wrapper.className = "list-item";

    const button = document.createElement("button");
    if (active) {
      button.classList.add("active");
    }
    button.type = "button";
    button.addEventListener("click", onClick);

    const strong = document.createElement("strong");
    strong.textContent = title;
    button.appendChild(strong);

    if (subtitle) {
      const small = document.createElement("small");
      small.textContent = subtitle;
      button.appendChild(small);
    }

    wrapper.appendChild(button);
    return wrapper;
  }

  function ensureExpandedPageAncestors(path) {
    const parts = String(path || "").split("/");
    let key = "";
    for (let index = 0; index < parts.length - 1; index += 1) {
      key = key ? key + "/" + parts[index] : parts[index];
      state.expandedPageFolders[key] = true;
    }
  }

  function buildPageTree(pages) {
    const root = { folders: {}, pages: [] };

    pages.forEach(function (page) {
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

  function renderPageTreeNode(node, depth) {
    const group = document.createElement("div");
    group.className = depth === 0 ? "page-tree-root" : "page-tree-children";

    Object.keys(node.folders)
      .sort()
      .forEach(function (name) {
        const folder = node.folders[name];
        const item = document.createElement("div");
        item.className = "page-tree-node page-tree-folder";

        const button = document.createElement("button");
        button.type = "button";
        button.className = "page-tree-toggle";
        button.setAttribute("aria-expanded", state.expandedPageFolders[folder.key] ? "true" : "false");
        button.addEventListener("click", function () {
          state.expandedPageFolders[folder.key] = !state.expandedPageFolders[folder.key];
          renderPages();
        });

        const chevron = document.createElement("span");
        chevron.className = "page-tree-chevron";
        chevron.textContent = state.expandedPageFolders[folder.key] ? "▾" : "▸";
        const icon = document.createElement("span");
        icon.className = "page-tree-icon";
        icon.textContent = state.expandedPageFolders[folder.key] ? "📂" : "📁";
        const label = document.createElement("span");
        label.className = "page-tree-label";
        label.textContent = folder.name;
        button.appendChild(chevron);
        button.appendChild(icon);
        button.appendChild(label);
        item.appendChild(button);

        if (state.expandedPageFolders[folder.key]) {
          item.appendChild(renderPageTreeNode(folder, depth + 1));
        }

        group.appendChild(item);
      });

    node.pages
      .slice()
      .sort(function (left, right) {
        return String(left.path).localeCompare(String(right.path));
      })
      .forEach(function (page) {
        const leafName = String(page.path || "").split("/").slice(-1)[0] || page.path;
        const item = document.createElement("div");
        item.className = "page-tree-node page-tree-leaf";

        const button = document.createElement("button");
        button.type = "button";
        button.className = "page-tree-page";
        if (state.selectedPage === page.path) {
          button.classList.add("active");
        }
        button.addEventListener("click", function () {
          navigateToPage(page.path, false);
        });

        const icon = document.createElement("span");
        icon.className = "page-tree-icon";
        icon.textContent = "•";
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

  function escapeHTML(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
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
          label: String(match[2] || match[1] || "").trim(),
        };
      }
    }
    return null;
  }

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
        matches: function () {
          return "task".indexOf(query) === 0;
        },
        apply: function (lineText) {
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

  function closeSlashMenu() {
    state.slashOpen = false;
    state.slashSelectionIndex = -1;
    state.slashContext = null;
    if (els.slashMenu) {
      els.slashMenu.classList.add("hidden");
    }
    if (els.slashMenuResults) {
      clearNode(els.slashMenuResults);
    }
  }

  function openSlashMenu(commands, context) {
    if (!els.slashMenu || !els.slashMenuResults || !commands.length) {
      closeSlashMenu();
      return;
    }
    state.slashOpen = true;
    state.slashSelectionIndex = 0;
    state.slashContext = context;
    clearNode(els.slashMenuResults);

    commands.forEach(function (command, index) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "slash-menu-item" + (index === state.slashSelectionIndex ? " active" : "");
      button.addEventListener("mousedown", function (event) {
        event.preventDefault();
      });
      button.addEventListener("click", function () {
        applySlashSelection();
      });
      const title = document.createElement("strong");
      title.textContent = "/" + command.id;
      const description = document.createElement("small");
      description.textContent = command.description;
      button.appendChild(title);
      button.appendChild(description);
      els.slashMenuResults.appendChild(button);
    });

    els.slashMenu.style.left = (context.left || 0) + "px";
    els.slashMenu.style.top = (context.top || 0) + "px";
    els.slashMenu.classList.remove("hidden");
  }

  function updateSlashSelection() {
    if (!state.slashOpen || !els.slashMenuResults) {
      return;
    }
    Array.from(els.slashMenuResults.querySelectorAll(".slash-menu-item")).forEach(function (item, index) {
      item.classList.toggle("active", index === state.slashSelectionIndex);
    });
  }

  function moveSlashSelection(delta) {
    if (!state.slashOpen || !els.slashMenuResults) {
      return;
    }
    const items = Array.from(els.slashMenuResults.querySelectorAll(".slash-menu-item"));
    if (!items.length) {
      return;
    }
    const nextIndex = Math.max(0, Math.min(items.length - 1, state.slashSelectionIndex + delta));
    state.slashSelectionIndex = nextIndex;
    updateSlashSelection();
  }

  function maybeOpenSlashMenu(editor, lineText, context) {
    const commands = slashCommandsForText(lineText);
    if (!commands.length) {
      closeSlashMenu();
      return;
    }

    const noteRect = els.noteLayout ? els.noteLayout.getBoundingClientRect() : { left: 0, top: 0 };
    const editorRect = editor.getBoundingClientRect();
    openSlashMenu(commands, {
      editor: context.editor || editor,
      commands: commands,
      left: Math.max(0, typeof context.left === "number" ? context.left : (editorRect.left - noteRect.left)),
      top: Math.max(0, typeof context.top === "number" ? context.top : (editorRect.bottom - noteRect.top + 4)),
      type: context.type,
      lineIndex: context.lineIndex,
    });
  }

  function applySlashSelection() {
    if (!state.slashOpen || !state.slashContext) {
      closeSlashMenu();
      return false;
    }
    const commands = state.slashContext.commands || [];
    const command = commands[state.slashSelectionIndex] || commands[0];
    if (!command) {
      closeSlashMenu();
      return false;
    }

    const rawContext = currentRawLineContext();
    const updated = command.apply(rawContext.lineText);
    const nextValue = rawContext.value.slice(0, rawContext.lineStart) + updated + rawContext.value.slice(rawContext.lineEnd);
    const scrollTop = markdownEditorScrollTop();
    setMarkdownEditorValue(nextValue);
    state.currentMarkdown = nextValue;
    els.rawView.textContent = state.currentMarkdown;
    scheduleAutosave();
    const caret = rawContext.lineStart + updated.length;
    focusMarkdownEditor({preventScroll: true});
    setMarkdownEditorSelection(caret, caret);
    setMarkdownEditorScrollTop(scrollTop);

    closeSlashMenu();
    return true;
  }

  function renderInlineTask(task, fallbackText, blockKey) {
    const text = task && task.text
      ? String(task.text).trim()
      : String(fallbackText || "").trim();
    const metaParts = [];
    if (task) {
      if (task.due) {
        metaParts.push('<span class="token">due ' + escapeHTML(task.due) + "</span>");
      }
      if (task.remind) {
        metaParts.push('<span class="token">remind ' + escapeHTML(task.remind) + "</span>");
      }
      if (task.who && task.who.length) {
        metaParts.push('<span class="token">' + escapeHTML(task.who.join(", ")) + "</span>");
      }
    }

    return (
      '<button type="button" class="inline-task' +
      (task && task.done ? " done" : "") +
      '"' +
      (task && task.ref ? ' data-task-ref="' + escapeHTML(task.ref) + '"' : "") +
      (blockKey ? ' data-block-key="' + escapeHTML(blockKey) + '"' : "") +
      ' tabindex="-1"' +
      ' title="Click to focus task markdown. Click again or type to edit. Alt/Ctrl/Cmd-click for task details."' +
      ">" +
      '<span class="inline-task-check" data-task-toggle="true">' +
      (task && task.done ? "☑" : "☐") +
      "</span>" +
      '<span class="inline-task-body">' +
      '<span class="inline-task-text">' +
      renderInline(text || "") +
      "</span>" +
      (metaParts.length ? '<span class="inline-task-meta">' + metaParts.join("") + "</span>" : "") +
      "</span>" +
      "</button>"
    );
  }

  function renderLineContent(line, task, blockKey, inFence) {
    const source = String(line || "");
    const trimmed = source.trim();

    if (!trimmed) {
      return '<div class="note-line-empty">&nbsp;</div>';
    }

    if (inFence || /^```/.test(trimmed)) {
      return '<div class="note-line-code">' + escapeHTML(source) + "</div>";
    }

    let match = source.match(/^(#{1,6})\s+(.*)$/);
    if (match) {
      return '<div class="note-line-content note-line-heading note-line-heading-' + String(match[1].length) + '">' + renderInline(match[2]) + "</div>";
    }

    match = source.match(/^>\s?(.*)$/);
    if (match) {
      return '<div class="note-line-content note-line-quote">' + renderInline(match[1]) + "</div>";
    }

    match = source.match(/^-\s+\[([ xX])\]\s+(.*)$/);
    if (match) {
      return renderInlineTask(task || null, match[2], blockKey);
    }

    match = source.match(/^(\s*-\s+)(.*)$/);
    if (match) {
      return (
        '<div class="note-line-content note-line-list">' +
        '<span class="note-line-marker">•</span>' +
        '<span class="note-line-text">' + renderInline(match[2]) + "</span>" +
        "</div>"
      );
    }

    return '<div class="note-line-content note-line-paragraph">' + renderInline(source) + "</div>";
  }

  function lineKind(line, inFence) {
    const source = String(line || "");
    const trimmed = source.trim();

    if (!trimmed) {
      return "empty";
    }
    if (inFence || /^```/.test(trimmed)) {
      return "code";
    }
    let match = source.match(/^(#{1,6})\s+/);
    if (match) {
      return "heading-" + String(match[1].length);
    }
    if (/^>\s?/.test(source)) {
      return "quote";
    }
    if (/^-\s+\[[ xX]\]\s+/.test(source)) {
      return "task";
    }
    if (/^-\s+/.test(source)) {
      return "list";
    }
    return "paragraph";
  }

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
      body: source.slice(closing + 5),
    };
  }

  function parseFrontmatterScalar(raw) {
    const text = String(raw || "").trim();
    if (!text) {
      return "";
    }
    if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
      return text.slice(1, -1);
    }
    if (text === "true") {
      return true;
    }
    if (text === "false") {
      return false;
    }
    if (text.startsWith("[") && text.endsWith("]")) {
      return text
        .slice(1, -1)
        .split(",")
        .map(function (part) {
          return parseFrontmatterScalar(part);
        })
        .filter(function (part) {
          return !(typeof part === "string" && !part.trim());
        });
    }
    return text;
  }

  function parseFrontmatter(markdown) {
    const split = splitFrontmatter(markdown);
    if (!split.frontmatter) {
      return {};
    }

    const lines = split.frontmatter
      .replace(/^---\n/, "")
      .replace(/\n---\n?$/, "")
      .split("\n");

    const result = {};
    let pendingListKey = "";

    lines.forEach(function (line) {
      if (!String(line || "").trim()) {
        return;
      }

      if (pendingListKey && /^\s*-\s+/.test(line)) {
        if (!Array.isArray(result[pendingListKey])) {
          result[pendingListKey] = [];
        }
        result[pendingListKey].push(parseFrontmatterScalar(line.replace(/^\s*-\s+/, "")));
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

  function currentPageView() {
    if (!state.currentPage) {
      return null;
    }

    const liveFrontmatter = parseFrontmatter(state.currentMarkdown);
    const title = inferMarkdownTitle(state.currentMarkdown, state.currentPage);

    return Object.assign({}, state.currentPage, {
      frontmatter: liveFrontmatter,
      title: title || state.currentPage.title || state.currentPage.page || state.currentPage.path || "",
    });
  }

  function refreshLivePageChrome() {
    const page = currentPageView();
    if (!page) {
      return;
    }

    const fallbackPath = page.page || page.path || state.selectedPage || "";
    els.detailPath.textContent = fallbackPath;
    els.detailTitle.textContent = page.title || fallbackPath;
    els.noteHeading.textContent = page.title || fallbackPath;
    renderPageTags();
    renderPageProperties();
  }

  function updateMarkdownBodyRange(start, end, replacement) {
    const split = splitFrontmatter(state.currentMarkdown);
    const bodyLines = split.body.split("\n");
    const replacementLines = String(replacement || "").replace(/\r\n/g, "\n").split("\n");
    bodyLines.splice.apply(bodyLines, [start, end - start].concat(replacementLines));
    state.currentMarkdown = split.frontmatter + bodyLines.join("\n");
  }

  function editableBody(markdown) {
    return splitFrontmatter(markdown).body;
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

  function bodyPositionFromRawOffset(markdown, offset) {
    const split = splitFrontmatter(markdown);
    const body = split.body;
    const lines = body.split("\n");
    const bodyStart = split.frontmatter.length;
    const absoluteOffset = Math.max(bodyStart, Math.min(Number(offset) || 0, String(markdown || "").length));
    let remaining = absoluteOffset - bodyStart;

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (remaining <= line.length) {
        return {
          lineIndex: index,
          caret: remaining,
        };
      }
      remaining -= line.length;
      if (index < lines.length - 1) {
        if (remaining === 0) {
          return {
            lineIndex: index + 1,
            caret: 0,
          };
        }
        remaining -= 1;
      }
    }

    return {
      lineIndex: Math.max(0, lines.length - 1),
      caret: (lines[lines.length - 1] || "").length,
    };
  }

  function focusEditorAtBodyPosition(lineIndex, caret) {
    const offset = rawOffsetForBodyPosition(state.currentMarkdown, lineIndex, caret);
    window.setTimeout(function () {
      focusMarkdownEditor({preventScroll: true});
      setMarkdownEditorSelection(offset, offset);
    }, 0);
  }

  function isQueryFenceBlock(markdown) {
    const lines = String(markdown || "").split("\n");
    return lines.length > 0 && /^```query(?:\s|$)/i.test(lines[0].trim());
  }

  function findDerivedQueryBlock(markdown) {
    const derived = state.currentDerived;
    if (!derived || !Array.isArray(derived.queryBlocks)) {
      return null;
    }
    const source = String(markdown || "").replace(/\r\n/g, "\n").trim();
    for (let index = 0; index < derived.queryBlocks.length; index += 1) {
      const block = derived.queryBlocks[index];
      if (String(block.source || "").replace(/\r\n/g, "\n").trim() === source) {
        return block;
      }
    }
    return null;
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
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      options[key] = value;
    }
    return options;
  }

  function renderQueryResultCell(column, value) {
    if (column === "path" && value) {
      const pagePath = String(value);
      return '<button type="button" class="wiki-link" data-page-link="' + escapeHTML(pagePath) + '">' + escapeHTML(pagePath) + "</button>";
    }
    if (Array.isArray(value)) {
      return escapeHTML(value.join(", "));
    }
    if (value === null || typeof value === "undefined" || value === "") {
      return '<span class="query-result-empty">—</span>';
    }
    if (typeof value === "boolean") {
      return value ? "true" : "false";
    }
    return escapeHTML(String(value));
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
          hiddenColumns: ["path", "vorname", "nachname"],
        };
      }
    }

    const directCandidates = ["title", "name", "vorname", "nachname"];
    for (let index = 0; index < directCandidates.length; index += 1) {
      const candidate = directCandidates[index];
      if (columns.indexOf(candidate) !== -1 && row[candidate]) {
        return {
          mode: "column",
          columns: ["title", "name"].indexOf(candidate) !== -1 ? [candidate] : ["nachname", "vorname"].filter(function (field) {
            return columns.indexOf(field) !== -1 && row[field];
          }),
          hiddenColumns: columns.indexOf("path") !== -1 ? ["path"] : [],
        };
      }
    }

    return null;
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
      return [linkSpec.column].concat(columns.filter(function (column) {
        return linkSpec.hiddenColumns.indexOf(column) === -1;
      }));
    }

    return columns.filter(function (column) {
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
    const pagePathValue = row ? (row.path || row.__pagePath) : "";
    const pageLineValue = row ? row.__pageLine : "";
    if (linkSpec && pagePathValue) {
      const pagePath = String(pagePathValue);
      if (linkSpec.mode === "synthetic" && column === linkSpec.column) {
        return '<button type="button" class="wiki-link query-cell-link" data-page-link="' + escapeHTML(pagePath) + '">' + escapeHTML(linkSpec.text) + "</button>";
      }
      if (linkSpec.mode === "column" && Array.isArray(linkSpec.columns) && linkSpec.columns.indexOf(column) !== -1) {
        return '<button type="button" class="wiki-link query-cell-link" data-page-link="' + escapeHTML(pagePath) + '">' + escapeHTML(String(row[column])) + "</button>";
      }
    }
    if (column === "text" && pagePathValue) {
      const pagePath = String(pagePathValue);
      const lineAttr = pageLineValue !== null && typeof pageLineValue !== "undefined"
        ? ' data-page-line="' + escapeHTML(String(pageLineValue)) + '"'
        : "";
      const refValue = row && row.__taskRef ? String(row.__taskRef) : "";
      const refAttr = refValue ? ' data-task-ref="' + escapeHTML(refValue) + '"' : "";
      return '<button type="button" class="wiki-link query-cell-link" data-page-link="' + escapeHTML(pagePath) + '"' + lineAttr + refAttr + '>' +
        escapeHTML(String(row ? row[column] || "" : "")) +
        "</button>";
    }
    return renderQueryResultCell(column, row ? row[column] : undefined);
  }

  function renderEmbeddedQueryBlock(block) {
    if (!block) {
      return null;
    }
    const options = parseQueryFenceOptions(block.source || "");
    if (block.error) {
      return '<div class="embedded-query embedded-query-error"><small>' + escapeHTML(block.error) + "</small></div>";
    }

    const result = block.result || {};
    const columns = Array.isArray(result.columns) ? result.columns : [];
    const rows = Array.isArray(result.rows) ? result.rows : [];
    const displayColumns = queryResultDisplayColumns(columns, rows);

    if (!rows.length) {
      return '<div class="embedded-query embedded-query-empty"><small>' + escapeHTML(options.empty || "No results.") + "</small></div>";
    }

    if (displayColumns.length === 1) {
      return '<div class="embedded-query embedded-query-list"><ul>' +
        rows.map(function (row) {
          return "<li>" + renderQueryResultDisplayCell(displayColumns[0], row, columns) + "</li>";
        }).join("") +
        "</ul></div>";
    }

    return '<div class="embedded-query embedded-query-table"><table><thead><tr>' +
      displayColumns.map(function (column) {
        return "<th>" + escapeHTML(queryResultColumnLabel(column, columns, rows[0])) + "</th>";
      }).join("") +
      "</tr></thead><tbody>" +
      rows.map(function (row) {
        return "<tr>" + displayColumns.map(function (column) {
          return "<td>" + renderQueryResultDisplayCell(column, row, columns) + "</td>";
        }).join("") + "</tr>";
      }).join("") +
      "</tbody></table></div>";
  }

  function renderedQueryBlocksForEditor(derived) {
    if (!derived || !Array.isArray(derived.queryBlocks)) {
      return [];
    }
    return derived.queryBlocks.map(function (block) {
      return {
        source: block.source || "",
        html: renderEmbeddedQueryBlock(block) || '<div class="embedded-query embedded-query-empty"><small>No results.</small></div>',
      };
    });
  }

  function renderedTasksForEditor(page) {
    if (!page || !Array.isArray(page.tasks)) {
      return [];
    }
    return page.tasks.map(function (task) {
      return {
        line: task.line,
        ref: task.ref || "",
        text: task.text || "",
        done: Boolean(task.done),
        due: task.due || "",
        remind: task.remind || "",
        who: Array.isArray(task.who) ? task.who.slice() : [],
      };
    });
  }

  function hasUnsavedPageChanges() {
    return Boolean(state.selectedPage && state.currentPage && state.currentMarkdown !== state.originalMarkdown);
  }

  function setNoteStatus(message) {
    els.noteStatus.textContent = message;
  }

  function renderNoteStudio() {
    const page = currentPageView();
    if (!page) {
      setMarkdownEditorValue("");
      setNoteStatus("Select a page to edit and preview markdown.");
      return;
    }

    setMarkdownEditorValue(state.currentMarkdown);
    if (state.markdownEditorApi && state.markdownEditorApi.host) {
      state.markdownEditorApi.host.classList.remove("hidden");
      markdownEditorSetRenderMode(!state.sourceOpen);
      markdownEditorSetQueryBlocks(renderedQueryBlocksForEditor(state.currentDerived));
      markdownEditorSetTasks(renderedTasksForEditor(page));
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
    state.autosaveTimer = window.setTimeout(function () {
      saveCurrentPage();
    }, 700);
  }

  function renderPageTasks(tasks) {
    clearNode(els.pageTaskList);

    if (!tasks || !tasks.length) {
      renderEmpty(els.pageTaskList, "No indexed tasks on this page.");
      return;
    }

    tasks.forEach(function (task) {
      const item = document.createElement("div");
      item.className = "page-task-item";

      const button = document.createElement("button");
      button.type = "button";
      button.addEventListener("click", function () {
        openTaskModal(task);
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
        task.who && task.who.length ? task.who.join(", ") : "",
      ]
        .filter(Boolean)
        .forEach(function (part) {
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
      els.pageTaskList.appendChild(item);
    });
  }

  function renderPageContext() {
    clearNode(els.pageContext);

    if (!state.currentPage || !state.currentDerived) {
      renderEmpty(els.pageContext, "Select a page to see backlinks, links, and query blocks.");
      return;
    }

    const cards = [
      {
        title: "Backlinks",
        body:
          (state.currentDerived.backlinks && state.currentDerived.backlinks.length
            ? state.currentDerived.backlinks.slice(0, 4).map(function (item) {
                return item.sourcePage || item.page || "unknown";
              }).join(", ")
            : "No backlinks yet."),
      },
      {
        title: "Outgoing Links",
        body:
          (state.currentPage.links && state.currentPage.links.length
            ? state.currentPage.links.slice(0, 4).map(function (item) {
                return item.targetPage || item.target || "unknown";
              }).join(", ")
            : "No outgoing links."),
      },
      {
        title: "Embedded Queries",
        body:
          (state.currentDerived.queryBlocks && state.currentDerived.queryBlocks.length
            ? String(state.currentDerived.queryBlocks.length) + " cached block(s)"
            : "No query blocks."),
      },
    ];

    cards.forEach(function (card) {
      const item = document.createElement("div");
      item.className = "context-item";
      const strong = document.createElement("strong");
      strong.textContent = card.title;
      const small = document.createElement("small");
      small.textContent = card.body;
      item.appendChild(strong);
      item.appendChild(small);
      els.pageContext.appendChild(item);
    });
  }

  function renderPageTags() {
    clearNode(els.pageTags);

    const page = currentPageView();
    if (!page) {
      renderEmpty(els.pageTags, "Select a page to see tags.");
      return;
    }

    const frontmatter = page.frontmatter || {};
    const tags = Array.isArray(frontmatter.tags)
      ? frontmatter.tags.slice()
      : (frontmatter.tags ? [String(frontmatter.tags)] : []);

    if (!tags.length) {
      renderEmpty(els.pageTags, "No tags on this page.");
      return;
    }

    tags.forEach(function (tag) {
      const chip = document.createElement("span");
      chip.className = "tag-chip";
      chip.textContent = tag;
      els.pageTags.appendChild(chip);
    });
  }

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
      kind: kind,
      text: kind === "list" ? "" : displayFrontmatterValue(value),
      list: Array.isArray(value) ? value.slice() : [],
    };
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

  function propertyMenuKey(row) {
    return row ? row.key : "__new__";
  }

  function togglePropertyTypeMenu(menuKey) {
    state.propertyTypeMenuKey = state.propertyTypeMenuKey === menuKey ? "" : menuKey;
    renderPageProperties();
  }

  function applyPropertyKind(kind, row) {
    const menuKey = propertyMenuKey(row);
    if (!row) {
      if (!state.propertyDraft || state.editingPropertyKey !== menuKey) {
        setPropertyDraft("", "", "__new__");
      }

      state.propertyDraft.kind = kind;
      if (kind === "list" && !Array.isArray(state.propertyDraft.list)) {
        state.propertyDraft.list = [];
      }
      if (kind === "bool") {
        state.propertyDraft.text = state.propertyDraft.text === "true" ? "true" : "false";
      }
      state.propertyTypeMenuKey = "";
      renderPageProperties();
      return;
    }

    state.propertyTypeMenuKey = "";
    patchCurrentPageFrontmatter({
      frontmatter: {
        set: {
          [row.key]: coercePropertyValue(kind, row.rawValue),
        },
      },
    }).catch(function (error) {
      setNoteStatus("Property type change failed: " + error.message);
    });
  }

  function dismissPropertyUI() {
    if (!state.propertyDraft && !state.propertyTypeMenuKey) {
      return;
    }
    clearPropertyDraft();
    renderPageProperties();
  }

  function propertyDraftValue() {
    if (!state.propertyDraft) {
      return "";
    }
    if (state.propertyDraft.kind === "list") {
      return state.propertyDraft.list.slice();
    }
    if (state.propertyDraft.kind === "bool") {
      return state.propertyDraft.text === "true";
    }
    return String(state.propertyDraft.text || "").trim();
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
      return normalizeDateTimeValue(displayFrontmatterValue(value));
    }
    return displayFrontmatterValue(value);
  }

  async function patchCurrentPageFrontmatter(payload) {
    if (!state.selectedPage || !state.currentPage) {
      return;
    }

    await fetchJSON("/api/pages/" + encodePath(state.selectedPage), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    await Promise.all([loadPages(), loadPageDetail(state.selectedPage, true)]);
  }

  function startAddProperty() {
    setPropertyDraft("", "", "__new__");
    renderPageProperties();
  }

  async function removeProperty(key) {
    if (!key) {
      return;
    }
    await patchCurrentPageFrontmatter({
      frontmatter: {
        remove: [key],
      },
    });
    clearPropertyDraft();
  }

  function startRenameProperty(row) {
    if (!row) {
      return;
    }
    setPropertyDraft(row.key, row.rawValue, row.key);
    state.propertyTypeMenuKey = "";
    renderPageProperties();
  }

  async function savePropertyEdit() {
    const key = state.propertyDraft ? String(state.propertyDraft.key || "").trim() : "";

    if (!key) {
      setNoteStatus("Frontmatter key is required.");
      return;
    }

    const value = propertyDraftValue();
    const setPayload = {};
    setPayload[key] = value;

    const remove = state.editingPropertyKey && state.editingPropertyKey !== key ? [state.editingPropertyKey] : [];

    await patchCurrentPageFrontmatter({
      frontmatter: {
        set: setPayload,
        remove: remove,
      },
    });

    clearPropertyDraft();
  }

  function renderPropertyValueNode(value) {
    if (Array.isArray(value)) {
      const list = document.createElement("div");
      list.className = "property-chip-list";
      value.forEach(function (entry) {
        const chip = document.createElement("span");
        chip.className = "property-chip";
        chip.textContent = entry;
        list.appendChild(chip);
      });
      return list;
    }

    if (typeof value === "boolean") {
      const bool = document.createElement("span");
      bool.className = "property-bool";
      bool.textContent = value ? "☑ true" : "☐ false";
      return bool;
    }

    const text = document.createElement("span");
    text.textContent = displayFrontmatterValue(value);
    return text;
  }

  function propertyTypeIcon(kind) {
    if (kind === "list") {
      return "☰";
    }
    if (kind === "bool") {
      return "☑";
    }
    if (kind === "date" || kind === "datetime") {
      return "◫";
    }
    return "≡";
  }

  function propertyKeyIcon(row) {
    const key = String(row && row.key ? row.key : "").toLowerCase();
    if (key === "tags") {
      return "#";
    }
    if (key.indexOf("date") >= 0 || key.indexOf("birth") >= 0 || key.indexOf("remind") >= 0 || key === "datum") {
      return "◫";
    }
    if (key.indexOf("who") >= 0 || key.indexOf("person") >= 0 || key.indexOf("name") >= 0 || key === "anwesend" || key === "vorname" || key === "nachname") {
      return "◌";
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

  function saveExistingPropertyValue(key, value) {
    return patchCurrentPageFrontmatter({
      frontmatter: {
        set: {
          [key]: value,
        },
      },
    });
  }

  function renderExistingPropertyValueEditor(row) {
    const kind = inferFrontmatterKind(row.rawValue);
    const value = document.createElement("div");
    value.className = "property-value property-inline-editor";

    if (kind === "list") {
      const chips = document.createElement("div");
      chips.className = "property-chip-list editable";
      row.rawValue.forEach(function (entry, index) {
        const chip = document.createElement("span");
        chip.className = "property-chip";

        const label = document.createElement("span");
        label.textContent = entry;
        chip.appendChild(label);

        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "property-chip-remove";
        remove.textContent = "×";
        remove.addEventListener("click", function () {
          const next = row.rawValue.slice();
          next.splice(index, 1);
          saveExistingPropertyValue(row.key, next).catch(function (error) {
            setNoteStatus("Property save failed: " + error.message);
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
      addInput.addEventListener("keydown", function (event) {
        if (event.key === "Enter" || event.key === ",") {
          event.preventDefault();
          const nextValue = addInput.value.trim();
          if (!nextValue) {
            return;
          }
          saveExistingPropertyValue(row.key, row.rawValue.concat([nextValue])).catch(function (error) {
            setNoteStatus("Property save failed: " + error.message);
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
      checkbox.addEventListener("change", function () {
        saveExistingPropertyValue(row.key, checkbox.checked).catch(function (error) {
          setNoteStatus("Property save failed: " + error.message);
        });
      });
      boolLabel.appendChild(checkbox);
      value.appendChild(boolLabel);
      return value;
    }

    const input = document.createElement("input");
    input.className = "property-inline-input";
    input.type = kind === "date" ? "date" : (kind === "datetime" ? "datetime-local" : "text");
    input.value = kind === "datetime" ? normalizeDateTimeValue(row.rawValue) : String(row.rawValue || "");
    input.placeholder = kind === "datetime" ? "2026-04-07T14:45" : "";

    const commit = function () {
      const nextValue = input.value;
      const normalizedCurrent = kind === "datetime" ? normalizeDateTimeValue(row.rawValue) : String(row.rawValue || "");
      if (nextValue === normalizedCurrent) {
        return;
      }
      saveExistingPropertyValue(row.key, nextValue).catch(function (error) {
        setNoteStatus("Property save failed: " + error.message);
      });
    };

    input.addEventListener("blur", commit);
    input.addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        event.preventDefault();
        input.blur();
      }
    });

    value.appendChild(input);
    return value;
  }

  function renderPropertyTypeMenu(shell, row) {
    const menu = document.createElement("div");
    menu.className = "property-type-menu";

    [
      ["text", "Text"],
      ["list", "List"],
      ["bool", "Checkbox"],
      ["date", "Date"],
      ["datetime", "Date & time"],
    ].forEach(function (parts) {
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
      option.addEventListener("click", function () {
        applyPropertyKind(parts[0], row);
      });
      menu.appendChild(option);
    });

    if (row) {
      const rename = document.createElement("button");
      rename.type = "button";
      rename.className = "property-type-option";
      const renameIcon = document.createElement("span");
      renameIcon.className = "property-menu-icon";
      renameIcon.textContent = "✎";
      rename.appendChild(renameIcon);
      const renameLabel = document.createElement("span");
      renameLabel.textContent = "Rename";
      rename.appendChild(renameLabel);
      rename.addEventListener("click", function () {
        startRenameProperty(row);
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
      removeIcon.textContent = "⌫";
      remove.appendChild(removeIcon);
      const removeLabel = document.createElement("span");
      removeLabel.textContent = "Remove";
      remove.appendChild(removeLabel);
      remove.addEventListener("click", function () {
        removeProperty(row.key).catch(function (error) {
          setNoteStatus("Property delete failed: " + error.message);
        });
      });
      menu.appendChild(remove);
    }

    shell.appendChild(menu);
  }

  function renderPropertyEditorRow(container, row) {
    const draft = state.propertyDraft || makePropertyDraft(row ? row.key : "", row ? row.rawValue : "", row ? row.key : "__new__");
    const item = document.createElement("div");
    item.className = "property-row editing";
    const commit = function () {
      savePropertyEdit().catch(function (error) {
        setNoteStatus("Property save failed: " + error.message);
      });
    };
    const cancel = function () {
      clearPropertyDraft();
      renderPageProperties();
    };

    const keyShell = document.createElement("div");
    keyShell.className = "property-key-shell";

    const keyInput = document.createElement("input");
    keyInput.type = "text";
    keyInput.className = "property-inline-input property-inline-key";
    keyInput.placeholder = "property";
    keyInput.value = draft.key;
    keyInput.addEventListener("input", function () {
      state.propertyDraft.key = keyInput.value;
    });
    keyShell.appendChild(keyInput);

    const kindButton = document.createElement("button");
    kindButton.type = "button";
    kindButton.className = "property-kind-button";
    kindButton.textContent = draft.kind;
    kindButton.addEventListener("click", function () {
      togglePropertyTypeMenu(propertyMenuKey(row));
    });
    keyShell.appendChild(kindButton);

    if (state.propertyTypeMenuKey === propertyMenuKey(row)) {
      renderPropertyTypeMenu(keyShell, row);
    }

    const value = document.createElement("div");
    value.className = "property-value property-inline-editor";

    if (draft.kind === "list") {
      const chips = document.createElement("div");
      chips.className = "property-chip-list editable";
      draft.list.forEach(function (entry, index) {
        const chip = document.createElement("span");
        chip.className = "property-chip";

        const label = document.createElement("span");
        label.textContent = entry;
        chip.appendChild(label);

        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "property-chip-remove";
        remove.textContent = "×";
        remove.addEventListener("click", function () {
          state.propertyDraft.list.splice(index, 1);
          renderPageProperties();
        });
        chip.appendChild(remove);

        chips.appendChild(chip);
      });
      value.appendChild(chips);

      const addInput = document.createElement("input");
      addInput.type = "text";
      addInput.className = "property-inline-input";
      addInput.placeholder = "Add list item";
      addInput.addEventListener("keydown", function (event) {
        if (event.key === "Enter" || event.key === ",") {
          event.preventDefault();
          const next = addInput.value.trim();
          if (!next) {
            return;
          }
          state.propertyDraft.list.push(next);
          renderPageProperties();
        }
      });
      value.appendChild(addInput);
    } else if (draft.kind === "bool") {
      const boolLabel = document.createElement("label");
      boolLabel.className = "property-inline-bool";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = draft.text === "true";
      checkbox.addEventListener("change", function () {
        state.propertyDraft.text = checkbox.checked ? "true" : "false";
      });
      boolLabel.appendChild(checkbox);
      value.appendChild(boolLabel);
    } else {
      const input = document.createElement("input");
      input.className = "property-inline-input";
      input.type = draft.kind === "date" ? "date" : (draft.kind === "datetime" ? "datetime-local" : "text");
      input.value = draft.kind === "datetime" ? normalizeDateTimeValue(draft.text) : String(draft.text || "");
      input.placeholder = draft.kind === "datetime" ? "2026-04-07T14:45" : "";
      input.addEventListener("input", function () {
        state.propertyDraft.text = input.value;
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

    item.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        cancel();
        return;
      }
      if (event.key === "Enter") {
        const target = event.target;
        const isListAdder = target && target.placeholder === "Add list item";
        if (isListAdder) {
          return;
        }
        if (target && target.classList && target.classList.contains("property-kind-button")) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        commit();
      }
    });

    window.setTimeout(function () {
      const input = keyShell.querySelector(".property-inline-key");
      if (input) {
        input.focus();
        if (row) {
          input.setSelectionRange(0, input.value.length);
        }
      }
    }, 0);
  }

  function renderPageProperties() {
    clearNode(els.pageProperties);
    els.pageProperties.style.removeProperty("--property-key-width");

    const page = currentPageView();
    if (!page) {
      renderEmpty(els.pageProperties, "Select a page to see properties.");
      return;
    }

    const rows = [];
    const frontmatter = page.frontmatter || {};

    Object.keys(frontmatter)
      .sort()
      .forEach(function (key) {
        const value = frontmatter[key];
        if (value === null || value === "" || typeof value === "undefined") {
          return;
        }
        rows.push({
          key: key,
          value: Array.isArray(value) ? value.join(", ") : String(value),
          rawValue: value,
        });
      });

    if (!rows.length && state.editingPropertyKey !== "__new__") {
      renderEmpty(els.pageProperties, "No frontmatter on this page.");
      return;
    }

    rows.forEach(function (row) {
      if (state.editingPropertyKey === row.key) {
        renderPropertyEditorRow(els.pageProperties, row);
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
      key.addEventListener("click", function () {
        togglePropertyTypeMenu(propertyMenuKey(row));
      });
      keyShell.appendChild(key);

      if (state.propertyTypeMenuKey === propertyMenuKey(row)) {
        renderPropertyTypeMenu(keyShell, row);
      }

      const value = renderExistingPropertyValueEditor(row);

      item.appendChild(keyShell);
      item.appendChild(value);
      els.pageProperties.appendChild(item);
    });

    if (state.editingPropertyKey === "__new__") {
      renderPropertyEditorRow(els.pageProperties, null);
    }

    window.requestAnimationFrame(function () {
      const buttons = Array.from(els.pageProperties.querySelectorAll(".property-name-button"));
      if (!buttons.length) {
        return;
      }
      const width = Math.max.apply(null, buttons.map(function (node) {
        const rectWidth = Math.ceil(node.getBoundingClientRect().width);
        const scrollWidth = Math.ceil(node.scrollWidth || 0);
        return Math.max(rectWidth, scrollWidth);
      }));
      if (width > 0) {
        els.pageProperties.style.setProperty("--property-key-width", (width + 6) + "px");
      }
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
    renderPageTasks([]);
    renderPageTags();
    renderPageContext();
    renderPageProperties();
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
        "Time " + meta.serverTime,
      ]);
    } catch (error) {
      setMetaPills(["Meta error", error.message]);
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
      renderEmpty(els.pageList, error.message);
    }
  }

  function renderPages() {
    clearNode(els.pageList);
    if (!state.pages.length) {
      renderEmpty(els.pageList, "No indexed pages match the current search.");
      return;
    }

    if (state.selectedPage) {
      ensureExpandedPageAncestors(state.selectedPage);
    }

    const query = els.pageSearch.value.trim();
    if (query) {
      const expanded = {};
      state.pages.forEach(function (page) {
        const parts = String(page.path || "").split("/");
        let key = "";
        for (let index = 0; index < parts.length - 1; index += 1) {
          key = key ? key + "/" + parts[index] : parts[index];
          expanded[key] = true;
        }
      });
      Object.keys(expanded).forEach(function (key) {
        state.expandedPageFolders[key] = true;
      });
    }

    els.pageList.appendChild(renderPageTreeNode(buildPageTree(state.pages), 0));
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
      renderSavedQueryTree();
    } catch (error) {
      renderEmpty(els.queryTree, error.message);
    }
  }

  function renderSavedQueryTree() {
    clearNode(els.queryTree);
    if (!state.queryTree.length) {
      renderEmpty(els.queryTree, "No saved queries match the current search.");
      return;
    }

    state.queryTree.forEach(function (bucket) {
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
        if (state.selectedSavedQuery === savedQuery.name) {
          button.classList.add("active");
        }
        button.addEventListener("click", function () {
          state.selectedSavedQuery = savedQuery.name;
          state.selectedPage = "";
          syncURLState(false);
          renderPages();
          renderSavedQueryTree();
          loadSavedQueryDetail(savedQuery.name);
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
      els.queryTree.appendChild(block);
    });
  }

  function findCurrentTask(ref) {
    if (!state.currentPage || !state.currentPage.tasks) {
      return null;
    }
    return state.currentPage.tasks.find(function (task) {
      return task.ref === ref;
    }) || null;
  }

  async function toggleTaskDone(task) {
    if (!task || !task.ref) {
      return;
    }

    try {
      await fetchJSON("/api/tasks/" + encodeURIComponent(task.ref), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          state: task.done ? "todo" : "done",
          due: task.due || "",
          remind: task.remind || "",
          who: task.who || [],
        }),
      });
      await Promise.all([state.selectedPage ? loadPageDetail(state.selectedPage, true) : Promise.resolve()]);
    } catch (error) {
      setNoteStatus("Task toggle failed: " + error.message);
    }
  }

  async function loadPageDetail(pagePath, force) {
    if (!force && hasUnsavedPageChanges()) {
      setNoteStatus("Unsaved local edits on " + state.selectedPage + ". Autosave pending.");
      return;
    }

    try {
      const payloads = await Promise.all([
        fetchJSON("/api/pages/" + encodePath(pagePath)),
        fetchJSON("/api/pages/" + encodePath(pagePath) + "/derived"),
      ]);
      const page = payloads[0];
      const derived = payloads[1];

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
          tasks: page.tasks,
        },
        {
          toc: derived.toc,
          backlinks: derived.backlinks,
          linkCounts: derived.linkCounts,
          taskCounts: derived.taskCounts,
          queryBlocks: derived.queryBlocks,
        },
        page.rawMarkdown || ""
      );
      renderNoteStudio();
      if (state.markdownEditorApi && !blockingOverlayOpen()) {
        if (state.pendingPageTaskRef || state.pendingPageLineFocus) {
          let targetLine = state.pendingPageLineFocus;
          if (state.pendingPageTaskRef) {
            const matchedTask = Array.isArray(page.tasks)
              ? page.tasks.find(function (task) {
                  return String(task.ref || "") === state.pendingPageTaskRef;
                })
              : null;
            if (matchedTask && matchedTask.line) {
              targetLine = matchedTask.line;
            }
          }
          const offset = state.pendingPageTaskRef
            ? rawOffsetForTaskLine(state.currentMarkdown, targetLine || 1)
            : rawOffsetForLineNumber(state.currentMarkdown, targetLine || 1);
          state.pendingPageLineFocus = null;
          state.pendingPageTaskRef = "";
          window.requestAnimationFrame(function () {
            focusMarkdownEditor({preventScroll: true});
            setMarkdownEditorSelection(offset, offset, true);
            window.requestAnimationFrame(function () {
              focusMarkdownEditor({preventScroll: true});
              setMarkdownEditorSelection(offset, offset, true);
            });
          });
        } else {
          focusEditorAtBodyPosition(firstEditableLineIndex(state.currentMarkdown), 0);
        }
      } else if (state.sourceOpen && !blockingOverlayOpen()) {
        window.setTimeout(function () {
          if (els.markdownEditor) {
            focusMarkdownEditor({preventScroll: true});
            const caret = rawOffsetForBodyPosition(state.currentMarkdown, firstEditableLineIndex(state.currentMarkdown), 0);
            setMarkdownEditorSelection(caret, caret);
          }
        }, 0);
      }
      renderPageTasks(page.tasks || []);
      renderPageTags();
      renderPageContext();
      renderPageProperties();
    } catch (error) {
      clearPageSelection();
      els.detailKind.textContent = "Page";
      els.detailTitle.textContent = pagePath;
      els.structuredView.textContent = error.message;
      els.derivedView.textContent = "";
      els.rawView.textContent = "";
    }
  }

  async function loadSavedQueryDetail(name) {
    clearPageSelection();
    try {
      const savedQuery = await fetchJSON("/api/queries/" + encodeURIComponent(name));
      state.selectedSavedQueryPayload = savedQuery;
      els.detailPath.textContent = savedQuery.name || name;
      els.noteHeading.textContent = savedQuery.title || savedQuery.name || name;
      const workbench = await fetchJSON("/api/queries/" + encodeURIComponent(name) + "/workbench", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ previewLimit: 8 }),
      });
      setStructuredViews("Saved Query", savedQuery.title || savedQuery.name, savedQuery, workbench.workbench, savedQuery.query || "");
      setNoteStatus("Viewing saved query details. Select a page to edit notes.");
      renderPageContext();
      renderPageProperties();
    } catch (error) {
      state.selectedSavedQueryPayload = null;
      els.detailKind.textContent = "Saved Query";
      els.detailTitle.textContent = name;
      els.structuredView.textContent = error.message;
      els.derivedView.textContent = "";
      els.rawView.textContent = "";
      setNoteStatus("Select a page to edit and preview markdown.");
      renderPageContext();
    }
  }

  function refreshCurrentDetail(force) {
    if (state.selectedPage) {
      if (!force && markdownEditorHasFocus()) {
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
    small.textContent = new Date().toLocaleTimeString();
    const pre = document.createElement("pre");
    pre.className = "code-block";
    pre.textContent = typeof data === "string" ? data : pretty(data);

    item.appendChild(strong);
    item.appendChild(small);
    item.appendChild(pre);
    els.eventLog.prepend(item);

    while (els.eventLog.childNodes.length > 12) {
      els.eventLog.removeChild(els.eventLog.lastChild);
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
          query: query,
          previewLimit: 10,
        }),
      });
      els.queryOutput.textContent = pretty(payload);
    } catch (error) {
      els.queryOutput.textContent = error.message;
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
        body: JSON.stringify({ query: query }),
      });
      els.queryOutput.textContent = pretty(payload);
      if (payload.valid && payload.formatted) {
        els.queryEditor.value = payload.formatted;
      }
    } catch (error) {
      els.queryOutput.textContent = error.message;
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
      task.line ? ("line " + task.line) : "",
      task.done ? "done" : "open",
    ].filter(Boolean);
    els.taskModalMeta.textContent = meta.join(" · ");
    els.taskModalShell.classList.remove("hidden");
  }

  function closeTaskModal() {
    state.currentTask = null;
    els.taskModalShell.classList.add("hidden");
  }

  function setSearchOpen(open) {
    if (!els.searchModalShell) {
      return;
    }
    els.searchModalShell.classList.toggle("hidden", !open);
    if (open) {
      window.setTimeout(function () {
        if (els.globalSearchInput) {
          els.globalSearchInput.focus();
          els.globalSearchInput.select();
        }
      }, 0);
    }
  }

  function closeSearchModal() {
    setSearchOpen(false);
  }

  function searchResultButtons() {
    if (!els.globalSearchResults) {
      return [];
    }
    return Array.from(els.globalSearchResults.querySelectorAll(".search-result-item"));
  }

  function commandResultButtons() {
    if (!els.commandPaletteResults) {
      return [];
    }
    return Array.from(els.commandPaletteResults.querySelectorAll(".search-result-item"));
  }

  function updateSearchSelection() {
    const buttons = searchResultButtons();
    buttons.forEach(function (button, index) {
      button.classList.toggle("active", index === state.searchSelectionIndex);
    });
  }

  function updateCommandSelection() {
    const buttons = commandResultButtons();
    buttons.forEach(function (button, index) {
      button.classList.toggle("active", index === state.commandSelectionIndex);
    });
  }

  function moveSearchSelection(delta) {
    const buttons = searchResultButtons();
    if (!buttons.length) {
      state.searchSelectionIndex = -1;
      return;
    }
    if (state.searchSelectionIndex < 0) {
      state.searchSelectionIndex = delta > 0 ? 0 : buttons.length - 1;
    } else {
      state.searchSelectionIndex = Math.max(0, Math.min(buttons.length - 1, state.searchSelectionIndex + delta));
    }
    updateSearchSelection();
    buttons[state.searchSelectionIndex].scrollIntoView({ block: "nearest" });
  }

  function moveCommandSelection(delta) {
    const buttons = commandResultButtons();
    if (!buttons.length) {
      state.commandSelectionIndex = -1;
      return;
    }
    if (state.commandSelectionIndex < 0) {
      state.commandSelectionIndex = delta > 0 ? 0 : buttons.length - 1;
    } else {
      state.commandSelectionIndex = Math.max(0, Math.min(buttons.length - 1, state.commandSelectionIndex + delta));
    }
    updateCommandSelection();
    buttons[state.commandSelectionIndex].scrollIntoView({ block: "nearest" });
  }

  function triggerSearchSelection() {
    const buttons = searchResultButtons();
    if (state.searchSelectionIndex >= 0 && state.searchSelectionIndex < buttons.length) {
      buttons[state.searchSelectionIndex].click();
    }
  }

  function triggerCommandSelection() {
    const buttons = commandResultButtons();
    if (state.commandSelectionIndex >= 0 && state.commandSelectionIndex < buttons.length) {
      buttons[state.commandSelectionIndex].click();
    }
  }

  function setCommandPaletteOpen(open) {
    if (!els.commandModalShell) {
      return;
    }
    els.commandModalShell.classList.toggle("hidden", !open);
    if (open) {
      window.setTimeout(function () {
        if (els.commandPaletteInput) {
          els.commandPaletteInput.focus();
          els.commandPaletteInput.select();
        }
      }, 0);
    }
  }

  function closeCommandPalette() {
    setCommandPaletteOpen(false);
  }

  function renderGlobalSearchSection(title, items, renderItem, showHeading) {
    const section = document.createElement("section");
    section.className = "search-result-section";

    if (showHeading) {
      const heading = document.createElement("h3");
      heading.textContent = title;
      section.appendChild(heading);
    }

    if (!items.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "No matches.";
      section.appendChild(empty);
      return section;
    }

    const list = document.createElement("div");
    list.className = "search-result-list";
    items.forEach(function (item) {
      list.appendChild(renderItem(item));
    });
    section.appendChild(list);
    return section;
  }

  function createSearchResultButton(title, meta, snippet, hint, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "search-result-item";
    button.tabIndex = -1;
    button.addEventListener("mousedown", function (event) {
      event.preventDefault();
    });
    button.addEventListener("click", onClick);

    const head = document.createElement("div");
    head.className = "search-result-head";

    const strong = document.createElement("strong");
    strong.textContent = title;
    head.appendChild(strong);

    if (hint) {
      const hintNode = document.createElement("span");
      hintNode.className = "search-result-hint";
      hintNode.textContent = hint;
      head.appendChild(hintNode);
    }

    button.appendChild(head);

    if (meta) {
      const small = document.createElement("small");
      small.textContent = meta;
      button.appendChild(small);
    }

    if (snippet) {
      const snippetNode = document.createElement("div");
      snippetNode.className = "search-result-snippet";
      snippetNode.textContent = snippet;
      button.appendChild(snippetNode);
    }
    return button;
  }

  function pageLeafName(pagePath) {
    const parts = String(pagePath || "").split("/");
    return parts[parts.length - 1] || pagePath;
  }

  function renderGlobalSearchResults(payload) {
    clearNode(els.globalSearchResults);
    state.searchSelectionIndex = -1;
    const counts = payload && payload.counts ? payload.counts : { total: 0 };
    if (!counts.total) {
      renderEmpty(els.globalSearchResults, "No results.");
      return;
    }

    const pageItems = payload.pages || [];
    const taskItems = payload.tasks || [];
    const queryItems = payload.queries || [];
    const nonEmptySections = [pageItems, taskItems, queryItems].filter(function (items) {
      return items.length > 0;
    }).length;
    const showHeadings = nonEmptySections > 1;

    els.globalSearchResults.appendChild(renderGlobalSearchSection("Pages", pageItems, function (item) {
      const leaf = pageLeafName(item.path);
      const title = item.title && item.title !== leaf ? item.title : "";
      return createSearchResultButton(
        leaf,
        [item.path, title, item.match].filter(Boolean).join(" · "),
        item.snippet || "",
        "",
        function () {
          closeSearchModal();
          if (item.line) {
            navigateToPageAtLine(item.path, item.line, false);
            return;
          }
          navigateToPage(item.path, false);
        }
      );
    }, showHeadings));

    els.globalSearchResults.appendChild(renderGlobalSearchSection("Tasks", taskItems, function (item) {
      return createSearchResultButton(
        item.text || item.ref,
        [item.page, item.line ? ("line " + item.line) : ""].filter(Boolean).join(" · "),
        item.snippet || "",
        "",
        function () {
          closeSearchModal();
          navigateToPageAtTask(item.page, item.ref, item.line, false);
        }
      );
    }, showHeadings));

    els.globalSearchResults.appendChild(renderGlobalSearchSection("Saved Queries", queryItems, function (item) {
      return createSearchResultButton(
        item.title || item.name,
        [item.name, item.folder, item.match].filter(Boolean).join(" · "),
        item.snippet || "",
        "",
        function () {
          closeSearchModal();
          state.selectedSavedQuery = item.name;
          state.selectedPage = "";
          syncURLState(false);
          renderPages();
          renderSavedQueryTree();
          loadSavedQueryDetail(item.name);
        }
      );
    }, showHeadings));

    if (searchResultButtons().length) {
      state.searchSelectionIndex = 0;
      updateSearchSelection();
    }

    if (els.searchModalShell && !els.searchModalShell.classList.contains("hidden") && els.globalSearchInput) {
      window.requestAnimationFrame(function () {
        if (document.activeElement !== els.globalSearchInput) {
          els.globalSearchInput.focus({preventScroll: true});
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
    els.globalSearchResults.textContent = "Searching…";
    try {
      const payload = await fetchJSON("/api/search?q=" + encodeURIComponent(query));
      renderGlobalSearchResults(payload);
    } catch (error) {
      els.globalSearchResults.textContent = error.message;
    }
  }

  function scheduleGlobalSearch() {
    window.clearTimeout(state.searchTimer);
    state.searchTimer = window.setTimeout(runGlobalSearch, 120);
  }

  function normalizePageDraftPath(value) {
    return String(value || "")
      .trim()
      .replace(/\\/g, "/")
      .replace(/\.md$/i, "")
      .replace(/^\/+/, "")
      .replace(/\/+/g, "/");
  }

  function pageTitleFromPath(pagePath) {
    return pageLeafName(pagePath);
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
      body: JSON.stringify({ rawMarkdown: initialMarkdown }),
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
      method: "DELETE",
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
      body: JSON.stringify({ targetPage: toPath }),
    });

    if (currentHomePage().toLowerCase() === fromPath.toLowerCase()) {
      setHomePage(toPath);
    }
    await loadPages();
    navigateToPage(payload.page || toPath, false);
  }

  function buildCommandEntries() {
    const commands = [
      {
        title: state.sourceOpen ? "Close Raw Mode" : "Open Raw Mode",
        meta: "Editor",
        keywords: "raw mode markdown source editor",
        hint: "Ctrl+E",
        run: function () {
          setSourceOpen(!state.sourceOpen);
        },
      },
      {
        title: "Global Search",
        meta: "Search",
        keywords: "search find global",
        hint: "Ctrl+K",
        run: function () {
          setSearchOpen(true);
          scheduleGlobalSearch();
        },
      },
      {
        title: "Focus Files",
        meta: "Rail",
        keywords: "files pages rail sidebar",
        run: function () {
          setRailTab("files");
          if (window.matchMedia("(max-width: 1180px)").matches) {
            setRailOpen(true);
          }
        },
      },
      {
        title: "Focus Context",
        meta: "Rail",
        keywords: "context backlinks links queries rail",
        run: function () {
          setRailTab("context");
          if (window.matchMedia("(max-width: 1180px)").matches) {
            setRailOpen(true);
          }
        },
      },
      {
        title: "Focus Tasks",
        meta: "Rail",
        keywords: "tasks rail",
        run: function () {
          setRailTab("tasks");
          if (window.matchMedia("(max-width: 1180px)").matches) {
            setRailOpen(true);
          }
        },
      },
      {
        title: "Focus Tags",
        meta: "Rail",
        keywords: "tags rail",
        run: function () {
          setRailTab("tags");
          if (window.matchMedia("(max-width: 1180px)").matches) {
            setRailOpen(true);
          }
        },
      },
      {
        title: state.railOpen ? "Close Sidebar" : "Open Sidebar",
        meta: "Layout",
        keywords: "sidebar rail drawer",
        run: function () {
          setRailOpen(!state.railOpen);
        },
      },
    ];

    const homePage = currentHomePage();
    if (homePage) {
      commands.push({
        title: "Open Home Page",
        meta: homePage,
        keywords: "home start page default landing",
        run: function () {
          navigateToPage(homePage, false);
        },
      });
    }

    if (state.selectedPage) {
      const selectedIsHomePage = homePage && homePage.toLowerCase() === String(state.selectedPage).toLowerCase();
      commands.push({
        title: selectedIsHomePage ? "Home Page Already Set" : "Set Home Page",
        meta: state.selectedPage,
        keywords: "home start page default landing",
        hint: selectedIsHomePage ? "Current" : "",
        run: function () {
          if (selectedIsHomePage) {
            return;
          }
          setHomePage(state.selectedPage);
          closeCommandPalette();
          renderCommandPaletteResults();
          setNoteStatus("Home page set to " + state.selectedPage + ".");
        },
      });

      commands.push({
        title: "Delete Page",
        meta: state.selectedPage,
        keywords: "delete remove page note file",
        hint: "Del",
        run: function () {
          closeCommandPalette();
          deletePage(state.selectedPage).catch(function (error) {
            setNoteStatus("Delete page failed: " + error.message);
          });
        },
      });
    }

    if (homePage) {
      commands.push({
        title: "Clear Home Page",
        meta: homePage,
        keywords: "home start page default landing reset clear",
        run: function () {
          clearHomePage();
          closeCommandPalette();
          renderCommandPaletteResults();
          setNoteStatus(state.configHomePage ? "Home page reset to configured default." : "Home page cleared.");
        },
      });
    }

    return commands;
  }

  function renderCommandPaletteSection(title, items, renderItem) {
    return renderGlobalSearchSection(title, items, renderItem);
  }

  function renderCommandPaletteResults() {
    clearNode(els.commandPaletteResults);
    state.commandSelectionIndex = -1;
    const query = els.commandPaletteInput ? els.commandPaletteInput.value.trim().toLowerCase() : "";
    const rawQuery = els.commandPaletteInput ? els.commandPaletteInput.value.trim() : "";
    const normalizedDraftPath = normalizePageDraftPath(rawQuery);
    const commands = buildCommandEntries().filter(function (command) {
      if (!query) {
        return true;
      }
      return [command.title, command.meta, command.keywords].join(" ").toLowerCase().indexOf(query) >= 0;
    });
    const pageExists = normalizedDraftPath
      ? state.pages.some(function (page) {
          return String(page.path || "").toLowerCase() === normalizedDraftPath.toLowerCase();
        })
      : false;
    const moveCommands = state.selectedPage && normalizedDraftPath && !pageExists && normalizedDraftPath.toLowerCase() !== String(state.selectedPage).toLowerCase()
      ? [{
          title: "Move Page",
          meta: state.selectedPage + " → " + normalizedDraftPath,
          keywords: "move rename page note file",
          hint: "Enter",
          run: function () {
            closeCommandPalette();
            movePage(state.selectedPage, normalizedDraftPath).catch(function (error) {
              setNoteStatus("Move page failed: " + error.message);
            });
          },
        }]
      : [];
    const createCommands = normalizedDraftPath && !pageExists
      ? [{
          title: "Create Page",
          meta: normalizedDraftPath,
          keywords: "new page create note file",
          hint: "Enter",
          run: function () {
            closeCommandPalette();
            createPage(normalizedDraftPath).catch(function (error) {
              setNoteStatus("Create page failed: " + error.message);
            });
          },
        }]
      : [];
    const pages = state.pages.filter(function (page) {
      if (!query) {
        return true;
      }
      return [page.path, page.title || "", (page.tags || []).join(" ")].join(" ").toLowerCase().indexOf(query) >= 0;
    }).slice(0, 20);

    if (!moveCommands.length && !createCommands.length && !commands.length && !pages.length) {
      renderEmpty(els.commandPaletteResults, "No matches.");
      return;
    }

    const nonEmptySections = [moveCommands, createCommands, commands, pages].filter(function (items) {
      return items.length > 0;
    }).length;
    const showHeadings = nonEmptySections > 1;

    els.commandPaletteResults.appendChild(renderCommandPaletteSection("Move", moveCommands, function (command) {
      return createSearchResultButton(command.title, command.meta, "", command.hint || "", function () {
        closeCommandPalette();
        command.run();
      });
    }, showHeadings));

    els.commandPaletteResults.appendChild(renderCommandPaletteSection("Create", createCommands, function (command) {
      return createSearchResultButton(command.title, command.meta, "", command.hint || "", function () {
        closeCommandPalette();
        command.run();
      });
    }, showHeadings));

    els.commandPaletteResults.appendChild(renderCommandPaletteSection("Commands", commands, function (command) {
      return createSearchResultButton(command.title, command.meta, "", command.hint || "", function () {
        closeCommandPalette();
        command.run();
      });
    }, showHeadings));

    els.commandPaletteResults.appendChild(renderCommandPaletteSection("Pages", pages, function (page) {
      const leaf = pageLeafName(page.path);
      const title = page.title && page.title !== leaf ? page.title : "";
      return createSearchResultButton(
        leaf,
        [page.path, title].concat(page.tags && page.tags.length ? [page.tags.join(", ")] : []).filter(Boolean).join(" · "),
        "",
        "",
        function () {
          closeCommandPalette();
          navigateToPage(page.path, false);
        }
      );
    }, showHeadings));

    if (commandResultButtons().length) {
      state.commandSelectionIndex = 0;
      updateCommandSelection();
    }

    if (els.commandModalShell && !els.commandModalShell.classList.contains("hidden") && els.commandPaletteInput) {
      window.requestAnimationFrame(function () {
        if (document.activeElement !== els.commandPaletteInput) {
          els.commandPaletteInput.focus({preventScroll: true});
        }
      });
    }
  }

  function scheduleCommandPaletteRefresh() {
    window.clearTimeout(state.commandTimer);
    state.commandTimer = window.setTimeout(renderCommandPaletteResults, 50);
  }

  function setSourceOpen(open) {
    const nextOpen = Boolean(open);
    if (state.sourceOpen === nextOpen) {
      return;
    }
    const scrollTop = markdownEditorScrollTop();
    const selectionStart = markdownEditorSelectionStart();
    const selectionEnd = markdownEditorSelectionEnd();
    state.sourceOpen = nextOpen;
    markdownEditorSetRenderMode(!state.sourceOpen);
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
    window.setTimeout(function () {
      focusMarkdownEditor({preventScroll: true});
      setMarkdownEditorSelection(selectionStart, selectionEnd);
      setMarkdownEditorScrollTop(scrollTop);
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

    const payload = {
      text: els.taskText.value.trim(),
      state: els.taskState.value,
      due: els.taskDue.value.trim(),
      remind: serializeDateTimeValue(els.taskRemind.value),
      who: els.taskWho.value
        .split(",")
        .map(function (part) {
          return part.trim();
        })
        .filter(Boolean),
    };

    els.taskModalMeta.textContent = "Saving task…";
    try {
      await fetchJSON("/api/tasks/" + encodeURIComponent(state.currentTask.ref), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      closeTaskModal();
      await Promise.all([state.selectedPage ? loadPageDetail(state.selectedPage, true) : Promise.resolve()]);
    } catch (error) {
      els.taskModalMeta.textContent = "Save failed: " + error.message;
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
      const payload = await fetchJSON("/api/pages/" + encodePath(state.selectedPage), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawMarkdown: markdownToSave }),
      });
      state.currentPage = payload;
      state.originalMarkdown = payload.rawMarkdown || markdownToSave;
      if (state.currentMarkdown === markdownToSave) {
        state.currentMarkdown = payload.rawMarkdown || markdownToSave;
      }
      setNoteStatus("Saved " + state.selectedPage + ".");
      await loadPages();
      if (!markdownEditorHasFocus()) {
        await loadPageDetail(state.selectedPage, true);
      }
    } catch (error) {
      setNoteStatus("Save failed: " + error.message);
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

    const markLive = function (label, live) {
      els.eventStatus.textContent = label;
      els.eventStatus.classList.toggle("live", live);
    };

    source.onopen = function () {
      markLive("live", true);
      addEventLine("sse.open", { ok: true }, false);
    };

    source.onerror = function () {
      markLive("reconnecting", false);
      addEventLine("sse.error", { reconnecting: true }, true);
    };

    [
      "page.changed",
      "page.deleted",
      "derived.changed",
      "task.changed",
      "query.changed",
      "query-block.changed",
    ].forEach(function (eventName) {
      source.addEventListener(eventName, function (event) {
        let payload = {};
        try {
          payload = JSON.parse(event.data);
        } catch (error) {
          payload = { raw: event.data };
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
    on(els.toggleRail, "click", function () {
      if (window.matchMedia("(max-width: 1180px)").matches) {
        setRailOpen(!state.railOpen);
      }
    });
    on(els.openSearch, "click", function () {
      setSearchOpen(true);
      scheduleGlobalSearch();
    });
    on(els.closeCommandModal, "click", closeCommandPalette);
    on(els.commandPaletteInput, "input", scheduleCommandPaletteRefresh);
    on(els.railTabFiles, "click", function () {
      setRailTab("files");
    });
    on(els.railTabContext, "click", function () {
      setRailTab("context");
    });
    on(els.railTabTasks, "click", function () {
      setRailTab("tasks");
    });
    on(els.railTabTags, "click", function () {
      setRailTab("tags");
    });
    on(els.toggleDebug, "click", function () {
      setDebugOpen(!state.debugOpen);
    });
    on(els.loadSelectedQuery, "click", loadSelectedQueryIntoEditor);
    on(els.formatQuery, "click", formatQueryText);
    on(els.runQuery, "click", runQueryWorkbench);
    on(els.markdownEditor, "input", function () {
      state.currentMarkdown = els.markdownEditor.value;
      const rawContext = currentRawLineContext();
      const slashAnchor = state.markdownEditorApi && state.markdownEditorApi.host ? state.markdownEditorApi.host : els.markdownEditor;
      const caretRect = markdownEditorCaretRect();
      const noteRect = els.noteLayout ? els.noteLayout.getBoundingClientRect() : { left: 0, top: 0 };
      maybeOpenSlashMenu(slashAnchor, rawContext.lineText, {
        type: "raw",
        left: caretRect ? Math.max(0, caretRect.left - noteRect.left) : undefined,
        top: caretRect ? Math.max(0, caretRect.bottom - noteRect.top + 6) : undefined,
      });
      if (state.currentPage) {
        els.rawView.textContent = state.currentMarkdown;
        refreshLivePageChrome();
      }
      if (state.currentPage) {
        setNoteStatus("Unsaved local edits on " + state.selectedPage + ".");
        scheduleAutosave();
      }
    });
    const handleMarkdownEditorKeydown = function (event) {
      if (event.key === "Enter" && event.shiftKey) {
        const rawContext = currentRawLineContext();
        const link = wikiLinkAtCaret(rawContext.lineText, rawContext.caretInLine);
        if (link && link.target) {
          event.preventDefault();
          closeSlashMenu();
          navigateToPage(link.target, false);
          return;
        }
      }
      if (event.key === "Escape" && state.slashOpen) {
        closeSlashMenu();
        event.preventDefault();
        return;
      }
      if (event.key === "ArrowUp" && state.slashOpen) {
        event.preventDefault();
        moveSlashSelection(-1);
        return;
      }
      if (event.key === "ArrowDown" && state.slashOpen) {
        event.preventDefault();
        moveSlashSelection(1);
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
    on(els.globalSearchInput, "keydown", function (event) {
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
    on(els.commandPaletteInput, "keydown", function (event) {
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
    on(els.taskModalShell, "click", function (event) {
      if (event.target === els.taskModalShell) {
        closeTaskModal();
      }
    });
    on(els.searchModalShell, "click", function (event) {
      if (event.target === els.searchModalShell) {
        closeSearchModal();
      }
    });
    on(els.commandModalShell, "click", function (event) {
      if (event.target === els.commandModalShell) {
        closeCommandPalette();
      }
    });
    document.addEventListener("mousedown", function (event) {
      const withinProperties = event.target.closest("#page-properties") || event.target.closest("#add-property");
      if (!withinProperties) {
        dismissPropertyUI();
      }
      if (!event.target.closest("#slash-menu")) {
        closeSlashMenu();
      }
      if (state.railOpen && els.rail && els.toggleRail) {
        const withinRail = event.target.closest("#rail") || event.target.closest("#toggle-rail");
        if (!withinRail && window.matchMedia("(max-width: 1180px)").matches) {
          setRailOpen(false);
        }
      }
    });
    window.addEventListener("keydown", function (event) {
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
        renderCommandPaletteResults();
      }
    });
    window.addEventListener("blur", function () {
      state.windowBlurred = true;
      captureEditorFocusSpec();
    });
    window.addEventListener("focus", function () {
      state.windowBlurred = false;
      restoreEditorFocus();
    });
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) {
        state.windowBlurred = true;
        captureEditorFocusSpec();
        return;
      }
      state.windowBlurred = false;
      restoreEditorFocus();
    });
    window.addEventListener("popstate", function () {
      applyURLState();
    });
  }

  async function boot() {
    if (window.NoteriousCodeEditor && els.markdownEditor) {
      state.markdownEditorApi = window.NoteriousCodeEditor.create(els.markdownEditor);
      on(state.markdownEditorApi.host, "click", function (event) {
        const target = event.target && typeof event.target.closest === "function"
          ? event.target.closest("[data-page-link]")
          : null;
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
      on(state.markdownEditorApi.host, "noterious:page-link", function (event) {
        const page = event.detail && event.detail.page ? String(event.detail.page) : "";
        const line = event.detail && event.detail.line ? Number(event.detail.line) : 0;
        const taskRef = event.detail && event.detail.taskRef ? String(event.detail.taskRef) : "";
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
      on(state.markdownEditorApi.host, "noterious:task-toggle", function (event) {
        const bodyLineNumber = Number(event.detail && event.detail.lineNumber) || 0;
        if (!state.currentPage || !state.currentPage.tasks || !bodyLineNumber) {
          return;
        }
        const split = splitFrontmatter(state.currentMarkdown);
        const frontmatterLineCount = split.frontmatter ? split.frontmatter.split("\n").length - 1 : 0;
        const rawLineNumber = frontmatterLineCount + bodyLineNumber;
        const task = state.currentPage.tasks.find(function (item) {
          return Number(item.line) === rawLineNumber;
        });
        if (task) {
          toggleTaskDone(task);
        }
      });
      on(state.markdownEditorApi.host, "noterious:task-open", function (event) {
        const ref = event.detail && event.detail.ref ? String(event.detail.ref) : "";
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
    renderPageTasks([]);
    renderPageContext();
    renderPageProperties();
    wireEvents();
    await Promise.all([loadMeta(), loadPages(), loadSavedQueryTree()]);
    applyURLState();
    connectEvents();
  }

  boot();
})();
