export interface PageChangeEventPayload {
  page?: unknown;
  originClientId?: unknown;
}

export interface MatchExternalPageChangeInput {
  eventName: string;
  payload: PageChangeEventPayload;
  targetPage: string;
  currentClientId: string;
  consumeExpectedLocalChange: (pagePath: string) => boolean;
}

export function matchExternalPageChange(input: MatchExternalPageChangeInput): boolean {
  if (input.eventName !== "page.changed" || !input.targetPage) {
    return false;
  }

  const eventPage = typeof input.payload.page === "string" ? input.payload.page : "";
  const eventOrigin = typeof input.payload.originClientId === "string" ? input.payload.originClientId : "";
  if (!eventPage || eventPage !== input.targetPage) {
    return false;
  }

  if (eventOrigin && eventOrigin === input.currentClientId) {
    input.consumeExpectedLocalChange(eventPage);
    return false;
  }

  if (input.consumeExpectedLocalChange(eventPage)) {
    return false;
  }

  return true;
}
