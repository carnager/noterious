import type { MetaResponse } from "./types";

export interface BackupManifest {
  generatedAt: string;
  app: {
    name: string;
    listenAddr: string;
  };
  paths: {
    vaultRoot: string;
    dataDir: string;
    database: string;
    currentScopeVault?: string;
  };
  restartRequired: boolean;
  notes: string[];
}

function safeString(value: string | undefined | null, fallback = ""): string {
  const trimmed = String(value || "").trim();
  return trimmed || fallback;
}

export function buildBackupManifest(meta: MetaResponse): BackupManifest {
  const runtimeVaultPath = safeString(meta.runtimeVault && meta.runtimeVault.vaultPath, "(unknown)");
  const currentScopeVault = safeString(meta.currentVault && meta.currentVault.vaultPath);

  return {
    generatedAt: safeString(meta.serverTime, new Date().toISOString()),
    app: {
      name: safeString(meta.name, "Noterious"),
      listenAddr: safeString(meta.listenAddr, "(unknown)"),
    },
    paths: {
      vaultRoot: runtimeVaultPath,
      dataDir: safeString(meta.dataDir, "(unknown)"),
      database: safeString(meta.database, "(unknown)"),
      currentScopeVault: currentScopeVault && currentScopeVault !== runtimeVaultPath
        ? currentScopeVault
        : undefined,
    },
    restartRequired: Boolean(meta.restartRequired),
    notes: [
      "Back up the full vault root and the full data dir together.",
      "The SQLite index database is rebuildable from the vault, but history, trash, themes, and auth state live under the data dir.",
      "Restore by stopping the server, restoring vault + data dir, then starting the server again.",
    ],
  };
}

export function backupManifestFilename(meta: MetaResponse): string {
  const isoTimestamp = safeString(meta.serverTime, new Date().toISOString()).replace(/[:]/g, "-");
  return "noterious-backup-manifest-" + isoTimestamp + ".json";
}
