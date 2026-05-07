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
    expect(defaultClientPreferences().notifications.browserEnabled).toBe(false);
    expect(defaultClientPreferences().templates).toEqual([]);
  });

  it("normalizes and clones scope home pages, notifications, and templates", function () {
    const normalized = normalizeClientPreferences({
      vaults: {
        topLevelFoldersAsVaults: true,
        rootHomePage: "index",
        scopeHomePages: {
          Work: "notes/home",
          Private: "shopping/index",
        },
      },
      notifications: {
        browserEnabled: true,
      },
      templates: [
        {
          id: "contact",
          name: "Contact",
          folder: "/contacts/",
          fields: [
            { key: "vorname", kind: "text", defaultValue: "{{title}}" },
            { key: "geburtstag", kind: "date", defaultValue: "" },
          ],
        },
      ],
    });

    expect(normalized.vaults.rootHomePage).toBe("index");
    expect(normalized.vaults.scopeHomePages).toEqual({
      Work: "notes/home",
      Private: "shopping/index",
    });
    expect(normalized.notifications.browserEnabled).toBe(true);
    expect(normalized.templates).toEqual([
      {
        id: "contact",
        name: "Contact",
        folder: "contacts",
        fields: [
          { key: "vorname", kind: "text", defaultValue: "{{title}}" },
          { key: "geburtstag", kind: "date", defaultValue: "" },
        ],
      },
    ]);

    const cloned = cloneClientPreferences(normalized);
    expect(cloned.vaults.rootHomePage).toBe(normalized.vaults.rootHomePage);
    expect(cloned.vaults.scopeHomePages).toEqual(normalized.vaults.scopeHomePages);
    expect(cloned.vaults.scopeHomePages).not.toBe(normalized.vaults.scopeHomePages);
    expect(cloned.notifications.browserEnabled).toBe(true);
    expect(cloned.templates).toEqual(normalized.templates);
    expect(cloned.templates).not.toBe(normalized.templates);
  });
});
