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

- Explore a personal companion app with native OS integration:
  - trigger native notifications when tasks have due/reminder dates
  - show contacts and open tasks in a focused companion UI
  - show a list of meetings with inline preview support
  - keep it intentionally personal/specialized rather than forcing those features into the main app UI
