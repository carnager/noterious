import { matchExternalPageChange, type PageChangeEventPayload } from "./pageChangeEvents";

export interface RoutePageChangeEventInput {
  eventName: string;
  payload: PageChangeEventPayload;
  selectedPage: string;
  conflictPage: string;
  currentClientId: string;
  consumeExpectedLocalChange: (pagePath: string) => boolean;
}

export type PageChangeRoute =
  | { action: "refresh" }
  | { action: "conflict-status"; pagePath: string }
  | { action: "sync-selected"; pagePath: string };

export function routePageChangeEvent(input: RoutePageChangeEventInput): PageChangeRoute {
  const conflictPage = String(input.conflictPage || "");
  const selectedPage = String(input.selectedPage || "");

  if (conflictPage && matchExternalPageChange({
    eventName: input.eventName,
    payload: input.payload,
    targetPage: conflictPage,
    currentClientId: input.currentClientId,
    consumeExpectedLocalChange: input.consumeExpectedLocalChange,
  })) {
    return {
      action: "conflict-status",
      pagePath: conflictPage,
    };
  }

  if (selectedPage && selectedPage !== conflictPage && matchExternalPageChange({
    eventName: input.eventName,
    payload: input.payload,
    targetPage: selectedPage,
    currentClientId: input.currentClientId,
    consumeExpectedLocalChange: input.consumeExpectedLocalChange,
  })) {
    return {
      action: "sync-selected",
      pagePath: selectedPage,
    };
  }

  return { action: "refresh" };
}
