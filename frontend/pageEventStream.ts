import type { PageChangeEventPayload } from "./pageChangeEvents";
import { routePageChangeEvent } from "./pageChangeRouter";

export interface EventSourceLike {
  onopen: ((this: EventSource, event: Event) => unknown) | null;
  onerror: ((this: EventSource, event: Event) => unknown) | null;
  addEventListener(type: string, listener: (event: Event) => void): void;
}

export interface BindPageEventStreamInput {
  source: EventSourceLike;
  currentClientId: string;
  selectedPage: () => string;
  conflictPage: () => string;
  consumeExpectedLocalChange: (pagePath: string) => boolean;
  setEventStatus: (label: string, live: boolean) => void;
  addEventLine: (eventName: string, payload: Record<string, unknown>, warn: boolean) => void;
  syncSelectedRemotePage: (pagePath: string) => void;
  setConflictStatus: (status: string) => void;
  renderConflictModal: () => void;
  debounceRefresh: () => void;
}

const eventNames = [
  "page.changed",
  "page.deleted",
  "derived.changed",
  "task.changed",
  "query.changed",
  "query-block.changed",
];

export function bindPageEventStream(input: BindPageEventStreamInput): void {
  input.source.onopen = function () {
    input.setEventStatus("live", true);
    input.addEventLine("sse.open", { ok: true }, false);
  };

  input.source.onerror = function () {
    input.setEventStatus("reconnecting", false);
    input.addEventLine("sse.error", { reconnecting: true }, true);
  };

  eventNames.forEach(function (eventName) {
    input.source.addEventListener(eventName, function (event: Event) {
      let payload: Record<string, unknown> = {};
      const messageEvent = event as MessageEvent<string>;
      try {
        payload = JSON.parse(messageEvent.data);
      } catch (_error) {
        payload = { raw: messageEvent.data };
      }

      input.addEventLine(eventName, payload, false);
      const routed = routePageChangeEvent({
        eventName,
        payload: payload as PageChangeEventPayload,
        selectedPage: input.selectedPage(),
        conflictPage: input.conflictPage(),
        currentClientId: input.currentClientId,
        consumeExpectedLocalChange: input.consumeExpectedLocalChange,
      });

      if (routed.action === "conflict-status") {
        input.setConflictStatus("Remote changes are still arriving. Saving your resolution will recheck against the latest server version.");
        input.renderConflictModal();
        input.debounceRefresh();
        return;
      }
      if (routed.action === "sync-selected") {
        input.syncSelectedRemotePage(routed.pagePath);
        return;
      }
      input.debounceRefresh();
    });
  });
}
