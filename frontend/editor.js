import {EditorState, StateEffect, StateField, RangeSetBuilder} from "@codemirror/state";
import {EditorView, keymap, drawSelection, highlightActiveLine, Decoration, WidgetType} from "@codemirror/view";
import {defaultKeymap, history, historyKeymap} from "@codemirror/commands";
import {markdown} from "@codemirror/lang-markdown";

function syncTextareaValue(textarea, value) {
  textarea.value = value;
  textarea.dispatchEvent(new Event("input", {bubbles: true}));
}

function setTextareaValue(textarea, value) {
  textarea.value = value;
}

const setRenderModeEffect = StateEffect.define();
const setQueryBlocksEffect = StateEffect.define();
const setTasksEffect = StateEffect.define();

class WikiLinkWidget extends WidgetType {
  constructor(target, label) {
    super();
    this.target = target;
    this.label = label;
  }

  eq(other) {
    return other.target === this.target && other.label === this.label;
  }

  toDOM() {
    const link = document.createElement("button");
    link.type = "button";
    link.className = "cm-md-link";
    link.setAttribute("data-page-link", this.target);
    link.textContent = this.label;
    return link;
  }

  ignoreEvent() {
    return false;
  }
}

class TaskCheckboxWidget extends WidgetType {
  constructor(done, ref) {
    super();
    this.done = done;
    this.ref = ref || "";
  }

  eq(other) {
    return other.done === this.done && other.ref === this.ref;
  }

  toDOM() {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cm-md-task-toggle";
    button.setAttribute("data-task-toggle", "true");
    if (this.ref) {
      button.setAttribute("data-task-ref", this.ref);
    }
    button.textContent = this.done ? "☑" : "☐";
    return button;
  }

  ignoreEvent() {
    return false;
  }
}

class TaskMetaWidget extends WidgetType {
  constructor(task) {
    super();
    this.task = task;
  }

  eq(other) {
    return JSON.stringify(other.task) === JSON.stringify(this.task);
  }

  toDOM() {
    const meta = document.createElement("span");
    meta.className = "cm-md-task-meta";

    if (this.task.due || this.task.remind || (this.task.who && this.task.who.length)) {
      if (this.task.due) {
        const pill = document.createElement("span");
        pill.className = "token";
        pill.textContent = "due " + this.task.due;
        meta.appendChild(pill);
      }
      if (this.task.remind) {
        const pill = document.createElement("span");
        pill.className = "token";
        pill.textContent = "remind " + this.task.remind;
        meta.appendChild(pill);
      }
      if (this.task.who && this.task.who.length) {
        const pill = document.createElement("span");
        pill.className = "token";
        pill.textContent = this.task.who.join(", ");
        meta.appendChild(pill);
      }
    }
    return meta;
  }

  ignoreEvent() {
    return false;
  }
}

class QueryBlockWidget extends WidgetType {
  constructor(html) {
    super();
    this.html = html;
  }

  eq(other) {
    return other.html === this.html;
  }

  toDOM() {
    const wrapper = document.createElement("div");
    wrapper.className = "cm-md-query-block";
    wrapper.innerHTML = this.html;
    return wrapper;
  }

  ignoreEvent() {
    return false;
  }
}

const queryBlocksField = StateField.define({
  create() {
    return new Map();
  },
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setQueryBlocksEffect)) {
        return effect.value instanceof Map ? effect.value : new Map();
      }
    }
    return value;
  },
});

const tasksField = StateField.define({
  create() {
    return new Map();
  },
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setTasksEffect)) {
        return effect.value instanceof Map ? effect.value : new Map();
      }
    }
    return value;
  },
});

function buildRenderedDecorations(state) {
  if (!state.field(renderModeField, false)) {
    return Decoration.none;
  }

  const builder = new RangeSetBuilder();
  const queryBlocks = state.field(queryBlocksField);
  const tasks = state.field(tasksField);
  let hiddenFrontmatterUntil = 0;

  if (state.doc.lines >= 1 && state.doc.line(1).text.trim() === "---") {
    for (let lineNumber = 2; lineNumber <= state.doc.lines; lineNumber += 1) {
      if (state.doc.line(lineNumber).text.trim() === "---") {
        const startLine = state.doc.line(1);
        const endLine = state.doc.line(lineNumber);
        builder.add(
          startLine.from,
          endLine.to,
          Decoration.replace({
            block: true,
          })
        );
        hiddenFrontmatterUntil = lineNumber;
        break;
      }
    }
  }

  for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber += 1) {
    if (lineNumber <= hiddenFrontmatterUntil) {
      continue;
    }
    const line = state.doc.line(lineNumber);
    const text = line.text;
    const from = line.from;

    if (/^```query(?:\s|$)/i.test(text.trim())) {
      let endLineNumber = lineNumber;
      while (endLineNumber < state.doc.lines) {
        const candidate = state.doc.line(endLineNumber + 1);
        endLineNumber += 1;
        if (/^```/.test(candidate.text.trim())) {
          break;
        }
      }
      const endLine = state.doc.line(endLineNumber);
      const blockSource = state.doc.sliceString(line.from, endLine.to).replace(/\r\n/g, "\n").trim();
      const html = queryBlocks.get(blockSource) || '<div class="embedded-query embedded-query-empty"><small>No results.</small></div>';
      builder.add(
        line.from,
        endLine.to,
        Decoration.replace({
          block: true,
          widget: new QueryBlockWidget(html),
        })
      );
      lineNumber = endLineNumber;
      continue;
    }

    let match = text.match(/^(#{1,6})(\s+)/);
    if (match) {
      builder.add(from, from, Decoration.line({class: "cm-md-heading cm-md-heading-" + String(match[1].length)}));
      builder.add(from, from + match[0].length, Decoration.replace({}));
    }

    match = text.match(/^(>\s?)/);
    if (match) {
      builder.add(from, from, Decoration.line({class: "cm-md-quote"}));
      builder.add(from, from + match[1].length, Decoration.replace({}));
    }

    match = text.match(/^(\s*-\s+\[([ xX])\]\s+)/);
    if (match) {
      const task = tasks.get(lineNumber) || {
        ref: "",
        text: text.replace(/^(\s*-\s+\[[ xX]\]\s+)/, ""),
        done: /[xX]/.test(match[2] || ""),
        due: "",
        remind: "",
        who: [],
      };
      const prefixLength = match[1].length;
      const bodyText = text.slice(prefixLength);
      builder.add(from, from, Decoration.line({class: "cm-md-task-line" + (task.done ? " cm-md-task-done" : "")}));
      builder.add(
        from,
        from + prefixLength,
        Decoration.replace({
          widget: new TaskCheckboxWidget(task.done, task.ref),
        })
      );
      if (task.text && bodyText.startsWith(task.text)) {
        let suffixStart = from + prefixLength + task.text.length;
        while (suffixStart < line.to && /\s/.test(state.doc.sliceString(suffixStart, suffixStart + 1))) {
          suffixStart += 1;
        }
        if (suffixStart < line.to && (task.due || task.remind || (task.who && task.who.length))) {
          builder.add(
            suffixStart,
            line.to,
            Decoration.replace({
              widget: new TaskMetaWidget(task),
            })
          );
        }
      }
      continue;
    }

    const wikiPattern = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
    let wikiMatch = null;
    while ((wikiMatch = wikiPattern.exec(text)) !== null) {
      const target = String(wikiMatch[1] || "").trim();
      const label = String(wikiMatch[2] || wikiMatch[1] || "").trim();
      const start = from + wikiMatch.index;
      const end = start + wikiMatch[0].length;
      builder.add(
        start,
        end,
        Decoration.replace({
          widget: new WikiLinkWidget(target, label),
        })
      );
    }
  }

  return builder.finish();
}

const renderModeField = StateField.define({
  create() {
    return false;
  },
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setRenderModeEffect)) {
        return Boolean(effect.value);
      }
    }
    return value;
  },
});

const renderedDecorationsField = StateField.define({
  create(state) {
    return buildRenderedDecorations(state);
  },
  update(value, transaction) {
    const modeChanged = transaction.effects.some((effect) => effect.is(setRenderModeEffect));
    if (!modeChanged && !transaction.docChanged && !transaction.selection) {
      return value;
    }
    return buildRenderedDecorations(transaction.state);
  },
  provide: (field) => EditorView.decorations.from(field),
});

window.NoteriousCodeEditor = {
  create(textarea) {
    if (!textarea || textarea.__noteriousEditor) {
      return textarea && textarea.__noteriousEditor ? textarea.__noteriousEditor : null;
    }

    const host = document.createElement("div");
    host.className = "markdown-editor-host hidden";
    textarea.parentNode.insertBefore(host, textarea);
    textarea.classList.add("markdown-editor-native");

    let suppressInput = false;

    const eventHandlers = EditorView.domEventHandlers({
      mousedown(event, view) {
        const target = event.target instanceof Element ? event.target : null;
        const pageLink = target ? target.closest("[data-page-link]") : null;
        if (pageLink) {
          event.preventDefault();
          host.dispatchEvent(new CustomEvent("noterious:page-link", {
            detail: {
              page: pageLink.getAttribute("data-page-link") || "",
              line: pageLink.getAttribute("data-page-line") || "",
              taskRef: pageLink.getAttribute("data-task-ref") || "",
            },
            bubbles: true,
          }));
          return true;
        }

        const taskToggle = target ? target.closest("[data-task-toggle]") : null;
        if (taskToggle) {
          event.preventDefault();
          const taskCarrier = target ? target.closest("[data-task-ref]") : null;
          const position = view.posAtDOM(taskToggle);
          const lineNumber = view.state.doc.lineAt(position).number;
          host.dispatchEvent(new CustomEvent("noterious:task-toggle", {
            detail: {
              lineNumber: lineNumber,
              ref: taskCarrier ? taskCarrier.getAttribute("data-task-ref") || "" : "",
            },
            bubbles: true,
          }));
          return true;
        }

        return false;
      },
    });

    const view = new EditorView({
      state: EditorState.create({
        doc: textarea.value || "",
        extensions: [
          history(),
          drawSelection(),
          highlightActiveLine(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          EditorView.lineWrapping,
          markdown(),
          renderModeField,
          queryBlocksField,
          tasksField,
          renderedDecorationsField,
          eventHandlers,
          EditorView.updateListener.of((update) => {
            const value = update.state.doc.toString();
            setTextareaValue(textarea, value);
            if (update.docChanged && !suppressInput) {
              syncTextareaValue(textarea, value);
            }
          }),
        ],
      }),
      parent: host,
    });

    const api = {
      host,
      view,
      getValue() {
        return view.state.doc.toString();
      },
      setValue(value) {
        const nextValue = String(value || "");
        const current = view.state.doc.toString();
        if (nextValue === current) {
          setTextareaValue(textarea, nextValue);
          return;
        }
        suppressInput = true;
        view.dispatch({
          changes: {from: 0, to: current.length, insert: nextValue},
        });
        suppressInput = false;
        setTextareaValue(textarea, nextValue);
      },
      focus(options) {
        try {
          view.focus();
          if (options && options.preventScroll) {
            view.scrollDOM.scrollTop = view.scrollDOM.scrollTop;
          }
        } catch (_error) {
          view.focus();
        }
      },
      hasFocus() {
        return view.hasFocus;
      },
      getSelectionStart() {
        return view.state.selection.main.from;
      },
      getSelectionEnd() {
        return view.state.selection.main.to;
      },
      setSelectionRange(anchor, head, reveal) {
        const max = view.state.doc.length;
        const nextAnchor = Math.max(0, Math.min(Number(anchor) || 0, max));
        const nextHead = Math.max(0, Math.min(typeof head === "number" ? head : nextAnchor, max));
        view.dispatch({
          selection: {anchor: nextAnchor, head: nextHead},
          scrollIntoView: Boolean(reveal),
        });
      },
      getScrollTop() {
        return view.scrollDOM.scrollTop;
      },
      setScrollTop(value) {
        view.scrollDOM.scrollTop = Number(value) || 0;
      },
      getCaretRect() {
        const head = view.state.selection.main.head;
        return view.coordsAtPos(head);
      },
      setRenderMode(enabled) {
        host.classList.toggle("render-mode", Boolean(enabled));
        host.classList.toggle("raw-mode", !enabled);
        view.dispatch({
          effects: setRenderModeEffect.of(Boolean(enabled)),
        });
      },
      setQueryBlocks(blocks) {
        const map = new Map();
        (Array.isArray(blocks) ? blocks : []).forEach((block) => {
          const source = String(block && block.source ? block.source : "").replace(/\r\n/g, "\n").trim();
          const html = String(block && block.html ? block.html : "");
          if (source) {
            map.set(source, html);
          }
        });
        view.dispatch({
          effects: setQueryBlocksEffect.of(map),
        });
      },
      setTasks(tasks) {
        const map = new Map();
        (Array.isArray(tasks) ? tasks : []).forEach((task) => {
          const line = Number(task && task.line);
          if (line > 0) {
            map.set(line, {
              ref: String(task.ref || ""),
              text: String(task.text || ""),
              done: Boolean(task.done),
              due: String(task.due || ""),
              remind: String(task.remind || ""),
              who: Array.isArray(task.who) ? task.who.slice() : [],
            });
          }
        });
        view.dispatch({
          effects: setTasksEffect.of(map),
        });
      },
      isRenderMode() {
        return view.state.field(renderModeField, false);
      },
      onKeydown(handler) {
        view.dom.addEventListener("keydown", handler);
      },
    };

    textarea.__noteriousEditor = api;
    return api;
  },
};
