# Noterious Refactoring TODO

Context: Noterious is a server-first markdown notebook app. Single-user, single
SQLite index, markdown files on disk as source of truth. The "multi-vault"
feature is a UI-only toggle that treats top-level directories as visual scopes
(e.g. "work" vs "private") -- there is no database separation. It should stay
but be implemented as a simple path-prefix filter, not a registry with IDs.
The current transition state already moved selection into the client/request
layer (`X-Noterious-Scope` on JSON requests, `?scope=` for SSE) and removed the
old auth-backed `/api/auth/vault*` switching endpoints.

## Priority 1: Strip vault registry overhead

The current vault abstraction (`vaults.Service`, vault IDs in context, per-vault
DB paths, 6-function resolution chain) was built for a multi-user multi-vault
design that was abandoned. Simplify to match reality.

- [x] Remove the remaining `internal/vaults/` package layer. Shared record,
      context, and filesystem discovery helpers now live in `internal/vault/`,
      and the leftover registry/service facade plus test fixtures are gone.
- [x] Remove vault ID from index-store context plumbing. `index.Service` now
      uses a single `*SQLiteStore` instead of `storeForContext` ->
      `storeForVault(vaultID)` fanout.
- [ ] Collapse `vault_resolution.go` (currently 6+ functions, two intermediate
      types: `resolvedUserVaultState`, `userVaultCatalog`) down to reading the
      configured vault path from settings. The scope toggle is a UI concern, not
      a server-side vault resolution chain.
- [ ] Remove `VaultID` fields from all response/record structs: `PageSummary`,
      `BacklinkRecord`, `QueryBlock`, `SavedQuery`, `PageRecord`, `Task`,
      `Link`, `Revision`, `TrashEntry`, etc.
- [x] Remove per-vault DB path logic (`vault-{id}.db`) from `index.Service`.
      Single `index/default.db` is now the only backing store.
- [x] Remove vault-scoped history/trash layout (`history/vaults/<id>`) and
      collapse `history.Service` to a single-store API.
- [x] Clean up `auth.Service` methods that stored vault selection per session.
      Scope selection now lives in the UI/client instead of auth storage.
- [x] Finish collapsing request-time vault resolution. `wrapWithVault` now
      validates the requested top-level scope and stores only the prefix in
      request context; current scope records are derived lazily when an
      endpoint actually needs to return one.
- [x] Simplify `app.New` -- startup now uses a deferred cleanup stack instead
      of repeating manual `_ = service.Close()` branches for each failure path.

## Priority 2: Routing and handler structure

The codebase is on Go 1.25 but routes like a pre-1.22 project.

- [ ] Use Go 1.22+ method-aware mux patterns (e.g. `"GET /api/settings"`,
      `"POST /api/pages/{path...}/move"`) to eliminate all `switch r.Method`
      blocks and `writeMethodNotAllowed` calls.
      Partial progress: settings/meta/events, auth/user settings, vault list
      management, themes, discovery, tasks, document/folder endpoints, and the
      top-level query API now use method-aware registrations.
- [ ] Remove `splitPageSubresource` and `parseQueryBlockPath` in
      `httpapi/router.go` (lines 297-444) -- these are hand-rolled routers with
      10+ branches of `if len(parts) > N` logic. Explicit mux registrations
      replace them entirely.
      Partial progress: those helpers now live with the page handlers in
      `pages.go`, so `router.go` no longer owns page/query-block parsing.
- [ ] Break up `handlePageRequest` in `httpapi/pages.go` -- currently a ~400
      line switch-in-switch that handles GET/PUT/DELETE/PATCH plus 6
      sub-resources. Each should be its own handler function.
      Partial progress: `/api/pages/` is now dispatched through method-specific
      subtree handlers, and query-block refresh/list/load logic has been split
      into dedicated helpers.

## Priority 3: Type safety and error handling

- [ ] Replace `map[string]any` API response payloads with typed structs. Affects
      `pageRecordPayload`, `derivedPagePayload`, `queryBlockChangedData`,
      `queryChangedData`, and all `writeJSON` call sites that build ad-hoc maps.
      Partial progress: page/detail/query-block payloads, SSE events,
      history/trash responses, discovery/search/link payloads, query API
      wrapper payloads, themes/tasks/documents/folder responses, health/meta,
      and the remaining small auth wrappers are now typed.
- [x] Define sentinel errors for conditions currently matched by string
      (`statusForFolderMoveError`, `statusForVaultError` in `httpapi/router.go`
      lines 360-394 match on `strings.Contains(message, "already exists")` etc).
      Use `errors.Is()` consistently.
- [x] `loadPageCountMap` in `index/sqlite.go:903` takes raw SQL as a parameter.
      Replace with purpose-specific methods.

## Priority 4: Operational fixes

- [x] `EventBroker.SubscribeVault` cancel function can double-close the channel
      if called after `Close()` -- causes a panic. Guard with `sync.Once` or a
      closed check. (`httpapi/events.go:71-84`)
- [x] SSE `PublishToVault` silently drops events when a subscriber's channel
      buffer (16) is full (`httpapi/events.go:46-48`). Add at least periodic
      logging or a counter so dropped events are observable.
- [ ] `storeForVault` TOCTOU race in `index/service.go:315-345` -- unlocks
      mutex, does filesystem I/O, re-locks. Two goroutines can both open a store.
      Less critical after vault simplification (single store) but still worth
      fixing.
- [x] `shouldLogHTTPRequest` in `app/http_logging.go:112-128` suppresses all
      successful GET/HEAD/OPTIONS logs (default path returns false). At minimum
      log at DEBUG level for debuggability.
- [x] Remove `http.Pusher` implementation from `responseRecorder` in
      `app/http_logging.go:51-57` -- HTTP/2 Push is deprecated and removed from
      browsers.

## Priority 5: Deduplication and cleanup

- [x] `PublishInvalidationEvents` and `PublishDeletionEvents` in
      `httpapi/events.go` share ~70% logic. Extract shared helper.
- [x] `countOpenTasks` / `countDoneTasks` in `httpapi/router.go:446-464` are
      separate loops over the same slice. Single pass returning both.
