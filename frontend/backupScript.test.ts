import { describe, expect, it } from "vitest";

import { buildBackupScript, backupScriptFilename } from "./backupScript";
import type { MetaResponse } from "./types";

function meta(overrides: Partial<MetaResponse> = {}): MetaResponse {
  return {
    name: "noterious",
    listenAddr: ":3000",
    runtimeVault: {
      vaultPath: "/srv/noterious/vault",
    },
    currentVault: {
      id: 2,
      key: "work",
      name: "Work",
      vaultPath: "/srv/noterious/vault/work",
      createdAt: "2026-04-01T00:00:00Z",
      updatedAt: "2026-04-01T00:00:00Z",
    },
    vaultHealth: { healthy: true },
    dataDir: "/srv/noterious/data",
    database: "/srv/noterious/data/index.sqlite",
    serverTime: "2026-04-30T13:05:00Z",
    serverFirst: true,
    restartRequired: false,
    ...overrides,
  };
}

describe("backup script helpers", function () {
  it("builds a runnable backup script with restore guidance", function () {
    const script = buildBackupScript(meta());

    expect(script).toContain("#!/usr/bin/env sh");
    expect(script).toContain("tar -C '/srv/noterious' -czf \"$TARGET_DIR/vault.tar.gz\" 'vault'");
    expect(script).toContain("tar -C '/srv/noterious' -czf \"$TARGET_DIR/data-dir.tar.gz\" 'data'");
    expect(script).toContain("Restore steps:");
    expect(script).toContain("Current UI scope at generation time: /srv/noterious/vault/work");
  });

  it("shell-quotes paths safely", function () {
    const script = buildBackupScript(meta({
      runtimeVault: {
        vaultPath: "/srv/noterious/owner's vault",
      },
      dataDir: "/srv/noterious/data dir",
      database: "/srv/noterious/data dir/index.sqlite",
      currentVault: undefined,
    }));

    expect(script).toContain("tar -C '/srv/noterious' -czf \"$TARGET_DIR/vault.tar.gz\" 'owner'\"'\"'s vault'");
    expect(script).toContain("tar -C '/srv/noterious' -czf \"$TARGET_DIR/data-dir.tar.gz\" 'data dir'");
  });

  it("builds a stable filename from server time", function () {
    expect(backupScriptFilename(meta())).toBe("noterious-backup-2026-04-30T13-05-00Z.sh");
  });
});
