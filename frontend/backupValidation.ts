import type { BackupManifest } from "./backupManifest";
import type { MetaResponse } from "./types";

export interface BackupManifestPathCheck {
  key: "vaultRoot" | "dataDir" | "database" | "currentScopeVault";
  label: string;
  manifestValue: string;
  currentValue: string;
  matches: boolean;
}

export interface BackupManifestValidationResult {
  manifest: BackupManifest;
  sourceLabel: string;
  matchesCurrentDeployment: boolean;
  summary: string;
  checks: BackupManifestPathCheck[];
  restoreSteps: string[];
}

function safeString(value: unknown): string {
  return String(value || "").trim();
}

function requiredString(value: unknown, label: string): string {
  const normalized = safeString(value);
  if (!normalized) {
    throw new Error("Backup manifest is missing " + label + ".");
  }
  return normalized;
}

export function parseBackupManifestJSON(raw: string): BackupManifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(raw || ""));
  } catch {
    throw new Error("Backup manifest is not valid JSON.");
  }

  const manifest = parsed as Partial<BackupManifest> | null;
  if (!manifest || typeof manifest !== "object") {
    throw new Error("Backup manifest must be a JSON object.");
  }

  return {
    generatedAt: requiredString(manifest.generatedAt, "generatedAt"),
    app: {
      name: requiredString(manifest.app && manifest.app.name, "app.name"),
      listenAddr: requiredString(manifest.app && manifest.app.listenAddr, "app.listenAddr"),
    },
    paths: {
      vaultRoot: requiredString(manifest.paths && manifest.paths.vaultRoot, "paths.vaultRoot"),
      dataDir: requiredString(manifest.paths && manifest.paths.dataDir, "paths.dataDir"),
      database: requiredString(manifest.paths && manifest.paths.database, "paths.database"),
      currentScopeVault: safeString(manifest.paths && manifest.paths.currentScopeVault) || undefined,
    },
    restartRequired: Boolean(manifest.restartRequired),
    notes: Array.isArray(manifest.notes)
      ? manifest.notes.map(function (entry) {
          return safeString(entry);
        }).filter(Boolean)
      : [],
  };
}

function currentScopeVault(meta: MetaResponse): string {
  return safeString(meta.currentVault && meta.currentVault.vaultPath);
}

export function validateBackupManifest(meta: MetaResponse, manifest: BackupManifest, sourceLabel: string): BackupManifestValidationResult {
  const checks: BackupManifestPathCheck[] = [
    {
      key: "vaultRoot",
      label: "Vault Root",
      manifestValue: safeString(manifest.paths.vaultRoot),
      currentValue: safeString(meta.runtimeVault && meta.runtimeVault.vaultPath),
      matches: safeString(manifest.paths.vaultRoot) === safeString(meta.runtimeVault && meta.runtimeVault.vaultPath),
    },
    {
      key: "dataDir",
      label: "Data Dir",
      manifestValue: safeString(manifest.paths.dataDir),
      currentValue: safeString(meta.dataDir),
      matches: safeString(manifest.paths.dataDir) === safeString(meta.dataDir),
    },
    {
      key: "database",
      label: "Index DB",
      manifestValue: safeString(manifest.paths.database),
      currentValue: safeString(meta.database),
      matches: safeString(manifest.paths.database) === safeString(meta.database),
    },
  ];

  const manifestScope = safeString(manifest.paths.currentScopeVault);
  const liveScope = currentScopeVault(meta);
  if (manifestScope || liveScope) {
    checks.push({
      key: "currentScopeVault",
      label: "Current Scope Vault",
      manifestValue: manifestScope || "(none)",
      currentValue: liveScope || "(none)",
      matches: manifestScope === liveScope,
    });
  }

  const matchesCurrentDeployment = checks.every(function (check) {
    return check.matches;
  });

  return {
    manifest,
    sourceLabel,
    matchesCurrentDeployment,
    summary: matchesCurrentDeployment
      ? "Backup manifest matches the current deployment paths."
      : "Backup manifest paths differ from the current deployment. Double-check the restore target before proceeding.",
    checks,
    restoreSteps: [
      "Stop the Noterious server before restoring any files.",
      "Restore the full vault root from the backup set.",
      "Restore the full data dir from the backup set.",
      "Start the server again and verify the vault opens cleanly.",
    ],
  };
}
