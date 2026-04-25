export class HTTPError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "HTTPError";
    this.status = status;
  }
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
  const response = await fetch(url, options);
  await requireOK(response, suppressAuthEvent);
  return response.json() as Promise<T>;
}
