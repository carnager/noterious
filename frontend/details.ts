import { fetchJSON } from "./http";
import { rawOffsetForLineNumber, rawOffsetForTaskLine } from "./markdown";
import type { DerivedPage, PageRecord, SavedQueryRecord, TaskRecord } from "./types";

interface SavedQueryWorkbenchResponse extends SavedQueryRecord {
  workbench: unknown;
}

export interface LoadedPageDetail {
  page: PageRecord;
  derived: DerivedPage;
  focusOffset: number | null;
}

export interface SavedQueryDetailData {
  savedQuery: SavedQueryRecord;
  workbench: unknown;
}

export interface TaskSavePayload {
  text: string;
  state: string;
  due: string;
  remind: string;
  who: string[];
}

export async function toggleTaskDone(task: TaskRecord): Promise<void> {
  await fetchJSON<unknown>("/api/tasks/" + encodeURIComponent(task.ref), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      state: task.done ? "todo" : "done",
      due: task.due || "",
      remind: task.remind || "",
      who: task.who || [],
    }),
  });
}

export async function loadPageDetailData(
  pagePath: string,
  encodePath: (pagePath: string) => string,
  pendingPageTaskRef: string,
  pendingPageLineFocus: number | null
): Promise<LoadedPageDetail> {
  const [page, derived] = await Promise.all([
    fetchJSON<PageRecord>("/api/pages/" + encodePath(pagePath)),
    fetchJSON<DerivedPage>("/api/pages/" + encodePath(pagePath) + "/derived"),
  ]);

  let targetLine = pendingPageLineFocus;
  if (pendingPageTaskRef) {
    const matchedTask = Array.isArray(page.tasks)
      ? page.tasks.find(function (task) {
          return String(task.ref || "") === pendingPageTaskRef;
        })
      : null;
    if (matchedTask && matchedTask.line) {
      targetLine = matchedTask.line;
    }
  }

  const markdown = page.rawMarkdown || "";
  const focusOffset = pendingPageTaskRef || pendingPageLineFocus
    ? (pendingPageTaskRef
        ? rawOffsetForTaskLine(markdown, targetLine || 1)
        : rawOffsetForLineNumber(markdown, targetLine || 1))
    : null;

  return {
    page,
    derived,
    focusOffset,
  };
}

export async function loadSavedQueryDetailData(name: string): Promise<SavedQueryDetailData> {
  const savedQuery = await fetchJSON<SavedQueryRecord>("/api/queries/" + encodeURIComponent(name));
  const workbench = await fetchJSON<SavedQueryWorkbenchResponse>("/api/queries/" + encodeURIComponent(name) + "/workbench", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ previewLimit: 8 }),
  });
  return {
    savedQuery,
    workbench: workbench.workbench,
  };
}

export function buildTaskSavePayload(
  taskText: string,
  taskState: string,
  taskDue: string,
  taskRemind: string,
  taskWho: string,
  serializeDateTimeValue: (value: string) => string
): TaskSavePayload {
  return {
    text: taskText.trim(),
    state: taskState,
    due: taskDue.trim(),
    remind: serializeDateTimeValue(taskRemind),
    who: taskWho
      .split(",")
      .map(function (part) {
        return part.trim();
      })
      .filter(Boolean),
  };
}

export async function saveTask(ref: string, payload: TaskSavePayload): Promise<void> {
  await fetchJSON<unknown>("/api/tasks/" + encodeURIComponent(ref), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function savePageMarkdown(
  pagePath: string,
  markdownToSave: string,
  encodePath: (pagePath: string) => string
): Promise<PageRecord> {
  return fetchJSON<PageRecord>("/api/pages/" + encodePath(pagePath), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rawMarkdown: markdownToSave }),
  });
}
