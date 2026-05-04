import { describe, expect, it, vi } from "vitest";

import { matchExternalPageChange } from "./pageChangeEvents";

describe("matchExternalPageChange", function () {
  it("ignores non-page events and non-matching pages", function () {
    const consume = vi.fn().mockReturnValue(false);

    expect(matchExternalPageChange({
      eventName: "task.changed",
      payload: { page: "notes/alpha" },
      targetPage: "notes/alpha",
      currentClientId: "tab-1",
      consumeExpectedLocalChange: consume,
    })).toBe(false);

    expect(matchExternalPageChange({
      eventName: "page.changed",
      payload: { page: "notes/beta" },
      targetPage: "notes/alpha",
      currentClientId: "tab-1",
      consumeExpectedLocalChange: consume,
    })).toBe(false);

    expect(consume).not.toHaveBeenCalled();
  });

  it("ignores same-client events and still consumes expected local echoes", function () {
    const consume = vi.fn().mockReturnValue(false);

    expect(matchExternalPageChange({
      eventName: "page.changed",
      payload: { page: "notes/alpha", originClientId: "tab-1" },
      targetPage: "notes/alpha",
      currentClientId: "tab-1",
      consumeExpectedLocalChange: consume,
    })).toBe(false);

    expect(consume).toHaveBeenCalledWith("notes/alpha");
  });

  it("ignores expected local watcher echoes from other origins", function () {
    const consume = vi.fn().mockReturnValue(true);

    expect(matchExternalPageChange({
      eventName: "page.changed",
      payload: { page: "notes/alpha", originClientId: "watcher" },
      targetPage: "notes/alpha",
      currentClientId: "tab-1",
      consumeExpectedLocalChange: consume,
    })).toBe(false);

    expect(consume).toHaveBeenCalledWith("notes/alpha");
  });

  it("returns true for real external page changes", function () {
    const consume = vi.fn().mockReturnValue(false);

    expect(matchExternalPageChange({
      eventName: "page.changed",
      payload: { page: "notes/alpha", originClientId: "tab-2" },
      targetPage: "notes/alpha",
      currentClientId: "tab-1",
      consumeExpectedLocalChange: consume,
    })).toBe(true);

    expect(consume).toHaveBeenCalledWith("notes/alpha");
  });
});
