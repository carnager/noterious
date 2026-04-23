export async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || ("Request failed: " + response.status));
  }
  return response.json() as Promise<T>;
}
