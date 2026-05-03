import { describe, expect, it } from "vitest";

import { resolveVisibleVaultSelection, scopePrefixForVaultSelection } from "./vaultScopes";
import type { VaultRecord } from "./types";

function makeVault(id: number, name: string, vaultPath: string): VaultRecord {
  return {
    id: id,
    key: name.toLowerCase(),
    name: name,
    vaultPath: vaultPath,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

describe("vaultScopes", function () {
  it("derives a scope prefix from a top-level vault selection", function () {
    const rootVault = makeVault(1, "Configured Vault", "/vault");
    const selectedVault = makeVault(2, "Private", "/vault/Private");

    expect(scopePrefixForVaultSelection(rootVault, selectedVault)).toBe("Private");
  });

  it("resolves the stored scope selection when top-level folders act as vaults", function () {
    const rootVault = makeVault(1, "Configured Vault", "/vault");
    const privateVault = makeVault(2, "Private", "/vault/Private");
    const shoppingVault = makeVault(3, "Shopping", "/vault/Shopping");

    expect(resolveVisibleVaultSelection({
      rootVault: rootVault,
      discoveredVaults: [privateVault, shoppingVault],
      storedScopePrefix: "Shopping",
      topLevelFoldersAsVaults: true,
    })).toEqual({
      availableVaults: [privateVault, shoppingVault],
      currentVault: shoppingVault,
      scopePrefix: "Shopping",
    });
  });

  it("falls back to the selected top-level folder name when the root vault is unavailable", function () {
    const privateVault = makeVault(2, "Private", "/vault/Private");
    const shoppingVault = makeVault(3, "Shopping", "/vault/Shopping");

    expect(resolveVisibleVaultSelection({
      rootVault: null,
      discoveredVaults: [privateVault, shoppingVault],
      storedScopePrefix: "Shopping",
      topLevelFoldersAsVaults: true,
    })).toEqual({
      availableVaults: [privateVault, shoppingVault],
      currentVault: shoppingVault,
      scopePrefix: "Shopping",
    });
  });

  it("falls back to the configured root when top-level folders are disabled", function () {
    const rootVault = makeVault(1, "Configured Vault", "/vault");
    const privateVault = makeVault(2, "Private", "/vault/Private");

    expect(resolveVisibleVaultSelection({
      rootVault: rootVault,
      discoveredVaults: [privateVault],
      storedScopePrefix: "Private",
      topLevelFoldersAsVaults: false,
    })).toEqual({
      availableVaults: [rootVault],
      currentVault: rootVault,
      scopePrefix: "",
    });
  });
});
