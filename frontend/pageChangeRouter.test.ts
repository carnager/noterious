import { describe, expect, it, vi } from "vitest";

import { routePageChangeEvent } from "./pageChangeRouter";

describe("routePageChangeEvent", function () {
  it("prioritizes the currently open conflict page", function () {
    const consume = vi.fn(function () {
      return false;
    });

    expect(routePageChangeEvent({
      eventName: "page.changed",
      payload: {
        page: "notes/alpha",
        originClientId: "other-tab",
      },
      selectedPage: "notes/alpha",
      conflictPage: "notes/alpha",
      currentClientId: "this-tab",
      consumeExpectedLocalChange: consume,
    })).toEqual({
      action: "conflict-status",
      pagePath: "notes/alpha",
    });

    expect(consume).toHaveBeenCalledTimes(1);
  });

  it("routes selected-page changes to remote sync when no conflict dialog is open", function () {
    expect(routePageChangeEvent({
      eventName: "page.changed",
      payload: {
        page: "notes/alpha",
        originClientId: "other-tab",
      },
      selectedPage: "notes/alpha",
      conflictPage: "",
      currentClientId: "this-tab",
      consumeExpectedLocalChange: function () {
        return false;
      },
    })).toEqual({
      action: "sync-selected",
      pagePath: "notes/alpha",
    });
  });

  it("falls back to refresh for unrelated events", function () {
    expect(routePageChangeEvent({
      eventName: "query.changed",
      payload: {
        page: "notes/alpha",
      },
      selectedPage: "notes/alpha",
      conflictPage: "",
      currentClientId: "this-tab",
      consumeExpectedLocalChange: function () {
        return false;
      },
    })).toEqual({
      action: "refresh",
    });
  });

  it("does not double-consume local echoes when conflict and selected pages match", function () {
    const consume = vi.fn(function () {
      return false;
    });

    expect(routePageChangeEvent({
      eventName: "page.changed",
      payload: {
        page: "notes/alpha",
        originClientId: "this-tab",
      },
      selectedPage: "notes/alpha",
      conflictPage: "notes/alpha",
      currentClientId: "this-tab",
      consumeExpectedLocalChange: consume,
    })).toEqual({
      action: "refresh",
    });

    expect(consume).toHaveBeenCalledTimes(1);
  });
});
