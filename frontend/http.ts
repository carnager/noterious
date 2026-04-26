export class HTTPError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "HTTPError";
    this.status = status;
  }
}

const scopeHeaderName = "X-Noterious-Scope";

let activeScopePrefix = "";

function normalizeScopePrefix(value: string): string {
  const trimmed = String(value || "").trim().replace(/^\/+|\/+$/g, "");
  if (!trimmed) {
    return "";
  }
  const segments = trimmed.split("/").filter(Boolean);
  if (segments.some(function (segment) {
    return segment === "." || segment === "..";
  })) {
    return "";
  }
  return segments.join("/");
}

function mergeScopeHeaders(headers?: HeadersInit): Headers {
  const merged = new Headers(headers);
  if (activeScopePrefix) {
    merged.set(scopeHeaderName, activeScopePrefix);
  } else {
    merged.delete(scopeHeaderName);
  }
  return merged;
}

export function setActiveScopePrefix(prefix: string): void {
  activeScopePrefix = normalizeScopePrefix(prefix);
}

export function currentActiveScopePrefix(): string {
  return activeScopePrefix;
}

export function scopedRequestInit(options?: RequestInit): RequestInit {
  return {
    ...options,
    headers: mergeScopeHeaders(options && options.headers ? options.headers : undefined),
  };
}

export function scopedEventSourceURL(url: string): string {
  if (!activeScopePrefix) {
    return url;
  }
  const separator = url.indexOf("?") >= 0 ? "&" : "?";
  return url + separator + "scope=" + encodeURIComponent(activeScopePrefix);
}

function dispatchAuthRequired(): void {
  window.dispatchEvent(new CustomEvent("noterious:auth-required"));
}

export async function requireOK(response: Response, suppressAuthEvent = false): Promise<Response> {
  if (!response.ok) {
    const text = await response.text();
    if (response.status === 401 && !suppressAuthEvent) {
      dispatchAuthRequired();
    }
    throw new HTTPError(response.status, text || ("Request failed: " + response.status));
  }
  return response;
}

export async function fetchJSON<T>(url: string, options?: RequestInit, suppressAuthEvent = false): Promise<T> {
  const response = await fetch(url, scopedRequestInit(options));
  await requireOK(response, suppressAuthEvent);
  return response.json() as Promise<T>;
}
