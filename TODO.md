# TODO

- Add vault health detection and user-facing status:
  - detect when the configured vault path is missing or unavailable
  - expose that state through the backend, likely via `/api/meta` or a dedicated status endpoint
  - show a visible UI warning/banner instead of silently serving only stale indexed data

- Design multi-vault support as explicit workspaces, not just multiple raw paths:
  - support multiple configured vault roots with one active vault/workspace at a time
  - carry a vault/workspace identifier through indexed pages, tasks, and query results
  - keep the app file-first: vaults must remain real directories, pages real markdown files, and attachments real files
  - avoid drifting into opaque database-only notes or a virtual document model detached from the filesystem

- Add PWA support:
  - ship a web app manifest and service worker
  - support installable mobile/desktop behavior for browser clients
  - decide which views/assets should work offline and which should remain network-only

- Add SSE for remote clients:
  - expose live invalidation/update events over server-sent events
  - let browser and companion clients refresh tasks/pages/search state without polling
  - define a stable event contract for page changes, task changes, and settings/runtime state changes

- Add authentication:
  - introduce a real user/session model instead of assuming a single open local user
  - protect settings, write operations, uploads, and future companion endpoints
  - keep the first version simple, likely cookie/session based, before considering more complex auth flows
