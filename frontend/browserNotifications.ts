import type { FrontmatterMap, PageSummary, TaskRecord } from "./types";

export type BrowserNotificationPermissionState = NotificationPermission | "unsupported";

export interface BrowserNotificationAPI {
  permission?: NotificationPermission;
  requestPermission?: () => Promise<NotificationPermission> | NotificationPermission;
}

export interface BrowserNotificationCandidate {
  key: string;
  kind: "remind" | "notification";
  at: number;
  raw: string;
  click: string;
  title: string;
  body: string;
  page: string;
  taskRef: string;
  fieldKey: string;
}

export interface StoredBrowserNotificationState {
  sent: Record<string, string>;
}

const browserNotificationStateStorageKey = "noterious.browser-notifications.sent";
const browserNotificationRetentionMs = 30 * 24 * 60 * 60 * 1000;

function notificationAPIFromWindow(): BrowserNotificationAPI | null {
  if (typeof window === "undefined") {
    return null;
  }
  const notificationAPI = (window as Window & typeof globalThis & { Notification?: BrowserNotificationAPI }).Notification;
  return notificationAPI || null;
}

function normalizePermission(value: unknown): BrowserNotificationPermissionState {
  if (value === "granted" || value === "denied" || value === "default") {
    return value;
  }
  return "default";
}

export function browserNotificationsSupported(api: BrowserNotificationAPI | null = notificationAPIFromWindow()): boolean {
  return Boolean(api && typeof api.requestPermission === "function");
}

export function browserNotificationPermission(api: BrowserNotificationAPI | null = notificationAPIFromWindow()): BrowserNotificationPermissionState {
  if (!api) {
    return "unsupported";
  }
  return normalizePermission(api.permission);
}

export async function requestBrowserNotificationPermission(api: BrowserNotificationAPI | null = notificationAPIFromWindow()): Promise<BrowserNotificationPermissionState> {
  if (!api || typeof api.requestPermission !== "function") {
    return "unsupported";
  }
  try {
    return normalizePermission(await api.requestPermission());
  } catch (_error) {
    return browserNotificationPermission(api);
  }
}

export function browserNotificationStatus(enabled: boolean, permission: BrowserNotificationPermissionState): string {
  if (permission === "unsupported") {
    return "This browser does not support notifications.";
  }
  if (permission === "granted") {
    return enabled
      ? "Granted. Noterious may use browser notifications on this device."
      : "Granted in this browser, but disabled in Noterious.";
  }
  if (permission === "denied") {
    return enabled
      ? "Blocked by this browser. Allow notifications for this site, then save again."
      : "Blocked by this browser.";
  }
  return enabled
    ? "Permission will be requested when you save."
    : "Permission not granted yet.";
}

function frontmatterStringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isNotificationClickKey(key: string): boolean {
  const normalized = String(key || "").trim().toLowerCase();
  return normalized.endsWith("_click") || normalized.endsWith("-click");
}

function isNotificationFrontmatterKey(key: string): boolean {
  const normalized = String(key || "").trim().toLowerCase();
  if (!normalized || normalized.startsWith("_") || isNotificationClickKey(normalized)) {
    return false;
  }
  return normalized === "notification"
    || normalized === "notify"
    || normalized === "remind"
    || normalized === "reminder"
    || normalized.includes("_notification")
    || normalized.includes("_remind")
    || normalized.includes("_reminder")
    || normalized.endsWith("-notification")
    || normalized.endsWith("-remind")
    || normalized.endsWith("-reminder")
    || normalized.startsWith("notification_")
    || normalized.startsWith("remind_")
    || normalized.startsWith("reminder_");
}

function isGenericNotificationField(key: string): boolean {
  const normalized = String(key || "").trim().toLowerCase();
  return normalized === "notification"
    || normalized === "notify"
    || normalized === "remind"
    || normalized === "reminder";
}

function notificationClickTarget(frontmatter: FrontmatterMap | undefined, fieldKey: string): string {
  if (!frontmatter) {
    return "";
  }
  for (const candidate of [fieldKey + "_click", fieldKey + "-click"]) {
    const value = frontmatterStringValue(frontmatter[candidate]);
    if (value) {
      return value;
    }
  }
  return "";
}

function parseDateOnly(raw: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(raw || "").trim());
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day, 0, 0, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseDateTime(raw: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/.exec(String(raw || "").trim());
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const date = new Date(year, month - 1, day, hour, minute, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseClockTime(raw: string): { hour: number; minute: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(raw || "").trim());
  if (!match) {
    return null;
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }
  return { hour, minute };
}

function parseNotificationTime(raw: string, dateOnlyHour: number): Date | null {
  const text = String(raw || "").trim();
  if (!text) {
    return null;
  }
  const dateOnly = parseDateOnly(text);
  if (dateOnly) {
    return new Date(
      dateOnly.getFullYear(),
      dateOnly.getMonth(),
      dateOnly.getDate(),
      dateOnlyHour,
      0,
      0,
      0,
    );
  }
  const localDateTime = parseDateTime(text);
  if (localDateTime) {
    return localDateTime;
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseReminderNotificationTime(remindRaw: string, dueRaw?: string): { at: Date; raw: string } | null {
  const remindText = String(remindRaw || "").trim();
  if (!remindText) {
    return null;
  }
  const clock = parseClockTime(remindText);
  if (clock) {
    const dueDate = parseDateOnly(String(dueRaw || "").trim());
    if (!dueDate) {
      return null;
    }
    const at = new Date(
      dueDate.getFullYear(),
      dueDate.getMonth(),
      dueDate.getDate(),
      clock.hour,
      clock.minute,
      0,
      0,
    );
    return {
      at,
      raw: [
        String(at.getFullYear()).padStart(4, "0"),
        String(at.getMonth() + 1).padStart(2, "0"),
        String(at.getDate()).padStart(2, "0"),
      ].join("-") + " " + String(clock.hour).padStart(2, "0") + ":" + String(clock.minute).padStart(2, "0"),
    };
  }
  const at = parseNotificationTime(remindText, 9);
  return at ? { at, raw: remindText } : null;
}

function taskNotificationCandidate(task: TaskRecord): BrowserNotificationCandidate | null {
  const parsed = parseReminderNotificationTime(String(task.remind || "").trim(), String(task.due || "").trim());
  if (!parsed) {
    return null;
  }
  const parts = [String(task.text || "").trim()].filter(Boolean);
  if (task.page) {
    parts.push("Page: " + task.page);
  }
  parts.push("Reminder: " + parsed.raw);
  if (Array.isArray(task.who) && task.who.length) {
    parts.push("Who: " + task.who.join(", "));
  }
  return {
    key: task.ref + "|remind|" + parsed.at.toISOString(),
    kind: "remind",
    at: parsed.at.getTime(),
    raw: parsed.raw,
    click: String(task.click || "").trim(),
    title: "Task reminder",
    body: parts.join("\n"),
    page: task.page,
    taskRef: task.ref,
    fieldKey: "remind",
  };
}

function noteNotificationCandidates(page: PageSummary): BrowserNotificationCandidate[] {
  const frontmatter = page.frontmatter;
  if (!frontmatter) {
    return [];
  }
  const keys = Object.keys(frontmatter).filter(isNotificationFrontmatterKey).sort();
  return keys.map(function (key) {
    const raw = frontmatterStringValue(frontmatter[key]);
    const at = parseNotificationTime(raw, 9);
    if (!raw || !at) {
      return null;
    }
    const titleText = String(page.title || "").trim() || String(page.path || "").trim();
    const parts = [titleText].filter(Boolean);
    if (page.path && page.path !== titleText) {
      parts.push("Page: " + page.path);
    }
    if (key && !isGenericNotificationField(key)) {
      parts.push("Field: " + key);
    }
    parts.push("Reminder: " + raw);
    return {
      key: "page:" + page.path + "|" + key + "|" + at.toISOString(),
      kind: "notification",
      at: at.getTime(),
      raw,
      click: notificationClickTarget(frontmatter, key),
      title: "Note reminder",
      body: parts.join("\n"),
      page: page.path,
      taskRef: "",
      fieldKey: key,
    } satisfies BrowserNotificationCandidate;
  }).filter(Boolean) as BrowserNotificationCandidate[];
}

export function collectBrowserNotificationCandidates(tasks: TaskRecord[], pages: PageSummary[]): BrowserNotificationCandidate[] {
  const taskCandidates = tasks.map(taskNotificationCandidate).filter(Boolean) as BrowserNotificationCandidate[];
  const pageCandidates = pages.flatMap(noteNotificationCandidates);
  return taskCandidates.concat(pageCandidates).sort(function (left, right) {
    if (left.at !== right.at) {
      return left.at - right.at;
    }
    return left.key.localeCompare(right.key);
  });
}

export function collectDueBrowserNotifications(
  tasks: TaskRecord[],
  pages: PageSummary[],
  now = Date.now(),
  recentWindowMs = 15 * 60 * 1000,
): BrowserNotificationCandidate[] {
  const minAt = now - Math.max(0, recentWindowMs);
  return collectBrowserNotificationCandidates(tasks, pages).filter(function (candidate) {
    return candidate.at <= now && candidate.at >= minAt;
  });
}

export function loadStoredBrowserNotificationState(): StoredBrowserNotificationState {
  try {
    const raw = window.localStorage.getItem(browserNotificationStateStorageKey);
    if (!raw) {
      return { sent: {} };
    }
    const decoded = JSON.parse(raw);
    const sent = decoded && typeof decoded === "object" && decoded.sent && typeof decoded.sent === "object"
      ? decoded.sent as Record<string, unknown>
      : {};
    return {
      sent: Object.fromEntries(
        Object.entries(sent).map(function ([key, value]) {
          return [String(key || "").trim(), String(value || "").trim()];
        }).filter(function ([key, value]) {
          return Boolean(key && value);
        }),
      ),
    };
  } catch (_error) {
    return { sent: {} };
  }
}

export function saveStoredBrowserNotificationState(state: StoredBrowserNotificationState): void {
  try {
    window.localStorage.setItem(browserNotificationStateStorageKey, JSON.stringify(state));
  } catch (_error) {
    // Ignore storage failures and keep runtime behavior.
  }
}

export function pruneStoredBrowserNotificationState(
  state: StoredBrowserNotificationState,
  now = Date.now(),
  retentionMs = browserNotificationRetentionMs,
): StoredBrowserNotificationState {
  const cutoff = now - Math.max(0, retentionMs);
  return {
    sent: Object.fromEntries(
      Object.entries(state.sent || {}).filter(function ([, value]) {
        const at = Date.parse(String(value || ""));
        return Number.isFinite(at) && at >= cutoff;
      }),
    ),
  };
}

export function candidateAlreadyDelivered(
  state: StoredBrowserNotificationState,
  candidate: BrowserNotificationCandidate,
): boolean {
  return Boolean(state.sent && state.sent[candidate.key]);
}

export function markDeliveredBrowserNotification(
  state: StoredBrowserNotificationState,
  candidate: BrowserNotificationCandidate,
  deliveredAt = new Date().toISOString(),
): StoredBrowserNotificationState {
  return {
    sent: {
      ...(state.sent || {}),
      [candidate.key]: deliveredAt,
    },
  };
}

export function notificationTargetURL(candidate: BrowserNotificationCandidate, currentHref: string): string {
  if (candidate.click) {
    return candidate.click;
  }
  const url = new URL(currentHref);
  if (candidate.page) {
    url.searchParams.set("page", candidate.page);
  } else {
    url.searchParams.delete("page");
  }
  url.searchParams.delete("screen");
  return url.toString();
}
