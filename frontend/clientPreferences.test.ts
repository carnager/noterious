import { describe, expect, it } from "vitest";

import {
  cloneClientPreferences,
  defaultClientPreferences,
  normalizeClientPreferences,
} from "./clientPreferences";

describe("clientPreferences", function () {
  it("defaults scope home pages to an empty map", function () {
    expect(defaultClientPreferences().vaults.scopeHomePages).toEqual({});
    expect(defaultClientPreferences().vaults.rootHomePage).toBe("");
  });

  it("normalizes and clones scope home pages", function () {
    const normalized = normalizeClientPreferences({
      vaults: {
        topLevelFoldersAsVaults: true,
        rootHomePage: "index",
        scopeHomePages: {
          Work: "notes/home",
          Private: "shopping/index",
        },
      },
    });

    expect(normalized.vaults.rootHomePage).toBe("index");
    expect(normalized.vaults.scopeHomePages).toEqual({
      Work: "notes/home",
      Private: "shopping/index",
    });

    const cloned = cloneClientPreferences(normalized);
    expect(cloned.vaults.rootHomePage).toBe(normalized.vaults.rootHomePage);
    expect(cloned.vaults.scopeHomePages).toEqual(normalized.vaults.scopeHomePages);
    expect(cloned.vaults.scopeHomePages).not.toBe(normalized.vaults.scopeHomePages);
  });
});
