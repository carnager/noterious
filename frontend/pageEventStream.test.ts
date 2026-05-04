import { describe, expect, it, vi } from "vitest";

import { bindPageEventStream, type EventSourceLike } from "./pageEventStream";

class FakeEventSource implements EventSourceLike {
  onopen: ((this: EventSource, event: Event) => unknown) | null = null;
  onerror: ((this: EventSource, event: Event) => unknown) | null = null;
  private listeners = new Map<string, Array<(event: Event) => void>>();

  addEventListener(type: string, listener: (event: Event) => void): void {
    const current = this.listeners.get(type) || [];
    current.push(listener);
    this.listeners.set(type, current);
  }

  emit(type: string, payload: unknown): void {
    const listeners = this.listeners.get(type) || [];
    const event = { data: JSON.stringify(payload) } as Event & { data: string };
    listeners.forEach(function (listener) {
      listener(event);
    });
  }
}

describe("bindPageEventStream", function () {
  it("syncs the selected page on external page.changed events", function () {
    const source = new FakeEventSource();
    const syncSelectedRemotePage = vi.fn();
    const debounceRefresh = vi.fn();
    const addEventLine = vi.fn();

    bindPageEventStream({
      source,
      currentClientId: "this-tab",
      selectedPage: function () {
        return "notes/alpha";
      },
      conflictPage: function () {
        return "";
      },
      consumeExpectedLocalChange: function () {
        return false;
      },
      setEventStatus: vi.fn(),
      addEventLine,
      syncSelectedRemotePage,
      setConflictStatus: vi.fn(),
      renderConflictModal: vi.fn(),
      debounceRefresh,
    });

    source.emit("page.changed", {
      page: "notes/alpha",
      originClientId: "other-tab",
    });

    expect(addEventLine).toHaveBeenCalledWith("page.changed", expect.objectContaining({ page: "notes/alpha" }), false);
    expect(syncSelectedRemotePage).toHaveBeenCalledWith("notes/alpha");
    expect(debounceRefresh).not.toHaveBeenCalled();
  });

  it("updates the open conflict dialog status when the same page changes again", function () {
    const source = new FakeEventSource();
    const setConflictStatus = vi.fn();
    const renderConflictModal = vi.fn();
    const debounceRefresh = vi.fn();

    bindPageEventStream({
      source,
      currentClientId: "this-tab",
      selectedPage: function () {
        return "notes/alpha";
      },
      conflictPage: function () {
        return "notes/alpha";
      },
      consumeExpectedLocalChange: function () {
        return false;
      },
      setEventStatus: vi.fn(),
      addEventLine: vi.fn(),
      syncSelectedRemotePage: vi.fn(),
      setConflictStatus,
      renderConflictModal,
      debounceRefresh,
    });

    source.emit("page.changed", {
      page: "notes/alpha",
      originClientId: "other-tab",
    });

    expect(setConflictStatus).toHaveBeenCalledWith(
      "Remote changes are still arriving. Saving your resolution will recheck against the latest server version."
    );
    expect(renderConflictModal).toHaveBeenCalledTimes(1);
    expect(debounceRefresh).toHaveBeenCalledTimes(1);
  });

  it("marks the stream live and reconnecting through the status callback", function () {
    const source = new FakeEventSource();
    const setEventStatus = vi.fn();
    const addEventLine = vi.fn();

    bindPageEventStream({
      source,
      currentClientId: "this-tab",
      selectedPage: function () {
        return "";
      },
      conflictPage: function () {
        return "";
      },
      consumeExpectedLocalChange: function () {
        return false;
      },
      setEventStatus,
      addEventLine,
      syncSelectedRemotePage: vi.fn(),
      setConflictStatus: vi.fn(),
      renderConflictModal: vi.fn(),
      debounceRefresh: vi.fn(),
    });

    source.onopen && source.onopen.call({} as EventSource, {} as Event);
    source.onerror && source.onerror.call({} as EventSource, {} as Event);

    expect(setEventStatus).toHaveBeenNthCalledWith(1, "live", true);
    expect(setEventStatus).toHaveBeenNthCalledWith(2, "reconnecting", false);
    expect(addEventLine).toHaveBeenNthCalledWith(1, "sse.open", { ok: true }, false);
    expect(addEventLine).toHaveBeenNthCalledWith(2, "sse.error", { reconnecting: true }, true);
  });
});
