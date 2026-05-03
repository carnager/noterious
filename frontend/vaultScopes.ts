import { normalizePageDraftPath } from "./commands";
import type { VaultRecord } from "./types";

export interface ResolveVisibleVaultSelectionOptions {
  rootVault: VaultRecord | null;
  discoveredVaults: VaultRecord[];
  storedScopePrefix: string;
  topLevelFoldersAsVaults: boolean;
}

export interface VisibleVaultSelection {
  availableVaults: VaultRecord[];
  currentVault: VaultRecord | null;
  scopePrefix: string;
}

function normalizeVaultPath(path: string): string {
  return String(path || "").replace(/\\/g, "/").replace(/\/+$/, "").trim();
}

function fallbackScopePrefix(selectedVault: VaultRecord | null): string {
  if (!selectedVault) {
    return "";
  }
  const fromName = normalizePageDraftPath(selectedVault.name || "");
  if (fromName) {
    return fromName;
  }
  const normalizedPath = normalizeVaultPath(selectedVault.vaultPath || "");
  const leaf = normalizedPath.split("/").filter(Boolean).pop() || "";
  return normalizePageDraftPath(leaf);
}

export function scopePrefixForVaultSelection(rootVault: VaultRecord | null, selectedVault: VaultRecord | null): string {
  if (!selectedVault) {
    return "";
  }
  if (!rootVault) {
    return fallbackScopePrefix(selectedVault);
  }
  const rootPath = normalizeVaultPath(rootVault.vaultPath || "");
  const currentPath = normalizeVaultPath(selectedVault.vaultPath || "");
  if (!rootPath || !currentPath || rootPath === currentPath) {
    return "";
  }
  if (!currentPath.startsWith(rootPath + "/")) {
    return fallbackScopePrefix(selectedVault);
  }
  return normalizePageDraftPath(currentPath.slice(rootPath.length + 1)) || "";
}

export function resolveVisibleVaultSelection(options: ResolveVisibleVaultSelectionOptions): VisibleVaultSelection {
  const rootVault = options.rootVault || null;
  const discoveredVaults = Array.isArray(options.discoveredVaults) ? options.discoveredVaults.slice() : [];
  const storedScopePrefix = normalizePageDraftPath(options.storedScopePrefix || "");

  if (!options.topLevelFoldersAsVaults) {
    return {
      availableVaults: rootVault ? [rootVault] : [],
      currentVault: rootVault,
      scopePrefix: "",
    };
  }

  const currentVault = discoveredVaults.find(function (vault) {
    return scopePrefixForVaultSelection(rootVault, vault) === storedScopePrefix;
  }) || discoveredVaults[0] || rootVault;

  return {
    availableVaults: discoveredVaults.length > 0
      ? discoveredVaults
      : (rootVault ? [rootVault] : []),
    currentVault: currentVault,
    scopePrefix: scopePrefixForVaultSelection(rootVault, currentVault),
  };
}
