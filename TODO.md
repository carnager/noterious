# TODO

## Status Check (2026-04-25)

Much of this refactor is already in place.

Mostly done in the current codebase:

- the configured-root plus top-level-vault model is implemented across backend and routing
- auth-side vault snapshots and session vault selection exist (`/api/auth/vaults`, `/api/auth/vault`)
- filesystem-first child vault discovery/create/rename flows are implemented and tested
- route-scoped vault index initialization exists, with request-time logging and targeted rebuild gates
- real-model regression coverage exists for pre-existing folders, top-level-vault switching, and folder discovery

What still looks incomplete or only partially cleaned up:

- terminology is mostly clean at the API/frontend/docs level, but older internal `workspaceID` naming and `LegacyVaultID` compatibility paths still remain in backend code
- vault resolution is more centralized than before, but the active logic is still split between `internal/httpapi/auth.go`, `internal/httpapi/vault.go`, and client-side selection logic in `frontend/app.ts`
- first-use indexing is much better guarded, but startup and background-service assumptions around the configured runtime vault root still need to stay explicit, and the newly added first-indexed-request regression should remain in place
- API ownership is cleaner than before, but `/api/meta` still mixes server-runtime config data with current resolved vault/session state
- documentation is improved overall, but the `README.md` `Next Steps` section is stale and still describes features that already exist

## Refactor Goal

Make the current single-user root-plus-top-level-folders implementation a clean, stable base again:

- markdown-first
- folder-first
- one configured server vault root
- optional "top-level folders are vaults" mode
- no collaboration-first architecture leaking through the code

## 1. Keep Terminology Clean

- keep `vault` terminology consistent across:
  - backend types
  - HTTP payloads
  - frontend state
  - status/error messages
  - tests
  - docs
- avoid reintroducing the older mixed terminology except when describing historical context

## 2. Simplify Vault Resolution

- make first-load vault selection easier to reason about
- reduce the amount of scattered fallback logic between:
  - configured root
  - selected vault
  - discovered top-level vaults
  - current session vault
- keep exactly one clear source of truth for:
  - current vault on the server
  - current vault in the client
- document the expected behavior for:
  - fresh setup with existing folders
  - empty configured root
  - top-level-folders mode on
  - top-level-folders mode off

## 3. Harden First-Use Indexing

- keep vault-scoped index initialization deterministic
- remove remaining boot-time race potential around:
  - first index rebuild
  - first query cache refresh
  - first SSE connection
- avoid doing index work for routes that do not need it
- make first-use failures log the real underlying cause clearly

## 4. Reduce Backend Drift

- remove remaining compatibility branches that only exist because the branch changed direction mid-implementation
- review:
  - auth startup/bootstrap code
  - vault discovery code
  - selected-vault persistence
  - fallback-to-root behavior
- make the active path obvious and short

## 5. Tighten Filesystem-First Behavior

- ensure the filesystem remains the source of truth
- make direct child-folder discovery under the configured root explicit and well-tested
- avoid app-owned metadata becoming more important than the real folders/files
- verify rename/create flows still map cleanly to real directories

## 6. Clean API Boundaries

- separate clearly:
  - server settings
  - user settings
  - current vault/session state
- avoid routes that mix config concerns with runtime vault resolution
- review `/api/meta`, `/api/settings`, `/api/user/settings`, `/api/auth/*`, and vault-list routes for clearer ownership

## 7. Improve Observability

- add more precise server-side logging around:
  - vault resolution
  - first-use index initialization
  - selected-vault switches
  - filesystem discovery failures
- prefer real error causes over generic `failed to ...` messages in logs

## 8. Strengthen Tests Around The Real Model

- add focused tests for:
  - fresh setup with pre-existing `vaultRoot/<child>` folders
  - top-level-folders mode on/off
  - switching between top-level vaults
  - empty top-level vaults
  - case-sensitive top-level folder discovery
  - first-use index rebuild on a newly selected vault
- keep these as direct regression tests for the actual single-root model, not the older personal-root terminology

## 9. Clean Documentation

- update README and operator docs so they describe:
  - vault root
  - folder-first vault behavior
  - top-level-folders mode
- remove stale wording that still implies collaboration/shared vaults are the main design
