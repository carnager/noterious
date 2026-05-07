import { describe, expect, it, vi } from "vitest";

import { HTTPError } from "./http";
import { createPage, type PageOperationsCallbacks } from "./pageOperations";

function createCallbacks(
  fetchJSON: PageOperationsCallbacks["fetchJSON"],
) {
  return {
    encodePath: vi.fn(function (path: string) {
      return encodeURIComponent(path);
    }),
    fetchJSON,
    loadPages: vi.fn(async function () {}),
    navigateToPage: vi.fn(),
  };
}

describe("pageOperations.createPage", function () {
  it("opens an existing page instead of overwriting it", async function () {
    const fetchJSON = vi.fn(async function (input: string): Promise<unknown> {
      expect(input).toBe("/api/pages/Inbox%2F2026-05-07");
      return {};
    });
    const callbacks = createCallbacks(fetchJSON as PageOperationsCallbacks["fetchJSON"]);

    await createPage("Inbox/2026-05-07", callbacks);

    expect(fetchJSON).toHaveBeenCalledTimes(1);
    expect(callbacks.loadPages).not.toHaveBeenCalled();
    expect(callbacks.navigateToPage).toHaveBeenCalledWith("Inbox/2026-05-07", false);
  });

  it("creates a missing page with the default heading", async function () {
    const fetchJSON = vi.fn(async function (input: string, init?: RequestInit): Promise<unknown> {
      if (!init) {
        throw new HTTPError(404, "not found");
      }
      expect(input).toBe("/api/pages/Inbox%2F2026-05-07");
      expect(init).toEqual({
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-Noterious-Create-Only": "true",
        },
        body: JSON.stringify({ rawMarkdown: "# 2026-05-07\n" }),
      });
      return {};
    });
    const callbacks = createCallbacks(fetchJSON as PageOperationsCallbacks["fetchJSON"]);

    await createPage("Inbox/2026-05-07", callbacks);

    expect(fetchJSON).toHaveBeenCalledTimes(2);
    expect(callbacks.loadPages).toHaveBeenCalledTimes(1);
    expect(callbacks.navigateToPage).toHaveBeenCalledWith("Inbox/2026-05-07", false);
  });

  it("uses the provided initial markdown when creating a missing page", async function () {
    const fetchJSON = vi.fn(async function (_input: string, init?: RequestInit): Promise<unknown> {
      if (!init) {
        throw new HTTPError(404, "not found");
      }
      expect(init).toEqual({
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-Noterious-Create-Only": "true",
        },
        body: JSON.stringify({ rawMarkdown: "# Daily\n\nSeeded.\n" }),
      });
      return {};
    });
    const callbacks = createCallbacks(fetchJSON as PageOperationsCallbacks["fetchJSON"]);

    await createPage("Inbox/2026-05-07", callbacks, { rawMarkdown: "# Daily\n\nSeeded.\n" });

    expect(fetchJSON).toHaveBeenCalledTimes(2);
    expect(callbacks.loadPages).toHaveBeenCalledTimes(1);
    expect(callbacks.navigateToPage).toHaveBeenCalledWith("Inbox/2026-05-07", false);
  });

  it("opens the page when the create-only write races with another creator", async function () {
    const fetchJSON = vi.fn(async function (_input: string, init?: RequestInit): Promise<unknown> {
      if (!init) {
        throw new HTTPError(404, "not found");
      }
      throw new HTTPError(409, "page already exists");
    });
    const callbacks = createCallbacks(fetchJSON as PageOperationsCallbacks["fetchJSON"]);

    await createPage("Inbox/2026-05-07", callbacks);

    expect(fetchJSON).toHaveBeenCalledTimes(2);
    expect(callbacks.loadPages).not.toHaveBeenCalled();
    expect(callbacks.navigateToPage).toHaveBeenCalledWith("Inbox/2026-05-07", false);
  });
});
