import { describe, expect, it } from "vitest";

import { parseBackupManifestJSON, validateBackupManifest } from "./backupValidation";
import { buildBackupManifest } from "./backupManifest";
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
    indexStatus: {
      dbPresent: true,
      indexedPageCount: 12,
      indexedTaskCount: 7,
      latestIndexedAt: "2026-04-30T12:44:00Z",
      latestVaultModAt: "2026-04-30T12:44:00Z",
      fresh: true,
      summary: "Fresh",
    },
    serverTime: "2026-04-30T12:45:00Z",
    serverFirst: true,
    restartRequired: false,
    ...overrides,
  };
}

describe("backup validation helpers", function () {
  it("parses a generated backup manifest", function () {
    const manifest = buildBackupManifest(meta());
    const parsed = parseBackupManifestJSON(JSON.stringify(manifest));

    expect(parsed).toEqual(manifest);
  });

  it("rejects invalid manifest payloads", function () {
    expect(function () {
      parseBackupManifestJSON("{");
    }).toThrow("Backup manifest is not valid JSON.");

    expect(function () {
      parseBackupManifestJSON(JSON.stringify({ generatedAt: "now" }));
    }).toThrow("Backup manifest is missing app.name.");
  });

  it("reports a full path match for the current deployment", function () {
    const manifest = buildBackupManifest(meta());
    const result = validateBackupManifest(meta(), manifest, "backup.json");

    expect(result.matchesCurrentDeployment).toBe(true);
    expect(result.summary).toContain("matches");
    expect(result.checks.every(function (check) { return check.matches; })).toBe(true);
  });

  it("flags path mismatches clearly", function () {
    const manifest = buildBackupManifest(meta({
      runtimeVault: { vaultPath: "/srv/noterious/other-vault" },
    }));
    const result = validateBackupManifest(meta(), manifest, "backup.json");

    expect(result.matchesCurrentDeployment).toBe(false);
    expect(result.summary).toContain("differ");
    expect(result.checks.find(function (check) { return check.key === "vaultRoot"; })?.matches).toBe(false);
  });
});
