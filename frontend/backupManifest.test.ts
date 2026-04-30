import { describe, expect, it } from "vitest";

import { backupManifestFilename, buildBackupManifest } from "./backupManifest";
import type { MetaResponse } from "./types";

function meta(overrides: Partial<MetaResponse> = {}): MetaResponse {
  return {
    name: "Noterious",
    listenAddr: ":3000",
    runtimeVault: {
      vaultPath: "/srv/noterious/vault",
    },
    currentVault: {
      id: 1,
      key: "work",
      name: "Work",
      vaultPath: "/srv/noterious/vault/work",
      createdAt: "2026-04-30T00:00:00Z",
      updatedAt: "2026-04-30T00:00:00Z",
    },
    vaultHealth: {
      healthy: true,
    },
    dataDir: "/srv/noterious/data",
    database: "/srv/noterious/data/index/default.db",
    serverTime: "2026-04-30T12:45:00Z",
    serverFirst: true,
    restartRequired: true,
    ...overrides,
  };
}

describe("backup manifest helpers", function () {
  it("builds a manifest with deployment paths and notes", function () {
    const manifest = buildBackupManifest(meta());

    expect(manifest.generatedAt).toBe("2026-04-30T12:45:00Z");
    expect(manifest.paths.vaultRoot).toBe("/srv/noterious/vault");
    expect(manifest.paths.dataDir).toBe("/srv/noterious/data");
    expect(manifest.paths.database).toBe("/srv/noterious/data/index/default.db");
    expect(manifest.paths.currentScopeVault).toBe("/srv/noterious/vault/work");
    expect(manifest.restartRequired).toBe(true);
    expect(manifest.notes[0]).toContain("vault root");
  });

  it("omits current scope vault when it matches the runtime vault", function () {
    const manifest = buildBackupManifest(meta({
      currentVault: {
        id: 1,
        key: "root",
        name: "Root",
        vaultPath: "/srv/noterious/vault",
        createdAt: "2026-04-30T00:00:00Z",
        updatedAt: "2026-04-30T00:00:00Z",
      },
    }));

    expect(manifest.paths.currentScopeVault).toBeUndefined();
  });

  it("builds a predictable download filename", function () {
    expect(backupManifestFilename(meta())).toBe("noterious-backup-manifest-2026-04-30T12-45-00Z.json");
  });
});
