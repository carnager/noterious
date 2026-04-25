# TODO

- Add vault health detection and user-facing status:
  - detect when the configured vault path is missing or unavailable
  - expose that state through the backend, likely via `/api/meta` or a dedicated status endpoint
  - show a visible UI warning/banner instead of silently serving only stale indexed data

- Add PWA support:
  - ship a web app manifest and service worker
  - support installable mobile/desktop behavior for browser clients
  - decide which views/assets should work offline and which should remain network-only

- Add SSE for remote clients:
  - current app already has `/api/events` SSE for browser clients
  - extend this deliberately for authenticated remote clients instead of inventing a second live-update mechanism
  - make the event contract explicit and stable for:
    - page changes
    - task changes
    - derived/query invalidations
    - trash/history changes if those need live UI refresh
  - when auth lands, make SSE workspace-aware and permission-aware

- Add auth + multi-user + multi-vault in phased order, not as one giant rewrite:
  - guiding model:
    - user logs in
    - user has membership in one or more workspaces
    - each workspace points to exactly one vault
    - a vault is still a real filesystem directory
    - pages remain real markdown files
    - attachments remain real files
    - index/history/documents remain caches/services over those files, not a new document source of truth
  - do NOT model this as "each user chooses arbitrary filesystem paths"
  - do NOT expose raw vault paths to normal users
  - admins manage workspace-to-vault mappings; users select among workspaces they belong to

- Auth / workspace implementation plan:
  - Phase 1: auth only
    - add `users`
    - add password hashing (`argon2id` or `bcrypt`)
    - add session cookie auth
    - add `POST /api/auth/login`
    - add `POST /api/auth/logout`
    - add `GET /api/auth/me`
    - add auth middleware
    - protect settings, write APIs, uploads, history/trash, and SSE
  - Phase 2: wrap current app in one default workspace
    - add `workspaces`
    - create one default workspace for the current vault
    - keep current single-vault behavior, but route it through an explicit workspace concept
    - no multi-workspace UI yet
  - Phase 3: make backend internals workspace-aware
    - carry `workspace_id` through app-level records and service boundaries
    - index/query/history/documents/events must all resolve within a workspace
    - keep filesystem translation clean:
      - one workspace = one real vault root
      - page path = markdown path within that vault
      - attachment path = real file within that vault
    - never drift into opaque DB-native notes detached from the filesystem
  - Phase 4: memberships and roles
    - add `workspace_memberships`
    - roles:
      - `owner`
      - `editor`
      - optional later: `viewer`
    - enforce access per workspace, including SSE subscriptions
  - Phase 5: multiple workspaces / vaults
    - add workspace listing and switching UI
    - allow one user to belong to multiple workspaces
    - support both:
      - personal workspaces (single member, single vault)
      - shared workspaces (multiple members, single shared vault)
    - filesystem mapping should be stable and workspace-based, e.g. one vault directory per workspace
  - Phase 6: admin UX and cleanup
    - admin actions to create/update/archive workspaces
    - admin-only vault path editing
    - migration of remaining single-user assumptions in settings/meta/UI

- Auth / workspace design constraints:
  - keep config scopes separate:
    - server config
    - workspace config
    - user preferences
  - user preferences:
    - hotkeys
    - font / font size
    - date-time format
    - UI behavior
  - workspace config:
    - vault path
    - home page
    - workspace-level notification config if needed
  - server config:
    - listen addr
    - data dir
    - auth bootstrap/admin setup

- Multi-user filesystem mapping:
  - personal vaults are just personal workspaces with one member
  - shared vaults are shared workspaces with multiple members
  - example clean mapping:
    - one workspace => one vault directory
    - one user may belong to multiple workspaces
    - two users can each have separate personal workspaces/vaults

- Delivery strategy for future sessions:
  - do this incrementally
  - freeze the target model before implementation
  - do not attempt auth + roles + multi-vault + admin UI + migration in one pass
  - recommended order for Codex sessions:
    1. auth
    2. default workspace wrapper
    3. workspace-aware backend internals
    4. memberships/roles
    5. multi-workspace UI
    6. admin UX
