import { describe, expect, it, vi } from "vitest";

import {
  browserNotificationPermission,
  browserNotificationsSupported,
  browserNotificationStatus,
  candidateAlreadyDelivered,
  collectDueBrowserNotifications,
  markDeliveredBrowserNotification,
  notificationTargetURL,
  pruneStoredBrowserNotificationState,
  requestBrowserNotificationPermission,
  type BrowserNotificationAPI,
} from "./browserNotifications";
import type { PageSummary, TaskRecord } from "./types";

describe("browserNotifications", function () {
  it("reports unsupported browsers", async function () {
    expect(browserNotificationsSupported(null)).toBe(false);
    expect(browserNotificationPermission(null)).toBe("unsupported");
    await expect(requestBrowserNotificationPermission(null)).resolves.toBe("unsupported");
  });

  it("normalizes permission state from the browser API", function () {
    const api: BrowserNotificationAPI = {
      permission: "granted",
      requestPermission: vi.fn(),
    };

    expect(browserNotificationsSupported(api)).toBe(true);
    expect(browserNotificationPermission(api)).toBe("granted");
  });

  it("requests permission when available", async function () {
    const api: BrowserNotificationAPI = {
      permission: "default",
      requestPermission: vi.fn(async function (): Promise<NotificationPermission> {
        return "granted";
      }),
    };

    await expect(requestBrowserNotificationPermission(api)).resolves.toBe("granted");
  });

  it("describes the permission state clearly", function () {
    expect(browserNotificationStatus(true, "default")).toContain("requested when you save");
    expect(browserNotificationStatus(false, "granted")).toContain("disabled in Noterious");
    expect(browserNotificationStatus(true, "denied")).toContain("Allow notifications");
  });

  it("collects due task and note notifications in the recent window", function () {
    const tasks: TaskRecord[] = [
      {
        ref: "task-1",
        page: "work/alpha",
        line: 2,
        text: "Follow up",
        state: "todo",
        done: false,
        due: "2026-05-05",
        remind: ["09:30"],
      },
    ];
    const pages: PageSummary[] = [
      {
        path: "contacts/ralf",
        title: "Ralf",
        tags: [],
        frontmatter: {
          birthday_notification: "2026-05-05 09:40",
          birthday_notification_click: "noteriousshopping://shopping?contact=ralf",
        },
        outgoingLinkCount: 0,
        backlinkCount: 0,
        taskCount: 0,
        openTaskCount: 0,
        doneTaskCount: 0,
        queryBlockCount: 0,
        createdAt: "",
        updatedAt: "",
      },
    ];

    const now = new Date(2026, 4, 5, 9, 45, 0, 0).getTime();
    const candidates = collectDueBrowserNotifications(tasks, pages, now, 20 * 60 * 1000);

    expect(candidates.map(function (candidate) { return candidate.title; })).toEqual([
      "Task reminder",
      "Note reminder",
    ]);
    expect(candidates[1].click).toBe("noteriousshopping://shopping?contact=ralf");
  });

  it("resolves relative reminder offsets against the due date", function () {
    const tasks: TaskRecord[] = [
      {
        ref: "task-rel",
        page: "work/alpha",
        line: 2,
        text: "Ship release",
        state: "todo",
        done: false,
        due: "2026-05-06",
        remind: ["-1d@08:30"],
      },
    ];

    // Fires on 2026-05-05 08:30 (one day before the due date).
    const now = new Date(2026, 4, 5, 8, 35, 0, 0).getTime();
    const candidates = collectDueBrowserNotifications(tasks, [], now, 20 * 60 * 1000);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].title).toBe("Task reminder");
    expect(candidates[0].raw).toBe("-1d@08:30");
  });

  it("ignores relative reminders without a due date", function () {
    const tasks: TaskRecord[] = [
      {
        ref: "task-no-due",
        page: "work/alpha",
        line: 2,
        text: "Floating",
        state: "todo",
        done: false,
        remind: ["-1d"],
      },
    ];

    const now = new Date(2026, 4, 5, 9, 0, 0, 0).getTime();
    expect(collectDueBrowserNotifications(tasks, [], now, 20 * 60 * 1000)).toHaveLength(0);
  });

  it("tracks delivered notification keys in memory", function () {
    const candidate = {
      key: "task-1|remind|2026-05-05T09:30:00.000Z",
      kind: "remind",
      at: new Date(2026, 4, 5, 9, 30, 0, 0).getTime(),
      raw: "2026-05-05 09:30",
      click: "",
      title: "Task reminder",
      body: "Follow up",
      page: "work/alpha",
      taskRef: "task-1",
      fieldKey: "remind",
    } as const;

    const marked = markDeliveredBrowserNotification({ sent: {} }, candidate, "2026-05-05T09:31:00.000Z");
    expect(candidateAlreadyDelivered(marked, candidate)).toBe(true);
    expect(marked.sent[candidate.key]).toBe("2026-05-05T09:31:00.000Z");
    expect(pruneStoredBrowserNotificationState({
      sent: {
        old: "2026-01-01T00:00:00.000Z",
        current: "2026-05-05T09:31:00.000Z",
      },
    }, new Date(2026, 4, 5, 9, 45, 0, 0).getTime(), 7 * 24 * 60 * 60 * 1000).sent).toEqual({
      current: "2026-05-05T09:31:00.000Z",
    });
  });

  it("builds a target URL from the page when no click target exists", function () {
    expect(notificationTargetURL({
      key: "page:contacts/ralf|notification|2026-05-05T09:40:00.000Z",
      kind: "notification",
      at: new Date(2026, 4, 5, 9, 40, 0, 0).getTime(),
      raw: "2026-05-05 09:40",
      click: "",
      title: "Note reminder",
      body: "Ralf",
      page: "contacts/ralf",
      taskRef: "",
      fieldKey: "notification",
    }, "https://notes.example/?screen=help")).toBe("https://notes.example/?page=contacts%2Fralf");
  });
});
