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
    const parts = String(pagePath || "").split("/");
    return parts[parts.length - 1] || pagePath;
  }
  function buildCommandEntries(options) {
    const commands = [
      {
        title: options.sourceOpen ? "Close Raw Mode" : "Open Raw Mode",
        meta: "Editor",
        keywords: "raw mode markdown source editor",
        hint: options.hotkeys.toggleRawMode,
        run: options.onToggleSource
      },
      {
        title: "Global Search",
        meta: "Search",
        keywords: "search find global",
        hint: options.hotkeys.globalSearch,
        run: options.onOpenSearch
      },
      {
        title: "Open Documents",
        meta: "Documents",
        keywords: "documents files attachments uploads",
        run: options.onOpenDocuments
      },
      {
        title: "Open Help",
        meta: "Help",
        keywords: "help shortcuts keyboard keymap",
        hint: options.hotkeys.help,
        run: options.onOpenHelp
      },
      {
        title: "Open Settings",
        meta: "Settings",
        keywords: "settings preferences hotkeys vault",
        run: options.onOpenSettings
      },
      {
        title: "Open Quick Switcher",
        meta: "Navigation",
        keywords: "quick switcher open file note",
        hint: options.hotkeys.quickSwitcher,
        run: options.onOpenQuickSwitcher
      },
      {
        title: "Open Daily Note",
        meta: "Capture",
        keywords: "daily note inbox capture today journal",
        hint: options.hotkeys.quickNote,
        run: options.onQuickNote
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
    const commands = buildCommandEntries(options).filter(function(command) {
      if (!query) {
        return true;
      }
      return [command.title, command.meta, command.keywords].join(" ").toLowerCase().indexOf(query) >= 0;
    });
    return [
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

  // frontend/clientPreferences.ts
  function defaultClientPreferences() {
    return {
      hotkeys: {
        quickSwitcher: "Mod+K",
        globalSearch: "Mod+Shift+K",
        commandPalette: "Mod+Shift+P",
        quickNote: "",
        help: "?",
        saveCurrentPage: "Mod+S",
        toggleRawMode: "Mod+E",
        toggleTaskDone: "Mod+Enter"
      },
      ui: {
        fontFamily: "mono",
        fontSize: "16",
        dateTimeFormat: "browser",
        themeId: "noterious-night"
      },
      vaults: {
        topLevelFoldersAsVaults: false
      }
    };
  }
  function cloneClientPreferences(input) {
    return {
      hotkeys: {
        quickSwitcher: input.hotkeys.quickSwitcher,
        globalSearch: input.hotkeys.globalSearch,
        commandPalette: input.hotkeys.commandPalette,
        quickNote: input.hotkeys.quickNote,
        help: input.hotkeys.help,
        saveCurrentPage: input.hotkeys.saveCurrentPage,
        toggleRawMode: input.hotkeys.toggleRawMode,
        toggleTaskDone: input.hotkeys.toggleTaskDone
      },
      ui: {
        fontFamily: input.ui.fontFamily,
        fontSize: input.ui.fontSize,
        dateTimeFormat: input.ui.dateTimeFormat,
        themeId: input.ui.themeId
      },
      vaults: {
        topLevelFoldersAsVaults: Boolean(input.vaults.topLevelFoldersAsVaults)
      }
    };
  }
  function normalizeClientPreferences(input) {
    const defaults = defaultClientPreferences();
    const source = input && typeof input === "object" ? input : {};
    const hotkeysSource = source.hotkeys && typeof source.hotkeys === "object" ? source.hotkeys : {};
    const uiSource = source.ui && typeof source.ui === "object" ? source.ui : {};
    const vaultsSource = source.vaults && typeof source.vaults === "object" ? source.vaults : {};
    const fontFamily = String(uiSource.fontFamily ?? defaults.ui.fontFamily).trim();
    const fontSize = String(uiSource.fontSize ?? defaults.ui.fontSize).trim();
    const dateTimeFormat = String(uiSource.dateTimeFormat ?? defaults.ui.dateTimeFormat).trim();
    const themeId = String(uiSource.themeId ?? defaults.ui.themeId).trim();
    return {
      hotkeys: {
        quickSwitcher: typeof hotkeysSource.quickSwitcher === "string" ? hotkeysSource.quickSwitcher.trim() : defaults.hotkeys.quickSwitcher,
        globalSearch: typeof hotkeysSource.globalSearch === "string" ? hotkeysSource.globalSearch.trim() : defaults.hotkeys.globalSearch,
        commandPalette: typeof hotkeysSource.commandPalette === "string" ? hotkeysSource.commandPalette.trim() : defaults.hotkeys.commandPalette,
        quickNote: typeof hotkeysSource.quickNote === "string" ? hotkeysSource.quickNote.trim() : defaults.hotkeys.quickNote,
        help: typeof hotkeysSource.help === "string" ? hotkeysSource.help.trim() : defaults.hotkeys.help,
        saveCurrentPage: typeof hotkeysSource.saveCurrentPage === "string" ? hotkeysSource.saveCurrentPage.trim() : defaults.hotkeys.saveCurrentPage,
        toggleRawMode: typeof hotkeysSource.toggleRawMode === "string" ? hotkeysSource.toggleRawMode.trim() : defaults.hotkeys.toggleRawMode,
        toggleTaskDone: typeof hotkeysSource.toggleTaskDone === "string" ? hotkeysSource.toggleTaskDone.trim() : defaults.hotkeys.toggleTaskDone
      },
      ui: {
        fontFamily: fontFamily === "sans" || fontFamily === "serif" ? fontFamily : "mono",
        fontSize: ["14", "15", "16", "17", "18", "19", "20"].includes(fontSize) ? fontSize : defaults.ui.fontSize,
        dateTimeFormat: dateTimeFormat === "iso" || dateTimeFormat === "de" ? dateTimeFormat : "browser",
        themeId: themeId || defaults.ui.themeId
      },
      vaults: {
        topLevelFoldersAsVaults: Boolean(vaultsSource.topLevelFoldersAsVaults)
      }
    };
  }
  function loadStoredClientPreferences() {
    try {
      const raw = window.localStorage.getItem(clientPreferencesStorageKey);
      if (!raw) {
        return defaultClientPreferences();
      }
      return normalizeClientPreferences(JSON.parse(raw));
    } catch (_error) {
      return defaultClientPreferences();
    }
  }
  function saveStoredClientPreferences(preferences) {
    try {
      window.localStorage.setItem(clientPreferencesStorageKey, JSON.stringify(preferences));
    } catch (_error) {
    }
  }
  var clientPreferencesStorageKey;
  var init_clientPreferences = __esm({
    "frontend/clientPreferences.ts"() {
      "use strict";
      clientPreferencesStorageKey = "noterious.client-preferences";
    }
  });

  // frontend/http.ts
  function dispatchAuthRequired() {
    window.dispatchEvent(new CustomEvent("noterious:auth-required"));
  }
  async function requireOK(response, suppressAuthEvent = false) {
    if (!response.ok) {
      const text = await response.text();
      if (response.status === 401 && !suppressAuthEvent) {
        dispatchAuthRequired();
      }
      throw new HTTPError(response.status, text || "Request failed: " + response.status);
    }
    return response;
  }
  async function fetchJSON(url, options, suppressAuthEvent = false) {
    const response = await fetch(url, options);
    await requireOK(response, suppressAuthEvent);
    return response.json();
  }
  var HTTPError;
  var init_http = __esm({
    "frontend/http.ts"() {
      "use strict";
      HTTPError = class extends Error {
        constructor(status, message) {
          super(message);
          this.name = "HTTPError";
          this.status = status;
        }
      };
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
  function splitMarkdownTableRow(line) {
    const source = String(line || "").trim();
    const trimmed = source.replace(/^\|/, "").replace(/\|$/, "");
    return trimmed.split("|").map(function(cell) {
      return cell.trim();
    });
  }
  function formatMarkdownTableRow(cells) {
    return "| " + cells.map(function(cell) {
      return String(cell || "").trim();
    }).join(" | ") + " |";
  }
  function isMarkdownTableSeparator(line) {
    const cells = splitMarkdownTableRow(line);
    if (!cells.length) {
      return false;
    }
    return cells.every(function(cell) {
      return /^:?-{3,}:?$/.test(cell);
    });
  }
  function looksLikeMarkdownTableRow(line) {
    const source = String(line || "").trim();
    return source.indexOf("|") >= 0 && splitMarkdownTableRow(source).length >= 2;
  }
  function markdownTableBlockAt(lines, startLineIndex) {
    if (!Array.isArray(lines) || startLineIndex < 0 || startLineIndex + 1 >= lines.length) {
      return null;
    }
    const headerLine = String(lines[startLineIndex] || "");
    const separatorLine = String(lines[startLineIndex + 1] || "");
    if (!looksLikeMarkdownTableRow(headerLine) || !isMarkdownTableSeparator(separatorLine)) {
      return null;
    }
    const headerCells = splitMarkdownTableRow(headerLine);
    if (headerCells.length < 2) {
      return null;
    }
    const alignments = splitMarkdownTableRow(separatorLine).map(function(cell) {
      const text = String(cell || "");
      const left = text.startsWith(":");
      const right = text.endsWith(":");
      if (left && right) {
        return "center";
      }
      if (right) {
        return "right";
      }
      return "left";
    });
    const rows = [];
    let endLineIndex = startLineIndex + 1;
    for (let index = startLineIndex + 2; index < lines.length; index += 1) {
      const rowLine = String(lines[index] || "");
      if (!looksLikeMarkdownTableRow(rowLine)) {
        break;
      }
      rows.push(splitMarkdownTableRow(rowLine));
      endLineIndex = index;
    }
    const renderCell = function(cell, rowIndex, index, tag) {
      const alignment = alignments[index] || "left";
      return "<" + tag + ' class="markdown-table-cell" style="text-align:' + alignment + ';" data-table-cell="true" data-table-start-line="' + String(startLineIndex + 1) + '" data-table-row="' + String(rowIndex) + '" data-table-col="' + String(index) + '">' + renderInline(cell) + "</" + tag + ">";
    };
    const html = '<div class="markdown-table-block" data-table-start-line="' + String(startLineIndex + 1) + '"><table><thead><tr>' + headerCells.map(function(cell, index) {
      return renderCell(cell, 0, index, "th");
    }).join("") + "</tr></thead><tbody>" + rows.map(function(row, rowIndex) {
      return "<tr>" + headerCells.map(function(_header, index) {
        return renderCell(String(row[index] || ""), rowIndex + 1, index, "td");
      }).join("") + "</tr>";
    }).join("") + "</tbody></table></div>";
    return {
      startLineIndex,
      endLineIndex,
      columnCount: headerCells.length,
      html
    };
  }
  function findMarkdownTableBlockForLine(lines, lineNumber) {
    const target = Math.max(1, Number(lineNumber) || 0) - 1;
    for (let index = target; index >= 0; index -= 1) {
      const block = markdownTableBlockAt(lines, index);
      if (block && target >= block.startLineIndex && target <= block.endLineIndex) {
        return block;
      }
    }
    return null;
  }
  function markdownTableRowsForLine(lines, lineNumber) {
    const block = findMarkdownTableBlockForLine(lines, lineNumber);
    if (!block) {
      return null;
    }
    const header = splitMarkdownTableRow(String(lines[block.startLineIndex] || ""));
    const rows = [];
    for (let index = block.startLineIndex + 2; index <= block.endLineIndex; index += 1) {
      rows.push(splitMarkdownTableRow(String(lines[index] || "")));
    }
    return { header, rows };
  }
  function renderInline(value) {
    const source = String(value || "");
    const inlinePattern = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]|\[([^\]]+)\]\(([^)\s]+)\)|`([^`]+)`|\*\*(.+?)\*\*|__(.+?)__|\*(.+?)\*|_(.+?)_|~~(.+?)~~/g;
    let result = "";
    let cursor = 0;
    let match = null;
    while ((match = inlinePattern.exec(source)) !== null) {
      result += escapeHTML(source.slice(cursor, match.index));
      if (match[1] !== void 0) {
        const target = String(match[1] || "").trim();
        const label = String(match[2] || match[1] || "").trim();
        result += '<button type="button" class="wiki-link" data-page-link="' + escapeHTML(target) + '">' + escapeHTML(label) + "</button>";
      } else if (match[3] !== void 0) {
        const label = String(match[3] || "").trim();
        const href = String(match[4] || "").trim();
        if (/^[a-z]+:/i.test(href)) {
          result += '<a href="' + escapeHTML(href) + '" target="_blank" rel="noopener">' + escapeHTML(label) + "</a>";
        } else {
          result += '<button type="button" class="wiki-link" data-page-link="' + escapeHTML(href) + '">' + escapeHTML(label) + "</button>";
        }
      } else if (match[5] !== void 0) {
        result += "<code>" + escapeHTML(match[5]) + "</code>";
      } else if (match[6] !== void 0 || match[7] !== void 0) {
        result += "<strong>" + escapeHTML(match[6] || match[7]) + "</strong>";
      } else if (match[8] !== void 0 || match[9] !== void 0) {
        result += "<em>" + escapeHTML(match[8] || match[9]) + "</em>";
      } else if (match[10] !== void 0) {
        result += "<del>" + escapeHTML(match[10]) + "</del>";
      }
      cursor = match.index + match[0].length;
    }
    result += escapeHTML(source.slice(cursor));
    return result;
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
  async function saveTask(ref, payload) {
    await fetchJSON("/api/tasks/" + encodeURIComponent(ref), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  }
  async function deleteTask(ref) {
    await fetchJSON("/api/tasks/" + encodeURIComponent(ref), {
      method: "DELETE"
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

  // frontend/datetime.ts
  function normalizeDateTimeDisplayFormat(value) {
    switch (String(value || "").trim().toLowerCase()) {
      case "iso":
        return "iso";
      case "de":
        return "de";
      default:
        return "browser";
    }
  }
  function setDateTimeDisplayFormat(value) {
    currentDisplayFormat = normalizeDateTimeDisplayFormat(value);
  }
  function pad(value) {
    return String(value).padStart(2, "0");
  }
  function parseStructuredDateValue(raw) {
    const text = String(raw || "").trim();
    const dateOnlyMatch = text.match(dateOnlyPattern);
    if (dateOnlyMatch) {
      return {
        year: Number(dateOnlyMatch[1]),
        month: Number(dateOnlyMatch[2]),
        day: Number(dateOnlyMatch[3]),
        hour: 0,
        minute: 0,
        second: 0,
        hasTime: false
      };
    }
    const dateTimeMatch = text.match(dateTimePattern);
    if (!dateTimeMatch) {
      return null;
    }
    return {
      year: Number(dateTimeMatch[1]),
      month: Number(dateTimeMatch[2]),
      day: Number(dateTimeMatch[3]),
      hour: Number(dateTimeMatch[4]),
      minute: Number(dateTimeMatch[5]),
      second: Number(dateTimeMatch[6] || "0"),
      hasTime: true
    };
  }
  function structuredDateFromDate(value) {
    return {
      year: value.getFullYear(),
      month: value.getMonth() + 1,
      day: value.getDate(),
      hour: value.getHours(),
      minute: value.getMinutes(),
      second: value.getSeconds(),
      hasTime: true
    };
  }
  function toLocalDate(structured) {
    return new Date(
      structured.year,
      structured.month - 1,
      structured.day,
      structured.hour,
      structured.minute,
      structured.second,
      0
    );
  }
  function formatStructuredDate(structured) {
    if (currentDisplayFormat === "iso") {
      return [structured.year, pad(structured.month), pad(structured.day)].join("-");
    }
    const locale = currentDisplayFormat === "de" ? "de-DE" : void 0;
    return new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(toLocalDate(structured));
  }
  function formatStructuredEditableDate(structured) {
    if (currentDisplayFormat === "de") {
      return [pad(structured.day), pad(structured.month), structured.year].join(".");
    }
    return [structured.year, pad(structured.month), pad(structured.day)].join("-");
  }
  function formatStructuredTime(structured) {
    if (currentDisplayFormat === "iso") {
      return [pad(structured.hour), pad(structured.minute), pad(structured.second)].join(":");
    }
    const locale = currentDisplayFormat === "de" ? "de-DE" : void 0;
    return new Intl.DateTimeFormat(locale, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    }).format(toLocalDate(structured));
  }
  function formatStructuredDateTime(structured) {
    if (!structured.hasTime) {
      return formatStructuredDate(structured);
    }
    if (currentDisplayFormat === "iso") {
      return formatStructuredDate(structured) + " " + [pad(structured.hour), pad(structured.minute)].join(":");
    }
    const locale = currentDisplayFormat === "de" ? "de-DE" : void 0;
    return new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).format(toLocalDate(structured));
  }
  function formatStructuredEditableDateTime(structured) {
    const datePart = formatStructuredEditableDate(structured);
    return datePart + " " + [pad(structured.hour), pad(structured.minute)].join(":");
  }
  function parseStructuredEditableDateValue(raw) {
    const text = String(raw || "").trim();
    if (!text) {
      return null;
    }
    const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) {
      return {
        year: Number(isoMatch[1]),
        month: Number(isoMatch[2]),
        day: Number(isoMatch[3]),
        hour: 0,
        minute: 0,
        second: 0,
        hasTime: false
      };
    }
    const deMatch = text.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (deMatch) {
      return {
        year: Number(deMatch[3]),
        month: Number(deMatch[2]),
        day: Number(deMatch[1]),
        hour: 0,
        minute: 0,
        second: 0,
        hasTime: false
      };
    }
    return null;
  }
  function parseStructuredEditableDateTimeValue(raw) {
    const text = String(raw || "").trim();
    if (!text) {
      return null;
    }
    const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/);
    if (isoMatch) {
      return {
        year: Number(isoMatch[1]),
        month: Number(isoMatch[2]),
        day: Number(isoMatch[3]),
        hour: Number(isoMatch[4]),
        minute: Number(isoMatch[5]),
        second: 0,
        hasTime: true
      };
    }
    const deMatch = text.match(/^(\d{2})\.(\d{2})\.(\d{4})[ T](\d{2}):(\d{2})$/);
    if (deMatch) {
      return {
        year: Number(deMatch[3]),
        month: Number(deMatch[2]),
        day: Number(deMatch[1]),
        hour: Number(deMatch[4]),
        minute: Number(deMatch[5]),
        second: 0,
        hasTime: true
      };
    }
    return null;
  }
  function formatDateValue(value) {
    if (value instanceof Date) {
      return formatStructuredDate(structuredDateFromDate(value));
    }
    const structured = parseStructuredDateValue(value);
    if (!structured) {
      const parsed = new Date(String(value || ""));
      return Number.isNaN(parsed.getTime()) ? String(value || "") : formatStructuredDate(structuredDateFromDate(parsed));
    }
    return formatStructuredDate(structured);
  }
  function formatEditableDateValue(value) {
    const structured = parseStructuredDateValue(value);
    if (!structured) {
      return String(value || "");
    }
    return formatStructuredEditableDate(structured);
  }
  function formatDateTimeValue(value) {
    if (value instanceof Date) {
      return formatStructuredDateTime(structuredDateFromDate(value));
    }
    const structured = parseStructuredDateValue(value);
    if (!structured) {
      const parsed = new Date(String(value || ""));
      return Number.isNaN(parsed.getTime()) ? String(value || "") : formatStructuredDateTime(structuredDateFromDate(parsed));
    }
    return formatStructuredDateTime(structured);
  }
  function formatEditableDateTimeValue(value) {
    const structured = parseStructuredDateValue(value);
    if (!structured) {
      return String(value || "");
    }
    return formatStructuredEditableDateTime(structured);
  }
  function formatTimeValue(value) {
    if (value instanceof Date) {
      return formatStructuredTime(structuredDateFromDate(value));
    }
    const structured = parseStructuredDateValue(value);
    if (!structured) {
      const parsed = new Date(String(value || ""));
      return Number.isNaN(parsed.getTime()) ? String(value || "") : formatStructuredTime(structuredDateFromDate(parsed));
    }
    return formatStructuredTime(structured);
  }
  function parseEditableDateValue(value) {
    const text = String(value || "").trim();
    if (!text) {
      return "";
    }
    const structured = parseStructuredEditableDateValue(text);
    if (!structured) {
      throw new Error('Invalid date. Use "YYYY-MM-DD" or "DD.MM.YYYY".');
    }
    return [structured.year, pad(structured.month), pad(structured.day)].join("-");
  }
  function parseEditableDateTimeValue(value) {
    const text = String(value || "").trim();
    if (!text) {
      return "";
    }
    const structured = parseStructuredEditableDateTimeValue(text);
    if (!structured) {
      throw new Error('Invalid date/time. Use "YYYY-MM-DD HH:MM" or "DD.MM.YYYY HH:MM".');
    }
    return [
      [structured.year, pad(structured.month), pad(structured.day)].join("-"),
      [pad(structured.hour), pad(structured.minute)].join(":")
    ].join(" ");
  }
  function editableDatePlaceholder() {
    return currentDisplayFormat === "de" ? "30.04.2026" : "2026-04-30";
  }
  function editableDateTimePlaceholder() {
    return currentDisplayFormat === "de" ? "30.04.2026 09:00" : "2026-04-30 09:00";
  }
  function isDateLikeColumn(column) {
    const normalized = String(column || "").trim().toLowerCase();
    return normalized === "due" || normalized === "remind" || normalized === "createdat" || normalized === "updatedat" || normalized === "birthday" || normalized === "birthday_reminder" || normalized === "date" || normalized === "datetime" || normalized === "datum" || /(^|_)(date|datum|due|remind|created|updated|birthday|time|timestamp)(_|$)/i.test(normalized);
  }
  function formatMaybeDateValue(column, value) {
    const text = String(value || "");
    if (!text.trim() || !isDateLikeColumn(column)) {
      return text;
    }
    const structured = parseStructuredDateValue(text);
    if (structured) {
      return structured.hasTime ? formatStructuredDateTime(structured) : formatStructuredDate(structured);
    }
    const parsed = new Date(text);
    if (Number.isNaN(parsed.getTime())) {
      return text;
    }
    return formatStructuredDateTime(structuredDateFromDate(parsed));
  }
  var currentDisplayFormat, dateOnlyPattern, dateTimePattern;
  var init_datetime = __esm({
    "frontend/datetime.ts"() {
      "use strict";
      currentDisplayFormat = "browser";
      dateOnlyPattern = /^(\d{4})-(\d{2})-(\d{2})$/;
      dateTimePattern = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/;
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
    if (api) {
      const active = document.activeElement instanceof Node ? document.activeElement : null;
      return api.hasFocus() || Boolean(active && api.host.contains(active));
    }
    return document.activeElement === elements.markdownEditor;
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
  function markdownEditorSetPagePath(state, path) {
    const api = markdownEditorAPI(state);
    if (api && typeof api.setPagePath === "function") {
      api.setPagePath(String(path || ""));
    }
  }
  function markdownEditorSetDateTimeFormat(state, format) {
    const api = markdownEditorAPI(state);
    if (api && typeof api.setDateTimeFormat === "function") {
      api.setDateTimeFormat(format);
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
      elements.taskModalShell && !elements.taskModalShell.classList.contains("hidden") || !elements.searchModalShell.classList.contains("hidden") || !elements.commandModalShell.classList.contains("hidden") || Boolean(elements.quickSwitcherModalShell && !elements.quickSwitcherModalShell.classList.contains("hidden")) || Boolean(elements.documentsModalShell && !elements.documentsModalShell.classList.contains("hidden")) || Boolean(elements.helpModalShell && !elements.helpModalShell.classList.contains("hidden")) || Boolean(elements.settingsModalShell && !elements.settingsModalShell.classList.contains("hidden")) || Boolean(elements.pageHistoryModalShell && !elements.pageHistoryModalShell.classList.contains("hidden")) || Boolean(elements.trashModalShell && !elements.trashModalShell.classList.contains("hidden"))
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

  // frontend/inlineEditors.ts
  function defaultTaskPickerState() {
    return {
      mode: "",
      ref: "",
      left: 0,
      top: 0,
      year: 0,
      month: 0,
      day: 0,
      hour: 9,
      minute: 0
    };
  }
  function canonicalDate(year, month, day) {
    return [
      String(year).padStart(4, "0"),
      String(month).padStart(2, "0"),
      String(day).padStart(2, "0")
    ].join("-");
  }
  function canonicalDateTime(year, month, day, hour, minute) {
    return canonicalDate(year, month, day) + " " + [hour, minute].map(function(value) {
      return String(value).padStart(2, "0");
    }).join(":");
  }
  function taskPickerPartsFromValue(mode, rawValue) {
    const fallback = /* @__PURE__ */ new Date();
    try {
      const canonical = mode === "due" ? parseEditableDateValue(rawValue) : parseEditableDateTimeValue(rawValue);
      if (!canonical) {
        throw new Error("empty");
      }
      const datePart = canonical.slice(0, 10);
      const timePart = canonical.slice(11, 16);
      const [year, month, day] = datePart.split("-").map(Number);
      const [hour, minute] = timePart ? timePart.split(":").map(Number) : [9, 0];
      if (![year, month, day, hour, minute].every(Number.isFinite)) {
        throw new Error("invalid");
      }
      return { year, month, day, hour, minute };
    } catch (_error) {
      return {
        year: fallback.getFullYear(),
        month: fallback.getMonth() + 1,
        day: fallback.getDate(),
        hour: 9,
        minute: 0
      };
    }
  }
  function setTaskDateApplySuppressed(markdownEditorApi, active) {
    if (!markdownEditorApi || !markdownEditorApi.host) {
      return;
    }
    markdownEditorApi.host.classList.toggle("task-date-apply-active", active);
  }
  function positionInlineTaskPicker(taskPickerState, els) {
    const picker = els.inlineTaskPicker;
    const width = picker.offsetWidth || 320;
    const maxLeft = Math.max(12, window.innerWidth - width - 12);
    picker.style.left = Math.max(12, Math.min(taskPickerState.left, maxLeft)) + "px";
    picker.style.top = Math.max(12, taskPickerState.top) + "px";
  }
  function closeTaskPickers(taskPickerState, els) {
    taskPickerState.mode = "";
    taskPickerState.ref = "";
    els.inlineTaskPicker.classList.add("hidden");
    clearNode(els.inlineTaskPicker);
  }
  function buildTableEditorRows(currentMarkdown, startLineNumber) {
    const lines = String(currentMarkdown || "").replace(/\r\n/g, "\n").split("\n");
    const table = markdownTableRowsForLine(lines, startLineNumber);
    if (!table) {
      return null;
    }
    const width = Math.max(2, table.header.length);
    const normalizeRow = function(cells) {
      const next = new Array(width).fill("");
      for (let index = 0; index < width; index += 1) {
        next[index] = String(cells[index] || "");
      }
      return next;
    };
    const rows = [normalizeRow(table.header)].concat(table.rows.map(normalizeRow));
    if (rows.length < 2) {
      rows.push(new Array(width).fill(""));
    }
    return rows;
  }
  function closeInlineTableEditor(appState, els) {
    appState.tableEditor = null;
    els.inlineTablePanel.classList.add("hidden");
    els.inlineTablePanel.style.left = "";
    els.inlineTablePanel.style.top = "";
    els.inlineTablePanel.style.width = "";
    clearNode(els.inlineTablePanel);
  }
  function inlineTableEditorHasFocus(els) {
    const active = document.activeElement instanceof Node ? document.activeElement : null;
    return Boolean(active && els.inlineTablePanel.contains(active));
  }
  function inlineTableEditorOpen(appState, els) {
    return Boolean(appState.tableEditor && !els.inlineTablePanel.classList.contains("hidden"));
  }
  function focusInlineTableEditorCell(els, rowIndex, colIndex) {
    window.requestAnimationFrame(function() {
      const input = els.inlineTablePanel.querySelector('[data-inline-table-row="' + String(rowIndex) + '"][data-inline-table-col="' + String(colIndex) + '"]');
      if (input instanceof HTMLInputElement) {
        input.focus({ preventScroll: true });
        input.select();
      }
    });
  }
  function appendInlineTableEditorRow(editorState) {
    const cols = Math.max(1, editorState.rows[0] ? editorState.rows[0].length : 0);
    editorState.rows.push(new Array(cols).fill(""));
    editorState.dirty = true;
  }
  function insertInlineTableEditorRowAfter(editorState, rowIndex) {
    const cols = Math.max(1, editorState.rows[0] ? editorState.rows[0].length : 0);
    const nextRow = new Array(cols).fill("");
    const insertAt = Math.max(0, Math.min(rowIndex + 1, editorState.rows.length));
    editorState.rows.splice(insertAt, 0, nextRow);
    editorState.dirty = true;
    editorState.row = insertAt;
    editorState.col = Math.max(0, Math.min(editorState.col, cols - 1));
  }
  function insertInlineTableEditorColumnAfter(editorState, colIndex) {
    const insertAt = Math.max(0, colIndex + 1);
    editorState.rows = editorState.rows.map(function(row) {
      const next = row.slice();
      next.splice(insertAt, 0, "");
      return next;
    });
    editorState.dirty = true;
    editorState.col = insertAt;
  }
  function moveInlineTableEditorFocus(els, editorState, rowIndex, colIndex, backward) {
    const rowCount = editorState.rows.length;
    const colCount = Math.max(1, editorState.rows[0] ? editorState.rows[0].length : 0);
    if (backward) {
      if (colIndex > 0) {
        editorState.row = rowIndex;
        editorState.col = colIndex - 1;
      } else if (rowIndex > 0) {
        editorState.row = rowIndex - 1;
        editorState.col = colCount - 1;
      } else {
        editorState.row = 0;
        editorState.col = 0;
      }
      focusInlineTableEditorCell(els, editorState.row, editorState.col);
      return;
    }
    if (colIndex < colCount - 1) {
      editorState.row = rowIndex;
      editorState.col = colIndex + 1;
      focusInlineTableEditorCell(els, editorState.row, editorState.col);
      return;
    }
    if (rowIndex < rowCount - 1) {
      editorState.row = rowIndex + 1;
      editorState.col = 0;
      focusInlineTableEditorCell(els, editorState.row, editorState.col);
      return;
    }
    appendInlineTableEditorRow(editorState);
    editorState.row = editorState.rows.length - 1;
    editorState.col = 0;
  }
  function restoreInlineTableEditorFocus(appState, els) {
    if (!appState.tableEditor || els.inlineTablePanel.classList.contains("hidden")) {
      return;
    }
    const row = appState.tableEditor.row;
    const col = appState.tableEditor.col;
    focusInlineTableEditorCell(els, row, col);
    window.setTimeout(function() {
      if (appState.tableEditor && !els.inlineTablePanel.classList.contains("hidden")) {
        focusInlineTableEditorCell(els, appState.tableEditor.row, appState.tableEditor.col);
      }
    }, 50);
    window.setTimeout(function() {
      if (appState.tableEditor && !els.inlineTablePanel.classList.contains("hidden")) {
        focusInlineTableEditorCell(els, appState.tableEditor.row, appState.tableEditor.col);
      }
    }, 180);
  }
  function clampTableEditorWidth(width) {
    const viewportWidth = Math.max(320, window.innerWidth || 0);
    return Math.max(320, Math.min(Math.round(width || 0), viewportWidth - 24, 900));
  }
  function readRenderedTableTypography(appState, startLineNumber) {
    const host = appState.markdownEditorApi && appState.markdownEditorApi.host ? appState.markdownEditorApi.host : null;
    const base = {
      bodyFontFamily: "",
      bodyFontSize: "",
      bodyLineHeight: "",
      bodyLetterSpacing: "",
      bodyColor: "",
      bodyFontWeight: "",
      headerColor: "",
      headerFontWeight: ""
    };
    if (!host) {
      return base;
    }
    const bodyCell = host.querySelector(
      '[data-table-start-line="' + String(startLineNumber) + '"][data-table-row="1"][data-table-col="0"]'
    );
    const headerCell = host.querySelector(
      '[data-table-start-line="' + String(startLineNumber) + '"][data-table-row="0"][data-table-col="0"]'
    );
    const bodyStyle = bodyCell instanceof HTMLElement ? window.getComputedStyle(bodyCell) : null;
    const headerStyle = headerCell instanceof HTMLElement ? window.getComputedStyle(headerCell) : bodyStyle;
    if (!bodyStyle) {
      return base;
    }
    return {
      bodyFontFamily: bodyStyle.fontFamily || "",
      bodyFontSize: bodyStyle.fontSize || "",
      bodyLineHeight: bodyStyle.lineHeight || "",
      bodyLetterSpacing: bodyStyle.letterSpacing || "",
      bodyColor: bodyStyle.color || "",
      bodyFontWeight: bodyStyle.fontWeight || "",
      headerColor: headerStyle ? headerStyle.color || bodyStyle.color || "" : bodyStyle.color || "",
      headerFontWeight: headerStyle ? headerStyle.fontWeight || bodyStyle.fontWeight || "" : bodyStyle.fontWeight || ""
    };
  }
  function positionInlineTableEditorPanel(appState, els) {
    if (!appState.tableEditor) {
      return;
    }
    if (els.inlineTablePanel.classList.contains("hidden")) {
      return;
    }
    const viewportWidth = Math.max(320, window.innerWidth || 0);
    const viewportHeight = Math.max(320, window.innerHeight || 0);
    const width = clampTableEditorWidth(appState.tableEditor.width || 0);
    const rect = els.inlineTablePanel.getBoundingClientRect();
    const panelHeight = rect.height || 0;
    let left = Math.round(appState.tableEditor.left || 12);
    let top = Math.round(appState.tableEditor.top || 12);
    left = Math.max(12, Math.min(left, viewportWidth - width - 12));
    if (panelHeight > 0 && top + panelHeight > viewportHeight - 12) {
      top = Math.max(12, viewportHeight - panelHeight - 12);
    }
    els.inlineTablePanel.style.left = String(left) + "px";
    els.inlineTablePanel.style.top = String(top) + "px";
    els.inlineTablePanel.style.width = String(width) + "px";
  }
  function anchorInlineTableEditorToRenderedTable(appState, els, startLineNumber) {
    const host = appState.markdownEditorApi && appState.markdownEditorApi.host ? appState.markdownEditorApi.host : null;
    if (!host || !appState.tableEditor) {
      return;
    }
    const anchor = host.querySelector('[data-table-start-line="' + String(startLineNumber) + '"]');
    const rect = anchor instanceof HTMLElement ? anchor.getBoundingClientRect() : null;
    if (!rect) {
      return;
    }
    appState.tableEditor.left = Math.round(rect.left);
    appState.tableEditor.top = Math.round(rect.top);
    appState.tableEditor.width = Math.round(rect.width);
    positionInlineTableEditorPanel(appState, els);
  }
  function applyInlineTableEditor(appState, els, options) {
    if (!appState.tableEditor || !appState.selectedPage || !appState.currentPage) {
      if (options.closeAfter) {
        closeInlineTableEditor(appState, els);
      }
      return;
    }
    const editorState = appState.tableEditor;
    const width = Math.max(2, ...editorState.rows.map(function(row) {
      return row.length;
    }));
    const normalizedRows = editorState.rows.map(function(row) {
      const next = new Array(width).fill("");
      for (let index = 0; index < width; index += 1) {
        next[index] = String(row[index] || "");
      }
      return next;
    });
    if (normalizedRows.length < 2) {
      normalizedRows.push(new Array(width).fill(""));
    }
    const lines = String(appState.currentMarkdown || "").replace(/\r\n/g, "\n").split("\n");
    const block = findMarkdownTableBlockForLine(lines, editorState.startLine);
    if (!block) {
      closeInlineTableEditor(appState, els);
      return;
    }
    const replaceFrom = lines.slice(0, block.startLineIndex).reduce(function(sum, line) {
      return sum + line.length + 1;
    }, 0);
    const replaceTo = lines.slice(0, block.endLineIndex + 1).reduce(function(sum, line) {
      return sum + line.length + 1;
    }, 0) - (block.endLineIndex + 1 < lines.length ? 1 : 0);
    const hasFollowingLine = block.endLineIndex + 1 < lines.length;
    const replacementLines = [
      formatMarkdownTableRow(normalizedRows[0]),
      formatMarkdownTableRow(new Array(width).fill("---"))
    ].concat(normalizedRows.slice(1).map(formatMarkdownTableRow));
    const replacement = replacementLines.join("\n");
    lines.splice(block.startLineIndex, block.endLineIndex - block.startLineIndex + 1, ...replacementLines);
    const nextMarkdown = lines.join("\n");
    const scrollTop = markdownEditorScrollTop(appState, els);
    if (appState.markdownEditorApi) {
      appState.markdownEditorApi.replaceRange(replaceFrom, replaceTo, replacement);
    } else {
      setMarkdownEditorValue(appState, els, nextMarkdown);
    }
    setMarkdownEditorScrollTop(appState, els, scrollTop);
    appState.currentMarkdown = nextMarkdown;
    appState.tableEditor.rows = normalizedRows;
    appState.tableEditor.dirty = false;
    els.rawView.textContent = nextMarkdown;
    options.refreshLivePageChrome();
    options.scheduleAutosave();
    if (options.closeAfter) {
      closeInlineTableEditor(appState, els);
      const focusOffset = Math.max(0, Math.min(nextMarkdown.length, replaceFrom + replacement.length + (hasFollowingLine ? 1 : 0)));
      window.requestAnimationFrame(function() {
        focusMarkdownEditor(appState, els, { preventScroll: true });
        setMarkdownEditorSelection(appState, els, focusOffset, focusOffset, true);
      });
      return;
    }
  }
  function renderInlineTableEditor(appState, els, callbacks) {
    clearNode(els.inlineTablePanel);
    if (!appState.tableEditor || appState.sourceOpen) {
      els.inlineTablePanel.classList.add("hidden");
      els.inlineTablePanel.style.left = "";
      els.inlineTablePanel.style.top = "";
      els.inlineTablePanel.style.width = "";
      return;
    }
    const editorState = appState.tableEditor;
    const cols = editorState.rows[0] ? editorState.rows[0].length : 0;
    const handlePanelShortcut = function(rawEvent) {
      const event = rawEvent;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (event.key === "Escape" && !event.altKey && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        event.stopPropagation();
        callbacks.closeInlineTableEditor();
        return;
      }
      if (event.key === "Enter" && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey) {
        if (target && target.closest("button")) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        callbacks.applyInlineTableEditor(true);
      }
    };
    const head = document.createElement("div");
    head.className = "table-editor-head";
    head.addEventListener("keydown", handlePanelShortcut);
    const title = document.createElement("h3");
    title.textContent = editorState.dirty ? "Table Editor \u2022 Unsaved" : "Table Editor";
    head.appendChild(title);
    const actions = document.createElement("div");
    actions.className = "table-editor-actions";
    const addRow = document.createElement("button");
    addRow.type = "button";
    addRow.textContent = "+ Row";
    addRow.addEventListener("click", function() {
      insertInlineTableEditorRowAfter(editorState, editorState.row);
      renderInlineTableEditor(appState, els, callbacks);
      focusInlineTableEditorCell(els, editorState.row, editorState.col);
    });
    actions.appendChild(addRow);
    const addCol = document.createElement("button");
    addCol.type = "button";
    addCol.textContent = "+ Col";
    addCol.addEventListener("click", function() {
      insertInlineTableEditorColumnAfter(editorState, editorState.col);
      renderInlineTableEditor(appState, els, callbacks);
      focusInlineTableEditorCell(els, editorState.row, editorState.col);
    });
    actions.appendChild(addCol);
    const apply = document.createElement("button");
    apply.type = "button";
    apply.textContent = "Apply";
    apply.addEventListener("click", function() {
      callbacks.applyInlineTableEditor(false);
    });
    actions.appendChild(apply);
    const done = document.createElement("button");
    done.type = "button";
    done.textContent = "Done";
    done.addEventListener("click", function() {
      callbacks.applyInlineTableEditor(true);
    });
    actions.appendChild(done);
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", function() {
      callbacks.closeInlineTableEditor();
    });
    actions.appendChild(cancel);
    head.appendChild(actions);
    els.inlineTablePanel.appendChild(head);
    const grid = document.createElement("div");
    grid.className = "table-editor-grid";
    grid.addEventListener("keydown", handlePanelShortcut);
    if (editorState.bodyFontFamily) {
      grid.style.fontFamily = editorState.bodyFontFamily;
    }
    if (editorState.bodyFontSize) {
      grid.style.fontSize = editorState.bodyFontSize;
    }
    if (editorState.bodyLineHeight) {
      grid.style.lineHeight = editorState.bodyLineHeight;
    }
    if (editorState.bodyLetterSpacing) {
      grid.style.letterSpacing = editorState.bodyLetterSpacing;
    }
    editorState.rows.forEach(function(row, rowIndex) {
      const rowNode = document.createElement("div");
      rowNode.className = "table-editor-row" + (rowIndex === 0 ? " table-editor-header" : "");
      rowNode.style.gridTemplateColumns = "repeat(" + String(Math.max(1, cols)) + ", minmax(0, 1fr))";
      row.forEach(function(cell, colIndex) {
        const input = document.createElement("input");
        input.type = "text";
        input.value = cell;
        input.setAttribute("data-inline-table-row", String(rowIndex));
        input.setAttribute("data-inline-table-col", String(colIndex));
        input.addEventListener("focus", function() {
          editorState.row = rowIndex;
          editorState.col = colIndex;
        });
        if (editorState.bodyFontFamily) {
          input.style.fontFamily = editorState.bodyFontFamily;
        }
        if (editorState.bodyFontSize) {
          input.style.fontSize = editorState.bodyFontSize;
        }
        if (editorState.bodyLineHeight) {
          input.style.lineHeight = editorState.bodyLineHeight;
        }
        if (editorState.bodyLetterSpacing) {
          input.style.letterSpacing = editorState.bodyLetterSpacing;
        }
        if (rowIndex === 0) {
          if (editorState.headerColor) {
            input.style.color = editorState.headerColor;
          }
          if (editorState.headerFontWeight) {
            input.style.fontWeight = editorState.headerFontWeight;
          }
        } else {
          if (editorState.bodyColor) {
            input.style.color = editorState.bodyColor;
          }
          if (editorState.bodyFontWeight) {
            input.style.fontWeight = editorState.bodyFontWeight;
          }
        }
        input.addEventListener("input", function() {
          editorState.rows[rowIndex][colIndex] = input.value;
          editorState.dirty = true;
        });
        input.addEventListener("keydown", function(rawEvent) {
          const event = rawEvent;
          if (event.key !== "Tab") {
            return;
          }
          event.preventDefault();
          editorState.rows[rowIndex][colIndex] = input.value;
          moveInlineTableEditorFocus(els, editorState, rowIndex, colIndex, event.shiftKey);
          renderInlineTableEditor(appState, els, callbacks);
          focusInlineTableEditorCell(els, editorState.row, editorState.col);
        });
        rowNode.appendChild(input);
      });
      grid.appendChild(rowNode);
    });
    els.inlineTablePanel.appendChild(grid);
    els.inlineTablePanel.classList.remove("hidden");
    positionInlineTableEditorPanel(appState, els);
  }
  function openInlineTableEditor(appState, els, options) {
    if (appState.tableEditor && appState.tableEditor.startLine === options.startLineNumber) {
      appState.tableEditor.row = options.rowIndex;
      appState.tableEditor.col = options.colIndex;
      if (options.anchor) {
        appState.tableEditor.left = options.anchor.left;
        appState.tableEditor.top = options.anchor.top;
        appState.tableEditor.width = options.anchor.width;
      }
      options.renderInlineTableEditor();
      restoreInlineTableEditorFocus(appState, els);
      return;
    }
    const rows = buildTableEditorRows(appState.currentMarkdown, options.startLineNumber);
    if (!rows) {
      closeInlineTableEditor(appState, els);
      return;
    }
    appState.tableEditor = {
      startLine: options.startLineNumber,
      row: Math.max(0, options.rowIndex),
      col: Math.max(0, options.colIndex),
      rows,
      dirty: false,
      left: options.anchor ? options.anchor.left : 12,
      top: options.anchor ? options.anchor.top : 12,
      width: options.anchor ? options.anchor.width : 520,
      ...readRenderedTableTypography(appState, options.startLineNumber)
    };
    options.renderInlineTableEditor();
    if (!options.anchor) {
      window.requestAnimationFrame(function() {
        anchorInlineTableEditorToRenderedTable(appState, els, options.startLineNumber);
        restoreInlineTableEditorFocus(appState, els);
      });
    }
    restoreInlineTableEditorFocus(appState, els);
  }
  function renderTaskPicker(taskPickerState, els, callbacks) {
    if (taskPickerState.mode !== "due" && taskPickerState.mode !== "remind") {
      closeTaskPickers(taskPickerState, els);
      return;
    }
    const mode = taskPickerState.mode;
    const target = els.inlineTaskPicker;
    clearNode(target);
    const monthStart = new Date(taskPickerState.year, taskPickerState.month - 1, 1);
    const firstWeekday = (monthStart.getDay() + 6) % 7;
    const gridStart = new Date(taskPickerState.year, taskPickerState.month - 1, 1 - firstWeekday);
    const monthLabel = new Intl.DateTimeFormat(void 0, { month: "long", year: "numeric" }).format(monthStart);
    const head = document.createElement("div");
    head.className = "task-picker-head";
    const title = document.createElement("strong");
    title.textContent = monthLabel;
    head.appendChild(title);
    const nav = document.createElement("div");
    nav.className = "task-picker-nav";
    const prev = document.createElement("button");
    prev.type = "button";
    prev.textContent = "<";
    prev.addEventListener("click", function() {
      taskPickerState.month -= 1;
      if (taskPickerState.month < 1) {
        taskPickerState.month = 12;
        taskPickerState.year -= 1;
      }
      renderTaskPicker(taskPickerState, els, callbacks);
    });
    nav.appendChild(prev);
    const next = document.createElement("button");
    next.type = "button";
    next.textContent = ">";
    next.addEventListener("click", function() {
      taskPickerState.month += 1;
      if (taskPickerState.month > 12) {
        taskPickerState.month = 1;
        taskPickerState.year += 1;
      }
      renderTaskPicker(taskPickerState, els, callbacks);
    });
    nav.appendChild(next);
    head.appendChild(nav);
    target.appendChild(head);
    if (mode === "remind") {
      const timeRow = document.createElement("div");
      timeRow.className = "task-picker-time";
      const hourSelect = document.createElement("select");
      for (let hour = 0; hour < 24; hour += 1) {
        const option = document.createElement("option");
        option.value = String(hour);
        option.textContent = String(hour).padStart(2, "0");
        option.selected = hour === taskPickerState.hour;
        hourSelect.appendChild(option);
      }
      hourSelect.addEventListener("change", function() {
        taskPickerState.hour = Number(hourSelect.value) || 0;
      });
      timeRow.appendChild(hourSelect);
      const minuteSelect = document.createElement("select");
      for (let minute = 0; minute < 60; minute += 5) {
        const option = document.createElement("option");
        option.value = String(minute);
        option.textContent = String(minute).padStart(2, "0");
        option.selected = minute === taskPickerState.minute;
        minuteSelect.appendChild(option);
      }
      minuteSelect.addEventListener("change", function() {
        taskPickerState.minute = Number(minuteSelect.value) || 0;
      });
      timeRow.appendChild(minuteSelect);
      const apply = document.createElement("button");
      apply.type = "button";
      apply.className = "task-picker-apply";
      apply.textContent = "Apply";
      apply.addEventListener("click", function() {
        const task = callbacks.currentPickerTask();
        if (!task) {
          callbacks.closeTaskPickers();
          return;
        }
        callbacks.saveTaskDateField(
          task,
          "remind",
          canonicalDateTime(
            taskPickerState.year,
            taskPickerState.month,
            taskPickerState.day,
            taskPickerState.hour,
            taskPickerState.minute
          )
        ).catch(function(error) {
          callbacks.setNoteStatus("Reminder update failed: " + callbacks.errorMessage(error));
        });
      });
      timeRow.appendChild(apply);
      target.appendChild(timeRow);
    }
    const weekdays = document.createElement("div");
    weekdays.className = "task-picker-weekdays";
    ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].forEach(function(label) {
      const cell = document.createElement("span");
      cell.textContent = label;
      weekdays.appendChild(cell);
    });
    target.appendChild(weekdays);
    const grid = document.createElement("div");
    grid.className = "task-picker-grid";
    for (let index = 0; index < 42; index += 1) {
      const current = new Date(gridStart);
      current.setDate(gridStart.getDate() + index);
      const dayButton = document.createElement("button");
      dayButton.type = "button";
      dayButton.className = "task-picker-day";
      if (current.getMonth() !== taskPickerState.month - 1) {
        dayButton.classList.add("is-faded");
      }
      if (current.getFullYear() === taskPickerState.year && current.getMonth() === taskPickerState.month - 1 && current.getDate() === taskPickerState.day) {
        dayButton.classList.add("is-selected");
      }
      dayButton.textContent = String(current.getDate());
      dayButton.addEventListener("click", function() {
        taskPickerState.year = current.getFullYear();
        taskPickerState.month = current.getMonth() + 1;
        taskPickerState.day = current.getDate();
        if (mode === "due") {
          const task = callbacks.currentPickerTask();
          if (!task) {
            callbacks.closeTaskPickers();
            return;
          }
          callbacks.saveTaskDateField(task, "due", canonicalDate(taskPickerState.year, taskPickerState.month, taskPickerState.day)).catch(function(error) {
            callbacks.setNoteStatus("Due date update failed: " + callbacks.errorMessage(error));
          });
          return;
        }
        renderTaskPicker(taskPickerState, els, callbacks);
      });
      grid.appendChild(dayButton);
    }
    target.appendChild(grid);
    const footer = document.createElement("div");
    footer.className = "task-picker-footer";
    const status = document.createElement("span");
    status.textContent = mode === "due" ? formatEditableDateValue(canonicalDate(taskPickerState.year, taskPickerState.month, taskPickerState.day)) : formatEditableDateTimeValue(canonicalDateTime(
      taskPickerState.year,
      taskPickerState.month,
      taskPickerState.day,
      taskPickerState.hour,
      taskPickerState.minute
    ));
    footer.appendChild(status);
    const actions = document.createElement("div");
    actions.className = "task-picker-footer-actions";
    const clear = document.createElement("button");
    clear.type = "button";
    clear.textContent = "Clear";
    clear.addEventListener("click", function() {
      const task = callbacks.currentPickerTask();
      if (!task) {
        callbacks.closeTaskPickers();
        return;
      }
      callbacks.saveTaskDateField(task, mode, "").catch(function(error) {
        callbacks.setNoteStatus("Date update failed: " + callbacks.errorMessage(error));
      });
    });
    actions.appendChild(clear);
    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "Close";
    close.addEventListener("click", callbacks.closeTaskPickers);
    actions.appendChild(close);
    footer.appendChild(actions);
    target.appendChild(footer);
    els.inlineTaskPicker.classList.remove("hidden");
    window.requestAnimationFrame(function() {
      positionInlineTaskPicker(taskPickerState, els);
    });
  }
  function openInlineTaskPicker(taskPickerState, options) {
    if (taskPickerState.mode === options.mode && taskPickerState.ref === options.ref) {
      options.closeTaskPickers();
      return;
    }
    if (!options.task) {
      return;
    }
    options.rememberNoteFocus();
    const parts = taskPickerPartsFromValue(options.mode, options.mode === "due" ? options.task.due || "" : options.task.remind || "");
    taskPickerState.mode = options.mode;
    taskPickerState.ref = options.ref;
    taskPickerState.left = options.left;
    taskPickerState.top = options.top;
    taskPickerState.year = parts.year;
    taskPickerState.month = parts.month;
    taskPickerState.day = parts.day;
    taskPickerState.hour = parts.hour;
    taskPickerState.minute = parts.minute - parts.minute % 5;
    options.renderTaskPicker();
  }
  var init_inlineEditors = __esm({
    "frontend/inlineEditors.ts"() {
      "use strict";
      init_datetime();
      init_dom();
      init_editorState();
      init_markdown();
    }
  });

  // frontend/hotkeys.ts
  function normalizeToken(token) {
    return String(token || "").trim().toLowerCase();
  }
  function normalizeKeyName(value) {
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
  function hotkeyLabel(value) {
    return String(value || "").split("+").map(function(part) {
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
    }).join("+");
  }
  function matchesHotkey(hotkey, event) {
    const binding = String(hotkey || "").trim();
    if (!binding) {
      return false;
    }
    const tokens = binding.split("+").map(normalizeKeyName).filter(Boolean);
    const modifiers = {
      meta: false,
      ctrl: false,
      alt: false,
      shift: false
    };
    let explicitShift = false;
    let key = "";
    tokens.forEach(function(token) {
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
  var init_hotkeys = __esm({
    "frontend/hotkeys.ts"() {
      "use strict";
    }
  });

  // frontend/historyTrashUi.ts
  function firstContentLine(rawMarkdown) {
    const line = String(rawMarkdown || "").split(/\r?\n/).map(function(part) {
      return part.trim();
    }).find(Boolean);
    return line || "Empty note";
  }
  function historyChangePreview(rawMarkdown, previousMarkdown) {
    const currentLines = String(rawMarkdown || "").split(/\r?\n/);
    const previousLines = String(previousMarkdown || "").split(/\r?\n/);
    const changes = [];
    const limit = Math.max(currentLines.length, previousLines.length);
    for (let index = 0; index < limit; index += 1) {
      const currentLine = String(currentLines[index] || "").trim();
      const previousLine = String(previousLines[index] || "").trim();
      if (currentLine === previousLine) {
        continue;
      }
      if (previousLine) {
        changes.push("\u2013 " + previousLine);
      }
      if (currentLine) {
        changes.push("+ " + currentLine);
      }
      if (changes.length >= 2) {
        break;
      }
    }
    if (!changes.length) {
      return firstContentLine(rawMarkdown);
    }
    return changes.slice(0, 2).join(" \xB7 ");
  }
  function historyDiffContent(rawMarkdown, previousMarkdown) {
    const currentLines = String(rawMarkdown || "").split(/\r?\n/);
    const previousLines = String(previousMarkdown || "").split(/\r?\n/);
    const result = [];
    const limit = Math.max(currentLines.length, previousLines.length);
    for (let index = 0; index < limit; index += 1) {
      const currentLine = currentLines[index];
      const previousLine = previousLines[index];
      if (currentLine === previousLine) {
        continue;
      }
      if (typeof previousLine === "string") {
        result.push("- " + previousLine);
      }
      if (typeof currentLine === "string") {
        result.push("+ " + currentLine);
      }
    }
    return result.join("\n").trim() || "No changes.";
  }
  function selectedPageHistoryRevision(state) {
    if (!state.pageHistory.length) {
      return null;
    }
    return state.pageHistory.find(function(revision) {
      return revision.id === state.selectedHistoryRevisionId;
    }) || state.pageHistory[0] || null;
  }
  function renderPageHistoryPreview(state, els) {
    const revision = selectedPageHistoryRevision(state);
    if (!revision) {
      els.pageHistoryPreview.textContent = "Select a revision to preview it.";
      els.copyPageHistory.disabled = true;
      els.restorePageHistory.disabled = true;
      return;
    }
    const index = state.pageHistory.findIndex(function(entry) {
      return entry.id === revision.id;
    });
    const previousMarkdown = index >= 0 && index + 1 < state.pageHistory.length ? state.pageHistory[index + 1].rawMarkdown : "";
    els.pageHistoryPreview.textContent = state.historyShowChanges ? historyDiffContent(revision.rawMarkdown, previousMarkdown) : String(revision.rawMarkdown || "");
    els.copyPageHistory.disabled = false;
    els.restorePageHistory.disabled = false;
  }
  function setPageHistoryOpen(state, els, open, onBeforeOpen) {
    if (open) {
      onBeforeOpen();
      els.searchModalShell.classList.add("hidden");
      els.commandModalShell.classList.add("hidden");
      els.quickSwitcherModalShell.classList.add("hidden");
      els.documentsModalShell.classList.add("hidden");
      els.helpModalShell.classList.add("hidden");
      els.settingsModalShell.classList.add("hidden");
      els.trashModalShell.classList.add("hidden");
      els.pageHistoryModalShell.classList.remove("hidden");
      els.pageHistoryShowChanges.checked = state.historyShowChanges;
      window.requestAnimationFrame(function() {
        focusWithoutScroll(els.closePageHistoryModal);
      });
      return;
    }
    els.pageHistoryModalShell.classList.add("hidden");
  }
  function renderPageHistory(state, els, onSelectRevision) {
    clearNode(els.pageHistoryResults);
    if (!state.pageHistory.length) {
      state.selectedHistoryRevisionId = "";
      renderEmpty(els.pageHistoryResults, "No saved revisions for this page yet.");
      renderPageHistoryPreview(state, els);
      return;
    }
    if (!selectedPageHistoryRevision(state)) {
      state.selectedHistoryRevisionId = state.pageHistory[0].id;
    }
    state.pageHistory.forEach(function(revision, index) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "history-item";
      if (revision.id === state.selectedHistoryRevisionId) {
        item.classList.add("active");
      }
      item.addEventListener("click", function() {
        state.selectedHistoryRevisionId = revision.id;
        onSelectRevision();
      });
      const meta = document.createElement("div");
      meta.className = "history-item-meta";
      meta.textContent = formatDateTimeValue(revision.savedAt);
      const snippet = document.createElement("div");
      snippet.className = "history-item-snippet";
      snippet.textContent = historyChangePreview(
        revision.rawMarkdown,
        index + 1 < state.pageHistory.length ? state.pageHistory[index + 1].rawMarkdown : ""
      );
      item.appendChild(meta);
      item.appendChild(snippet);
      els.pageHistoryResults.appendChild(item);
    });
    renderPageHistoryPreview(state, els);
  }
  function setTrashOpen(els, open, onBeforeOpen) {
    if (open) {
      onBeforeOpen();
      els.searchModalShell.classList.add("hidden");
      els.commandModalShell.classList.add("hidden");
      els.quickSwitcherModalShell.classList.add("hidden");
      els.documentsModalShell.classList.add("hidden");
      els.helpModalShell.classList.add("hidden");
      els.settingsModalShell.classList.add("hidden");
      els.pageHistoryModalShell.classList.add("hidden");
      els.trashModalShell.classList.remove("hidden");
      window.requestAnimationFrame(function() {
        focusWithoutScroll(els.closeTrashModal);
      });
      return;
    }
    els.trashModalShell.classList.add("hidden");
  }
  function renderTrash(state, els, actions) {
    clearNode(els.trashResults);
    if (!state.trashPages.length) {
      renderEmpty(els.trashResults, "Trash is empty.");
      return;
    }
    state.trashPages.forEach(function(entry) {
      const item = document.createElement("div");
      item.className = "history-item";
      const meta = document.createElement("div");
      meta.className = "history-item-meta";
      meta.textContent = pageTitleFromPath(entry.page) + " \xB7 deleted " + formatDateTimeValue(entry.deletedAt);
      const snippet = document.createElement("div");
      snippet.className = "history-item-snippet";
      snippet.textContent = firstContentLine(entry.rawMarkdown);
      const actionRow = document.createElement("div");
      actionRow.className = "history-item-actions";
      const restoreButton = document.createElement("button");
      restoreButton.type = "button";
      restoreButton.textContent = "Restore";
      restoreButton.addEventListener("click", function() {
        actions.onRestore(entry);
      });
      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "danger-button";
      deleteButton.textContent = "Delete Permanently";
      deleteButton.addEventListener("click", function() {
        actions.onDelete(entry);
      });
      actionRow.appendChild(restoreButton);
      actionRow.appendChild(deleteButton);
      item.appendChild(meta);
      item.appendChild(snippet);
      item.appendChild(actionRow);
      els.trashResults.appendChild(item);
    });
  }
  var init_historyTrashUi = __esm({
    "frontend/historyTrashUi.ts"() {
      "use strict";
      init_datetime();
      init_dom();
      init_commands();
    }
  });

  // frontend/helpUi.ts
  function shortcutRow(label, hotkey) {
    const row = document.createElement("div");
    row.className = "shortcut-row";
    const title = document.createElement("span");
    title.textContent = label;
    row.appendChild(title);
    const keys = document.createElement("span");
    keys.className = "shortcut-keys";
    hotkeyLabel(hotkey).split("+").forEach(function(part) {
      const key = document.createElement("kbd");
      key.textContent = part;
      keys.appendChild(key);
    });
    row.appendChild(keys);
    return row;
  }
  function renderHelpShortcuts(els, preferences) {
    clearNode(els.helpShortcutCore);
    clearNode(els.helpShortcutEditor);
    [
      ["Quick Switcher", preferences.hotkeys.quickSwitcher],
      ["Full Search", preferences.hotkeys.globalSearch],
      ["Command Palette", preferences.hotkeys.commandPalette],
      ["Open Daily Note", preferences.hotkeys.quickNote],
      ["Back", "Alt+Left"],
      ["Forward", "Alt+Right"],
      ["Save Current Note", preferences.hotkeys.saveCurrentPage],
      ["Toggle Raw Mode", preferences.hotkeys.toggleRawMode],
      ["Open Help", preferences.hotkeys.help]
    ].forEach(function(entry) {
      els.helpShortcutCore.appendChild(shortcutRow(entry[0], entry[1]));
    });
    [
      ["Toggle Task Done", preferences.hotkeys.toggleTaskDone],
      ["Slash Commands", "/"],
      ["Open Link Under Caret", "Shift+Enter"],
      ["Close Menus or Modals", "Esc"]
    ].forEach(function(entry) {
      els.helpShortcutEditor.appendChild(shortcutRow(entry[0], entry[1]));
    });
  }
  var init_helpUi = __esm({
    "frontend/helpUi.ts"() {
      "use strict";
      init_dom();
      init_hotkeys();
    }
  });

  // frontend/noteView.ts
  function currentPageView(currentPage, currentMarkdown) {
    if (!currentPage) {
      return null;
    }
    const liveFrontmatter = parseFrontmatter(currentMarkdown);
    const fallbackPath = currentPage.page || currentPage.path || "";
    const title = currentPage.title || pageTitleFromPath(fallbackPath);
    return Object.assign({}, currentPage, {
      frontmatter: liveFrontmatter,
      title: title || fallbackPath
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
      return '<button type="button" class="wiki-link" data-page-link="' + escapeHTML(pagePath) + '">' + escapeHTML(pageTitleFromPath(pagePath)) + "</button>";
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
      }) : value.map(function(item) {
        return formatMaybeDateValue(column, String(item));
      })).filter(Boolean);
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
    return escapeHTML(formatMaybeDateValue(column, String(value)));
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
    if ((column === "text" || column === "task" && row && row.__taskRef) && pagePathValue) {
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
      init_datetime();
      init_commands();
    }
  });

  // frontend/pageOperations.ts
  function remapPathPrefix(value, fromPrefix, toPrefix) {
    const source = normalizePageDraftPath(value);
    if (!source) {
      return "";
    }
    if (source === fromPrefix) {
      return toPrefix;
    }
    if (source.startsWith(fromPrefix + "/")) {
      return toPrefix + source.slice(fromPrefix.length);
    }
    return source;
  }
  function remapExpandedFolderKeys(expandedPageFolders, fromPrefix, toPrefix) {
    const next = {};
    Object.keys(expandedPageFolders).forEach(function(key) {
      if (!expandedPageFolders[key]) {
        return;
      }
      const remapped = remapPathPrefix(key, fromPrefix, toPrefix);
      next[remapped || key] = true;
    });
    Object.keys(expandedPageFolders).forEach(function(key) {
      delete expandedPageFolders[key];
    });
    Object.assign(expandedPageFolders, next);
  }
  async function createPage(pagePath, callbacks) {
    const normalized = normalizePageDraftPath(pagePath);
    if (!normalized) {
      return;
    }
    const leaf = pageTitleFromPath(normalized);
    const initialMarkdown = leaf ? "# " + leaf + "\n" : "";
    await callbacks.fetchJSON("/api/pages/" + callbacks.encodePath(normalized), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rawMarkdown: initialMarkdown })
    });
    await callbacks.loadPages();
    callbacks.navigateToPage(normalized, false);
  }
  async function deletePage(pagePath, context, callbacks) {
    const normalized = normalizePageDraftPath(pagePath);
    if (!normalized) {
      return;
    }
    const deletingSelectedPage = context.selectedPage === normalized;
    const currentIndex = context.pages.findIndex(function(page) {
      return normalizePageDraftPath(page.path) === normalized;
    });
    const fallbackPage = currentIndex >= 0 ? context.pages[currentIndex - 1] || context.pages[currentIndex + 1] || null : null;
    const fallbackPath = fallbackPage ? normalizePageDraftPath(fallbackPage.path) : "";
    if (!window.confirm('Move page "' + normalized + '" to trash?')) {
      return;
    }
    await callbacks.fetchJSON("/api/pages/" + callbacks.encodePath(normalized), {
      method: "DELETE"
    });
    callbacks.setNoteStatus("Moved " + normalized + " to trash.");
    if (callbacks.currentHomePage().toLowerCase() === normalized.toLowerCase()) {
      callbacks.clearHomePage();
    }
    await callbacks.loadPages();
    if (deletingSelectedPage) {
      if (fallbackPath && context.pages.some(function(page) {
        return normalizePageDraftPath(page.path) === fallbackPath;
      })) {
        callbacks.navigateToPage(fallbackPath, true);
      } else {
        callbacks.clearPageSelection();
      }
    }
  }
  async function deleteFolder(folderKey, context, callbacks) {
    const normalized = normalizePageDraftPath(folderKey);
    if (!normalized) {
      return;
    }
    const pageCount = context.pages.filter(function(page) {
      const path = String(page.path || "");
      return path === normalized || path.startsWith(normalized + "/");
    }).length;
    if (!window.confirm('Delete folder "' + normalized + '" and everything inside it?\n\n' + String(pageCount) + " note(s) will be removed.")) {
      return;
    }
    await callbacks.fetchJSON("/api/folders/" + callbacks.encodePath(normalized), {
      method: "DELETE"
    });
    if (context.selectedPage && (context.selectedPage === normalized || context.selectedPage.startsWith(normalized + "/"))) {
      callbacks.clearPageSelection();
    }
    const currentHomePage = callbacks.currentHomePage().toLowerCase();
    if (currentHomePage === normalized.toLowerCase() || currentHomePage.startsWith(normalized.toLowerCase() + "/")) {
      callbacks.clearHomePage();
    }
    await callbacks.loadPages();
  }
  async function movePage(pagePath, targetPage, callbacks) {
    const fromPath = normalizePageDraftPath(pagePath);
    const toPath = normalizePageDraftPath(targetPage);
    if (!fromPath || !toPath || fromPath === toPath) {
      return;
    }
    const payload = await callbacks.fetchJSON("/api/pages/" + callbacks.encodePath(fromPath) + "/move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetPage: toPath })
    });
    if (callbacks.currentHomePage().toLowerCase() === fromPath.toLowerCase()) {
      callbacks.setHomePage(toPath);
    }
    await callbacks.loadPages();
    callbacks.navigateToPage(payload.page || toPath, false);
  }
  async function renamePage(pagePath, nextLeafName, callbacks) {
    const fromPath = normalizePageDraftPath(pagePath);
    const nextLeaf = normalizePageDraftPath(nextLeafName);
    if (!fromPath || !nextLeaf) {
      return;
    }
    let targetPath;
    if (nextLeaf.indexOf("/") >= 0) {
      targetPath = nextLeaf;
    } else {
      const slash = fromPath.lastIndexOf("/");
      const parent = slash >= 0 ? fromPath.slice(0, slash) : "";
      targetPath = parent ? parent + "/" + nextLeaf : nextLeaf;
    }
    await movePage(fromPath, targetPath, callbacks);
  }
  async function movePageToFolder(pagePath, folderKey, callbacks) {
    const fromPath = normalizePageDraftPath(pagePath);
    if (!fromPath) {
      return;
    }
    const leaf = pageTitleFromPath(fromPath);
    const targetFolder = normalizePageDraftPath(folderKey);
    const toPath = targetFolder ? targetFolder + "/" + leaf : leaf;
    await movePage(fromPath, toPath, callbacks);
  }
  async function moveFolder(folderKey, targetFolder, context, callbacks) {
    const sourceFolder = normalizePageDraftPath(folderKey);
    const destinationParent = normalizePageDraftPath(targetFolder);
    if (!sourceFolder) {
      return;
    }
    const folderName = pageTitleFromPath(sourceFolder);
    const destinationFolder = destinationParent ? destinationParent + "/" + folderName : folderName;
    if (destinationFolder === sourceFolder || destinationParent.startsWith(sourceFolder + "/")) {
      return;
    }
    const payload = await callbacks.fetchJSON("/api/folders/" + callbacks.encodePath(sourceFolder) + "/move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetFolder: destinationParent, name: "" })
    });
    const movedFolder = normalizePageDraftPath(payload.folder || destinationFolder);
    const movedSelectedPage = context.selectedPage ? remapPathPrefix(context.selectedPage, sourceFolder, movedFolder) : "";
    const movedHomePage = callbacks.currentHomePage() ? remapPathPrefix(callbacks.currentHomePage(), sourceFolder, movedFolder) : "";
    remapExpandedFolderKeys(context.expandedPageFolders, sourceFolder, movedFolder);
    if (movedHomePage) {
      callbacks.setHomePage(movedHomePage);
    }
    await callbacks.loadPages();
    if (movedSelectedPage && movedSelectedPage !== context.selectedPage) {
      callbacks.navigateToPage(movedSelectedPage, false);
      return;
    }
    callbacks.renderPages();
  }
  async function renameFolder(folderKey, nextLeafName, context, callbacks) {
    const sourceFolder = normalizePageDraftPath(folderKey);
    const nextLeaf = normalizePageDraftPath(nextLeafName);
    if (!sourceFolder || !nextLeaf) {
      return;
    }
    let parentFolder;
    let folderName;
    if (nextLeaf.indexOf("/") >= 0) {
      const lastSlash = nextLeaf.lastIndexOf("/");
      parentFolder = nextLeaf.slice(0, lastSlash);
      folderName = nextLeaf.slice(lastSlash + 1);
    } else {
      const slash = sourceFolder.lastIndexOf("/");
      parentFolder = slash >= 0 ? sourceFolder.slice(0, slash) : "";
      folderName = nextLeaf;
    }
    const destinationFolder = parentFolder ? parentFolder + "/" + folderName : folderName;
    if (destinationFolder === sourceFolder || destinationFolder.startsWith(sourceFolder + "/")) {
      return;
    }
    const payload = await callbacks.fetchJSON("/api/folders/" + callbacks.encodePath(sourceFolder) + "/move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetFolder: parentFolder, name: folderName })
    });
    const movedFolder = normalizePageDraftPath(payload.folder || destinationFolder);
    const movedSelectedPage = context.selectedPage ? remapPathPrefix(context.selectedPage, sourceFolder, movedFolder) : "";
    const movedHomePage = callbacks.currentHomePage() ? remapPathPrefix(callbacks.currentHomePage(), sourceFolder, movedFolder) : "";
    remapExpandedFolderKeys(context.expandedPageFolders, sourceFolder, movedFolder);
    if (movedHomePage) {
      callbacks.setHomePage(movedHomePage);
    }
    await callbacks.loadPages();
    if (movedSelectedPage && movedSelectedPage !== context.selectedPage) {
      callbacks.navigateToPage(movedSelectedPage, false);
      return;
    }
    callbacks.renderPages();
  }
  var init_pageOperations = __esm({
    "frontend/pageOperations.ts"() {
      "use strict";
      init_commands();
    }
  });

  // frontend/documents.ts
  function normalizePath(value) {
    return String(value || "").replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+/g, "/").trim();
  }
  function pageDirectory(pagePath) {
    const normalized = normalizePath(pagePath).replace(/\.md$/i, "");
    const parts = normalized.split("/").filter(Boolean);
    if (parts.length <= 1) {
      return "";
    }
    return parts.slice(0, -1).join("/");
  }
  function relativeDocumentPath(currentPagePath, documentPath) {
    const fromDir = pageDirectory(currentPagePath);
    const toPath = normalizePath(documentPath);
    const fromParts = fromDir ? fromDir.split("/").filter(Boolean) : [];
    const toParts = toPath.split("/").filter(Boolean);
    let common = 0;
    while (common < fromParts.length && common < toParts.length && fromParts[common] === toParts[common]) {
      common += 1;
    }
    const upwards = new Array(fromParts.length - common).fill("..");
    const downwards = toParts.slice(common);
    const relative = upwards.concat(downwards).join("/");
    return relative || pathLeaf(toPath);
  }
  function pathLeaf(path) {
    const parts = normalizePath(path).split("/");
    return parts[parts.length - 1] || path;
  }
  function markdownLinkForDocument(document2, currentPagePath) {
    const label = String(document2.name || "").replace(/]/g, "\\]");
    return "[" + label + "](" + relativeDocumentPath(currentPagePath, document2.path) + ")";
  }
  function matchesDocument(document2, query) {
    const target = String(query || "").trim().toLowerCase();
    if (!target) {
      return true;
    }
    const haystack = [document2.name, document2.contentType].join(" ").toLowerCase();
    return haystack.indexOf(target) >= 0;
  }
  function scoreDocument(document2, query) {
    const target = String(query || "").trim().toLowerCase();
    const name = String(document2.name || "").toLowerCase();
    if (!target) {
      return document2.createdAt ? Date.parse(document2.createdAt) || 0 : 0;
    }
    return (name === target ? 4e3 : 0) + (name.startsWith(target) ? 2800 : 0) + (name.indexOf(target) >= 0 ? 1200 : 0) + (document2.createdAt ? (Date.parse(document2.createdAt) || 0) / 1e12 : 0);
  }
  function buildDocumentSections(options) {
    const query = String(options.inputValue || "").trim();
    const items = options.documents.filter(function(document2) {
      return matchesDocument(document2, query);
    }).sort(function(left, right) {
      return scoreDocument(right, query) - scoreDocument(left, query);
    }).slice(0, query ? 30 : 20).map(function(document2) {
      return {
        title: document2.name,
        meta: [document2.path, document2.contentType, document2.size ? Math.round(document2.size / 102.4) / 10 + " KB" : ""].filter(Boolean).join(" \xB7 "),
        onSelect: function() {
          options.onSelectDocument(document2);
        }
      };
    });
    return [{
      title: query ? "Matching Documents" : "Recent Documents",
      items
    }];
  }
  function renderDocumentsResults(options) {
    return renderPaletteSections(options.container, buildDocumentSections(options), "No matching documents.");
  }
  var init_documents = __esm({
    "frontend/documents.ts"() {
      "use strict";
      init_palette();
    }
  });

  // frontend/quickSwitcher.ts
  function scorePage(page, query, selectedPage) {
    const path = String(page.path || "").toLowerCase();
    const title = String(page.title || "").toLowerCase();
    const target = String(query || "").trim().toLowerCase();
    if (!target) {
      const selectedBoost2 = path === String(selectedPage || "").toLowerCase() ? 2e12 : 0;
      const updatedAt = page.updatedAt ? Date.parse(page.updatedAt) || 0 : 0;
      return selectedBoost2 + updatedAt;
    }
    const exactPath = path === target ? 5e3 : 0;
    const exactLeaf = pageLeafName(page.path).toLowerCase() === target ? 4500 : 0;
    const prefixPath = path.startsWith(target) ? 3e3 : 0;
    const prefixTitle = title.startsWith(target) ? 2500 : 0;
    const includesPath = path.indexOf(target) >= 0 ? 1200 : 0;
    const includesTitle = title.indexOf(target) >= 0 ? 1e3 : 0;
    const selectedBoost = path === String(selectedPage || "").toLowerCase() ? 50 : 0;
    const freshness = page.updatedAt ? (Date.parse(page.updatedAt) || 0) / 1e12 : 0;
    return exactPath + exactLeaf + prefixPath + prefixTitle + includesPath + includesTitle + selectedBoost + freshness;
  }
  function matchesPage(page, query) {
    const target = String(query || "").trim().toLowerCase();
    if (!target) {
      return true;
    }
    const haystack = [page.path, page.title || ""].join(" ").toLowerCase();
    return haystack.indexOf(target) >= 0;
  }
  function buildQuickSwitcherSections(options) {
    const query = String(options.inputValue || "").trim();
    const normalizedDraftPath = normalizePageDraftPath(query);
    const matchingPages = options.pages.filter(function(page) {
      return matchesPage(page, query);
    }).sort(function(left, right) {
      return scorePage(right, query, options.selectedPage) - scorePage(left, query, options.selectedPage);
    }).slice(0, query ? 20 : 15);
    const hasExactMatch = normalizedDraftPath ? matchingPages.some(function(page) {
      return String(page.path || "").toLowerCase() === normalizedDraftPath.toLowerCase();
    }) : false;
    const createItems = normalizedDraftPath && !hasExactMatch ? [{
      title: "Create note",
      meta: normalizedDraftPath,
      hint: "Enter",
      onSelect: function() {
        options.onClose();
        options.onCreatePage(normalizedDraftPath);
      }
    }] : [];
    const recentTitle = query ? "Notes" : "Recent Notes";
    const noteItems = matchingPages.map(function(page) {
      const leaf = pageLeafName(page.path);
      const title = page.title && page.title !== leaf ? page.title : "";
      return {
        title: leaf,
        meta: [page.path, title].filter(Boolean).join(" \xB7 "),
        onSelect: function() {
          options.onClose();
          options.onOpenPage(page.path);
        }
      };
    });
    return [
      {
        title: "Create",
        items: createItems
      },
      {
        title: recentTitle,
        items: noteItems
      }
    ];
  }
  function renderQuickSwitcherResults(options) {
    return renderPaletteSections(options.container, buildQuickSwitcherSections(options), "No matching notes.");
  }
  var init_quickSwitcher = __esm({
    "frontend/quickSwitcher.ts"() {
      "use strict";
      init_palette();
      init_commands();
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

  // frontend/paletteModals.ts
  function hideOtherPalettes(els, active) {
    if (active !== "search") {
      els.searchModalShell.classList.add("hidden");
    }
    if (active !== "command") {
      els.commandModalShell.classList.add("hidden");
    }
    if (active !== "quick") {
      els.quickSwitcherModalShell.classList.add("hidden");
    }
    if (active !== "documents") {
      els.documentsModalShell.classList.add("hidden");
    }
    els.helpModalShell.classList.add("hidden");
    els.pageHistoryModalShell.classList.add("hidden");
    els.trashModalShell.classList.add("hidden");
  }
  function focusWhenOpen(shell, input) {
    if (shell.classList.contains("hidden")) {
      return;
    }
    window.requestAnimationFrame(function() {
      if (document.activeElement !== input) {
        input.focus({ preventScroll: true });
      }
    });
  }
  function setSearchOpen(els, open, onBeforeOpen) {
    if (open) {
      onBeforeOpen();
      hideOtherPalettes(els, "search");
    }
    setPaletteOpen(els.searchModalShell, els.globalSearchInput, open);
  }
  function setCommandPaletteOpen(els, open, onBeforeOpen) {
    if (open) {
      onBeforeOpen();
      hideOtherPalettes(els, "command");
    }
    setPaletteOpen(els.commandModalShell, els.commandPaletteInput, open);
  }
  function setQuickSwitcherOpen(els, open, onBeforeOpen) {
    if (open) {
      onBeforeOpen();
      hideOtherPalettes(els, "quick");
    }
    setPaletteOpen(els.quickSwitcherModalShell, els.quickSwitcherInput, open);
  }
  function setDocumentsOpen(els, open, onBeforeOpen) {
    if (open) {
      onBeforeOpen();
      hideOtherPalettes(els, "documents");
    }
    setPaletteOpen(els.documentsModalShell, els.documentsInput, open);
  }
  function updatePaletteModalSelection(container, index) {
    updateSelection(container, index);
  }
  function movePaletteModalSelection(container, index, delta) {
    return moveSelection(container, index, delta);
  }
  function triggerPaletteModalSelection(container, index) {
    triggerSelection(container, index);
  }
  function paletteModalButtons(container) {
    return resultButtons(container);
  }
  function renderSearchResults(options) {
    const selectionIndex = renderGlobalSearchResults({
      container: options.els.globalSearchResults,
      payload: options.payload,
      onClose: options.onClose,
      onOpenPage: options.onOpenPage,
      onOpenPageAtLine: options.onOpenPageAtLine,
      onOpenPageAtTask: options.onOpenPageAtTask,
      onOpenSavedQuery: options.onOpenSavedQuery
    });
    if (selectionIndex >= 0) {
      updateSelection(options.els.globalSearchResults, selectionIndex);
    }
    focusWhenOpen(options.els.searchModalShell, options.els.globalSearchInput);
    return selectionIndex;
  }
  function renderSearchEmptyState(els, message) {
    renderEmpty(els.globalSearchResults, message);
  }
  function renderCommandResults(options) {
    const selectionIndex = renderCommandPaletteResults({
      container: options.els.commandPaletteResults,
      inputValue: options.inputValue,
      selectedPage: options.selectedPage,
      sourceOpen: options.sourceOpen,
      railOpen: options.railOpen,
      currentHomePage: options.currentHomePage,
      hotkeys: options.hotkeys,
      onToggleSource: options.onToggleSource,
      onOpenHelp: options.onOpenHelp,
      onOpenSettings: options.onOpenSettings,
      onOpenDocuments: options.onOpenDocuments,
      onOpenQuickSwitcher: options.onOpenQuickSwitcher,
      onQuickNote: options.onQuickNote,
      onOpenSearch: options.onOpenSearch,
      onFocusRail: options.onFocusRail,
      onToggleRail: options.onToggleRail,
      onOpenHomePage: options.onOpenHomePage,
      onSetHomePage: options.onSetHomePage,
      onDeletePage: options.onDeletePage,
      onClearHomePage: options.onClearHomePage
    });
    if (selectionIndex >= 0) {
      updateSelection(options.els.commandPaletteResults, selectionIndex);
    }
    focusWhenOpen(options.els.commandModalShell, options.els.commandPaletteInput);
    return selectionIndex;
  }
  function renderQuickSwitcherResults2(options) {
    const selectionIndex = renderQuickSwitcherResults({
      container: options.els.quickSwitcherResults,
      inputValue: options.inputValue,
      pages: options.pages,
      selectedPage: options.selectedPage,
      onClose: options.onClose,
      onOpenPage: options.onOpenPage,
      onCreatePage: options.onCreatePage
    });
    if (selectionIndex >= 0) {
      updateSelection(options.els.quickSwitcherResults, selectionIndex);
    }
    focusWhenOpen(options.els.quickSwitcherModalShell, options.els.quickSwitcherInput);
    return selectionIndex;
  }
  function renderDocumentResults(options) {
    const selectionIndex = renderDocumentsResults({
      container: options.els.documentsResults,
      inputValue: options.inputValue,
      documents: options.documents,
      onSelectDocument: options.onSelectDocument
    });
    if (selectionIndex >= 0) {
      updateSelection(options.els.documentsResults, selectionIndex);
    }
    focusWhenOpen(options.els.documentsModalShell, options.els.documentsInput);
    return selectionIndex;
  }
  function documentLinkForSelection(document2, selectedPage) {
    return markdownLinkForDocument(document2, selectedPage);
  }
  var init_paletteModals = __esm({
    "frontend/paletteModals.ts"() {
      "use strict";
      init_commands();
      init_documents();
      init_dom();
      init_palette();
      init_quickSwitcher();
      init_search();
    }
  });

  // frontend/pageViews.ts
  function setDragPayload(event, payload) {
    if (!event.dataTransfer) {
      return;
    }
    activeDragItem = payload;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.dropEffect = "move";
    event.dataTransfer.setData("application/x-noterious-tree", JSON.stringify(payload));
    event.dataTransfer.setData("text/plain", payload.path);
  }
  function getDragPayload(event) {
    if (activeDragItem) {
      return activeDragItem;
    }
    if (!event.dataTransfer) {
      return null;
    }
    const raw = event.dataTransfer.getData("application/x-noterious-tree");
    if (!raw) {
      return null;
    }
    try {
      const payload = JSON.parse(raw);
      if (!payload || !payload.path || payload.kind !== "page" && payload.kind !== "folder") {
        return null;
      }
      return payload;
    } catch (_error) {
      return null;
    }
  }
  function canDropOnFolder(payload, folderKey) {
    if (!payload || !folderKey) {
      return false;
    }
    if (payload.kind === "page") {
      const pageLeaf = String(payload.path || "").split("/").pop() || "";
      return folderKey + "/" + pageLeaf !== payload.path;
    }
    return payload.path !== folderKey && !folderKey.startsWith(payload.path + "/");
  }
  function canDropOnRoot(payload) {
    if (!payload) {
      return false;
    }
    return String(payload.path || "").indexOf("/") >= 0;
  }
  function makeDragSource(element, payload) {
    element.draggable = true;
    element.setAttribute("data-drag-kind", payload.kind);
    element.setAttribute("data-drag-path", payload.path);
    element.addEventListener("dragstart", function(event) {
      event.stopPropagation();
      setDragPayload(event, payload);
      document.body.classList.add("tree-dragging");
      element.classList.add("drag-source");
    });
    element.addEventListener("dragend", function(event) {
      event.stopPropagation();
      activeDragItem = null;
      document.body.classList.remove("tree-dragging");
      element.classList.remove("drag-source");
    });
  }
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
  function renderPageTreeNode(node, depth, expandedPageFolders, selectedPage, onToggleFolder, onSelectPage, onCreatePage, onCreateSubfolder, onRenameFolder, onDeleteFolder, onRenamePage, onDeletePage, onOpenContextMenu, onMovePage, onMoveFolder) {
    const group = document.createElement("div");
    group.className = depth === 0 ? "page-tree-root" : "page-tree-children";
    Object.keys(node.folders).sort().forEach(function(name) {
      const folder = node.folders[name];
      const item = document.createElement("div");
      item.className = "page-tree-node page-tree-folder";
      makeDragSource(item, { kind: "folder", path: folder.key });
      item.addEventListener("dragover", function(event) {
        const payload = getDragPayload(event);
        if (!canDropOnFolder(payload, folder.key)) {
          return;
        }
        event.preventDefault();
        if (event.dataTransfer) {
          event.dataTransfer.dropEffect = "move";
        }
        item.classList.add("drag-target");
      });
      item.addEventListener("dragleave", function() {
        item.classList.remove("drag-target");
      });
      item.addEventListener("drop", function(event) {
        const payload = getDragPayload(event);
        item.classList.remove("drag-target");
        if (!payload || !canDropOnFolder(payload, folder.key)) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        if (payload.kind === "page") {
          onMovePage(payload.path, folder.key);
          return;
        }
        onMoveFolder(payload.path, folder.key);
      });
      const row = document.createElement("div");
      row.className = "page-tree-row";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "page-tree-toggle";
      button.setAttribute("aria-expanded", expandedPageFolders[folder.key] ? "true" : "false");
      makeDragSource(button, { kind: "folder", path: folder.key });
      button.addEventListener("click", function() {
        onToggleFolder(folder.key);
      });
      button.addEventListener("contextmenu", function(event) {
        event.preventDefault();
        event.stopPropagation();
        onOpenContextMenu({ kind: "folder", path: folder.key, name: folder.name }, event.clientX, event.clientY);
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
      label.title = folder.name;
      button.appendChild(chevron);
      button.appendChild(icon);
      button.appendChild(label);
      row.appendChild(button);
      item.appendChild(row);
      if (expandedPageFolders[folder.key]) {
        item.appendChild(renderPageTreeNode(folder, depth + 1, expandedPageFolders, selectedPage, onToggleFolder, onSelectPage, onCreatePage, onCreateSubfolder, onRenameFolder, onDeleteFolder, onRenamePage, onDeletePage, onOpenContextMenu, onMovePage, onMoveFolder));
      }
      group.appendChild(item);
    });
    node.pages.slice().sort(function(left, right) {
      return String(left.path).localeCompare(String(right.path));
    }).forEach(function(page) {
      const leafName = String(page.path || "").split("/").slice(-1)[0] || page.path;
      const item = document.createElement("div");
      item.className = "page-tree-node page-tree-leaf";
      makeDragSource(item, { kind: "page", path: page.path });
      const row = document.createElement("div");
      row.className = "page-tree-row";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "page-tree-page";
      makeDragSource(button, { kind: "page", path: page.path });
      if (selectedPage === page.path) {
        button.classList.add("active");
      }
      button.addEventListener("click", function() {
        onSelectPage(page.path);
      });
      button.addEventListener("contextmenu", function(event) {
        event.preventDefault();
        event.stopPropagation();
        onOpenContextMenu({ kind: "page", path: page.path, name: leafName }, event.clientX, event.clientY);
      });
      const icon = document.createElement("span");
      icon.className = "page-tree-icon";
      icon.textContent = "\u2022";
      const label = document.createElement("span");
      label.className = "page-tree-label";
      label.textContent = leafName;
      label.title = leafName;
      button.appendChild(icon);
      button.appendChild(label);
      row.appendChild(button);
      item.appendChild(row);
      group.appendChild(item);
    });
    return group;
  }
  function renderPagesTree(container, pages, selectedPage, expandedPageFolders, pageSearchQuery, onToggleFolder, onSelectPage, onCreatePage, onCreateSubfolder, onRenameFolder, onDeleteFolder, onRenamePage, onDeletePage, onOpenContextMenu, onMovePage, onMoveFolder) {
    clearNode(container);
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
    const rootRow = document.createElement("div");
    rootRow.className = "page-tree-root-drop";
    const rootLabel = document.createElement("div");
    rootLabel.className = "page-tree-root-label";
    rootLabel.textContent = "Vault root";
    rootRow.appendChild(rootLabel);
    const rootActions = document.createElement("div");
    rootActions.className = "page-tree-actions page-tree-actions-visible";
    const createRootNote = document.createElement("button");
    createRootNote.type = "button";
    createRootNote.className = "page-tree-action";
    createRootNote.title = "New root note";
    createRootNote.setAttribute("aria-label", "New root note");
    createRootNote.textContent = "+";
    createRootNote.addEventListener("click", function(event) {
      event.preventDefault();
      event.stopPropagation();
      onCreatePage("");
    });
    rootActions.appendChild(createRootNote);
    const createRootFolder = document.createElement("button");
    createRootFolder.type = "button";
    createRootFolder.className = "page-tree-action";
    createRootFolder.title = "New root folder";
    createRootFolder.setAttribute("aria-label", "New root folder");
    createRootFolder.textContent = "\u229E";
    createRootFolder.addEventListener("click", function(event) {
      event.preventDefault();
      event.stopPropagation();
      onCreateSubfolder("");
    });
    rootActions.appendChild(createRootFolder);
    rootRow.appendChild(rootActions);
    function isPointerOverRoot(event) {
      const hovered = document.elementFromPoint(event.clientX, event.clientY);
      return !!hovered && hovered.closest(".page-tree-root-drop") === rootRow;
    }
    function syncRootTarget(event, payload) {
      const canDrop = canDropOnRoot(payload) && isPointerOverRoot(event);
      rootRow.classList.toggle("drag-target", canDrop);
      return canDrop;
    }
    function handleRootDragOver(event) {
      const payload = getDragPayload(event);
      const isRootTarget = syncRootTarget(event, payload);
      if (!canDropOnRoot(payload)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "move";
      }
    }
    function handleRootDragEnter(event) {
      const payload = getDragPayload(event);
      const isRootTarget = syncRootTarget(event, payload);
      if (!canDropOnRoot(payload)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "move";
      }
    }
    function handleRootDragLeave() {
      rootRow.classList.remove("drag-target");
    }
    function handleRootDrop(event) {
      const payload = getDragPayload(event);
      const isRootTarget = syncRootTarget(event, payload);
      rootRow.classList.remove("drag-target");
      if (!payload || !canDropOnRoot(payload) || !isRootTarget) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (payload.kind === "page") {
        onMovePage(payload.path, "");
        return;
      }
      onMoveFolder(payload.path, "");
    }
    [rootRow, rootLabel, rootActions].forEach(function(element) {
      element.addEventListener("dragover", handleRootDragOver);
      element.addEventListener("dragenter", handleRootDragEnter);
      element.addEventListener("dragleave", handleRootDragLeave);
      element.addEventListener("drop", handleRootDrop);
    });
    container.appendChild(rootRow);
    if (!pages.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = pageSearchQuery ? "No indexed pages match the current search." : "No notes yet. Use + to create the first note.";
      container.appendChild(empty);
      return;
    }
    container.ondragover = function(event) {
      const payload = getDragPayload(event);
      if (!canDropOnRoot(payload)) {
        rootRow.classList.remove("drag-target");
        return;
      }
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "move";
      }
      container.classList.add("drag-target");
      syncRootTarget(event, payload);
    };
    container.ondragleave = function() {
      container.classList.remove("drag-target");
      rootRow.classList.remove("drag-target");
    };
    container.ondrop = function(event) {
      const payload = getDragPayload(event);
      container.classList.remove("drag-target");
      const isRootTarget = syncRootTarget(event, payload);
      rootRow.classList.remove("drag-target");
      if (!payload || !canDropOnRoot(payload)) {
        return;
      }
      event.preventDefault();
      if (!isRootTarget) {
        return;
      }
      if (payload.kind === "page") {
        onMovePage(payload.path, "");
        return;
      }
      onMoveFolder(payload.path, "");
    };
    container.appendChild(renderPageTreeNode(buildPageTree(pages), 0, expandedPageFolders, selectedPage, onToggleFolder, onSelectPage, onCreatePage, onCreateSubfolder, onRenameFolder, onDeleteFolder, onRenamePage, onDeletePage, onOpenContextMenu, onMovePage, onMoveFolder));
  }
  function filterTasks(tasks, filter) {
    if (!tasks || !tasks.length) {
      return [];
    }
    switch (filter) {
      case "not-done":
        return tasks.filter(function(task) {
          return !task.done;
        });
      case "has-due":
        return tasks.filter(function(task) {
          return Boolean(task.due);
        });
      case "has-reminder":
        return tasks.filter(function(task) {
          return Boolean(task.remind);
        });
      default:
        return tasks;
    }
  }
  function renderPageTasks(container, tasks, onSelectTask, onToggleTask, filter) {
    clearNode(container);
    const filtered = filterTasks(tasks, filter || "not-done");
    if (!filtered.length) {
      const label = filter === "all" ? "No tasks on this page." : "No matching tasks.";
      renderEmpty(container, tasks.length ? label : "No indexed tasks on this page.");
      return;
    }
    filtered.forEach(function(task) {
      const item = document.createElement("div");
      item.className = "page-task-item";
      if (task.done) {
        item.classList.add("page-task-done");
      }
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "page-task-checkbox";
      checkbox.checked = task.done;
      checkbox.title = task.done ? "Mark as not done" : "Mark as done";
      checkbox.addEventListener("click", function(event) {
        event.stopPropagation();
        onToggleTask(task);
      });
      item.appendChild(checkbox);
      const button = document.createElement("button");
      button.type = "button";
      button.addEventListener("click", function() {
        onSelectTask(task);
      });
      const title = document.createElement("span");
      title.className = "page-task-title";
      title.innerHTML = renderInline(task.text || task.ref);
      button.appendChild(title);
      const meta = document.createElement("div");
      meta.className = "page-task-meta";
      [
        task.due ? "due " + formatDateValue(task.due) : "no due",
        task.remind ? "remind " + formatDateTimeValue(task.remind) : "",
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
  var activeDragItem;
  var init_pageViews = __esm({
    "frontend/pageViews.ts"() {
      "use strict";
      init_dom();
      init_datetime();
      init_markdown();
      activeDragItem = null;
    }
  });

  // frontend/pageTreeUi.ts
  function updatePageListScrollState(pageList) {
    window.requestAnimationFrame(function() {
      const overflow = pageList.scrollHeight - pageList.clientHeight;
      pageList.classList.toggle("no-scroll", overflow <= 8);
    });
  }
  function renderPagesSection(state, els, actions, openTreeContextMenu2) {
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
        renderPagesSection(state, els, actions, openTreeContextMenu2);
      },
      function(pagePath) {
        actions.navigateToPage(pagePath, false);
      },
      function(folderKey) {
        const name = window.prompt('New note in "' + folderKey + '"', "");
        const normalizedName = normalizePageDraftPath(name || "");
        if (!normalizedName) {
          return;
        }
        actions.createPage(folderKey + "/" + normalizedName).catch(function(error) {
          actions.setNoteStatus("Create page failed: " + actions.errorMessage(error));
        });
      },
      function(folderKey) {
        const subfolder = normalizePageDraftPath(window.prompt('New subfolder in "' + folderKey + '"', "") || "");
        if (!subfolder) {
          return;
        }
        const initialNote = normalizePageDraftPath(window.prompt('Initial note inside "' + subfolder + '"', "index") || "");
        if (!initialNote) {
          return;
        }
        actions.createPage(folderKey + "/" + subfolder + "/" + initialNote).catch(function(error) {
          actions.setNoteStatus("Create folder failed: " + actions.errorMessage(error));
        });
      },
      function(folderKey) {
        const currentName = pageTitleFromPath(folderKey);
        const nextName = normalizePageDraftPath(window.prompt('Rename folder "' + currentName + '"', currentName) || "");
        if (!nextName || nextName === currentName) {
          return;
        }
        actions.renameFolder(folderKey, nextName).catch(function(error) {
          actions.setNoteStatus("Rename folder failed: " + actions.errorMessage(error));
        });
      },
      function(folderKey) {
        actions.deleteFolder(folderKey).catch(function(error) {
          actions.setNoteStatus("Delete folder failed: " + actions.errorMessage(error));
        });
      },
      function(pagePath) {
        const currentName = pageTitleFromPath(pagePath);
        const nextName = normalizePageDraftPath(window.prompt('Rename note "' + currentName + '"', currentName) || "");
        if (!nextName || nextName === currentName) {
          return;
        }
        actions.renamePage(pagePath, nextName).catch(function(error) {
          actions.setNoteStatus("Rename note failed: " + actions.errorMessage(error));
        });
      },
      function(pagePath) {
        actions.deletePage(pagePath).catch(function(error) {
          actions.setNoteStatus("Delete page failed: " + actions.errorMessage(error));
        });
      },
      function(target, left, top) {
        openTreeContextMenu2(target, left, top);
      },
      function(pagePath, folderKey) {
        actions.movePageToFolder(pagePath, folderKey).catch(function(error) {
          actions.setNoteStatus("Move page failed: " + actions.errorMessage(error));
        });
      },
      function(folderKey, targetFolder) {
        actions.moveFolder(folderKey, targetFolder).catch(function(error) {
          actions.setNoteStatus("Move folder failed: " + actions.errorMessage(error));
        });
      }
    );
    updatePageListScrollState(els.pageList);
  }
  function closeTreeContextMenu(treeContextMenu) {
    treeContextMenu.classList.add("hidden");
    clearNode(treeContextMenu);
  }
  function positionTreeContextMenu(treeContextMenu, left, top) {
    const width = treeContextMenu.offsetWidth || 220;
    const height = treeContextMenu.offsetHeight || 200;
    const maxLeft = Math.max(12, window.innerWidth - width - 12);
    const maxTop = Math.max(12, window.innerHeight - height - 12);
    treeContextMenu.style.left = Math.max(12, Math.min(left, maxLeft)) + "px";
    treeContextMenu.style.top = Math.max(12, Math.min(top, maxTop)) + "px";
  }
  function appendTreeContextMenuItem(treeContextMenu, label, iconPath, onSelect, danger) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = danger ? "tree-context-menu-item danger" : "tree-context-menu-item";
    button.setAttribute("role", "menuitem");
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("viewBox", "0 0 16 16");
    icon.setAttribute("aria-hidden", "true");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", iconPath);
    path.setAttribute("fill", "currentColor");
    icon.appendChild(path);
    button.appendChild(icon);
    const text = document.createElement("span");
    text.textContent = label;
    button.appendChild(text);
    button.addEventListener("click", function() {
      closeTreeContextMenu(treeContextMenu);
      onSelect();
    });
    treeContextMenu.appendChild(button);
  }
  function appendTreeContextMenuDivider(treeContextMenu) {
    const divider = document.createElement("div");
    divider.className = "tree-context-menu-divider";
    treeContextMenu.appendChild(divider);
  }
  function openTreeContextMenu(treeContextMenu, target, left, top, actions) {
    clearNode(treeContextMenu);
    if (target.kind === "page") {
      appendTreeContextMenuItem(treeContextMenu, "Open note", "M3 2.5h5.7L13 6.8V13a1 1 0 0 1-1 1H3.9a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1Zm5 .9v3.2h3.2", function() {
        actions.navigateToPage(target.path, false);
      });
      appendTreeContextMenuItem(
        treeContextMenu,
        actions.currentHomePage().toLowerCase() === target.path.toLowerCase() ? "Home Page Already Set" : "Set as Homepage",
        "M8 1.8 14.2 7H13v6.2a1 1 0 0 1-1 1H9V10H7v4.2H4a1 1 0 0 1-1-1V7H1.8L8 1.8Z",
        function() {
          if (actions.currentHomePage().toLowerCase() === target.path.toLowerCase()) {
            actions.setNoteStatus("Home page already set to " + target.path + ".");
            return;
          }
          actions.setHomePage(target.path);
          actions.setNoteStatus("Home page set to " + target.path + ".");
        }
      );
      appendTreeContextMenuItem(treeContextMenu, "Show version history", "M8 2.2a5.8 5.8 0 1 0 4.1 1.7l.9-.9v2.8H10l1.1-1.1A4.4 4.4 0 1 1 8 3.6v1.1l2.3 1.4-.7 1.1L7.4 6V2.2H8Z", function() {
        actions.openPageHistory(target.path);
      });
      appendTreeContextMenuDivider(treeContextMenu);
      appendTreeContextMenuItem(treeContextMenu, "Rename\u2026", "M11.72 1.72a1.5 1.5 0 0 1 2.12 2.12l-7.3 7.3-3.13.75.75-3.13 7.56-7.04zm-6.42 7.54-.38 1.56 1.56-.38 6.3-6.3-.9-.9-6.58 6.02z", function() {
        const currentName = pageTitleFromPath(target.path);
        const nextName = normalizePageDraftPath(window.prompt('Rename note "' + currentName + '"', currentName) || "");
        if (!nextName || nextName === currentName) {
          return;
        }
        actions.renamePage(target.path, nextName).catch(function(error) {
          actions.setNoteStatus("Rename note failed: " + actions.errorMessage(error));
        });
      });
      appendTreeContextMenuItem(treeContextMenu, "Delete", "M5.2 3h5.6l.4 1.2H14v1.2H2V4.2h2.8L5.2 3Zm-1 3.2h7.6l-.5 6.1a1 1 0 0 1-1 .9H5.7a1 1 0 0 1-1-.9L4.2 6.2Z", function() {
        actions.deletePage(target.path).catch(function(error) {
          actions.setNoteStatus("Delete page failed: " + actions.errorMessage(error));
        });
      }, true);
    } else {
      appendTreeContextMenuItem(treeContextMenu, "New note", "M8 2.5v11M2.5 8h11", function() {
        const name = window.prompt('New note in "' + target.name + '"', "");
        const normalizedName = normalizePageDraftPath(name || "");
        if (!normalizedName) {
          return;
        }
        actions.createPage(target.path + "/" + normalizedName).catch(function(error) {
          actions.setNoteStatus("Create page failed: " + actions.errorMessage(error));
        });
      });
      appendTreeContextMenuItem(treeContextMenu, "New subfolder", "M8 2.5v11M2.5 8h11", function() {
        const subfolder = normalizePageDraftPath(window.prompt('New subfolder in "' + target.name + '"', "") || "");
        if (!subfolder) {
          return;
        }
        const initialNote = normalizePageDraftPath(window.prompt('Initial note inside "' + subfolder + '"', "index") || "");
        if (!initialNote) {
          return;
        }
        actions.createPage(target.path + "/" + subfolder + "/" + initialNote).catch(function(error) {
          actions.setNoteStatus("Create folder failed: " + actions.errorMessage(error));
        });
      });
      appendTreeContextMenuDivider(treeContextMenu);
      appendTreeContextMenuItem(treeContextMenu, "Rename\u2026", "M11.72 1.72a1.5 1.5 0 0 1 2.12 2.12l-7.3 7.3-3.13.75.75-3.13 7.56-7.04zm-6.42 7.54-.38 1.56 1.56-.38 6.3-6.3-.9-.9-6.58 6.02z", function() {
        const currentName = pageTitleFromPath(target.path);
        const nextName = normalizePageDraftPath(window.prompt('Rename folder "' + currentName + '"', currentName) || "");
        if (!nextName || nextName === currentName) {
          return;
        }
        actions.renameFolder(target.path, nextName).catch(function(error) {
          actions.setNoteStatus("Rename folder failed: " + actions.errorMessage(error));
        });
      });
      appendTreeContextMenuItem(treeContextMenu, "Delete", "M5.2 3h5.6l.4 1.2H14v1.2H2V4.2h2.8L5.2 3Zm-1 3.2h7.6l-.5 6.1a1 1 0 0 1-1 .9H5.7a1 1 0 0 1-1-.9L4.2 6.2Z", function() {
        actions.deleteFolder(target.path).catch(function(error) {
          actions.setNoteStatus("Delete folder failed: " + actions.errorMessage(error));
        });
      }, true);
    }
    treeContextMenu.classList.remove("hidden");
    window.requestAnimationFrame(function() {
      positionTreeContextMenu(treeContextMenu, left, top);
    });
  }
  var init_pageTreeUi = __esm({
    "frontend/pageTreeUi.ts"() {
      "use strict";
      init_commands();
      init_dom();
      init_pageViews();
    }
  });

  // frontend/settingsPersistence.ts
  function prepareSettingsSave(collectClientPreferences, collectUserSettings, collectServerSettings, applyClientPreferences) {
    const clientPreferences = collectClientPreferences();
    const userSettings = collectUserSettings();
    const serverSettings = collectServerSettings();
    applyClientPreferences(clientPreferences);
    return {
      clientPreferences,
      userSettings,
      serverSettings
    };
  }
  var init_settingsPersistence = __esm({
    "frontend/settingsPersistence.ts"() {
      "use strict";
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
    const text = kind === "date" ? formatEditableDateValue(String(value || "")) : kind === "datetime" ? formatEditableDateTimeValue(String(value || "")) : displayFrontmatterValue(value);
    return {
      originalKey: originalKey || key || "",
      key: key || "",
      kind,
      text: kind === "list" ? "" : text,
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
    if (draft.kind === "date") {
      return parseEditableDateValue(String(draft.text || ""));
    }
    if (draft.kind === "datetime") {
      return parseEditableDateTimeValue(String(draft.text || ""));
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
    input.type = "text";
    input.value = kind === "date" ? formatEditableDateValue(String(row.rawValue || "")) : kind === "datetime" ? formatEditableDateTimeValue(String(row.rawValue || "")) : String(row.rawValue || "");
    input.placeholder = kind === "date" ? editableDatePlaceholder() : kind === "datetime" ? editableDateTimePlaceholder() : "";
    const commit = function() {
      try {
        const rawValue = input.value;
        const nextValue = kind === "date" ? parseEditableDateValue(rawValue) : kind === "datetime" ? parseEditableDateTimeValue(rawValue) : rawValue;
        const normalizedCurrent = String(row.rawValue || "");
        if (nextValue === normalizedCurrent) {
          return;
        }
        options.onSaveExistingProperty(row.key, nextValue).catch(function(error) {
          options.onSetNoteStatus("Property save failed: " + error.message);
        });
      } catch (error) {
        options.onSetNoteStatus("Property save failed: " + (error instanceof Error ? error.message : String(error)));
      }
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
      input.type = "text";
      input.value = String(draft.text || "");
      input.placeholder = draft.kind === "date" ? editableDatePlaceholder() : draft.kind === "datetime" ? editableDateTimePlaceholder() : "";
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
      init_datetime();
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

  // frontend/sessionUi.ts
  function canSwitchVault(state) {
    return state.authenticated && state.availableVaults.some(function(vault) {
      return !state.currentVault || vault.id !== state.currentVault.id;
    });
  }
  function applyAuthSessionResponse(state, session) {
    state.authenticated = Boolean(session.authenticated);
    state.currentUser = state.authenticated && session.user ? session.user : null;
    state.currentVault = state.authenticated && session.vault ? session.vault : null;
    if (!state.authenticated) {
      state.availableVaults = [];
      state.vaultSwitchPending = false;
    }
    state.mustChangePassword = Boolean(state.currentUser && state.currentUser.mustChangePassword);
    state.setupRequired = Boolean(!state.authenticated && session.setupRequired);
    state.authGateMode = state.mustChangePassword ? "changePassword" : state.setupRequired ? "setup" : "login";
  }
  function renderAuthGate(state, els) {
    const setupRequired = state.authGateMode === "setup";
    const mustChangePassword = state.authGateMode === "changePassword";
    if (mustChangePassword) {
      els.authEyebrow.textContent = "Password Rotation";
      els.authTitle.textContent = "Rotate Bootstrap Password";
      els.authCopy.textContent = "This session is using a generated bootstrap credential. Set a new password before loading notes, queries, documents, history, or live events.";
    } else if (setupRequired) {
      els.authEyebrow.textContent = "Welcome";
      els.authTitle.textContent = "Who Are You?";
      els.authCopy.textContent = "Set up this installation with the username and password you want to use here.";
    } else {
      els.authEyebrow.textContent = "Auth Required";
      els.authTitle.textContent = "Sign In To Noterious";
      els.authCopy.textContent = "The server now requires a session before loading notes, queries, documents, history, or live events.";
    }
    els.authIdentity.classList.toggle("hidden", !mustChangePassword);
    if (mustChangePassword && state.currentUser) {
      els.authIdentity.textContent = "Signed in as " + state.currentUser.username + ".";
    } else {
      els.authIdentity.textContent = "";
    }
    els.authUsernameRow.classList.toggle("hidden", mustChangePassword);
    els.authPasswordRow.classList.toggle("hidden", mustChangePassword);
    els.authSetupConfirmRow.classList.toggle("hidden", !setupRequired);
    els.authChangeFields.classList.toggle("hidden", !mustChangePassword);
    els.authSubmit.textContent = mustChangePassword ? "Update Password" : setupRequired ? "Set Up Account" : "Sign In";
  }
  function setAuthGateOpen(state, els, open, status) {
    renderAuthGate(state, els);
    els.authShell.classList.toggle("hidden", !open);
    if (els.appShell) {
      if (open) {
        els.appShell.setAttribute("inert", "");
      } else {
        els.appShell.removeAttribute("inert");
      }
    }
    if (typeof status === "string") {
      els.authStatus.textContent = status;
    } else if (!open) {
      els.authStatus.textContent = "";
    }
    if (!open) {
      return;
    }
    window.setTimeout(function() {
      if (state.authGateMode === "changePassword") {
        if (els.authCurrentPassword.value.trim()) {
          els.authNewPassword.focus();
          return;
        }
        els.authCurrentPassword.focus();
        return;
      }
      if (state.authGateMode === "setup") {
        if (els.authUsername.value.trim()) {
          els.authPassword.focus();
          return;
        }
        els.authUsername.focus();
        return;
      }
      if (els.authUsername.value.trim()) {
        els.authPassword.focus();
        return;
      }
      els.authUsername.focus();
    }, 0);
  }
  function setVaultSwitcherOpen(state, els, open) {
    state.vaultSwitcherOpen = canSwitchVault(state) && open;
    els.vaultSwitcherPanel.classList.toggle("hidden", !state.vaultSwitcherOpen);
    els.openVaultSwitcher.setAttribute("aria-expanded", state.vaultSwitcherOpen ? "true" : "false");
  }
  function setSessionMenuOpen(state, els, open) {
    if (!state.authenticated) {
      open = false;
    }
    els.sessionMenuPanel.classList.toggle("hidden", !open);
    els.openSessionMenu.setAttribute("aria-expanded", open ? "true" : "false");
  }
  function renderSessionState(state, els, onSwitchVault) {
    const username = state.currentUser && state.currentUser.username ? state.currentUser.username : "Sign In";
    els.sessionUser.textContent = username;
    els.logoutSession.classList.toggle("hidden", !state.authenticated);
    els.openSessionMenu.title = state.authenticated ? "Session menu" : "Open sign in";
    if (!state.authenticated) {
      setSessionMenuOpen(state, els, false);
    }
    const hasCurrentVault = state.authenticated && Boolean(state.currentVault);
    const canToggleVaults = canSwitchVault(state);
    els.vaultSwitcher.classList.toggle("hidden", !hasCurrentVault);
    els.currentVaultName.textContent = state.currentVault && state.currentVault.name ? state.currentVault.name : "Vault";
    els.openVaultSwitcher.disabled = !canToggleVaults || state.vaultSwitchPending;
    clearNode(els.vaultSwitcherList);
    if (!hasCurrentVault || !canToggleVaults) {
      setVaultSwitcherOpen(state, els, false);
      return;
    }
    state.availableVaults.forEach(function(vault) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "vault-switcher-item";
      if (state.currentVault && vault.id === state.currentVault.id) {
        button.classList.add("active");
      }
      button.disabled = state.vaultSwitchPending;
      button.addEventListener("click", function() {
        onSwitchVault(vault.id);
      });
      const title = document.createElement("strong");
      title.textContent = vault.name || vault.key || "Vault " + String(vault.id);
      button.appendChild(title);
      if (state.currentVault && vault.id === state.currentVault.id) {
        const meta = document.createElement("span");
        meta.textContent = "Current";
        button.appendChild(meta);
      }
      els.vaultSwitcherList.appendChild(button);
    });
    els.vaultSwitcherPanel.classList.toggle("hidden", !state.vaultSwitcherOpen);
    els.openVaultSwitcher.setAttribute("aria-expanded", state.vaultSwitcherOpen ? "true" : "false");
  }
  var init_sessionUi = __esm({
    "frontend/sessionUi.ts"() {
      "use strict";
      init_dom();
    }
  });

  // frontend/settingsUi.ts
  function defaultSettingsSection() {
    return "appearance";
  }
  function availableSettingsSections() {
    return ["appearance", "notifications", "vault"];
  }
  function normalizeSettingsSection(state) {
    if (!availableSettingsSections().includes(state.settingsSection)) {
      state.settingsSection = defaultSettingsSection();
    }
  }
  function renderSettingsModal(state, els) {
    normalizeSettingsSection(state);
    els.settingsEyebrow.textContent = "";
    els.settingsTitle.textContent = "Settings";
    const activeSection = state.settingsSection;
    const navButtons = [
      { button: els.settingsNavAppearance, section: "appearance" },
      { button: els.settingsNavNotifications, section: "notifications" },
      { button: els.settingsNavVault, section: "vault" }
    ];
    navButtons.forEach(function(entry) {
      const visible = availableSettingsSections().includes(entry.section);
      entry.button.classList.toggle("hidden", !visible);
      entry.button.classList.toggle("active", visible && activeSection === entry.section);
      entry.button.setAttribute("aria-current", visible && activeSection === entry.section ? "page" : "false");
    });
    els.settingsGroupSession.classList.toggle("hidden", activeSection !== "appearance");
    els.settingsGroupUserNotifications.classList.toggle("hidden", activeSection !== "notifications");
    els.settingsGroupServer.classList.toggle("hidden", activeSection !== "vault");
    els.saveSettings.classList.remove("hidden");
    els.saveSettings.textContent = "Save Settings";
  }
  function renderSettingsForm(state, els) {
    renderSettingsModal(state, els);
    const serverFields = [
      els.settingsVaultPath,
      els.settingsNtfyInterval
    ];
    const userFields = [
      els.settingsUserNtfyTopicUrl,
      els.settingsUserNtfyToken,
      els.settingsUserTopLevelVaults,
      els.settingsFontFamily,
      els.settingsFontSize,
      els.settingsDateTimeFormat,
      els.settingsTheme,
      els.settingsQuickSwitcher,
      els.settingsGlobalSearch,
      els.settingsCommandPalette,
      els.settingsQuickNote,
      els.settingsHelp,
      els.settingsSaveCurrentPage,
      els.settingsToggleRawMode,
      els.settingsToggleTaskDone
    ];
    serverFields.forEach(function(field) {
      field.disabled = !state.settingsLoaded;
    });
    userFields.forEach(function(field) {
      field.disabled = false;
    });
    els.settingsThemeUpload.disabled = false;
    els.settingsThemeDelete.disabled = false;
    if (!state.settingsLoaded) {
      els.saveSettings.disabled = true;
      els.settingsStatus.textContent = "";
      return;
    }
    els.saveSettings.disabled = false;
    els.settingsVaultPath.value = state.settings.vault.vaultPath || "";
    els.settingsNtfyInterval.value = state.settings.notifications.ntfyInterval || "1m";
    els.settingsUserNtfyTopicUrl.value = state.settings.userNotifications.ntfyTopicUrl || "";
    els.settingsUserNtfyToken.value = state.settings.userNotifications.ntfyToken || "";
    els.settingsUserTopLevelVaults.checked = state.topLevelFoldersAsVaults;
    renderThemeOptions(state, els);
    els.settingsFontFamily.value = state.settings.preferences.ui.fontFamily || "mono";
    els.settingsFontSize.value = state.settings.preferences.ui.fontSize || "16";
    els.settingsDateTimeFormat.value = state.settings.preferences.ui.dateTimeFormat || "browser";
    els.settingsTheme.value = state.settings.preferences.ui.themeId || "noterious-night";
    const selectedTheme = state.themeLibrary.find(function(theme) {
      return theme.id === els.settingsTheme.value;
    }) || null;
    const themeControlsDisabled = !state.themeLibraryLoaded && state.themeLibrary.length === 0;
    els.settingsTheme.disabled = themeControlsDisabled;
    els.settingsThemeUpload.disabled = themeControlsDisabled;
    els.settingsThemeDelete.disabled = themeControlsDisabled || !selectedTheme || selectedTheme.source !== "custom";
    els.settingsThemeHelp.textContent = "Built-in themes are always available. Upload JSON token themes to add custom ones.";
    els.settingsQuickSwitcher.value = state.settings.preferences.hotkeys.quickSwitcher || "";
    els.settingsGlobalSearch.value = state.settings.preferences.hotkeys.globalSearch || "";
    els.settingsCommandPalette.value = state.settings.preferences.hotkeys.commandPalette || "";
    els.settingsQuickNote.value = state.settings.preferences.hotkeys.quickNote || "";
    els.settingsHelp.value = state.settings.preferences.hotkeys.help || "";
    els.settingsSaveCurrentPage.value = state.settings.preferences.hotkeys.saveCurrentPage || "";
    els.settingsToggleRawMode.value = state.settings.preferences.hotkeys.toggleRawMode || "";
    els.settingsToggleTaskDone.value = state.settings.preferences.hotkeys.toggleTaskDone || "";
  }
  function renderThemeOptions(state, els) {
    const selectedValue = els.settingsTheme.value || state.settings.preferences.ui.themeId || "noterious-night";
    els.settingsTheme.textContent = "";
    const themes = Array.isArray(state.themeLibrary) ? state.themeLibrary.slice() : [];
    themes.sort(function(left, right) {
      if (left.source !== right.source) {
        return left.source === "builtin" ? -1 : 1;
      }
      return left.name.localeCompare(right.name);
    });
    themes.forEach(function(theme) {
      const option = document.createElement("option");
      option.value = theme.id;
      option.textContent = theme.source === "custom" ? theme.name + " (Custom)" : theme.name;
      els.settingsTheme.appendChild(option);
    });
    if (themes.length === 0) {
      const option = document.createElement("option");
      option.value = "noterious-night";
      option.textContent = "Noterious Night";
      els.settingsTheme.appendChild(option);
    }
    els.settingsTheme.value = themes.some(function(theme) {
      return theme.id === selectedValue;
    }) ? selectedValue : "noterious-night";
  }
  var init_settingsUi = __esm({
    "frontend/settingsUi.ts"() {
      "use strict";
    }
  });

  // frontend/slashMenu.ts
  function fuzzyMatch(haystack, query) {
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
  function slashSearchTokens(command) {
    return [command.id, command.title, command.keywords || ""].join(" ").toLowerCase().split(/[^a-z0-9]+/i).map(function(token) {
      return token.trim();
    }).filter(Boolean);
  }
  function replaceSlashToken(lineText, _commandName, replacement) {
    const source = String(lineText || "");
    const pattern = /(?:^|\s)\/[a-z0-9-]*\s*$/i;
    const updated = source.replace(pattern, "");
    if (!updated.trim()) {
      return replacement;
    }
    return updated.replace(/\s+$/, "") + " " + replacement;
  }
  function prefixLine(lineText, commandName, prefix) {
    const source = replaceSlashToken(lineText, commandName, "").trim();
    return source ? prefix + source : prefix;
  }
  function todayDate() {
    const now = /* @__PURE__ */ new Date();
    return [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0")
    ].join("-");
  }
  function currentDateTime() {
    const now = /* @__PURE__ */ new Date();
    return todayDate() + " " + [
      String(now.getHours()).padStart(2, "0"),
      String(now.getMinutes()).padStart(2, "0")
    ].join(":");
  }
  function appendField(lineText, commandName, fieldText) {
    const source = replaceSlashToken(lineText, commandName, "").trimEnd();
    return source ? source + " " + fieldText : fieldText;
  }
  function slashCommandCatalog() {
    return [
      {
        id: "task",
        title: "Insert task",
        description: "Turn the current line into a checkbox item.",
        keywords: "todo checkbox checklist",
        hint: "/task",
        apply: function(lineText) {
          return prefixLine(lineText, "task", "- [ ] ");
        }
      },
      {
        id: "bullet",
        title: "Insert bullet list",
        description: "Turn the current line into a bullet list item.",
        keywords: "list unordered dash",
        hint: "/bullet",
        apply: function(lineText) {
          return prefixLine(lineText, "bullet", "- ");
        }
      },
      {
        id: "number",
        title: "Insert numbered list",
        description: "Turn the current line into a numbered list item.",
        keywords: "list ordered numbered",
        hint: "/number",
        apply: function(lineText) {
          return prefixLine(lineText, "number", "1. ");
        }
      },
      {
        id: "h1",
        title: "Heading 1",
        description: "Insert a level 1 heading.",
        keywords: "header title heading",
        hint: "/h1",
        apply: function(lineText) {
          return prefixLine(lineText, "h1", "# ");
        }
      },
      {
        id: "h2",
        title: "Heading 2",
        description: "Insert a level 2 heading.",
        keywords: "header heading",
        hint: "/h2",
        apply: function(lineText) {
          return prefixLine(lineText, "h2", "## ");
        }
      },
      {
        id: "h3",
        title: "Heading 3",
        description: "Insert a level 3 heading.",
        keywords: "header heading",
        hint: "/h3",
        apply: function(lineText) {
          return prefixLine(lineText, "h3", "### ");
        }
      },
      {
        id: "quote",
        title: "Insert blockquote",
        description: "Turn the current line into a blockquote.",
        keywords: "blockquote cite",
        hint: "/quote",
        apply: function(lineText) {
          return prefixLine(lineText, "quote", "> ");
        }
      },
      {
        id: "code",
        title: "Insert code block",
        description: "Replace the current line with a fenced code block.",
        keywords: "fence snippet",
        hint: "/code",
        apply: function() {
          return "```\n\n```";
        }
      },
      {
        id: "callout",
        title: "Insert callout",
        description: "Replace the current line with an Obsidian-style callout.",
        keywords: "note tip warning admonition",
        hint: "/callout",
        apply: function() {
          return "> [!note]\n> ";
        }
      },
      {
        id: "table",
        title: "Insert table",
        description: "Replace the current line with a simple markdown table.",
        keywords: "table grid columns rows",
        hint: "/table",
        apply: function() {
          return "| Column | Value |\n| --- | --- |\n|  |  |\n";
        },
        caret: function(updatedLine) {
          return updatedLine.length;
        }
      },
      {
        id: "due",
        title: "Insert due date",
        description: "Append a due field with today's date.",
        keywords: "task due date schedule deadline",
        hint: "/due",
        apply: function(lineText) {
          return appendField(lineText, "due", "[due: " + todayDate() + "]");
        }
      },
      {
        id: "remind",
        title: "Insert reminder",
        description: "Append a remind field with the current date and time.",
        keywords: "task remind reminder notify notification",
        hint: "/remind",
        apply: function(lineText) {
          return appendField(lineText, "remind", "[remind: " + currentDateTime() + "]");
        }
      }
    ];
  }
  function parseSlashQuery(text) {
    const raw = String(text || "");
    const trimmed = raw.trimEnd();
    const match = trimmed.match(/(?:^|\s)\/([a-z0-9-]*)$/i);
    if (!match) {
      return null;
    }
    return String(match[1] || "").toLowerCase();
  }
  function slashCommandsForText(text) {
    const query = parseSlashQuery(text);
    if (query === null) {
      return [];
    }
    return slashCommandCatalog().filter(function(command) {
      return slashSearchTokens(command).some(function(token) {
        return token.indexOf(query) === 0 || fuzzyMatch(token, query);
      });
    });
  }
  function findWikilinkTrigger(lineText, caretInLine) {
    const beforeCaret = String(lineText || "").slice(0, Math.max(0, caretInLine));
    const match = beforeCaret.match(/(!?)\[\[([^\]\n]*)$/);
    if (!match) {
      return null;
    }
    return {
      start: beforeCaret.length - match[0].length,
      end: beforeCaret.length,
      query: String(match[2] || "").trim().toLowerCase(),
      embed: match[1] === "!"
    };
  }
  function findDocumentTrigger(lineText) {
    const trimmed = String(lineText || "").trim();
    const match = trimmed.match(/^\/([a-z-]+)(?:\s+(.*))?$/i);
    if (!match) {
      return null;
    }
    const alias = String(match[1] || "").toLowerCase();
    if (["doc", "docs", "document", "documents", "attach", "file"].indexOf(alias) === -1) {
      return null;
    }
    return {
      alias,
      query: String(match[2] || "").trim().toLowerCase()
    };
  }
  function scorePage2(page, query) {
    const path = String(page.path || "").toLowerCase();
    const leaf = pageLeafName(page.path).toLowerCase();
    const title = String(page.title || "").toLowerCase();
    if (!query) {
      return page.updatedAt ? Date.parse(page.updatedAt) || 0 : 0;
    }
    return (path === query ? 5e3 : 0) + (leaf === query ? 4500 : 0) + (leaf.startsWith(query) ? 3200 : 0) + (path.startsWith(query) ? 2800 : 0) + (title.startsWith(query) ? 2400 : 0) + (path.indexOf(query) >= 0 ? 1200 : 0) + (title.indexOf(query) >= 0 ? 900 : 0);
  }
  function wikilinkCommandsForContext(lineText, caretInLine, pages) {
    const trigger = findWikilinkTrigger(lineText, caretInLine);
    if (!trigger) {
      return [];
    }
    const matches = pages.filter(function(page) {
      if (!trigger.query) {
        return true;
      }
      const haystack = [page.path, page.title || ""].join(" ").toLowerCase();
      return haystack.indexOf(trigger.query) >= 0;
    }).sort(function(left, right) {
      return scorePage2(right, trigger.query) - scorePage2(left, trigger.query);
    }).slice(0, 12);
    const normalizedDraftPath = normalizePageDraftPath(trigger.query);
    const hasExactMatch = normalizedDraftPath ? pages.some(function(page) {
      return String(page.path || "").toLowerCase() === normalizedDraftPath.toLowerCase();
    }) : false;
    const createCommands = normalizedDraftPath && !hasExactMatch ? [{
      id: "create:" + normalizedDraftPath,
      title: "Create note",
      description: normalizedDraftPath,
      keywords: "create new note page",
      hint: "Enter",
      apply: function(sourceLine) {
        const replacement = (trigger.embed ? "![[" : "[[") + normalizedDraftPath + "]]";
        return String(sourceLine || "").slice(0, trigger.start) + replacement + String(sourceLine || "").slice(trigger.end);
      },
      caret: function() {
        const replacement = (trigger.embed ? "![[" : "[[") + normalizedDraftPath + "]]";
        return trigger.start + replacement.length;
      }
    }] : [];
    return matches.map(function(page) {
      const replacement = (trigger.embed ? "![[" : "[[") + page.path + "]]";
      const titleLeaf = pageLeafName(page.path);
      return {
        id: page.path,
        title: titleLeaf,
        description: page.title && page.title !== titleLeaf ? page.path + " \xB7 " + page.title : page.path,
        hint: trigger.embed ? "![[" : "[[",
        apply: function(sourceLine) {
          return String(sourceLine || "").slice(0, trigger.start) + replacement + String(sourceLine || "").slice(trigger.end);
        },
        caret: function() {
          return trigger.start + replacement.length;
        }
      };
    }).concat(createCommands);
  }
  function documentCommandsForText(text, documents, currentPagePath) {
    const trigger = findDocumentTrigger(text);
    if (!trigger) {
      return [];
    }
    const matches = documents.filter(function(document2) {
      if (!trigger.query) {
        return true;
      }
      const haystack = [document2.name, document2.contentType].join(" ").toLowerCase();
      return haystack.indexOf(trigger.query) >= 0;
    }).slice().sort(function(left, right) {
      const leftCreated = left.createdAt ? Date.parse(left.createdAt) || 0 : 0;
      const rightCreated = right.createdAt ? Date.parse(right.createdAt) || 0 : 0;
      return rightCreated - leftCreated;
    }).slice(0, 12);
    return matches.map(function(document2) {
      const link = markdownLinkForDocument(document2, currentPagePath);
      return {
        id: document2.id,
        title: document2.name,
        description: document2.contentType || "document",
        hint: "/" + trigger.alias,
        apply: function() {
          return link;
        },
        caret: function() {
          return link.length;
        }
      };
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
    resultButtons(elements.slashMenuResults).forEach(function(item, index) {
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
      button.className = "search-result-item slash-menu-item" + (index === state.slashSelectionIndex ? " active" : "");
      button.tabIndex = -1;
      button.addEventListener("mousedown", function(event) {
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
      hint.textContent = command.hint || "/" + command.id;
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
  function moveSlashSelection(state, elements, delta) {
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
  function maybeOpenSlashMenu(state, elements, editor, lineText, context, onApplySelection) {
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
      top: Math.max(0, typeof context.top === "number" ? context.top : editorRect.bottom + 4),
      type: context.type,
      lineIndex: context.lineIndex
    }, onApplySelection);
  }
  function openSlashMenuWithCommands(state, elements, editor, commands, context, onApplySelection) {
    if (!commands.length) {
      closeSlashMenu(state, elements);
      return;
    }
    const editorRect = editor.getBoundingClientRect();
    openSlashMenu(state, elements, commands, {
      editor: context.editor || editor,
      commands,
      left: Math.max(0, typeof context.left === "number" ? context.left : editorRect.left),
      top: Math.max(0, typeof context.top === "number" ? context.top : editorRect.bottom + 4),
      type: context.type,
      lineIndex: context.lineIndex
    }, onApplySelection);
  }
  var init_slashMenu = __esm({
    "frontend/slashMenu.ts"() {
      "use strict";
      init_dom();
      init_documents();
      init_commands();
      init_palette();
      init_palette();
    }
  });

  // frontend/themes.ts
  function builtinThemeLibrary() {
    return builtinThemes.map(cloneThemeRecord);
  }
  function builtinThemeMap() {
    const result = {};
    builtinThemeLibrary().forEach(function(theme) {
      result[theme.id] = theme;
    });
    return result;
  }
  function cloneThemeRecord(theme) {
    return {
      version: Number(theme.version) || 1,
      id: String(theme.id || "").trim(),
      name: String(theme.name || "").trim(),
      source: theme.source === "custom" ? "custom" : "builtin",
      kind: theme.kind === "light" ? "light" : "dark",
      description: String(theme.description || "").trim(),
      tokens: normalizeThemeTokens(theme.tokens)
    };
  }
  function normalizeThemeTokens(input) {
    const source = input && typeof input === "object" ? input : {};
    const defaults = builtinThemes[0].tokens;
    const result = {};
    tokenKeys.forEach(function(key) {
      const value = String(source[key] ?? defaults[key] ?? "").trim();
      result[key] = value || defaults[key];
    });
    return result;
  }
  function normalizeThemeRecord(input) {
    const source = input && typeof input === "object" ? input : null;
    if (!source) {
      return null;
    }
    const id = String(source.id || "").trim();
    const name = String(source.name || "").trim();
    if (!id || !name) {
      return null;
    }
    return {
      version: Number(source.version) || 1,
      id,
      name,
      source: source.source === "custom" ? "custom" : "builtin",
      kind: source.kind === "light" ? "light" : "dark",
      description: String(source.description || "").trim(),
      tokens: normalizeThemeTokens(source.tokens)
    };
  }
  function normalizeThemeListResponse(input) {
    const source = input && typeof input === "object" ? input : {};
    const themes = Array.isArray(source.themes) ? source.themes.map(normalizeThemeRecord).filter(Boolean) : [];
    return {
      themes,
      count: Number(source.count) || themes.length
    };
  }
  function loadStoredThemeCache() {
    try {
      const raw = window.localStorage.getItem(themeCacheStorageKey);
      if (!raw) {
        return {};
      }
      const source = JSON.parse(raw);
      if (!source || typeof source !== "object") {
        return {};
      }
      const result = {};
      Object.keys(source).forEach(function(id) {
        const theme = normalizeThemeRecord(source[id]);
        if (theme) {
          result[theme.id] = theme;
        }
      });
      return result;
    } catch (_error) {
      return {};
    }
  }
  function saveStoredThemeCache(cache) {
    try {
      window.localStorage.setItem(themeCacheStorageKey, JSON.stringify(cache));
    } catch (_error) {
    }
  }
  function mergeThemeCache(themes) {
    const result = {};
    themes.forEach(function(theme) {
      if (theme.source === "custom") {
        result[theme.id] = cloneThemeRecord(theme);
      }
    });
    return result;
  }
  function removeThemeFromCache(cache, themeID) {
    const result = {};
    Object.keys(cache || {}).forEach(function(id) {
      if (id !== themeID) {
        result[id] = cloneThemeRecord(cache[id]);
      }
    });
    return result;
  }
  function themeLibraryMap(themes) {
    const result = builtinThemeMap();
    (Array.isArray(themes) ? themes : []).forEach(function(theme) {
      result[theme.id] = cloneThemeRecord(theme);
    });
    return result;
  }
  function resolveTheme(themeID, library, cache) {
    const desiredID = String(themeID || "").trim() || defaultThemeId;
    const fromLibrary = themeLibraryMap(library)[desiredID];
    if (fromLibrary) {
      return cloneThemeRecord(fromLibrary);
    }
    if (cache && cache[desiredID]) {
      return cloneThemeRecord(cache[desiredID]);
    }
    return cloneThemeRecord(builtinThemeMap()[defaultThemeId]);
  }
  function applyTheme(theme) {
    const root = document.documentElement;
    tokenKeys.forEach(function(key) {
      root.style.setProperty(cssVarMap[key], theme.tokens[key]);
    });
    root.style.colorScheme = theme.kind;
    root.setAttribute("data-theme-id", theme.id);
    root.setAttribute("data-theme-kind", theme.kind);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta && typeof meta === "object" && "content" in meta) {
      meta.content = theme.tokens.themeColor || theme.tokens.bg || "#11131d";
    }
  }
  var defaultThemeId, themeCacheStorageKey, builtinThemes, tokenKeys, cssVarMap;
  var init_themes = __esm({
    "frontend/themes.ts"() {
      "use strict";
      defaultThemeId = "noterious-night";
      themeCacheStorageKey = "noterious.theme-cache";
      builtinThemes = [
        {
          version: 1,
          id: "noterious-night",
          name: "Noterious Night",
          source: "builtin",
          kind: "dark",
          description: "The original Noterious night palette.",
          tokens: {
            bg: "#16161e",
            bgGradientStart: "#16161e",
            bgGradientEnd: "#13141c",
            bgGlowA: "rgba(122, 162, 247, 0.08)",
            bgGlowB: "rgba(187, 154, 247, 0.06)",
            sidebar: "rgba(22, 23, 31, 0.98)",
            sidebarSoft: "rgba(17, 19, 28, 0.9)",
            panel: "rgba(26, 27, 38, 0.9)",
            panelStrong: "#1f2335",
            surface: "#24283b",
            surfaceSoft: "#1a1b26",
            overlay: "rgba(24, 25, 34, 0.99)",
            overlaySoft: "rgba(17, 19, 28, 0.92)",
            table: "rgba(26, 27, 38, 0.78)",
            tableHeader: "rgba(122, 162, 247, 0.05)",
            editorOverlay: "rgba(26, 27, 38, 0.96)",
            ink: "#c0caf5",
            muted: "#7a83a8",
            accent: "#7aa2f7",
            accentSoft: "rgba(122, 162, 247, 0.14)",
            warn: "#f7768e",
            line: "rgba(122, 162, 247, 0.13)",
            lineStrong: "rgba(122, 162, 247, 0.28)",
            focusRing: "rgba(122, 162, 247, 0.35)",
            selection: "rgba(122, 162, 247, 0.22)",
            shadow: "0 16px 40px rgba(0, 0, 0, 0.34)",
            themeColor: "#11131d"
          }
        },
        {
          version: 1,
          id: "paper",
          name: "Paper",
          source: "builtin",
          kind: "light",
          description: "A warm paper-like light theme.",
          tokens: {
            bg: "#f5efe4",
            bgGradientStart: "#fbf5eb",
            bgGradientEnd: "#eadfcd",
            bgGlowA: "rgba(173, 112, 56, 0.09)",
            bgGlowB: "rgba(124, 149, 176, 0.06)",
            sidebar: "rgba(232, 221, 205, 0.98)",
            sidebarSoft: "rgba(241, 231, 216, 0.96)",
            panel: "rgba(255, 251, 245, 0.94)",
            panelStrong: "#ebdecc",
            surface: "#e3d4bc",
            surfaceSoft: "#f5ebdc",
            overlay: "rgba(252, 247, 241, 0.99)",
            overlaySoft: "rgba(246, 238, 228, 0.96)",
            table: "rgba(239, 231, 220, 0.94)",
            tableHeader: "rgba(154, 90, 41, 0.1)",
            editorOverlay: "rgba(247, 240, 231, 0.98)",
            ink: "#3a2e22",
            muted: "#75614b",
            accent: "#9a5a29",
            accentSoft: "rgba(154, 90, 41, 0.15)",
            warn: "#ab4c56",
            line: "rgba(154, 90, 41, 0.16)",
            lineStrong: "rgba(154, 90, 41, 0.28)",
            focusRing: "rgba(154, 90, 41, 0.36)",
            selection: "rgba(154, 90, 41, 0.18)",
            shadow: "0 16px 36px rgba(101, 67, 33, 0.14)",
            themeColor: "#efe2cf"
          }
        },
        {
          version: 1,
          id: "arc",
          name: "Arc",
          source: "builtin",
          kind: "light",
          description: "Clean blue-gray chrome inspired by Arc.",
          tokens: {
            bg: "#eef2f7",
            bgGradientStart: "#f6f8fb",
            bgGradientEnd: "#dfe7f1",
            bgGlowA: "rgba(82, 116, 188, 0.08)",
            bgGlowB: "rgba(70, 154, 209, 0.06)",
            sidebar: "rgba(220, 229, 239, 0.98)",
            sidebarSoft: "rgba(232, 238, 246, 0.96)",
            panel: "rgba(250, 252, 255, 0.95)",
            panelStrong: "#dfe6ef",
            surface: "#d7e0ea",
            surfaceSoft: "#eef3f8",
            overlay: "rgba(248, 251, 255, 0.99)",
            overlaySoft: "rgba(240, 245, 251, 0.96)",
            table: "rgba(231, 237, 244, 0.94)",
            tableHeader: "rgba(82, 116, 188, 0.08)",
            editorOverlay: "rgba(238, 244, 250, 0.98)",
            ink: "#2f3947",
            muted: "#627182",
            accent: "#4f74bc",
            accentSoft: "rgba(79, 116, 188, 0.15)",
            warn: "#c75359",
            line: "rgba(79, 116, 188, 0.14)",
            lineStrong: "rgba(79, 116, 188, 0.26)",
            focusRing: "rgba(79, 116, 188, 0.34)",
            selection: "rgba(79, 116, 188, 0.18)",
            shadow: "0 16px 36px rgba(53, 76, 107, 0.14)",
            themeColor: "#e4ebf4"
          }
        },
        {
          version: 1,
          id: "arc-dark",
          name: "Arc Dark",
          source: "builtin",
          kind: "dark",
          description: "Arc's cool dark chrome with restrained blue accents.",
          tokens: {
            bg: "#2f343f",
            bgGradientStart: "#343944",
            bgGradientEnd: "#2a2f39",
            bgGlowA: "rgba(82, 116, 188, 0.08)",
            bgGlowB: "rgba(70, 154, 209, 0.05)",
            sidebar: "rgba(47, 52, 63, 0.98)",
            sidebarSoft: "rgba(56, 62, 75, 0.93)",
            panel: "rgba(60, 67, 80, 0.92)",
            panelStrong: "#434c5c",
            surface: "#4c5668",
            surfaceSoft: "#394150",
            overlay: "rgba(60, 67, 80, 0.99)",
            overlaySoft: "rgba(67, 75, 89, 0.95)",
            table: "rgba(67, 75, 89, 0.92)",
            tableHeader: "rgba(82, 116, 188, 0.1)",
            editorOverlay: "rgba(67, 75, 89, 0.98)",
            ink: "#d8dee9",
            muted: "#a3afc2",
            accent: "#729fcf",
            accentSoft: "rgba(114, 159, 207, 0.16)",
            warn: "#d06b75",
            line: "rgba(114, 159, 207, 0.14)",
            lineStrong: "rgba(114, 159, 207, 0.28)",
            focusRing: "rgba(114, 159, 207, 0.36)",
            selection: "rgba(114, 159, 207, 0.22)",
            shadow: "0 16px 40px rgba(12, 16, 24, 0.36)",
            themeColor: "#343944"
          }
        },
        {
          version: 1,
          id: "nord",
          name: "Nord",
          source: "builtin",
          kind: "dark",
          description: "Arctic blue-gray with crisp Nord contrast.",
          tokens: {
            bg: "#2e3440",
            bgGradientStart: "#2e3440",
            bgGradientEnd: "#242933",
            bgGlowA: "rgba(129, 161, 193, 0.08)",
            bgGlowB: "rgba(94, 129, 172, 0.06)",
            sidebar: "rgba(46, 52, 64, 0.98)",
            sidebarSoft: "rgba(52, 60, 74, 0.93)",
            panel: "rgba(59, 66, 82, 0.92)",
            panelStrong: "#434c5e",
            surface: "#4c566a",
            surfaceSoft: "#3b4252",
            overlay: "rgba(59, 66, 82, 0.99)",
            overlaySoft: "rgba(67, 76, 94, 0.95)",
            table: "rgba(67, 76, 94, 0.92)",
            tableHeader: "rgba(129, 161, 193, 0.1)",
            editorOverlay: "rgba(67, 76, 94, 0.98)",
            ink: "#eceff4",
            muted: "#a7b1c2",
            accent: "#88c0d0",
            accentSoft: "rgba(136, 192, 208, 0.16)",
            warn: "#bf616a",
            line: "rgba(136, 192, 208, 0.14)",
            lineStrong: "rgba(136, 192, 208, 0.28)",
            focusRing: "rgba(136, 192, 208, 0.36)",
            selection: "rgba(136, 192, 208, 0.22)",
            shadow: "0 16px 40px rgba(16, 20, 28, 0.34)",
            themeColor: "#2e3440"
          }
        },
        {
          version: 1,
          id: "dracula",
          name: "Dracula",
          source: "builtin",
          kind: "dark",
          description: "Beloved violet-tinted dark theme with neon accents.",
          tokens: {
            bg: "#282a36",
            bgGradientStart: "#282a36",
            bgGradientEnd: "#22242f",
            bgGlowA: "rgba(189, 147, 249, 0.09)",
            bgGlowB: "rgba(80, 250, 123, 0.05)",
            sidebar: "rgba(40, 42, 54, 0.98)",
            sidebarSoft: "rgba(47, 49, 64, 0.93)",
            panel: "rgba(50, 52, 68, 0.92)",
            panelStrong: "#3a3d4f",
            surface: "#44475a",
            surfaceSoft: "#343746",
            overlay: "rgba(50, 52, 68, 0.99)",
            overlaySoft: "rgba(58, 61, 79, 0.95)",
            table: "rgba(58, 61, 79, 0.92)",
            tableHeader: "rgba(189, 147, 249, 0.1)",
            editorOverlay: "rgba(58, 61, 79, 0.98)",
            ink: "#f8f8f2",
            muted: "#b7b9c7",
            accent: "#bd93f9",
            accentSoft: "rgba(189, 147, 249, 0.16)",
            warn: "#ff5555",
            line: "rgba(189, 147, 249, 0.14)",
            lineStrong: "rgba(189, 147, 249, 0.28)",
            focusRing: "rgba(189, 147, 249, 0.36)",
            selection: "rgba(189, 147, 249, 0.22)",
            shadow: "0 16px 40px rgba(16, 15, 22, 0.38)",
            themeColor: "#282a36"
          }
        },
        {
          version: 1,
          id: "solarized-light",
          name: "Solarized Light",
          source: "builtin",
          kind: "light",
          description: "The classic Solarized light palette.",
          tokens: {
            bg: "#fdf6e3",
            bgGradientStart: "#fdf6e3",
            bgGradientEnd: "#eee8d5",
            bgGlowA: "rgba(181, 137, 0, 0.08)",
            bgGlowB: "rgba(38, 139, 210, 0.05)",
            sidebar: "rgba(245, 236, 210, 0.98)",
            sidebarSoft: "rgba(251, 244, 225, 0.96)",
            panel: "rgba(253, 246, 227, 0.95)",
            panelStrong: "#eee8d5",
            surface: "#e7dfc8",
            surfaceSoft: "#f7f1dd",
            overlay: "rgba(253, 246, 227, 0.99)",
            overlaySoft: "rgba(247, 240, 220, 0.96)",
            table: "rgba(244, 236, 213, 0.94)",
            tableHeader: "rgba(38, 139, 210, 0.08)",
            editorOverlay: "rgba(247, 240, 220, 0.98)",
            ink: "#586e75",
            muted: "#7b8c8f",
            accent: "#268bd2",
            accentSoft: "rgba(38, 139, 210, 0.14)",
            warn: "#dc322f",
            line: "rgba(38, 139, 210, 0.14)",
            lineStrong: "rgba(38, 139, 210, 0.24)",
            focusRing: "rgba(38, 139, 210, 0.32)",
            selection: "rgba(38, 139, 210, 0.16)",
            shadow: "0 16px 36px rgba(88, 110, 117, 0.14)",
            themeColor: "#f4edd8"
          }
        },
        {
          version: 1,
          id: "solarized-dark",
          name: "Solarized Dark",
          source: "builtin",
          kind: "dark",
          description: "The classic Solarized dark palette.",
          tokens: {
            bg: "#002b36",
            bgGradientStart: "#002b36",
            bgGradientEnd: "#001f27",
            bgGlowA: "rgba(42, 161, 152, 0.08)",
            bgGlowB: "rgba(38, 139, 210, 0.06)",
            sidebar: "rgba(0, 43, 54, 0.98)",
            sidebarSoft: "rgba(6, 53, 66, 0.92)",
            panel: "rgba(7, 54, 66, 0.92)",
            panelStrong: "#073642",
            surface: "#0c4654",
            surfaceSoft: "#073642",
            overlay: "rgba(7, 54, 66, 0.99)",
            overlaySoft: "rgba(9, 62, 76, 0.95)",
            table: "rgba(8, 63, 76, 0.92)",
            tableHeader: "rgba(42, 161, 152, 0.1)",
            editorOverlay: "rgba(9, 62, 76, 0.98)",
            ink: "#93a1a1",
            muted: "#6c8588",
            accent: "#2aa198",
            accentSoft: "rgba(42, 161, 152, 0.16)",
            warn: "#dc322f",
            line: "rgba(42, 161, 152, 0.14)",
            lineStrong: "rgba(42, 161, 152, 0.28)",
            focusRing: "rgba(42, 161, 152, 0.36)",
            selection: "rgba(42, 161, 152, 0.2)",
            shadow: "0 16px 40px rgba(0, 0, 0, 0.34)",
            themeColor: "#002b36"
          }
        },
        {
          version: 1,
          id: "catppuccin-latte",
          name: "Catppuccin Latte",
          source: "builtin",
          kind: "light",
          description: "Creamy Catppuccin light tones with rose accents.",
          tokens: {
            bg: "#eff1f5",
            bgGradientStart: "#f5f6fa",
            bgGradientEnd: "#e6e9ef",
            bgGlowA: "rgba(220, 138, 120, 0.08)",
            bgGlowB: "rgba(30, 102, 245, 0.05)",
            sidebar: "rgba(220, 224, 232, 0.98)",
            sidebarSoft: "rgba(234, 237, 243, 0.96)",
            panel: "rgba(252, 252, 253, 0.95)",
            panelStrong: "#e6e9ef",
            surface: "#dce0e8",
            surfaceSoft: "#eff1f5",
            overlay: "rgba(250, 251, 252, 0.99)",
            overlaySoft: "rgba(239, 241, 245, 0.96)",
            table: "rgba(230, 233, 239, 0.94)",
            tableHeader: "rgba(30, 102, 245, 0.08)",
            editorOverlay: "rgba(239, 241, 245, 0.98)",
            ink: "#4c4f69",
            muted: "#7c7f93",
            accent: "#1e66f5",
            accentSoft: "rgba(30, 102, 245, 0.14)",
            warn: "#d20f39",
            line: "rgba(30, 102, 245, 0.14)",
            lineStrong: "rgba(30, 102, 245, 0.24)",
            focusRing: "rgba(30, 102, 245, 0.32)",
            selection: "rgba(30, 102, 245, 0.16)",
            shadow: "0 16px 36px rgba(76, 79, 105, 0.14)",
            themeColor: "#e6e9ef"
          }
        },
        {
          version: 1,
          id: "catppuccin-mocha",
          name: "Catppuccin Mocha",
          source: "builtin",
          kind: "dark",
          description: "The widely loved Catppuccin mocha palette.",
          tokens: {
            bg: "#1e1e2e",
            bgGradientStart: "#1e1e2e",
            bgGradientEnd: "#181825",
            bgGlowA: "rgba(203, 166, 247, 0.08)",
            bgGlowB: "rgba(137, 180, 250, 0.06)",
            sidebar: "rgba(24, 24, 37, 0.98)",
            sidebarSoft: "rgba(30, 30, 46, 0.93)",
            panel: "rgba(49, 50, 68, 0.92)",
            panelStrong: "#313244",
            surface: "#45475a",
            surfaceSoft: "#1e1e2e",
            overlay: "rgba(49, 50, 68, 0.99)",
            overlaySoft: "rgba(57, 59, 79, 0.95)",
            table: "rgba(57, 59, 79, 0.92)",
            tableHeader: "rgba(137, 180, 250, 0.1)",
            editorOverlay: "rgba(57, 59, 79, 0.98)",
            ink: "#cdd6f4",
            muted: "#a6adc8",
            accent: "#89b4fa",
            accentSoft: "rgba(137, 180, 250, 0.16)",
            warn: "#f38ba8",
            line: "rgba(137, 180, 250, 0.14)",
            lineStrong: "rgba(137, 180, 250, 0.28)",
            focusRing: "rgba(137, 180, 250, 0.36)",
            selection: "rgba(137, 180, 250, 0.22)",
            shadow: "0 16px 40px rgba(0, 0, 0, 0.36)",
            themeColor: "#1e1e2e"
          }
        },
        {
          version: 1,
          id: "base16-ocean",
          name: "Base16 Ocean",
          source: "builtin",
          kind: "dark",
          description: "The classic Base16 Ocean variant.",
          tokens: {
            bg: "#2b303b",
            bgGradientStart: "#2b303b",
            bgGradientEnd: "#252a34",
            bgGlowA: "rgba(143, 161, 179, 0.08)",
            bgGlowB: "rgba(102, 153, 204, 0.06)",
            sidebar: "rgba(43, 48, 59, 0.98)",
            sidebarSoft: "rgba(52, 58, 71, 0.93)",
            panel: "rgba(52, 58, 71, 0.92)",
            panelStrong: "#343d46",
            surface: "#4f5b66",
            surfaceSoft: "#343d46",
            overlay: "rgba(52, 58, 71, 0.99)",
            overlaySoft: "rgba(62, 69, 84, 0.95)",
            table: "rgba(62, 69, 84, 0.92)",
            tableHeader: "rgba(143, 161, 179, 0.1)",
            editorOverlay: "rgba(62, 69, 84, 0.98)",
            ink: "#c0c5ce",
            muted: "#a7adba",
            accent: "#8fa1b3",
            accentSoft: "rgba(143, 161, 179, 0.16)",
            warn: "#bf616a",
            line: "rgba(143, 161, 179, 0.14)",
            lineStrong: "rgba(143, 161, 179, 0.28)",
            focusRing: "rgba(143, 161, 179, 0.36)",
            selection: "rgba(143, 161, 179, 0.22)",
            shadow: "0 16px 40px rgba(17, 20, 26, 0.36)",
            themeColor: "#2b303b"
          }
        },
        {
          version: 1,
          id: "base16-eighties",
          name: "Base16 Eighties",
          source: "builtin",
          kind: "dark",
          description: "The popular warm Base16 Eighties palette.",
          tokens: {
            bg: "#2d2d2d",
            bgGradientStart: "#2d2d2d",
            bgGradientEnd: "#262626",
            bgGlowA: "rgba(102, 153, 204, 0.07)",
            bgGlowB: "rgba(245, 245, 245, 0.03)",
            sidebar: "rgba(45, 45, 45, 0.98)",
            sidebarSoft: "rgba(57, 57, 57, 0.93)",
            panel: "rgba(57, 57, 57, 0.92)",
            panelStrong: "#393939",
            surface: "#515151",
            surfaceSoft: "#393939",
            overlay: "rgba(57, 57, 57, 0.99)",
            overlaySoft: "rgba(64, 64, 64, 0.95)",
            table: "rgba(64, 64, 64, 0.92)",
            tableHeader: "rgba(102, 153, 204, 0.1)",
            editorOverlay: "rgba(64, 64, 64, 0.98)",
            ink: "#d3d0c8",
            muted: "#b0a99f",
            accent: "#6699cc",
            accentSoft: "rgba(102, 153, 204, 0.16)",
            warn: "#f2777a",
            line: "rgba(102, 153, 204, 0.14)",
            lineStrong: "rgba(102, 153, 204, 0.28)",
            focusRing: "rgba(102, 153, 204, 0.36)",
            selection: "rgba(102, 153, 204, 0.22)",
            shadow: "0 16px 40px rgba(0, 0, 0, 0.36)",
            themeColor: "#2d2d2d"
          }
        },
        {
          version: 1,
          id: "base16-material",
          name: "Base16 Material",
          source: "builtin",
          kind: "dark",
          description: "Material-inspired Base16 with softened contrast.",
          tokens: {
            bg: "#263238",
            bgGradientStart: "#263238",
            bgGradientEnd: "#202a30",
            bgGlowA: "rgba(130, 170, 255, 0.08)",
            bgGlowB: "rgba(137, 221, 255, 0.05)",
            sidebar: "rgba(38, 50, 56, 0.98)",
            sidebarSoft: "rgba(45, 58, 64, 0.93)",
            panel: "rgba(49, 63, 69, 0.92)",
            panelStrong: "#314047",
            surface: "#546e7a",
            surfaceSoft: "#314047",
            overlay: "rgba(49, 63, 69, 0.99)",
            overlaySoft: "rgba(57, 72, 79, 0.95)",
            table: "rgba(57, 72, 79, 0.92)",
            tableHeader: "rgba(130, 170, 255, 0.1)",
            editorOverlay: "rgba(57, 72, 79, 0.98)",
            ink: "#eeffff",
            muted: "#aabfc9",
            accent: "#82aaff",
            accentSoft: "rgba(130, 170, 255, 0.16)",
            warn: "#f07178",
            line: "rgba(130, 170, 255, 0.14)",
            lineStrong: "rgba(130, 170, 255, 0.28)",
            focusRing: "rgba(130, 170, 255, 0.36)",
            selection: "rgba(130, 170, 255, 0.22)",
            shadow: "0 16px 40px rgba(12, 18, 22, 0.36)",
            themeColor: "#263238"
          }
        },
        {
          version: 1,
          id: "spruce",
          name: "Spruce",
          source: "builtin",
          kind: "dark",
          description: "Deep green graphite with soft spruce accents.",
          tokens: {
            bg: "#101815",
            bgGradientStart: "#101815",
            bgGradientEnd: "#0c1210",
            bgGlowA: "rgba(102, 187, 106, 0.1)",
            bgGlowB: "rgba(120, 197, 154, 0.06)",
            sidebar: "rgba(15, 22, 19, 0.98)",
            sidebarSoft: "rgba(16, 24, 21, 0.92)",
            panel: "rgba(18, 27, 24, 0.9)",
            panelStrong: "#1a2b25",
            surface: "#20362f",
            surfaceSoft: "#16231f",
            overlay: "rgba(18, 27, 24, 0.98)",
            overlaySoft: "rgba(19, 30, 26, 0.94)",
            table: "rgba(22, 35, 30, 0.9)",
            tableHeader: "rgba(108, 188, 120, 0.1)",
            editorOverlay: "rgba(20, 31, 27, 0.98)",
            ink: "#d3e9df",
            muted: "#8fa89d",
            accent: "#6cbc78",
            accentSoft: "rgba(108, 188, 120, 0.16)",
            warn: "#e1787e",
            line: "rgba(108, 188, 120, 0.14)",
            lineStrong: "rgba(108, 188, 120, 0.26)",
            focusRing: "rgba(108, 188, 120, 0.36)",
            selection: "rgba(108, 188, 120, 0.2)",
            shadow: "0 16px 40px rgba(0, 0, 0, 0.32)",
            themeColor: "#111a17"
          }
        },
        {
          version: 1,
          id: "graphite",
          name: "Graphite",
          source: "builtin",
          kind: "dark",
          description: "Neutral graphite with cool steel highlights.",
          tokens: {
            bg: "#181a1f",
            bgGradientStart: "#181a1f",
            bgGradientEnd: "#13151a",
            bgGlowA: "rgba(133, 154, 176, 0.08)",
            bgGlowB: "rgba(96, 120, 148, 0.06)",
            sidebar: "rgba(22, 24, 29, 0.98)",
            sidebarSoft: "rgba(24, 26, 31, 0.92)",
            panel: "rgba(28, 30, 36, 0.9)",
            panelStrong: "#242830",
            surface: "#303641",
            surfaceSoft: "#1f242c",
            overlay: "rgba(25, 27, 33, 0.99)",
            overlaySoft: "rgba(28, 31, 37, 0.95)",
            table: "rgba(38, 42, 50, 0.9)",
            tableHeader: "rgba(134, 164, 195, 0.1)",
            editorOverlay: "rgba(30, 33, 39, 0.98)",
            ink: "#dde3ea",
            muted: "#98a5b4",
            accent: "#86a4c3",
            accentSoft: "rgba(134, 164, 195, 0.16)",
            warn: "#d97777",
            line: "rgba(134, 164, 195, 0.14)",
            lineStrong: "rgba(134, 164, 195, 0.26)",
            focusRing: "rgba(134, 164, 195, 0.36)",
            selection: "rgba(134, 164, 195, 0.2)",
            shadow: "0 16px 40px rgba(0, 0, 0, 0.34)",
            themeColor: "#191b20"
          }
        }
      ];
      tokenKeys = [
        "bg",
        "bgGradientStart",
        "bgGradientEnd",
        "bgGlowA",
        "bgGlowB",
        "sidebar",
        "sidebarSoft",
        "panel",
        "panelStrong",
        "surface",
        "surfaceSoft",
        "overlay",
        "overlaySoft",
        "table",
        "tableHeader",
        "editorOverlay",
        "ink",
        "muted",
        "accent",
        "accentSoft",
        "warn",
        "line",
        "lineStrong",
        "focusRing",
        "selection",
        "shadow",
        "themeColor"
      ];
      cssVarMap = {
        bg: "--bg",
        bgGradientStart: "--bg-gradient-start",
        bgGradientEnd: "--bg-gradient-end",
        bgGlowA: "--bg-glow-a",
        bgGlowB: "--bg-glow-b",
        sidebar: "--sidebar",
        sidebarSoft: "--sidebar-soft",
        panel: "--panel",
        panelStrong: "--panel-strong",
        surface: "--surface",
        surfaceSoft: "--surface-soft",
        overlay: "--overlay",
        overlaySoft: "--overlay-soft",
        table: "--table",
        tableHeader: "--table-header",
        editorOverlay: "--editor-overlay",
        ink: "--ink",
        muted: "--muted",
        accent: "--accent",
        accentSoft: "--accent-soft",
        warn: "--warn",
        line: "--line",
        lineStrong: "--line-strong",
        focusRing: "--focus-ring",
        selection: "--selection",
        shadow: "--shadow",
        themeColor: "--theme-color"
      };
    }
  });

  // frontend/app.ts
  var require_app = __commonJS({
    "frontend/app.ts"() {
      init_commands();
      init_clientPreferences();
      init_details();
      init_datetime();
      init_dom();
      init_editorState();
      init_http();
      init_inlineEditors();
      init_markdown();
      init_hotkeys();
      init_historyTrashUi();
      init_helpUi();
      init_noteView();
      init_pageOperations();
      init_paletteModals();
      init_palette();
      init_pageViews();
      init_pageTreeUi();
      init_settingsPersistence();
      init_properties();
      init_queryTree();
      init_routing();
      init_sessionUi();
      init_settingsUi();
      init_slashMenu();
      init_themes();
      (function() {
        let pwaRegistrationPromise = null;
        function registerPWA() {
          if (pwaRegistrationPromise) {
            return pwaRegistrationPromise;
          }
          const localHost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1" || window.location.hostname === "[::1]";
          if (!("serviceWorker" in navigator) || window.location.protocol !== "https:" && !localHost) {
            pwaRegistrationPromise = Promise.resolve();
            return pwaRegistrationPromise;
          }
          pwaRegistrationPromise = navigator.serviceWorker.register("/sw.js").then(function() {
            return;
          }).catch(function(error) {
            console.warn("PWA registration failed", error);
          });
          return pwaRegistrationPromise;
        }
        const state = {
          selectedPage: "",
          selectedSavedQuery: "",
          pages: [],
          documents: [],
          tasks: [],
          queryTree: [],
          selectedSavedQueryPayload: null,
          eventSource: null,
          refreshTimer: null,
          autosaveTimer: null,
          searchTimer: null,
          commandTimer: null,
          quickSwitcherTimer: null,
          documentTimer: null,
          searchSelectionIndex: -1,
          commandSelectionIndex: -1,
          quickSwitcherSelectionIndex: -1,
          documentSelectionIndex: -1,
          currentPage: null,
          currentDerived: null,
          currentMarkdown: "",
          originalMarkdown: "",
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
          settings: {
            preferences: cloneClientPreferences(defaultClientPreferences()),
            vault: {
              vaultPath: "./vault",
              homePage: ""
            },
            notifications: {
              ntfyInterval: "1m"
            },
            userNotifications: {
              ntfyTopicUrl: "",
              ntfyToken: ""
            }
          },
          appliedVault: {
            vaultPath: "./vault",
            homePage: ""
          },
          settingsRestartRequired: false,
          settingsLoaded: false,
          userSettingsLoaded: false,
          configHomePage: "",
          homePage: "",
          topLevelFoldersAsVaults: false,
          themeLibraryLoaded: false,
          themeLibrary: builtinThemeLibrary(),
          savedThemeId: defaultThemeId,
          previewThemeId: defaultThemeId,
          themeCache: {},
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
          renamingPageTitle: false,
          taskFilter: "not-done",
          tableEditor: null,
          pageHistory: [],
          selectedHistoryRevisionId: "",
          historyShowChanges: false,
          trashPages: [],
          authenticated: false,
          currentUser: null,
          currentVault: null,
          availableVaults: [],
          vaultSwitchPending: false,
          vaultSwitcherOpen: false,
          mustChangePassword: false,
          setupRequired: false,
          authGateMode: "login",
          settingsSection: "appearance"
        };
        const els = {
          appShell: optionalQuery(".shell"),
          authShell: requiredElement("auth-shell"),
          authForm: requiredElement("auth-form"),
          authEyebrow: requiredElement("auth-eyebrow"),
          authTitle: requiredElement("auth-title"),
          authCopy: requiredElement("auth-copy"),
          authIdentity: requiredElement("auth-identity"),
          authUsernameRow: requiredElement("auth-username-row"),
          authUsername: requiredElement("auth-username"),
          authPasswordRow: requiredElement("auth-password-row"),
          authPassword: requiredElement("auth-password"),
          authSetupConfirmRow: requiredElement("auth-setup-confirm-row"),
          authSetupConfirm: requiredElement("auth-setup-confirm"),
          authChangeFields: requiredElement("auth-change-fields"),
          authCurrentPassword: requiredElement("auth-current-password"),
          authNewPassword: requiredElement("auth-new-password"),
          authConfirmPassword: requiredElement("auth-confirm-password"),
          authSubmit: requiredElement("auth-submit"),
          authStatus: requiredElement("auth-status"),
          vaultHealthBanner: requiredElement("vault-health-banner"),
          vaultHealthTitle: requiredElement("vault-health-title"),
          vaultHealthMessage: requiredElement("vault-health-message"),
          metaStrip: optionalElement("meta-strip"),
          pageSearch: requiredElement("page-search"),
          pageSearchShell: requiredElement("page-search-shell"),
          togglePageSearch: requiredElement("toggle-page-search"),
          pageList: requiredElement("page-list"),
          pageTaskList: requiredElement("page-task-list"),
          taskFilters: requiredElement("task-filters"),
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
          toggleSourceMode: requiredElement("toggle-source-mode"),
          noteStatus: requiredElement("note-status"),
          treeContextMenu: requiredElement("tree-context-menu"),
          markdownEditor: requiredElement("markdown-editor"),
          structuredView: requiredElement("structured-view"),
          derivedView: requiredElement("derived-view"),
          rawView: requiredElement("raw-view"),
          queryEditor: requiredElement("query-editor"),
          queryOutput: requiredElement("query-output"),
          eventStatus: requiredElement("event-status"),
          eventLog: requiredElement("event-log"),
          appLayout: optionalQuery(".app-layout"),
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
          noteSurface: requiredElement("note-surface"),
          inlineTablePanel: requiredElement("inline-table-panel"),
          toggleRail: requiredElement("toggle-rail"),
          historyBack: requiredElement("history-back"),
          historyForward: requiredElement("history-forward"),
          openHomePage: requiredElement("open-home-page"),
          openQuickSwitcher: requiredElement("open-quick-switcher"),
          openDocuments: requiredElement("open-documents"),
          openSearch: requiredElement("open-search"),
          sessionMenu: requiredElement("session-menu"),
          sessionMenuPanel: requiredElement("session-menu-panel"),
          openSessionMenu: requiredElement("open-session-menu"),
          sessionUser: requiredElement("session-user"),
          openTrash: requiredElement("open-trash"),
          openHelp: requiredElement("open-help"),
          openSettings: requiredElement("open-settings"),
          logoutSession: requiredElement("logout-session"),
          vaultSwitcher: requiredElement("vault-switcher"),
          openVaultSwitcher: requiredElement("open-vault-switcher"),
          currentVaultName: requiredElement("current-vault-name"),
          vaultSwitcherPanel: requiredElement("vault-switcher-panel"),
          vaultSwitcherList: requiredElement("vault-switcher-list"),
          reloadPages: optionalElement("reload-pages"),
          reloadQueries: optionalElement("reload-queries"),
          toggleDebug: optionalElement("toggle-debug"),
          debugDrawer: requiredElement("debug-drawer"),
          loadSelectedQuery: requiredElement("load-selected-query"),
          formatQuery: requiredElement("format-query"),
          runQuery: requiredElement("run-query"),
          inlineTaskPicker: requiredElement("inline-task-picker"),
          searchModalShell: requiredElement("search-modal-shell"),
          closeSearchModal: requiredElement("close-search-modal"),
          globalSearchInput: requiredElement("global-search-input"),
          globalSearchResults: requiredElement("global-search-results"),
          commandModalShell: requiredElement("command-modal-shell"),
          closeCommandModal: requiredElement("close-command-modal"),
          commandPaletteInput: requiredElement("command-palette-input"),
          commandPaletteResults: requiredElement("command-palette-results"),
          quickSwitcherModalShell: requiredElement("quick-switcher-modal-shell"),
          closeQuickSwitcherModal: requiredElement("close-quick-switcher-modal"),
          quickSwitcherInput: requiredElement("quick-switcher-input"),
          quickSwitcherResults: requiredElement("quick-switcher-results"),
          documentsModalShell: requiredElement("documents-modal-shell"),
          closeDocumentsModal: requiredElement("close-documents-modal"),
          documentsInput: requiredElement("documents-input"),
          documentsResults: requiredElement("documents-results"),
          pageHistoryButton: requiredElement("open-page-history"),
          pageHistoryModalShell: requiredElement("page-history-modal-shell"),
          purgePageHistory: requiredElement("purge-page-history"),
          closePageHistoryModal: requiredElement("close-page-history-modal"),
          pageHistoryTitle: requiredElement("page-history-title"),
          pageHistoryResults: requiredElement("page-history-results"),
          pageHistoryPreview: requiredElement("page-history-preview"),
          pageHistoryShowChanges: requiredElement("page-history-show-changes"),
          copyPageHistory: requiredElement("copy-page-history"),
          restorePageHistory: requiredElement("restore-page-history"),
          trashModalShell: requiredElement("trash-modal-shell"),
          emptyTrash: requiredElement("empty-trash"),
          closeTrashModal: requiredElement("close-trash-modal"),
          trashResults: requiredElement("trash-results"),
          helpModalShell: requiredElement("help-modal-shell"),
          closeHelpModal: requiredElement("close-help-modal"),
          helpShortcutCore: requiredElement("help-shortcuts-core"),
          helpShortcutEditor: requiredElement("help-shortcuts-editor"),
          settingsModalShell: requiredElement("settings-modal-shell"),
          closeSettingsModal: requiredElement("close-settings-modal"),
          settingsEyebrow: requiredElement("settings-eyebrow"),
          settingsTitle: requiredElement("settings-title"),
          settingsNavAppearance: requiredElement("settings-nav-appearance"),
          settingsNavNotifications: requiredElement("settings-nav-notifications"),
          settingsNavVault: requiredElement("settings-nav-vault"),
          settingsGroupServer: requiredElement("settings-group-server"),
          settingsGroupSession: requiredElement("settings-group-session"),
          settingsGroupUserNotifications: requiredElement("settings-group-user-notifications"),
          cancelSettings: requiredElement("cancel-settings"),
          saveSettings: requiredElement("save-settings"),
          settingsVaultPath: requiredElement("settings-vault-path"),
          settingsNtfyInterval: requiredElement("settings-ntfy-interval"),
          settingsUserNtfyTopicUrl: requiredElement("settings-user-ntfy-topic-url"),
          settingsUserNtfyToken: requiredElement("settings-user-ntfy-token"),
          settingsUserTopLevelVaults: requiredElement("settings-user-top-level-vaults"),
          settingsTheme: requiredElement("settings-ui-theme"),
          settingsThemeUpload: requiredElement("settings-theme-upload"),
          settingsThemeDelete: requiredElement("settings-theme-delete"),
          settingsThemeUploadInput: requiredElement("settings-theme-upload-input"),
          settingsThemeHelp: requiredElement("settings-theme-help"),
          settingsFontFamily: requiredElement("settings-ui-font-family"),
          settingsFontSize: requiredElement("settings-ui-font-size"),
          settingsDateTimeFormat: requiredElement("settings-ui-date-time-format"),
          settingsQuickSwitcher: requiredElement("settings-hotkey-quick-switcher"),
          settingsGlobalSearch: requiredElement("settings-hotkey-global-search"),
          settingsCommandPalette: requiredElement("settings-hotkey-command-palette"),
          settingsQuickNote: requiredElement("settings-hotkey-quick-note"),
          settingsHelp: requiredElement("settings-hotkey-help"),
          settingsSaveCurrentPage: requiredElement("settings-hotkey-save-current-page"),
          settingsToggleRawMode: requiredElement("settings-hotkey-toggle-raw-mode"),
          settingsToggleTaskDone: requiredElement("settings-hotkey-toggle-task-done"),
          settingsStatus: requiredElement("settings-status"),
          slashMenu: requiredElement("slash-menu"),
          slashMenuResults: requiredElement("slash-menu-results")
        };
        const taskPickerState = defaultTaskPickerState();
        const treeContextMenuState = {
          target: null,
          left: 0,
          top: 0
        };
        function currentPickerTask() {
          return taskPickerState.ref ? findCurrentTask(taskPickerState.ref) : null;
        }
        function setTaskDateApplySuppressed2(active) {
          setTaskDateApplySuppressed(state.markdownEditorApi, active);
        }
        async function saveTaskDateField(task, field, value) {
          setTaskDateApplySuppressed2(true);
          await saveTask(task.ref, {
            text: task.text || "",
            state: task.done ? "done" : "todo",
            due: field === "due" ? value : task.due || "",
            remind: field === "remind" ? value : task.remind || "",
            who: Array.isArray(task.who) ? task.who.slice() : []
          });
          closeTaskPickers2();
          await Promise.all([state.selectedPage ? loadPageDetail(state.selectedPage, true, false) : Promise.resolve()]);
          restoreNoteFocus();
          window.requestAnimationFrame(function() {
            window.requestAnimationFrame(function() {
              setTaskDateApplySuppressed2(false);
            });
          });
        }
        async function deleteTaskInline(ref) {
          const task = ref ? findCurrentTask(ref) : null;
          if (!task) {
            return;
          }
          if (!window.confirm('Delete task "' + (task.text || task.ref) + '"?')) {
            return;
          }
          await deleteTask(ref);
          closeTaskPickers2();
          await Promise.all([state.selectedPage ? loadPageDetail(state.selectedPage, true) : Promise.resolve()]);
        }
        function closeTaskPickers2() {
          closeTaskPickers(taskPickerState, els);
        }
        function closeInlineTableEditor2() {
          closeInlineTableEditor(state, els);
        }
        function inlineTableEditorHasFocus2() {
          return inlineTableEditorHasFocus(els);
        }
        function inlineTableEditorOpen2() {
          return inlineTableEditorOpen(state, els);
        }
        function positionInlineTableEditorPanel2() {
          positionInlineTableEditorPanel(state, els);
        }
        function applyInlineTableEditor2(closeAfter) {
          applyInlineTableEditor(state, els, {
            closeAfter,
            refreshLivePageChrome,
            scheduleAutosave
          });
          if (!closeAfter && state.tableEditor) {
            renderInlineTableEditor2();
          }
        }
        function renderInlineTableEditor2() {
          renderInlineTableEditor(state, els, {
            applyInlineTableEditor: applyInlineTableEditor2,
            closeInlineTableEditor: closeInlineTableEditor2
          });
        }
        function openInlineTableEditor2(startLineNumber, rowIndex, colIndex, anchor) {
          openInlineTableEditor(state, els, {
            startLineNumber,
            rowIndex,
            colIndex,
            anchor,
            renderInlineTableEditor: renderInlineTableEditor2
          });
        }
        function renderTaskPicker2() {
          renderTaskPicker(taskPickerState, els, {
            currentPickerTask,
            saveTaskDateField,
            closeTaskPickers: closeTaskPickers2,
            setNoteStatus,
            errorMessage
          });
        }
        function openInlineTaskPicker2(ref, mode, left, top) {
          openInlineTaskPicker(taskPickerState, {
            ref,
            mode,
            left,
            top,
            task: ref ? findCurrentTask(ref) : null,
            rememberNoteFocus,
            closeTaskPickers: closeTaskPickers2,
            renderTaskPicker: renderTaskPicker2
          });
        }
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
        function renderVaultHealth(meta) {
          if (!meta || !meta.vaultHealth || meta.vaultHealth.healthy) {
            els.vaultHealthBanner.classList.add("hidden");
            els.vaultHealthTitle.textContent = "Vault Warning";
            els.vaultHealthMessage.textContent = "";
            return;
          }
          const reason = String(meta.vaultHealth.reason || "").toLowerCase();
          els.vaultHealthTitle.textContent = reason === "missing" ? "Vault Missing" : "Vault Unavailable";
          els.vaultHealthMessage.textContent = (meta.vaultHealth.message || "The configured vault is currently unavailable.") + " The app may only be showing previously indexed data until the vault becomes readable again.";
          els.vaultHealthBanner.classList.remove("hidden");
        }
        function nextDailyNotePath() {
          const now = /* @__PURE__ */ new Date();
          return normalizePageDraftPath(
            "Inbox/" + [
              now.getFullYear(),
              String(now.getMonth() + 1).padStart(2, "0"),
              String(now.getDate()).padStart(2, "0")
            ].join("-")
          );
        }
        function createDailyNote() {
          const pagePath = nextDailyNotePath();
          if (hasPage(pagePath)) {
            navigateToPage(pagePath, false);
            return;
          }
          createPage2(pagePath).catch(function(error) {
            setNoteStatus("Daily note failed: " + errorMessage(error));
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
        function setHomePage(pagePath) {
          const normalized = normalizePageDraftPath(pagePath);
          state.homePage = normalized;
          renderHomeButton();
          if (!els.settingsModalShell.classList.contains("hidden")) {
            renderSettingsForm2();
          }
          persistUserHomePage(true);
        }
        function clearHomePage() {
          state.homePage = "";
          renderHomeButton();
          if (!els.settingsModalShell.classList.contains("hidden")) {
            renderSettingsForm2();
          }
          persistUserHomePage(true);
        }
        function currentHomePage() {
          return normalizePageDraftPath(state.homePage || "");
        }
        function renderHomeButton() {
          const homePage = currentHomePage();
          els.openHomePage.disabled = !homePage;
          els.openHomePage.title = homePage ? "Open home page: " + homePage : "No home page configured";
        }
        function setSessionMenuOpen2(open) {
          setSessionMenuOpen(state, els, open);
        }
        function renderSessionState2() {
          renderSessionState(state, els, function(vaultID) {
            switchVault(vaultID).catch(function(error) {
              setNoteStatus("Vault switch failed: " + errorMessage(error));
            });
          });
        }
        function setVaultSwitcherOpen2(open) {
          setVaultSwitcherOpen(state, els, open);
        }
        function renderAuthGate2() {
          renderAuthGate(state, els);
        }
        function setAuthSession(session) {
          applyAuthSessionResponse(state, session);
          renderSessionState2();
          renderAuthGate2();
        }
        function setAuthGateOpen2(open, status) {
          setAuthGateOpen(state, els, open, status);
        }
        async function loadSession() {
          return fetchJSON("/api/auth/me", void 0, true);
        }
        async function login() {
          els.authStatus.textContent = "Signing in\u2026";
          try {
            const loginPassword = els.authPassword.value;
            const session = await fetchJSON("/api/auth/login", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                username: els.authUsername.value.trim(),
                password: els.authPassword.value
              })
            }, true);
            setAuthSession(session);
            els.authPassword.value = "";
            if (state.mustChangePassword) {
              els.authCurrentPassword.value = loginPassword;
              els.authNewPassword.value = "";
              els.authConfirmPassword.value = "";
              setAuthGateOpen2(true, "Change your password to continue.");
              return;
            }
            setAuthGateOpen2(false);
            window.location.reload();
          } catch (error) {
            els.authStatus.textContent = errorMessage(error);
          }
        }
        async function setupInitialAdmin() {
          const username = els.authUsername.value.trim();
          const password = els.authPassword.value;
          const confirmPassword = els.authSetupConfirm.value;
          if (!username) {
            els.authStatus.textContent = "Username is required.";
            return;
          }
          if (!password.trim()) {
            els.authStatus.textContent = "Password is required.";
            return;
          }
          if (password !== confirmPassword) {
            els.authStatus.textContent = "Passwords do not match.";
            return;
          }
          els.authStatus.textContent = "Setting up account\u2026";
          try {
            const session = await fetchJSON("/api/auth/setup", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                username,
                password
              })
            }, true);
            setAuthSession(session);
            els.authPassword.value = "";
            els.authSetupConfirm.value = "";
            setAuthGateOpen2(false);
            window.location.reload();
          } catch (error) {
            els.authStatus.textContent = errorMessage(error);
          }
        }
        async function changePassword() {
          const currentPassword = els.authCurrentPassword.value;
          const newPassword = els.authNewPassword.value;
          const confirmPassword = els.authConfirmPassword.value;
          if (!currentPassword.trim()) {
            els.authStatus.textContent = "Current password is required.";
            return;
          }
          if (!newPassword.trim()) {
            els.authStatus.textContent = "New password is required.";
            return;
          }
          if (newPassword !== confirmPassword) {
            els.authStatus.textContent = "New passwords do not match.";
            return;
          }
          els.authStatus.textContent = "Updating password\u2026";
          try {
            const session = await fetchJSON("/api/auth/change-password", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                currentPassword,
                newPassword
              })
            }, true);
            setAuthSession(session);
            els.authCurrentPassword.value = "";
            els.authNewPassword.value = "";
            els.authConfirmPassword.value = "";
            setAuthGateOpen2(false);
            window.location.reload();
          } catch (error) {
            els.authStatus.textContent = errorMessage(error);
          }
        }
        async function logout() {
          try {
            await fetchJSON("/api/auth/logout", { method: "POST" }, true);
          } catch (error) {
            setNoteStatus("Logout failed: " + errorMessage(error));
          }
          window.location.reload();
        }
        async function loadAuthenticatedApp() {
          await loadAuthVaults().catch(function(error) {
            setNoteStatus("Vault list failed: " + errorMessage(error));
          });
          await Promise.all([
            loadThemes().catch(function(error) {
              state.themeLibraryLoaded = false;
              renderSettingsForm2();
              setNoteStatus("Theme library failed: " + errorMessage(error));
            }),
            loadSettings(),
            loadUserSettings().catch(function(error) {
              setNoteStatus("User settings failed: " + errorMessage(error));
            }),
            loadMeta(),
            loadPages(),
            loadSavedQueryTree(),
            loadDocuments()
          ]);
          applyURLState2();
          connectEvents();
        }
        function setVisibleVaultState(availableVaults, currentVault) {
          state.availableVaults = Array.isArray(availableVaults) ? availableVaults.slice() : [];
          if (currentVault) {
            state.currentVault = currentVault;
          } else if (!state.availableVaults.some(function(vaultRecord) {
            return Boolean(state.currentVault && vaultRecord.id === state.currentVault.id);
          })) {
            state.currentVault = state.availableVaults[0] || null;
          }
          state.vaultSwitchPending = false;
          state.vaultSwitcherOpen = false;
          renderSessionState2();
        }
        async function selectCurrentVault(vaultID) {
          return fetchJSON("/api/auth/vault", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ vaultId: vaultID })
          }, true);
        }
        async function loadAuthVaults() {
          const snapshot = await fetchJSON("/api/auth/vaults");
          const rootVault = snapshot.rootVault || null;
          const discoveredVaults = Array.isArray(snapshot.vaults) ? snapshot.vaults.slice() : [];
          const currentVault = snapshot.currentVault || rootVault;
          if (!state.topLevelFoldersAsVaults) {
            if (rootVault && currentVault && currentVault.id !== rootVault.id) {
              const session = await selectCurrentVault(rootVault.id);
              setAuthSession(session);
              setVisibleVaultState([rootVault], session.vault || rootVault);
              return;
            }
            setVisibleVaultState(rootVault ? [rootVault] : [], currentVault);
            return;
          }
          const desiredVault = discoveredVaults.length === 0 ? rootVault : discoveredVaults.find(function(vault) {
            return Boolean(currentVault && vault.id === currentVault.id);
          }) || discoveredVaults[0];
          const visibleVaults = discoveredVaults.length > 0 ? discoveredVaults : rootVault ? [rootVault] : [];
          if (desiredVault && (!currentVault || currentVault.id !== desiredVault.id)) {
            const session = await selectCurrentVault(desiredVault.id);
            setAuthSession(session);
            setVisibleVaultState(visibleVaults, session.vault || desiredVault);
            return;
          }
          setVisibleVaultState(visibleVaults, desiredVault || currentVault);
        }
        async function switchVault(vaultID) {
          if (!Number.isFinite(vaultID) || vaultID <= 0) {
            return;
          }
          if (state.currentVault && vaultID === state.currentVault.id) {
            return;
          }
          state.vaultSwitchPending = true;
          renderSessionState2();
          try {
            const session = await selectCurrentVault(vaultID);
            setAuthSession(session);
            setVaultSwitcherOpen2(false);
            setSessionMenuOpen2(false);
            window.location.reload();
          } catch (error) {
            state.vaultSwitchPending = false;
            renderSessionState2();
            setNoteStatus("Vault switch failed: " + errorMessage(error));
          }
        }
        function setPageSearchOpen(open) {
          const keepOpen = open || Boolean(els.pageSearch.value.trim());
          els.pageSearchShell.classList.toggle("hidden", !keepOpen);
          els.togglePageSearch.classList.toggle("active", keepOpen);
          els.togglePageSearch.setAttribute("aria-expanded", keepOpen ? "true" : "false");
          if (keepOpen) {
            window.requestAnimationFrame(function() {
              if (document.activeElement !== els.pageSearch) {
                els.pageSearch.focus({ preventScroll: true });
              }
            });
          }
        }
        function syncURLState(replace) {
          const url = buildSelectionURL(window.location.href, state.selectedPage, state.selectedSavedQuery);
          if (url.href === window.location.href) {
            return;
          }
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
        function hasPage(pagePath) {
          const normalized = normalizePageDraftPath(pagePath).toLowerCase();
          if (!normalized) {
            return false;
          }
          return state.pages.some(function(page) {
            return String(page.path || "").toLowerCase() === normalized;
          });
        }
        function openOrCreatePage(pagePath, replace) {
          const normalized = normalizePageDraftPath(pagePath);
          if (!normalized) {
            return;
          }
          if (hasPage(normalized)) {
            navigateToPage(normalized, replace);
            return;
          }
          createPage2(normalized).catch(function(error) {
            setNoteStatus("Create page failed: " + errorMessage(error));
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
        function taskLineIndent(line) {
          const match = String(line || "").match(/^(\s*)-\s+\[[ xX]\]\s+/);
          return match ? match[1].length : null;
        }
        function taskBlockEnd(lines, startIndex) {
          const startIndent = taskLineIndent(lines[startIndex]);
          if (startIndent === null) {
            return startIndex + 1;
          }
          let index = startIndex + 1;
          while (index < lines.length) {
            const indent = taskLineIndent(lines[index]);
            if (indent !== null && indent <= startIndent) {
              break;
            }
            index += 1;
          }
          return index;
        }
        function previousSiblingTaskStart(lines, startIndex, indent) {
          for (let index = startIndex - 1; index >= 0; index -= 1) {
            const candidateIndent = taskLineIndent(lines[index]);
            if (candidateIndent === null) {
              continue;
            }
            if (candidateIndent < indent) {
              return -1;
            }
            if (candidateIndent === indent) {
              return index;
            }
          }
          return -1;
        }
        function nextSiblingTaskStart(lines, endIndex, indent) {
          for (let index = endIndex; index < lines.length; index += 1) {
            const candidateIndent = taskLineIndent(lines[index]);
            if (candidateIndent === null) {
              continue;
            }
            if (candidateIndent < indent) {
              return -1;
            }
            if (candidateIndent === indent) {
              return index;
            }
          }
          return -1;
        }
        function currentRawLineIndex(value, lineStart) {
          return String(value || "").slice(0, Math.max(0, lineStart)).split("\n").length - 1;
        }
        function replaceMarkdownAndKeepEditor(nextMarkdown, nextOffset, scrollTop) {
          setMarkdownEditorValue(state, els, nextMarkdown);
          state.currentMarkdown = nextMarkdown;
          els.rawView.textContent = nextMarkdown;
          refreshLivePageChrome();
          scheduleAutosave();
          focusMarkdownEditor(state, els, { preventScroll: true });
          setMarkdownEditorSelection(state, els, nextOffset, nextOffset);
          setMarkdownEditorScrollTop(state, els, scrollTop);
        }
        function moveCurrentTaskBlock(direction) {
          if (!state.selectedPage || !state.currentPage) {
            return false;
          }
          const rawContext = currentRawLineContext(state, els);
          const lines = String(rawContext.value || "").replace(/\r\n/g, "\n").split("\n");
          const currentLineIndex = currentRawLineIndex(rawContext.value, rawContext.lineStart);
          const startIndex = currentLineIndex;
          const indent = taskLineIndent(lines[currentLineIndex] || "");
          if (indent === null) {
            return false;
          }
          const currentEnd = taskBlockEnd(lines, startIndex);
          const currentLength = currentEnd - startIndex;
          const relativeLineIndex = currentLineIndex - startIndex;
          const scrollTop = markdownEditorScrollTop(state, els);
          if (direction < 0) {
            const prevStart = previousSiblingTaskStart(lines, startIndex, indent);
            if (prevStart < 0) {
              return false;
            }
            const nextLines2 = lines.slice();
            const movedBlock2 = nextLines2.splice(startIndex, currentLength);
            nextLines2.splice(prevStart, 0, ...movedBlock2);
            const nextMarkdown2 = nextLines2.join("\n");
            const nextLineIndex2 = prevStart + relativeLineIndex;
            const nextLineText2 = nextLines2[nextLineIndex2] || "";
            const nextOffset2 = rawOffsetForLineNumber(nextMarkdown2, nextLineIndex2 + 1) + Math.min(rawContext.caretInLine, nextLineText2.length);
            replaceMarkdownAndKeepEditor(nextMarkdown2, nextOffset2, scrollTop);
            return true;
          }
          const nextStart = nextSiblingTaskStart(lines, currentEnd, indent);
          if (nextStart < 0) {
            return false;
          }
          const nextEnd = taskBlockEnd(lines, nextStart);
          const nextLines = lines.slice();
          const movedBlock = nextLines.splice(startIndex, currentLength);
          const insertedAt = nextEnd - currentLength;
          nextLines.splice(insertedAt, 0, ...movedBlock);
          const nextMarkdown = nextLines.join("\n");
          const nextLineIndex = insertedAt + relativeLineIndex;
          const nextLineText = nextLines[nextLineIndex] || "";
          const nextOffset = rawOffsetForLineNumber(nextMarkdown, nextLineIndex + 1) + Math.min(rawContext.caretInLine, nextLineText.length);
          replaceMarkdownAndKeepEditor(nextMarkdown, nextOffset, scrollTop);
          return true;
        }
        function indentCurrentTaskBlock(delta) {
          if (!state.selectedPage || !state.currentPage) {
            return false;
          }
          const rawContext = currentRawLineContext(state, els);
          const lines = String(rawContext.value || "").replace(/\r\n/g, "\n").split("\n");
          const currentLineIndex = currentRawLineIndex(rawContext.value, rawContext.lineStart);
          const startIndex = currentLineIndex;
          const indent = taskLineIndent(lines[currentLineIndex] || "");
          if (indent === null) {
            return false;
          }
          if (delta < 0 && indent < 2) {
            return false;
          }
          const endIndex = taskBlockEnd(lines, startIndex);
          const scrollTop = markdownEditorScrollTop(state, els);
          const nextLines = lines.slice();
          for (let index = startIndex; index < endIndex; index += 1) {
            const line = nextLines[index];
            if (!String(line || "").length) {
              continue;
            }
            nextLines[index] = delta > 0 ? "  " + line : String(line).replace(/^ {1,2}/, "");
          }
          const nextMarkdown = nextLines.join("\n");
          const nextLineText = nextLines[currentLineIndex] || "";
          const nextCaretInLine = Math.max(0, Math.min(rawContext.caretInLine + (delta > 0 ? 2 : -2), nextLineText.length));
          const nextOffset = rawOffsetForLineNumber(nextMarkdown, currentLineIndex + 1) + nextCaretInLine;
          replaceMarkdownAndKeepEditor(nextMarkdown, nextOffset, scrollTop);
          return true;
        }
        function selectionOnTaskLine() {
          const rawContext = currentRawLineContext(state, els);
          const lines = String(rawContext.value || "").replace(/\r\n/g, "\n").split("\n");
          const currentLineIndex = currentRawLineIndex(rawContext.value, rawContext.lineStart);
          return taskLineIndent(lines[currentLineIndex] || "") !== null;
        }
        function toggleTaskDoneAtSelection() {
          const rawContext = currentRawLineContext(state, els);
          const currentLineIndex = currentRawLineIndex(rawContext.value, rawContext.lineStart);
          const task = findCurrentTaskByLine(currentLineIndex + 1);
          if (!task) {
            return false;
          }
          toggleTaskDone2(task).catch(function(error) {
            setNoteStatus("Task toggle failed: " + errorMessage(error));
          });
          return true;
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
          const insertedRawLineNumber = rawContext.value.slice(0, rawContext.lineStart).split("\n").length;
          const insertedTaskLineNumber = insertedRawLineNumber;
          setMarkdownEditorValue(state, els, nextValue);
          state.currentMarkdown = nextValue;
          els.rawView.textContent = state.currentMarkdown;
          scheduleAutosave();
          if (command.id === "table") {
            const safeCaret = Math.max(0, Math.min(rawContext.lineStart + updated.length, nextValue.length));
            setMarkdownEditorSelection(state, els, safeCaret, safeCaret);
            setMarkdownEditorScrollTop(state, els, scrollTop);
            if (state.markdownEditorApi) {
              state.markdownEditorApi.blur();
            }
          } else {
            const caret = rawContext.lineStart + (typeof command.caret === "function" ? command.caret(updated) : updated.length);
            focusMarkdownEditor(state, els, { preventScroll: true });
            setMarkdownEditorSelection(state, els, caret, caret);
            setMarkdownEditorScrollTop(state, els, scrollTop);
          }
          closeSlashMenu(state, els);
          if (command.id === "table") {
            openInlineTableEditor2(insertedRawLineNumber, 1, 0);
          } else if (command.id === "due" || command.id === "remind") {
            openInsertedTaskPicker(insertedTaskLineNumber, command.id);
          }
          return true;
        }
        function insertTextAtEditorSelection(text) {
          if (!state.selectedPage || !state.currentPage) {
            return;
          }
          const value = markdownEditorValue(state, els);
          const selectionStart = markdownEditorSelectionStart(state, els);
          const selectionEnd = markdownEditorSelectionEnd(state, els);
          const scrollTop = markdownEditorScrollTop(state, els);
          const nextValue = value.slice(0, selectionStart) + text + value.slice(selectionEnd);
          const nextCaret = selectionStart + text.length;
          setMarkdownEditorValue(state, els, nextValue);
          state.currentMarkdown = nextValue;
          els.rawView.textContent = nextValue;
          refreshLivePageChrome();
          scheduleAutosave();
          focusMarkdownEditor(state, els, { preventScroll: true });
          setMarkdownEditorSelection(state, els, nextCaret, nextCaret);
          setMarkdownEditorScrollTop(state, els, scrollTop);
        }
        function currentPageView2() {
          return currentPageView(state.currentPage, state.currentMarkdown);
        }
        function currentPageTitleValue() {
          const page = currentPageView2();
          if (!page) {
            return "";
          }
          return page.title || pageTitleFromPath(page.page || page.path || state.selectedPage || "");
        }
        function setNoteHeadingValue(value, editable) {
          els.noteHeading.value = value;
          els.noteHeading.disabled = !editable;
          els.noteHeading.readOnly = !editable;
          els.noteHeading.title = editable ? "Rename note file" : "";
        }
        function normalizePageTitleDraft(value) {
          return String(value || "").trim().replace(/\\/g, " ").replace(/\//g, " ").replace(/\.md$/i, "").replace(/\s+/g, " ");
        }
        async function renameCurrentPageFromTitle(nextTitle) {
          if (!state.selectedPage || !state.currentPage || state.renamingPageTitle) {
            return;
          }
          const normalizedTitle = normalizePageTitleDraft(nextTitle);
          const currentPath = state.selectedPage;
          const currentLeaf = pageTitleFromPath(currentPath);
          if (!normalizedTitle) {
            setNoteHeadingValue(currentPageTitleValue() || currentLeaf, true);
            return;
          }
          if (normalizedTitle === currentLeaf) {
            setNoteHeadingValue(normalizedTitle, true);
            return;
          }
          let targetPath;
          if (normalizedTitle.indexOf("/") >= 0) {
            targetPath = normalizedTitle;
          } else {
            const slash = currentPath.lastIndexOf("/");
            const parentFolder = slash >= 0 ? currentPath.slice(0, slash) : "";
            targetPath = parentFolder ? parentFolder + "/" + normalizedTitle : normalizedTitle;
          }
          state.renamingPageTitle = true;
          try {
            if (hasUnsavedPageChanges()) {
              await saveCurrentPage();
            }
            await movePage2(currentPath, targetPath);
            setNoteStatus("Renamed " + currentLeaf + " to " + normalizedTitle + ".");
          } catch (error) {
            setNoteHeadingValue(currentPageTitleValue() || currentLeaf, true);
            setNoteStatus("Rename failed: " + errorMessage(error));
          } finally {
            state.renamingPageTitle = false;
          }
        }
        function refreshLivePageChrome() {
          const page = currentPageView2();
          if (!page) {
            return;
          }
          const fallbackPath = page.page || page.path || state.selectedPage || "";
          els.detailPath.textContent = fallbackPath;
          els.detailTitle.textContent = page.title || fallbackPath;
          setNoteHeadingValue(page.title || fallbackPath, true);
          renderPageTags2();
          renderPageProperties2();
        }
        function renderSourceModeButton() {
          const hasPage2 = Boolean(state.selectedPage && state.currentPage);
          els.toggleSourceMode.disabled = !hasPage2;
          els.toggleSourceMode.classList.toggle("active", state.sourceOpen);
          els.toggleSourceMode.setAttribute("aria-pressed", state.sourceOpen ? "true" : "false");
          els.toggleSourceMode.textContent = state.sourceOpen ? "Preview" : "Raw";
          els.toggleSourceMode.title = state.sourceOpen ? "Switch to rendered preview (" + hotkeyLabel(state.settings.preferences.hotkeys.toggleRawMode) + ")" : "Switch to raw markdown (" + hotkeyLabel(state.settings.preferences.hotkeys.toggleRawMode) + ")";
        }
        function renderPageHistoryButton() {
          const hasPage2 = Boolean(state.selectedPage && state.currentPage);
          els.pageHistoryButton.disabled = !hasPage2;
          els.pageHistoryButton.title = hasPage2 ? "Open page history" : "Open a note first";
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
            closeInlineTableEditor2();
            setMarkdownEditorValue(state, els, "");
            markdownEditorSetPagePath(state, "");
            setNoteStatus("Select a page to edit and preview markdown.");
            renderSourceModeButton();
            renderPageHistoryButton();
            return;
          }
          setMarkdownEditorValue(state, els, state.currentMarkdown);
          if (state.markdownEditorApi && state.markdownEditorApi.host) {
            state.markdownEditorApi.host.classList.remove("hidden");
            markdownEditorSetPagePath(state, state.selectedPage);
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
          if (state.sourceOpen) {
            closeInlineTableEditor2();
          } else if (state.tableEditor) {
            const lines = String(state.currentMarkdown || "").replace(/\r\n/g, "\n").split("\n");
            if (!findMarkdownTableBlockForLine(lines, state.tableEditor.startLine)) {
              closeInlineTableEditor2();
            } else {
              renderInlineTableEditor2();
            }
          }
          renderSourceModeButton();
          renderPageHistoryButton();
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
          renderPageTasks(els.pageTaskList, Array.isArray(tasks) ? tasks : [], function(task) {
            if (!task || !task.page) {
              return;
            }
            navigateToPageAtTask(task.page, task.ref || "", task.line || 0, false);
          }, function(task) {
            toggleTaskDone2(task).catch(function(error) {
              setNoteStatus("Task toggle failed: " + errorMessage(error));
            });
          }, state.taskFilter);
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
          clearPropertyDraft();
          syncURLState(true);
          els.detailPath.textContent = "Select a page";
          setNoteHeadingValue("Waiting for selection", false);
          renderNoteStudio();
          renderSourceModeButton();
          renderPageHistoryButton();
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
        function renderHelpShortcuts2() {
          renderHelpShortcuts(els, state.settings.preferences);
        }
        function renderSettingsForm2() {
          renderSettingsForm(state, els);
          els.settingsStatus.textContent = "";
        }
        function setSettingsSnapshot(snapshot) {
          state.settings.vault = snapshot.settings.vault;
          state.settings.notifications = snapshot.settings.notifications;
          state.appliedVault = snapshot.appliedVault;
          state.settingsRestartRequired = snapshot.restartRequired;
          state.settingsLoaded = true;
          renderHomeButton();
          renderHelpShortcuts2();
          renderSettingsForm2();
          applyUIPreferences();
          renderSourceModeButton();
          renderPageHistoryButton();
          loadMeta();
          if (state.currentPage) {
            renderNoteStudio();
            renderPageTasks2(state.currentPage.tasks || []);
            renderPageContext2();
            renderPageProperties2();
          } else if (state.selectedSavedQuery) {
            loadSavedQueryDetail(state.selectedSavedQuery);
          }
        }
        function setUserSettingsSnapshot(snapshot) {
          state.homePage = normalizePageDraftPath(snapshot.settings.homePage || "");
          state.settings.userNotifications = {
            ntfyTopicUrl: snapshot.settings.notifications.ntfyTopicUrl || "",
            ntfyToken: snapshot.settings.notifications.ntfyToken || ""
          };
          state.userSettingsLoaded = true;
          renderHomeButton();
          renderSettingsForm2();
        }
        function currentThemeID() {
          return String(state.settings.preferences.ui.themeId || defaultThemeId).trim() || defaultThemeId;
        }
        function refreshThemeCache(themes) {
          state.themeCache = mergeThemeCache(themes);
          saveStoredThemeCache(state.themeCache);
        }
        function syncThemeSelection(themeID) {
          const normalizedID = String(themeID || "").trim() || defaultThemeId;
          state.settings.preferences.ui.themeId = normalizedID;
          state.previewThemeId = normalizedID;
        }
        function applyCurrentTheme(themeID) {
          const resolved = resolveTheme(themeID || currentThemeID(), state.themeLibrary, state.themeCache);
          applyTheme(resolved);
          return resolved;
        }
        function restoreSavedThemePreview() {
          const savedThemeID = state.savedThemeId || defaultThemeId;
          syncThemeSelection(savedThemeID);
          applyCurrentTheme(savedThemeID);
          renderSettingsForm2();
        }
        function applyUIPreferences() {
          const root = document.documentElement;
          const fontFamily = state.settings.preferences.ui.fontFamily || "mono";
          const fontSize = state.settings.preferences.ui.fontSize || "16";
          const dateTimeFormat = state.settings.preferences.ui.dateTimeFormat || "browser";
          const fontMap = {
            mono: '"IBM Plex Mono", "SFMono-Regular", Consolas, "Liberation Mono", monospace',
            sans: '"IBM Plex Sans", "Segoe UI", system-ui, sans-serif',
            serif: '"Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif'
          };
          root.style.setProperty("--app-font-family", fontMap[fontFamily] || fontMap.mono);
          root.style.setProperty("--editor-font-family", fontMap[fontFamily] || fontMap.mono);
          root.style.setProperty("--app-font-size", fontSize + "px");
          setDateTimeDisplayFormat(dateTimeFormat);
          markdownEditorSetDateTimeFormat(state, dateTimeFormat);
          applyCurrentTheme(currentThemeID());
        }
        async function loadThemes() {
          const payload = normalizeThemeListResponse(await fetchJSON("/api/themes"));
          state.themeLibrary = Array.isArray(payload.themes) && payload.themes.length > 0 ? payload.themes.slice() : builtinThemeLibrary();
          state.themeLibraryLoaded = true;
          refreshThemeCache(state.themeLibrary);
          const currentThemeIDValue = currentThemeID();
          const resolved = resolveTheme(currentThemeIDValue, state.themeLibrary, state.themeCache);
          const savedThemeStillExists = resolved.id === currentThemeIDValue;
          if (!savedThemeStillExists) {
            syncThemeSelection(defaultThemeId);
            saveStoredClientPreferences(state.settings.preferences);
            state.savedThemeId = defaultThemeId;
          }
          applyCurrentTheme(currentThemeID());
          renderSettingsForm2();
        }
        function currentSelectedTheme() {
          const selectedID = String(els.settingsTheme.value || currentThemeID()).trim();
          return state.themeLibrary.find(function(theme) {
            return theme.id === selectedID;
          }) || null;
        }
        function previewTheme(themeID, persistSelection) {
          syncThemeSelection(themeID);
          applyCurrentTheme(themeID);
          if (persistSelection) {
            state.savedThemeId = currentThemeID();
            saveStoredClientPreferences(state.settings.preferences);
          }
          renderSettingsForm2();
        }
        async function uploadThemeFile(file) {
          const body = new FormData();
          body.append("file", file);
          const created = await fetchJSON("/api/themes", {
            method: "POST",
            body
          });
          state.themeLibrary = builtinThemeLibrary().concat(
            state.themeLibrary.filter(function(theme) {
              return theme.source === "custom" && theme.id !== created.id;
            }),
            [created]
          );
          refreshThemeCache(state.themeLibrary);
          previewTheme(created.id, false);
          els.settingsStatus.textContent = 'Theme "' + created.name + '" uploaded.';
        }
        async function deleteCurrentTheme() {
          const selectedTheme = currentSelectedTheme();
          if (!selectedTheme || selectedTheme.source !== "custom") {
            return;
          }
          if (!window.confirm('Delete theme "' + selectedTheme.name + '"?')) {
            return;
          }
          await fetchJSON("/api/themes/" + encodeURIComponent(selectedTheme.id), {
            method: "DELETE"
          });
          state.themeLibrary = state.themeLibrary.filter(function(theme) {
            return theme.id !== selectedTheme.id;
          });
          state.themeCache = removeThemeFromCache(state.themeCache, selectedTheme.id);
          saveStoredThemeCache(state.themeCache);
          const removedActiveTheme = state.savedThemeId === selectedTheme.id || state.previewThemeId === selectedTheme.id;
          if (removedActiveTheme) {
            syncThemeSelection(defaultThemeId);
            state.savedThemeId = defaultThemeId;
            saveStoredClientPreferences(state.settings.preferences);
            applyCurrentTheme(defaultThemeId);
          }
          renderSettingsForm2();
          els.settingsStatus.textContent = 'Theme "' + selectedTheme.name + '" deleted.';
        }
        async function loadSettings() {
          try {
            const snapshot = await fetchJSON("/api/settings");
            setSettingsSnapshot(snapshot);
          } catch (error) {
            state.settingsLoaded = false;
            renderSettingsForm2();
            els.settingsStatus.textContent = errorMessage(error);
          }
        }
        async function loadUserSettings() {
          try {
            const snapshot = await fetchJSON("/api/user/settings");
            setUserSettingsSnapshot(snapshot);
          } catch (error) {
            state.userSettingsLoaded = false;
            renderSettingsForm2();
            throw error;
          }
        }
        async function loadMeta() {
          try {
            const meta = await fetchJSON("/api/meta");
            const runtimeVaultPath = meta.runtimeVault && meta.runtimeVault.vaultPath ? meta.runtimeVault.vaultPath : "(none)";
            const pills = [
              "Listening " + meta.listenAddr,
              "Runtime vault " + runtimeVaultPath,
              "DB " + meta.database,
              "Time " + formatDateTimeValue(meta.serverTime)
            ];
            if (meta.currentVault && meta.currentVault.vaultPath && meta.currentVault.vaultPath !== runtimeVaultPath) {
              pills.splice(2, 0, "Current vault " + meta.currentVault.vaultPath);
            }
            if (meta.restartRequired) {
              pills.splice(2, 0, "Restart required");
            }
            setMetaPills(pills);
            renderVaultHealth(meta);
          } catch (error) {
            setMetaPills(["Meta error", errorMessage(error)]);
            renderVaultHealth(null);
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
            els.pageList.classList.add("no-scroll");
          }
        }
        function renderPages() {
          renderPagesSection(state, els, {
            navigateToPage,
            createPage: createPage2,
            renameFolder: renameFolder2,
            deleteFolder: deleteFolder2,
            renamePage: renamePage2,
            deletePage: deletePage2,
            movePageToFolder: movePageToFolder2,
            moveFolder: moveFolder2,
            openPageHistory: openPageHistoryFor,
            currentHomePage,
            setHomePage,
            setNoteStatus,
            errorMessage
          }, openTreeContextMenu2);
        }
        function closeTreeContextMenu2() {
          treeContextMenuState.target = null;
          closeTreeContextMenu(els.treeContextMenu);
        }
        function openPageHistoryFor(pagePath) {
          if (!pagePath) {
            return;
          }
          closeTreeContextMenu2();
          navigateToPage(pagePath, false);
          window.setTimeout(function() {
            setPageHistoryOpen2(true);
            loadPageHistory().catch(function(error) {
              setNoteStatus("History failed: " + errorMessage(error));
            });
          }, 0);
        }
        function openTreeContextMenu2(target, left, top) {
          treeContextMenuState.target = target;
          treeContextMenuState.left = left;
          treeContextMenuState.top = top;
          openTreeContextMenu(els.treeContextMenu, target, left, top, {
            navigateToPage,
            createPage: createPage2,
            renameFolder: renameFolder2,
            deleteFolder: deleteFolder2,
            renamePage: renamePage2,
            deletePage: deletePage2,
            movePageToFolder: movePageToFolder2,
            moveFolder: moveFolder2,
            openPageHistory: openPageHistoryFor,
            currentHomePage,
            setHomePage,
            setNoteStatus,
            errorMessage
          });
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
        function findCurrentTaskByLine(lineNumber) {
          if (!state.currentPage || !state.currentPage.tasks || !lineNumber) {
            return null;
          }
          return state.currentPage.tasks.find(function(task) {
            return Number(task.line) === lineNumber;
          }) || null;
        }
        function openInsertedTaskPicker(lineNumber, mode) {
          const task = findCurrentTaskByLine(lineNumber);
          if (!task || !task.ref) {
            return;
          }
          window.requestAnimationFrame(function() {
            const caretRect = state.markdownEditorApi ? state.markdownEditorApi.getCaretRect() : null;
            const left = caretRect ? caretRect.left : 0;
            const top = caretRect ? caretRect.bottom + 10 : 0;
            openInlineTaskPicker2(task.ref, mode, left, top);
          });
        }
        async function toggleTaskDone2(task) {
          if (!task || !task.ref) {
            return;
          }
          try {
            setTaskDateApplySuppressed2(true);
            rememberNoteFocus();
            await toggleTaskDone(task);
            await Promise.all([state.selectedPage ? loadPageDetail(state.selectedPage, true, false) : Promise.resolve()]);
            restoreNoteFocus();
            window.requestAnimationFrame(function() {
              window.requestAnimationFrame(function() {
                setTaskDateApplySuppressed2(false);
              });
            });
          } catch (error) {
            setTaskDateApplySuppressed2(false);
            setNoteStatus("Task toggle failed: " + errorMessage(error));
          }
        }
        async function loadPageDetail(pagePath, force, allowEditorFocus) {
          if (!force && hasUnsavedPageChanges()) {
            setNoteStatus("Unsaved local edits on " + state.selectedPage + ". Autosave pending.");
            return;
          }
          const shouldFocusEditor = allowEditorFocus !== false;
          try {
            const pendingLineFocus = state.pendingPageLineFocus;
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
            clearPropertyDraft();
            state.selectedSavedQueryPayload = null;
            els.detailPath.textContent = page.page || page.path || pagePath;
            setNoteHeadingValue(page.title || page.page || pagePath, true);
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
            if (shouldFocusEditor && state.markdownEditorApi && !blockingOverlayOpen(els) && !inlineTableEditorOpen2()) {
              state.markdownEditorApi.setHighlightedLine(
                typeof pendingLineFocus === "number" && pendingLineFocus > 0 ? pendingLineFocus : null
              );
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
                state.markdownEditorApi.setHighlightedLine(null);
                focusEditorAtBodyPosition(firstEditableLineIndex(state.currentMarkdown), 0);
              }
            } else if (shouldFocusEditor && state.sourceOpen && !blockingOverlayOpen(els) && !inlineTableEditorOpen2()) {
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
            setNoteHeadingValue(savedQuery.title || savedQuery.name || name, false);
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
            if (!force && (markdownEditorHasFocus(state, els) || inlineTableEditorHasFocus2() || inlineTableEditorOpen2())) {
              return;
            }
            loadPageDetail(state.selectedPage, force, false);
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
          small.textContent = formatTimeValue(/* @__PURE__ */ new Date());
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
        function setSearchOpen2(open) {
          setSearchOpen(els, open, rememberNoteFocus);
        }
        function closeSearchModal() {
          setSearchOpen2(false);
        }
        function rememberNoteFocus() {
          if (!state.selectedPage) {
            return;
          }
          state.restoreFocusSpec = {
            mode: "editor",
            offset: markdownEditorSelectionStart(state, els)
          };
        }
        function restoreNoteFocus() {
          if (!state.selectedPage) {
            return;
          }
          restoreEditorFocus(state, els, state.selectedPage);
          window.requestAnimationFrame(function() {
            if (state.selectedPage && !state.restoreFocusSpec && !blockingOverlayOpen(els) && !inlineTableEditorOpen2()) {
              focusMarkdownEditor(state, els, { preventScroll: true });
            }
          });
        }
        function searchResultButtons() {
          return paletteModalButtons(els.globalSearchResults);
        }
        function commandResultButtons() {
          return resultButtons(els.commandPaletteResults);
        }
        function quickSwitcherResultButtons() {
          return paletteModalButtons(els.quickSwitcherResults);
        }
        function documentResultButtons() {
          return paletteModalButtons(els.documentsResults);
        }
        function updateSearchSelection() {
          updatePaletteModalSelection(els.globalSearchResults, state.searchSelectionIndex);
        }
        function updateCommandSelection() {
          updateSelection(els.commandPaletteResults, state.commandSelectionIndex);
        }
        function updateQuickSwitcherSelection() {
          updatePaletteModalSelection(els.quickSwitcherResults, state.quickSwitcherSelectionIndex);
        }
        function updateDocumentSelection() {
          updatePaletteModalSelection(els.documentsResults, state.documentSelectionIndex);
        }
        function moveSearchSelection(delta) {
          state.searchSelectionIndex = movePaletteModalSelection(els.globalSearchResults, state.searchSelectionIndex, delta);
        }
        function moveCommandSelection(delta) {
          state.commandSelectionIndex = moveSelection(els.commandPaletteResults, state.commandSelectionIndex, delta);
        }
        function moveQuickSwitcherSelection(delta) {
          state.quickSwitcherSelectionIndex = movePaletteModalSelection(
            els.quickSwitcherResults,
            state.quickSwitcherSelectionIndex,
            delta
          );
        }
        function moveDocumentSelection(delta) {
          state.documentSelectionIndex = movePaletteModalSelection(els.documentsResults, state.documentSelectionIndex, delta);
        }
        function triggerSearchSelection() {
          triggerPaletteModalSelection(els.globalSearchResults, state.searchSelectionIndex);
        }
        function triggerCommandSelection() {
          triggerSelection(els.commandPaletteResults, state.commandSelectionIndex);
        }
        function triggerQuickSwitcherSelection() {
          triggerPaletteModalSelection(els.quickSwitcherResults, state.quickSwitcherSelectionIndex);
        }
        function triggerDocumentSelection() {
          triggerPaletteModalSelection(els.documentsResults, state.documentSelectionIndex);
        }
        function setCommandPaletteOpen2(open) {
          setCommandPaletteOpen(els, open, rememberNoteFocus);
        }
        function closeCommandPalette() {
          setCommandPaletteOpen2(false);
        }
        function setQuickSwitcherOpen2(open) {
          setQuickSwitcherOpen(els, open, rememberNoteFocus);
        }
        function closeQuickSwitcher() {
          setQuickSwitcherOpen2(false);
        }
        function setDocumentsOpen2(open) {
          setDocumentsOpen(els, open, rememberNoteFocus);
        }
        function closeDocumentsModal() {
          setDocumentsOpen2(false);
        }
        function selectedPageHistoryRevision2() {
          return selectedPageHistoryRevision(state);
        }
        function renderPageHistoryPreview2() {
          renderPageHistoryPreview(state, els);
        }
        function restorePageHistoryRevision(revision) {
          if (!state.selectedPage) {
            return;
          }
          fetchJSON("/api/page-history/" + encodePath(state.selectedPage) + "/restore", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ revisionId: revision.id })
          }).then(function() {
            closePageHistoryModal();
            return Promise.all([loadPages(), loadPageDetail(state.selectedPage, true)]);
          }).then(function() {
            setNoteStatus("Restored revision for " + state.selectedPage + ".");
          }).catch(function(error) {
            setNoteStatus("Restore failed: " + errorMessage(error));
          });
        }
        function setPageHistoryOpen2(open) {
          setPageHistoryOpen(state, els, open, rememberNoteFocus);
        }
        function closePageHistoryModal() {
          setPageHistoryOpen2(false);
        }
        function renderPageHistory2() {
          renderPageHistory(state, els, renderPageHistory2);
        }
        async function loadPageHistory() {
          if (!state.selectedPage) {
            state.pageHistory = [];
            state.selectedHistoryRevisionId = "";
            renderPageHistory2();
            return;
          }
          els.pageHistoryTitle.textContent = "Revision History \xB7 " + pageTitleFromPath(state.selectedPage);
          const payload = await fetchJSON("/api/page-history/" + encodePath(state.selectedPage));
          state.pageHistory = Array.isArray(payload.revisions) ? payload.revisions : [];
          state.selectedHistoryRevisionId = state.pageHistory[0] ? state.pageHistory[0].id : "";
          renderPageHistory2();
        }
        async function purgeCurrentPageHistory() {
          if (!state.selectedPage) {
            return;
          }
          if (!window.confirm("Permanently remove all saved revisions for " + state.selectedPage + "?")) {
            return;
          }
          await fetchJSON("/api/page-history/" + encodePath(state.selectedPage), {
            method: "DELETE"
          });
          state.pageHistory = [];
          renderPageHistory2();
          setNoteStatus("Purged history for " + state.selectedPage + ".");
        }
        function setTrashOpen2(open) {
          setTrashOpen(els, open, rememberNoteFocus);
        }
        function closeTrashModal() {
          setTrashOpen2(false);
        }
        function renderTrash2() {
          renderTrash(state, els, {
            onRestore: function(entry) {
              fetchJSON("/api/trash/pages/" + encodePath(entry.page) + "/restore", {
                method: "POST"
              }).then(function(payload) {
                return loadPages().then(function() {
                  state.trashPages = state.trashPages.filter(function(item) {
                    return item.page !== entry.page;
                  });
                  renderTrash2();
                  navigateToPage(payload.page || entry.page, false);
                  setNoteStatus("Restored " + entry.page + " from trash.");
                });
              }).catch(function(error) {
                setNoteStatus("Restore failed: " + errorMessage(error));
              });
            },
            onDelete: function(entry) {
              if (!window.confirm('Permanently delete "' + entry.page + '" and its history?')) {
                return;
              }
              fetchJSON("/api/trash/pages/" + encodePath(entry.page), {
                method: "DELETE"
              }).then(function() {
                state.trashPages = state.trashPages.filter(function(item) {
                  return item.page !== entry.page;
                });
                renderTrash2();
                setNoteStatus("Permanently deleted " + entry.page + ".");
              }).catch(function(error) {
                setNoteStatus("Permanent delete failed: " + errorMessage(error));
              });
            }
          });
        }
        async function loadTrash() {
          const payload = await fetchJSON("/api/trash/pages");
          state.trashPages = Array.isArray(payload.pages) ? payload.pages : [];
          renderTrash2();
        }
        async function emptyTrash() {
          if (!state.trashPages.length) {
            return;
          }
          if (!window.confirm("Permanently delete all trashed pages and their history?")) {
            return;
          }
          await fetchJSON("/api/trash/pages", {
            method: "DELETE"
          });
          state.trashPages = [];
          renderTrash2();
          setNoteStatus("Trash emptied.");
        }
        function setHelpOpen(open) {
          if (open) {
            rememberNoteFocus();
            els.searchModalShell.classList.add("hidden");
            els.commandModalShell.classList.add("hidden");
            els.quickSwitcherModalShell.classList.add("hidden");
            els.documentsModalShell.classList.add("hidden");
            els.pageHistoryModalShell.classList.add("hidden");
            els.trashModalShell.classList.add("hidden");
            els.helpModalShell.classList.remove("hidden");
            window.requestAnimationFrame(function() {
              focusWithoutScroll(els.closeHelpModal);
            });
            return;
          }
          els.helpModalShell.classList.add("hidden");
        }
        function closeHelpModal() {
          setHelpOpen(false);
        }
        function setSettingsOpen(open) {
          if (open) {
            state.savedThemeId = currentThemeID();
            state.previewThemeId = currentThemeID();
            rememberNoteFocus();
            els.searchModalShell.classList.add("hidden");
            els.commandModalShell.classList.add("hidden");
            els.quickSwitcherModalShell.classList.add("hidden");
            els.documentsModalShell.classList.add("hidden");
            els.helpModalShell.classList.add("hidden");
            els.pageHistoryModalShell.classList.add("hidden");
            els.trashModalShell.classList.add("hidden");
            els.settingsModalShell.classList.remove("hidden");
            renderSettingsForm2();
            if (!state.settingsLoaded) {
              loadSettings();
            }
            window.requestAnimationFrame(function() {
              if (state.settingsSection === "vault" && state.settingsLoaded) {
                focusWithoutScroll(els.settingsVaultPath);
                return;
              }
              if (state.settingsSection === "notifications") {
                focusWithoutScroll(els.settingsUserNtfyTopicUrl);
                return;
              }
              if (state.settingsSection === "appearance") {
                focusWithoutScroll(els.settingsTheme);
                return;
              }
              focusWithoutScroll(els.closeSettingsModal);
            });
            return;
          }
          els.settingsModalShell.classList.add("hidden");
        }
        function closeSettingsModal() {
          if (state.previewThemeId !== state.savedThemeId) {
            restoreSavedThemePreview();
          }
          setSettingsOpen(false);
        }
        function collectServerSettingsForm() {
          return {
            vault: {
              vaultPath: String(els.settingsVaultPath.value || "").trim(),
              homePage: state.settings.vault.homePage || ""
            },
            notifications: {
              ntfyInterval: String(els.settingsNtfyInterval.value || "1m").trim()
            }
          };
        }
        function collectUserSettingsForm() {
          return {
            settings: {
              homePage: normalizePageDraftPath(state.homePage || ""),
              notifications: {
                ntfyTopicUrl: String(els.settingsUserNtfyTopicUrl.value || "").trim(),
                ntfyToken: String(els.settingsUserNtfyToken.value || "").trim()
              }
            }
          };
        }
        function currentUserSettingsPayload() {
          return {
            settings: {
              homePage: normalizePageDraftPath(state.homePage || ""),
              notifications: {
                ntfyTopicUrl: state.settings.userNotifications.ntfyTopicUrl || "",
                ntfyToken: state.settings.userNotifications.ntfyToken || ""
              }
            }
          };
        }
        function persistUserHomePage(showFailure) {
          if (!state.authenticated) {
            return;
          }
          fetchJSON("/api/user/settings", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(currentUserSettingsPayload())
          }).then(function(snapshot) {
            setUserSettingsSnapshot(snapshot);
          }).catch(function(error) {
            if (showFailure) {
              setNoteStatus("Home page update failed: " + errorMessage(error));
            }
          });
        }
        function collectClientPreferencesForm() {
          return normalizeClientPreferences({
            ui: {
              themeId: String(els.settingsTheme.value || defaultThemeId).trim(),
              fontFamily: String(els.settingsFontFamily.value || "mono").trim(),
              fontSize: String(els.settingsFontSize.value || "16").trim(),
              dateTimeFormat: String(els.settingsDateTimeFormat.value || "browser").trim()
            },
            vaults: {
              topLevelFoldersAsVaults: Boolean(els.settingsUserTopLevelVaults.checked)
            },
            hotkeys: {
              quickSwitcher: String(els.settingsQuickSwitcher.value || "").trim(),
              globalSearch: String(els.settingsGlobalSearch.value || "").trim(),
              commandPalette: String(els.settingsCommandPalette.value || "").trim(),
              quickNote: String(els.settingsQuickNote.value || "").trim(),
              help: String(els.settingsHelp.value || "").trim(),
              saveCurrentPage: String(els.settingsSaveCurrentPage.value || "").trim(),
              toggleRawMode: String(els.settingsToggleRawMode.value || "").trim(),
              toggleTaskDone: String(els.settingsToggleTaskDone.value || "").trim()
            }
          });
        }
        function applyClientPreferences(preferences) {
          state.settings.preferences = cloneClientPreferences(preferences);
          state.topLevelFoldersAsVaults = Boolean(state.settings.preferences.vaults.topLevelFoldersAsVaults);
          state.savedThemeId = currentThemeID();
          state.previewThemeId = currentThemeID();
          saveStoredClientPreferences(state.settings.preferences);
          renderHelpShortcuts2();
          renderSettingsForm2();
          applyUIPreferences();
          renderSourceModeButton();
          renderPageHistoryButton();
          if (state.currentPage) {
            renderNoteStudio();
            renderPageTasks2(state.currentPage.tasks || []);
            renderPageContext2();
            renderPageProperties2();
          }
        }
        async function persistSettings() {
          if (!state.settingsLoaded) {
            els.settingsStatus.textContent = "Settings are still loading. Try again in a moment.";
            return;
          }
          const previousTopLevelFoldersAsVaults = state.topLevelFoldersAsVaults;
          const nextSettings = prepareSettingsSave(
            collectClientPreferencesForm,
            collectUserSettingsForm,
            collectServerSettingsForm,
            applyClientPreferences
          );
          els.settingsStatus.textContent = "Saving settings\u2026";
          try {
            const userSnapshot = await fetchJSON("/api/user/settings", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(nextSettings.userSettings)
            });
            setUserSettingsSnapshot(userSnapshot);
            const settingsSnapshot = await fetchJSON("/api/settings", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(nextSettings.serverSettings)
            });
            setSettingsSnapshot(settingsSnapshot);
            await loadMeta();
            await loadAuthVaults();
            if (state.selectedPage || state.selectedSavedQuery) {
              syncURLState(true);
            }
            if (previousTopLevelFoldersAsVaults !== state.topLevelFoldersAsVaults) {
              window.location.reload();
              return;
            }
            closeSettingsModal();
            restoreNoteFocus();
            setNoteStatus(settingsSnapshot.restartRequired ? "Settings saved. Restart required to apply runtime changes." : "Settings saved.");
          } catch (error) {
            els.settingsStatus.textContent = "Settings save failed: " + errorMessage(error);
          }
        }
        function renderGlobalSearchResults2(payload) {
          state.searchSelectionIndex = renderSearchResults({
            els,
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
        }
        async function runGlobalSearch() {
          if (!els.globalSearchInput || !els.globalSearchResults) {
            return;
          }
          const query = els.globalSearchInput.value.trim();
          if (!query) {
            renderSearchEmptyState(els, "Type to search pages, tasks, and saved queries.");
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
        function renderQuickSwitcherResults3() {
          state.quickSwitcherSelectionIndex = renderQuickSwitcherResults2({
            els,
            inputValue: els.quickSwitcherInput ? els.quickSwitcherInput.value : "",
            pages: state.pages,
            selectedPage: state.selectedPage,
            onClose: closeQuickSwitcher,
            onOpenPage: function(pagePath) {
              navigateToPage(pagePath, false);
            },
            onCreatePage: function(pagePath) {
              createPage2(pagePath).catch(function(error) {
                setNoteStatus("Create page failed: " + errorMessage(error));
              });
            }
          });
        }
        function handleDocumentSelection(document2) {
          closeDocumentsModal();
          if (state.selectedPage && state.currentPage) {
            insertTextAtEditorSelection(documentLinkForSelection(document2, state.selectedPage));
            setNoteStatus("Inserted document link for " + document2.name + ".");
            return;
          }
          window.open(document2.downloadURL, "_blank", "noopener");
        }
        async function copyCodeBlock(code) {
          const value = String(code || "");
          if (!value) {
            setNoteStatus("Code block is empty.");
            return;
          }
          if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(value);
            setNoteStatus("Copied code block.");
            return;
          }
          const textarea = document.createElement("textarea");
          textarea.value = value;
          textarea.setAttribute("readonly", "true");
          textarea.style.position = "fixed";
          textarea.style.opacity = "0";
          textarea.style.pointerEvents = "none";
          document.body.appendChild(textarea);
          textarea.select();
          try {
            document.execCommand("copy");
            setNoteStatus("Copied code block.");
          } finally {
            document.body.removeChild(textarea);
          }
        }
        function renderDocumentResults2() {
          state.documentSelectionIndex = renderDocumentResults({
            els,
            inputValue: els.documentsInput ? els.documentsInput.value : "",
            documents: state.documents,
            onSelectDocument: handleDocumentSelection
          });
        }
        async function loadDocuments() {
          const query = String(els.documentsInput ? els.documentsInput.value : "").trim();
          if (els.documentsResults) {
            els.documentsResults.textContent = "Loading\u2026";
          }
          try {
            const payload = await fetchJSON("/api/documents" + (query ? "?q=" + encodeURIComponent(query) : ""));
            state.documents = Array.isArray(payload.documents) ? payload.documents : [];
            renderDocumentResults2();
          } catch (error) {
            if (els.documentsResults) {
              els.documentsResults.textContent = errorMessage(error);
            }
          }
        }
        function scheduleQuickSwitcherRefresh() {
          window.clearTimeout(state.quickSwitcherTimer ?? void 0);
          state.quickSwitcherTimer = window.setTimeout(renderQuickSwitcherResults3, 50);
        }
        function scheduleDocumentsRefresh() {
          window.clearTimeout(state.documentTimer ?? void 0);
          state.documentTimer = window.setTimeout(loadDocuments, 80);
        }
        function scheduleGlobalSearch() {
          window.clearTimeout(state.searchTimer ?? void 0);
          state.searchTimer = window.setTimeout(runGlobalSearch, 120);
        }
        async function createPage2(pagePath) {
          return createPage(pagePath, {
            encodePath,
            fetchJSON,
            loadPages,
            navigateToPage
          });
        }
        async function uploadDocument(file) {
          const formData = new FormData();
          formData.append("file", file);
          if (state.selectedPage) {
            formData.append("page", state.selectedPage);
          }
          const response = await fetch("/api/documents", {
            method: "POST",
            body: formData
          });
          await requireOK(response);
          const document2 = await response.json();
          state.documents = [document2].concat(state.documents.filter(function(item) {
            return item.id !== document2.id;
          }));
          return document2;
        }
        async function uploadDroppedFiles(fileList) {
          if (!fileList || !fileList.length) {
            return;
          }
          if (!state.selectedPage || !state.currentPage) {
            setNoteStatus("Open a note before uploading documents.");
            return;
          }
          const documents = [];
          setNoteStatus("Uploading " + String(fileList.length) + " document" + (fileList.length === 1 ? "" : "s") + "\u2026");
          for (let index = 0; index < fileList.length; index += 1) {
            const file = fileList[index];
            if (!file) {
              continue;
            }
            const document2 = await uploadDocument(file);
            documents.push(document2);
          }
          if (!documents.length) {
            return;
          }
          insertTextAtEditorSelection(documents.map(function(document2) {
            return documentLinkForSelection(document2, state.selectedPage);
          }).join("\n"));
          setNoteStatus("Uploaded " + String(documents.length) + " document" + (documents.length === 1 ? "" : "s") + ".");
        }
        async function deletePage2(pagePath) {
          return deletePage(pagePath, state, {
            encodePath,
            fetchJSON,
            loadPages,
            currentHomePage,
            clearHomePage,
            clearPageSelection,
            navigateToPage,
            setNoteStatus
          });
        }
        async function deleteFolder2(folderKey) {
          return deleteFolder(folderKey, state, {
            encodePath,
            fetchJSON,
            loadPages,
            currentHomePage,
            clearHomePage,
            clearPageSelection
          });
        }
        async function movePage2(pagePath, targetPage) {
          return movePage(pagePath, targetPage, {
            encodePath,
            fetchJSON,
            loadPages,
            currentHomePage,
            setHomePage,
            navigateToPage
          });
        }
        async function renamePage2(pagePath, nextLeafName) {
          return renamePage(pagePath, nextLeafName, {
            encodePath,
            fetchJSON,
            loadPages,
            currentHomePage,
            setHomePage,
            navigateToPage
          });
        }
        async function movePageToFolder2(pagePath, folderKey) {
          return movePageToFolder(pagePath, folderKey, {
            encodePath,
            fetchJSON,
            loadPages,
            currentHomePage,
            setHomePage,
            navigateToPage
          });
        }
        async function moveFolder2(folderKey, targetFolder) {
          return moveFolder(folderKey, targetFolder, state, {
            encodePath,
            fetchJSON,
            loadPages,
            currentHomePage,
            setHomePage,
            navigateToPage,
            renderPages
          });
        }
        async function renameFolder2(folderKey, nextLeafName) {
          return renameFolder(folderKey, nextLeafName, state, {
            encodePath,
            fetchJSON,
            loadPages,
            currentHomePage,
            setHomePage,
            navigateToPage,
            renderPages
          });
        }
        function renderCommandPaletteResults2() {
          state.commandSelectionIndex = renderCommandResults({
            els,
            inputValue: els.commandPaletteInput ? els.commandPaletteInput.value : "",
            selectedPage: state.selectedPage,
            sourceOpen: state.sourceOpen,
            railOpen: state.railOpen,
            currentHomePage: currentHomePage(),
            hotkeys: state.settings.preferences.hotkeys,
            onToggleSource: function() {
              setSourceOpen(!state.sourceOpen);
            },
            onOpenHelp: function() {
              closeCommandPalette();
              setHelpOpen(true);
            },
            onOpenSettings: function() {
              closeCommandPalette();
              setSettingsOpen(true);
            },
            onOpenDocuments: function() {
              closeCommandPalette();
              setDocumentsOpen2(true);
              scheduleDocumentsRefresh();
            },
            onOpenQuickSwitcher: function() {
              closeCommandPalette();
              setQuickSwitcherOpen2(true);
              renderQuickSwitcherResults3();
            },
            onQuickNote: function() {
              closeCommandPalette();
              createDailyNote();
            },
            onOpenSearch: function() {
              closeCommandPalette();
              setSearchOpen2(true);
              scheduleGlobalSearch();
            },
            onFocusRail: function(tab) {
              closeCommandPalette();
              setRailTab(tab);
              if (window.matchMedia("(max-width: 1180px)").matches) {
                setRailOpen(true);
              }
            },
            onToggleRail: function() {
              closeCommandPalette();
              setRailOpen(!state.railOpen);
            },
            onOpenHomePage: function(pagePath) {
              closeCommandPalette();
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
              deletePage2(pagePath).catch(function(error) {
                setNoteStatus("Delete page failed: " + errorMessage(error));
              });
            },
            onClearHomePage: function() {
              clearHomePage();
              closeCommandPalette();
              renderCommandPaletteResults2();
              setNoteStatus("Home page cleared.");
            }
          });
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
          renderSourceModeButton();
          renderPageHistoryButton();
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
          const mobileLayout = window.matchMedia("(max-width: 1180px)").matches;
          if (els.rail) {
            els.rail.classList.toggle("open", state.railOpen);
          }
          if (els.appLayout) {
            els.appLayout.classList.toggle("rail-collapsed", !mobileLayout && !state.railOpen);
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
            if (!markdownEditorHasFocus(state, els) && !inlineTableEditorHasFocus2()) {
              await loadPageDetail(state.selectedPage, true, false);
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
          on(window, "noterious:auth-required", function() {
            if (state.authenticated) {
              window.location.reload();
            }
          });
          on(els.authForm, "submit", function(event) {
            event.preventDefault();
            if (state.authGateMode === "changePassword") {
              changePassword();
              return;
            }
            if (state.authGateMode === "setup") {
              setupInitialAdmin();
              return;
            }
            login();
          });
          function isTypingTarget(target) {
            const element = target instanceof Element ? target : null;
            if (!element) {
              return false;
            }
            return Boolean(element.closest("input, textarea, select, [contenteditable='true'], .cm-editor, .cm-content"));
          }
          on(els.pageSearch, "input", loadPages);
          on(els.pageSearch, "blur", function() {
            if (!els.pageSearch.value.trim()) {
              setPageSearchOpen(false);
            }
          });
          on(els.querySearch, "input", loadSavedQueryTree);
          on(els.reloadPages, "click", loadPages);
          on(els.reloadQueries, "click", loadSavedQueryTree);
          on(els.addProperty, "click", startAddProperty);
          on(els.toggleRail, "click", function() {
            setRailOpen(!state.railOpen);
          });
          on(els.togglePageSearch, "click", function() {
            setPageSearchOpen(els.pageSearchShell.classList.contains("hidden"));
          });
          on(els.openSessionMenu, "click", function() {
            if (!state.authenticated) {
              setAuthGateOpen2(true, "Sign in to continue.");
              return;
            }
            const nextOpen = els.sessionMenuPanel.classList.contains("hidden");
            setSessionMenuOpen2(nextOpen);
          });
          on(els.openVaultSwitcher, "click", function() {
            if (els.openVaultSwitcher.disabled) {
              return;
            }
            setVaultSwitcherOpen2(!state.vaultSwitcherOpen);
          });
          on(els.logoutSession, "click", function() {
            setSessionMenuOpen2(false);
            logout();
          });
          on(els.openHelp, "click", function() {
            setSessionMenuOpen2(false);
            setHelpOpen(true);
          });
          on(els.openTrash, "click", function() {
            setSessionMenuOpen2(false);
            setTrashOpen2(true);
            loadTrash().catch(function(error) {
              setNoteStatus("Trash failed: " + errorMessage(error));
            });
          });
          on(els.openSettings, "click", function() {
            setSessionMenuOpen2(false);
            setSettingsOpen(true);
          });
          on(els.settingsNavAppearance, "click", function() {
            state.settingsSection = "appearance";
            renderSettingsForm2();
          });
          on(els.settingsNavNotifications, "click", function() {
            state.settingsSection = "notifications";
            renderSettingsForm2();
          });
          on(els.settingsNavVault, "click", function() {
            state.settingsSection = "vault";
            renderSettingsForm2();
          });
          on(els.openQuickSwitcher, "click", function() {
            setSessionMenuOpen2(false);
            setQuickSwitcherOpen2(true);
            renderQuickSwitcherResults3();
          });
          on(els.openHomePage, "click", function() {
            setSessionMenuOpen2(false);
            const homePage = currentHomePage();
            if (!homePage) {
              setNoteStatus("No home page configured.");
              return;
            }
            navigateToPage(homePage, false);
          });
          on(els.openDocuments, "click", function() {
            setSessionMenuOpen2(false);
            setDocumentsOpen2(true);
            scheduleDocumentsRefresh();
          });
          on(els.openSearch, "click", function() {
            setSessionMenuOpen2(false);
            setSearchOpen2(true);
            scheduleGlobalSearch();
          });
          on(els.historyBack, "click", function() {
            window.history.back();
          });
          on(els.historyForward, "click", function() {
            window.history.forward();
          });
          on(els.toggleSourceMode, "click", function() {
            if (!state.selectedPage) {
              return;
            }
            setSourceOpen(!state.sourceOpen);
          });
          on(els.pageHistoryButton, "click", function() {
            if (!state.selectedPage) {
              return;
            }
            setPageHistoryOpen2(true);
            loadPageHistory().catch(function(error) {
              setNoteStatus("History failed: " + errorMessage(error));
            });
          });
          on(els.purgePageHistory, "click", function() {
            purgeCurrentPageHistory().catch(function(error) {
              setNoteStatus("Purge history failed: " + errorMessage(error));
            });
          });
          on(els.closeCommandModal, "click", function() {
            closeCommandPalette();
            restoreNoteFocus();
          });
          on(els.commandPaletteInput, "input", scheduleCommandPaletteRefresh);
          on(els.closeQuickSwitcherModal, "click", function() {
            closeQuickSwitcher();
            restoreNoteFocus();
          });
          on(els.quickSwitcherInput, "input", scheduleQuickSwitcherRefresh);
          on(els.closeDocumentsModal, "click", function() {
            closeDocumentsModal();
            restoreNoteFocus();
          });
          on(els.closePageHistoryModal, "click", function() {
            closePageHistoryModal();
            restoreNoteFocus();
          });
          on(els.pageHistoryShowChanges, "change", function() {
            state.historyShowChanges = Boolean(els.pageHistoryShowChanges.checked);
            renderPageHistoryPreview2();
          });
          on(els.copyPageHistory, "click", function() {
            const revision = selectedPageHistoryRevision2();
            if (!revision) {
              return;
            }
            const index = state.pageHistory.findIndex(function(entry) {
              return entry.id === revision.id;
            });
            const previousMarkdown = index >= 0 && index + 1 < state.pageHistory.length ? state.pageHistory[index + 1].rawMarkdown : "";
            copyCodeBlock(
              state.historyShowChanges ? historyDiffContent(revision.rawMarkdown, previousMarkdown) : revision.rawMarkdown
            ).catch(function(error) {
              setNoteStatus("Copy history failed: " + errorMessage(error));
            });
          });
          on(els.restorePageHistory, "click", function() {
            const revision = selectedPageHistoryRevision2();
            if (!revision) {
              return;
            }
            restorePageHistoryRevision(revision);
          });
          on(els.emptyTrash, "click", function() {
            emptyTrash().catch(function(error) {
              setNoteStatus("Empty trash failed: " + errorMessage(error));
            });
          });
          on(els.closeTrashModal, "click", function() {
            closeTrashModal();
            restoreNoteFocus();
          });
          on(els.documentsInput, "input", scheduleDocumentsRefresh);
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
          on(els.taskFilters, "click", function(rawEvent) {
            const target = rawEvent.target instanceof HTMLElement ? rawEvent.target : null;
            const button = target ? target.closest("[data-task-filter]") : null;
            if (!button) {
              return;
            }
            const filter = button.getAttribute("data-task-filter") || "not-done";
            state.taskFilter = filter;
            els.taskFilters.querySelectorAll(".task-filter").forEach(function(btn) {
              btn.classList.toggle("active", btn.getAttribute("data-task-filter") === filter);
            });
            renderPageTasks2(state.currentPage ? state.currentPage.tasks || [] : []);
          });
          on(els.toggleDebug, "click", function() {
            setDebugOpen(!state.debugOpen);
          });
          on(els.loadSelectedQuery, "click", loadSelectedQueryIntoEditor);
          on(els.formatQuery, "click", formatQueryText);
          on(els.runQuery, "click", runQueryWorkbench);
          on(els.noteSurface, "dragenter", function(event) {
            event.preventDefault();
            els.noteSurface.classList.add("drop-active");
          });
          on(els.noteSurface, "dragover", function(event) {
            event.preventDefault();
            els.noteSurface.classList.add("drop-active");
          });
          on(els.noteSurface, "dragleave", function(event) {
            const dragEvent = event;
            const related = dragEvent.relatedTarget instanceof Node ? dragEvent.relatedTarget : null;
            if (related && els.noteSurface.contains(related)) {
              return;
            }
            els.noteSurface.classList.remove("drop-active");
          });
          on(els.noteSurface, "drop", function(event) {
            const dragEvent = event;
            dragEvent.preventDefault();
            els.noteSurface.classList.remove("drop-active");
            uploadDroppedFiles(dragEvent.dataTransfer ? dragEvent.dataTransfer.files : null).catch(function(error) {
              setNoteStatus("Upload failed: " + errorMessage(error));
            });
          });
          on(els.markdownEditor, "input", function() {
            state.currentMarkdown = els.markdownEditor.value;
            window.requestAnimationFrame(function() {
              const rawContext = currentRawLineContext(state, els);
              const slashAnchor = state.markdownEditorApi && state.markdownEditorApi.host ? state.markdownEditorApi.host : els.markdownEditor;
              const caretRect = markdownEditorCaretRect(state);
              const menuContext = {
                type: "raw",
                left: caretRect ? Math.max(0, caretRect.left) : void 0,
                top: caretRect ? Math.max(0, caretRect.bottom + 6) : void 0
              };
              const wikilinkCommands = wikilinkCommandsForContext(rawContext.lineText, rawContext.caretInLine, state.pages);
              const documentCommands = documentCommandsForText(rawContext.lineText, state.documents, state.selectedPage);
              if (wikilinkCommands.length) {
                openSlashMenuWithCommands(state, els, slashAnchor, wikilinkCommands, menuContext, applySlashSelection);
              } else if (documentCommands.length) {
                openSlashMenuWithCommands(state, els, slashAnchor, documentCommands, menuContext, applySlashSelection);
              } else {
                maybeOpenSlashMenu(state, els, slashAnchor, rawContext.lineText, menuContext, applySlashSelection);
              }
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
          const handleMarkdownEditorKeydown = function(rawEvent) {
            const event = rawEvent;
            if (matchesHotkey(state.settings.preferences.hotkeys.toggleTaskDone, event) && selectionOnTaskLine()) {
              event.preventDefault();
              event.stopPropagation();
              event.stopImmediatePropagation();
              toggleTaskDoneAtSelection();
              return;
            }
            if (event.altKey && event.shiftKey && !event.ctrlKey && !event.metaKey) {
              if (event.key === "ArrowUp") {
                if (selectionOnTaskLine()) {
                  event.preventDefault();
                }
                if (moveCurrentTaskBlock(-1)) {
                  return;
                }
                return;
              }
              if (event.key === "ArrowDown") {
                if (selectionOnTaskLine()) {
                  event.preventDefault();
                }
                if (moveCurrentTaskBlock(1)) {
                  return;
                }
                return;
              }
              if (event.key === "ArrowRight") {
                if (selectionOnTaskLine()) {
                  event.preventDefault();
                }
                if (indentCurrentTaskBlock(1)) {
                  return;
                }
                return;
              }
              if (event.key === "ArrowLeft") {
                if (selectionOnTaskLine()) {
                  event.preventDefault();
                }
                if (indentCurrentTaskBlock(-1)) {
                  return;
                }
                return;
              }
            }
            if (event.key === "Enter" && event.shiftKey) {
              const rawContext = currentRawLineContext(state, els);
              const link = wikiLinkAtCaret(rawContext.lineText, rawContext.caretInLine);
              if (link && link.target) {
                event.preventDefault();
                closeSlashMenu(state, els);
                openOrCreatePage(link.target, false);
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
            if ((event.key === "Enter" || event.key === "Tab") && state.slashOpen) {
              event.preventDefault();
              applySlashSelection();
              return;
            }
          };
          on(els.markdownEditor, "keydown", handleMarkdownEditorKeydown);
          if (state.markdownEditorApi) {
            state.markdownEditorApi.onKeydown(handleMarkdownEditorKeydown);
          }
          on(els.closeSearchModal, "click", function() {
            closeSearchModal();
            restoreNoteFocus();
          });
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
          on(els.quickSwitcherInput, "keydown", function(rawEvent) {
            const event = rawEvent;
            if (event.key === "ArrowDown") {
              event.preventDefault();
              moveQuickSwitcherSelection(1);
              return;
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              moveQuickSwitcherSelection(-1);
              return;
            }
            if (event.key === "Enter") {
              const buttons = quickSwitcherResultButtons();
              if (buttons.length && state.quickSwitcherSelectionIndex >= 0) {
                event.preventDefault();
                triggerQuickSwitcherSelection();
              }
            }
          });
          on(els.documentsInput, "keydown", function(rawEvent) {
            const event = rawEvent;
            if (event.key === "ArrowDown") {
              event.preventDefault();
              moveDocumentSelection(1);
              return;
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              moveDocumentSelection(-1);
              return;
            }
            if (event.key === "Enter") {
              const buttons = documentResultButtons();
              if (buttons.length && state.documentSelectionIndex >= 0) {
                event.preventDefault();
                triggerDocumentSelection();
              }
            }
          });
          on(els.searchModalShell, "click", function(event) {
            if (event.target === els.searchModalShell) {
              closeSearchModal();
              restoreNoteFocus();
            }
          });
          on(els.commandModalShell, "click", function(event) {
            if (event.target === els.commandModalShell) {
              closeCommandPalette();
              restoreNoteFocus();
            }
          });
          on(els.quickSwitcherModalShell, "click", function(event) {
            if (event.target === els.quickSwitcherModalShell) {
              closeQuickSwitcher();
              restoreNoteFocus();
            }
          });
          on(els.documentsModalShell, "click", function(event) {
            if (event.target === els.documentsModalShell) {
              closeDocumentsModal();
              restoreNoteFocus();
            }
          });
          on(els.noteHeading, "focus", function() {
            if (!state.selectedPage || !state.currentPage || els.noteHeading.disabled) {
              return;
            }
            window.setTimeout(function() {
              els.noteHeading.select();
            }, 0);
          });
          on(els.noteHeading, "keydown", function(rawEvent) {
            const event = rawEvent;
            if (event.key === "Enter") {
              event.preventDefault();
              els.noteHeading.blur();
              return;
            }
            if (event.key === "Escape") {
              event.preventDefault();
              setNoteHeadingValue(currentPageTitleValue() || state.selectedPage || "", Boolean(state.selectedPage && state.currentPage));
              els.noteHeading.blur();
            }
          });
          on(els.noteHeading, "blur", function() {
            if (!state.selectedPage || !state.currentPage || els.noteHeading.disabled) {
              return;
            }
            renameCurrentPageFromTitle(els.noteHeading.value).catch(function(error) {
              setNoteStatus("Rename failed: " + errorMessage(error));
            });
          });
          on(els.closeHelpModal, "click", function() {
            closeHelpModal();
            restoreNoteFocus();
          });
          on(els.helpModalShell, "click", function(event) {
            if (event.target === els.helpModalShell) {
              closeHelpModal();
              restoreNoteFocus();
            }
          });
          on(els.closeSettingsModal, "click", function() {
            closeSettingsModal();
            restoreNoteFocus();
          });
          on(els.cancelSettings, "click", function() {
            closeSettingsModal();
            restoreNoteFocus();
          });
          on(els.settingsTheme, "change", function() {
            previewTheme(String(els.settingsTheme.value || defaultThemeId).trim() || defaultThemeId, false);
          });
          on(els.settingsThemeUpload, "click", function() {
            els.settingsThemeUploadInput.value = "";
            els.settingsThemeUploadInput.click();
          });
          on(els.settingsThemeUploadInput, "change", function() {
            const file = els.settingsThemeUploadInput.files && els.settingsThemeUploadInput.files[0] ? els.settingsThemeUploadInput.files[0] : null;
            if (!file) {
              return;
            }
            els.settingsStatus.textContent = "Uploading theme\u2026";
            uploadThemeFile(file).catch(function(error) {
              els.settingsStatus.textContent = "Theme upload failed: " + errorMessage(error);
            }).finally(function() {
              els.settingsThemeUploadInput.value = "";
            });
          });
          on(els.settingsThemeDelete, "click", function() {
            deleteCurrentTheme().catch(function(error) {
              els.settingsStatus.textContent = "Theme delete failed: " + errorMessage(error);
            });
          });
          on(els.saveSettings, "click", function() {
            persistSettings().catch(function(error) {
              els.settingsStatus.textContent = errorMessage(error);
            });
          });
          on(els.settingsModalShell, "click", function(event) {
            if (event.target === els.settingsModalShell) {
              closeSettingsModal();
              restoreNoteFocus();
            }
          });
          on(els.pageHistoryModalShell, "click", function(event) {
            if (event.target === els.pageHistoryModalShell) {
              closePageHistoryModal();
              restoreNoteFocus();
            }
          });
          on(els.trashModalShell, "click", function(event) {
            if (event.target === els.trashModalShell) {
              closeTrashModal();
              restoreNoteFocus();
            }
          });
          document.addEventListener("mousedown", function(event) {
            const target = event.target instanceof Element ? event.target : null;
            const withinProperties = target ? target.closest("#page-properties") || target.closest("#add-property") : null;
            if (!withinProperties) {
              dismissPropertyUI();
            }
            if (!target || !target.closest("#session-menu")) {
              setSessionMenuOpen2(false);
            }
            if (!target || !target.closest("#vault-switcher")) {
              setVaultSwitcherOpen2(false);
            }
            if (!target || !target.closest("#tree-context-menu")) {
              closeTreeContextMenu2();
            }
            if (!target || !target.closest("#inline-task-picker") && !target.closest("[data-task-date-edit]")) {
              closeTaskPickers2();
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
            if (event.key === "Escape" && !els.treeContextMenu.classList.contains("hidden")) {
              closeTreeContextMenu2();
              return;
            }
            if (event.key === "Escape" && !els.sessionMenuPanel.classList.contains("hidden")) {
              setSessionMenuOpen2(false);
              return;
            }
            if (event.key === "Escape" && state.vaultSwitcherOpen) {
              setVaultSwitcherOpen2(false);
              return;
            }
            if (!event.ctrlKey && !event.metaKey && !event.shiftKey && event.altKey && event.key === "ArrowLeft") {
              event.preventDefault();
              window.history.back();
              return;
            }
            if (!event.ctrlKey && !event.metaKey && !event.shiftKey && event.altKey && event.key === "ArrowRight") {
              event.preventDefault();
              window.history.forward();
              return;
            }
            if (event.key === "Escape" && taskPickerState.mode) {
              closeTaskPickers2();
              return;
            }
            if (event.key === "Escape" && els.searchModalShell && !els.searchModalShell.classList.contains("hidden")) {
              closeSearchModal();
              restoreNoteFocus();
              return;
            }
            if (event.key === "Escape" && els.commandModalShell && !els.commandModalShell.classList.contains("hidden")) {
              closeCommandPalette();
              restoreNoteFocus();
              return;
            }
            if (event.key === "Escape" && els.quickSwitcherModalShell && !els.quickSwitcherModalShell.classList.contains("hidden")) {
              closeQuickSwitcher();
              restoreNoteFocus();
              return;
            }
            if (event.key === "Escape" && els.documentsModalShell && !els.documentsModalShell.classList.contains("hidden")) {
              closeDocumentsModal();
              restoreNoteFocus();
              return;
            }
            if (event.key === "Escape" && els.pageHistoryModalShell && !els.pageHistoryModalShell.classList.contains("hidden")) {
              closePageHistoryModal();
              restoreNoteFocus();
              return;
            }
            if (event.key === "Escape" && els.trashModalShell && !els.trashModalShell.classList.contains("hidden")) {
              closeTrashModal();
              restoreNoteFocus();
              return;
            }
            if (event.key === "Escape" && els.helpModalShell && !els.helpModalShell.classList.contains("hidden")) {
              closeHelpModal();
              restoreNoteFocus();
              return;
            }
            if (event.key === "Escape" && els.settingsModalShell && !els.settingsModalShell.classList.contains("hidden")) {
              closeSettingsModal();
              restoreNoteFocus();
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
            if (matchesHotkey(state.settings.preferences.hotkeys.saveCurrentPage, event) && state.selectedPage) {
              event.preventDefault();
              saveCurrentPage();
              return;
            }
            if (matchesHotkey(state.settings.preferences.hotkeys.toggleRawMode, event) && state.selectedPage) {
              event.preventDefault();
              setSourceOpen(!state.sourceOpen);
              return;
            }
            if (matchesHotkey(state.settings.preferences.hotkeys.quickSwitcher, event)) {
              event.preventDefault();
              setQuickSwitcherOpen2(true);
              renderQuickSwitcherResults3();
              return;
            }
            if (matchesHotkey(state.settings.preferences.hotkeys.globalSearch, event)) {
              event.preventDefault();
              setSearchOpen2(true);
              scheduleGlobalSearch();
              return;
            }
            if (matchesHotkey(state.settings.preferences.hotkeys.commandPalette, event)) {
              event.preventDefault();
              setCommandPaletteOpen2(true);
              renderCommandPaletteResults2();
              return;
            }
            if (matchesHotkey(state.settings.preferences.hotkeys.quickNote, event)) {
              event.preventDefault();
              createDailyNote();
              return;
            }
            if (matchesHotkey(state.settings.preferences.hotkeys.help, event) && !isTypingTarget(event.target)) {
              event.preventDefault();
              setHelpOpen(true);
              return;
            }
          });
          window.addEventListener("blur", function() {
            state.windowBlurred = true;
            captureEditorFocusSpec(state, els);
            closeTreeContextMenu2();
          });
          window.addEventListener("focus", function() {
            state.windowBlurred = false;
            if (state.tableEditor && !els.inlineTablePanel.classList.contains("hidden")) {
              restoreInlineTableEditorFocus(state, els);
              return;
            }
            restoreNoteFocus();
          });
          document.addEventListener("visibilitychange", function() {
            if (document.hidden) {
              state.windowBlurred = true;
              captureEditorFocusSpec(state, els);
              return;
            }
            state.windowBlurred = false;
            if (state.tableEditor && !els.inlineTablePanel.classList.contains("hidden")) {
              restoreInlineTableEditorFocus(state, els);
              return;
            }
            restoreNoteFocus();
          });
          window.addEventListener("popstate", function() {
            closeTreeContextMenu2();
            applyURLState2();
          });
          on(window, "resize", closeTreeContextMenu2);
          on(window, "scroll", closeTreeContextMenu2);
        }
        async function boot() {
          registerPWA();
          renderSessionState2();
          renderHomeButton();
          renderPageHistoryButton();
          if (window.NoteriousCodeEditor && els.markdownEditor) {
            state.markdownEditorApi = window.NoteriousCodeEditor.create(els.markdownEditor);
            const markdownEditorApi = state.markdownEditorApi;
            if (!markdownEditorApi) {
              return;
            }
            on(markdownEditorApi.host, "click", function(event) {
              const eventTarget = event.target instanceof Element ? event.target : null;
              if (eventTarget && eventTarget.closest("[data-page-link]")) {
                event.preventDefault();
                return;
              }
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
                openOrCreatePage(page, false);
              }
            });
            on(markdownEditorApi.host, "noterious:document-download", function(event) {
              const detail = event.detail || {};
              const href = detail.href ? String(detail.href) : "";
              if (!href) {
                return;
              }
              window.location.href = href;
            });
            on(markdownEditorApi.host, "noterious:code-copy", function(event) {
              const detail = event.detail || {};
              copyCodeBlock(detail.code ? String(detail.code) : "").catch(function(error) {
                setNoteStatus("Copy failed: " + errorMessage(error));
              });
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
            on(markdownEditorApi.host, "noterious:task-date-edit", function(event) {
              const detail = event.detail || {};
              const ref = detail.ref ? String(detail.ref) : "";
              const field = detail.field === "remind" ? "remind" : "due";
              const left = Number(detail.left) || 0;
              const top = Number(detail.top) || 0;
              openInlineTaskPicker2(ref, field, left, top);
            });
            on(markdownEditorApi.host, "noterious:task-delete", function(event) {
              const detail = event.detail || {};
              const ref = detail.ref ? String(detail.ref) : "";
              deleteTaskInline(ref).catch(function(error) {
                setNoteStatus("Delete task failed: " + errorMessage(error));
              });
            });
            on(markdownEditorApi.host, "noterious:table-open", function(event) {
              const detail = event.detail || {};
              const startLine = Number(detail.startLine) || 0;
              const row = Math.max(0, Number(detail.row) || 0);
              const col = Math.max(0, Number(detail.col) || 0);
              const left = Number(detail.left);
              const top = Number(detail.top);
              const width = Number(detail.width);
              const anchor = Number.isFinite(left) && Number.isFinite(top) ? {
                left,
                top,
                width: Number.isFinite(width) ? width : 520
              } : void 0;
              openInlineTableEditor2(startLine, row, col, anchor);
            });
          }
          on(window, "resize", function() {
            positionInlineTableEditorPanel2();
          });
          on(window, "scroll", function() {
            if (state.tableEditor) {
              anchorInlineTableEditorToRenderedTable(state, els, state.tableEditor.startLine);
            }
          });
          setDebugOpen(false);
          setRailTab("files");
          setRailOpen(!window.matchMedia("(max-width: 1180px)").matches);
          setPageSearchOpen(false);
          setSourceOpen(false);
          state.themeCache = loadStoredThemeCache();
          state.settings.preferences = loadStoredClientPreferences();
          state.topLevelFoldersAsVaults = Boolean(state.settings.preferences.vaults.topLevelFoldersAsVaults);
          state.savedThemeId = currentThemeID();
          state.previewThemeId = currentThemeID();
          applyUIPreferences();
          renderNoteStudio();
          renderPageTasks2([]);
          renderPageContext2();
          renderPageProperties2();
          renderHelpShortcuts2();
          renderSettingsForm2();
          wireEvents();
          try {
            const session = await loadSession();
            setAuthSession(session);
            if (session.setupRequired) {
              setAuthGateOpen2(true, "Set up your account to continue.");
              return;
            }
            if (!session.authenticated) {
              setAuthGateOpen2(true, "Sign in to continue.");
              return;
            }
            if (session.user && session.user.mustChangePassword) {
              setAuthGateOpen2(true, "Change your password to continue.");
              return;
            }
            await loadAuthenticatedApp();
          } catch (error) {
            setAuthGateOpen2(true, errorMessage(error));
          }
        }
        boot();
      })();
    }
  });
  require_app();
})();
