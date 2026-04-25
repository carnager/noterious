# Noterious

Noterious is a server-first, markdown-backed knowledge base with markdown files on disk as the source of truth.

## Goals

- Markdown files remain the source of truth.
- The server owns indexing, querying, rendering, events, and API access.
- Clients stay thin and fast, especially on weak devices.
- Offline support is graceful degradation, not full offline equivalence.
- UI sugar edits semantic entities and round-trips back to markdown cleanly.

## Product Shape

- Go server
- One configured vault root on disk
- One user root folder below that vault root per user
- Optional child-vault switching across top-level folders inside the user root
- SQLite-backed derived index
- HTTP API for web and companion clients
- SSE for live invalidation
- Web UI as a thin editor/viewer
- Android companion using the same API directly

## Early Scope

Phase 1 is intentionally narrow:

- vault bootstrap and config loading
- HTTP server with health and metadata endpoints
- page/query architecture docs
- package layout for vault, markdown, index, query, and HTTP API layers

## Repo Layout

- `cmd/noterious`: application entrypoint
- `internal/app`: top-level application wiring
- `internal/config`: configuration loading
- `internal/httpapi`: HTTP router and handlers
- `internal/vault`: vault filesystem abstraction
- `internal/markdown`: markdown parsing and rewrite layer
- `internal/index`: derived index services
- `internal/query`: query model and execution interfaces
- `docs`: architecture and API design

## Build And Run

Prerequisites:

- Go
- Node.js and npm

Install frontend dependencies once:

```bash
npm install
```

Build the embedded frontend assets:

```bash
npm run build:ui
```

Verify that committed embedded assets are up to date:

```bash
npm run verify:ui
```

Or use the local build wrapper:

```bash
make build
```

Build the server binary:

```bash
go build -o noterious ./cmd/noterious
```

Run the server:

```bash
./noterious
```

Or override the listen port directly:

```bash
./noterious -port 9090
```

The startup flags currently support:

- `--listen-addr`
- `--port`
- `--data-dir`
- `--vault-dir`

For local iteration you can also run the app directly without creating a binary first:

```bash
npm run build:ui
go run ./cmd/noterious
```

Important: the web UI is served through Go `embed`, so after `npm run build:ui` you must restart the Go process for updated frontend assets to be included.

The repository also includes CI that rebuilds the embedded frontend assets and fails if committed generated files are stale.

By default the app uses:

- vault root: `./vault`
- data dir: `./data`
- listen address: `:3000`

These can be overridden with:

- `NOTERIOUS_VAULT_PATH`
- `NOTERIOUS_DATA_DIR`
- `NOTERIOUS_LISTEN_ADDR`
- `NOTERIOUS_WATCH_INTERVAL`
- `NOTERIOUS_NTFY_INTERVAL`
- `NOTERIOUS_AUTH_COOKIE_NAME`
- `NOTERIOUS_AUTH_SESSION_TTL`
- `NOTERIOUS_AUTH_BOOTSTRAP_USERNAME`
- `NOTERIOUS_AUTH_BOOTSTRAP_PASSWORD`

CLI flags override the corresponding environment variables when both are set.

## Vault Layout

The configured `vault root` is the server-level root directory.

With auth enabled, each user gets one personal root directly below that folder:

- `<vault-root>/<username>`

That user root is always a valid markdown vault on its own.

Users may also keep separate child vaults as direct folders below their personal root:

- `<vault-root>/<username>/<child-vault>`

The web UI has a per-user preference for whether those top-level child folders should be treated as switchable vaults or whether the whole user root should remain the active vault. Different users can choose differently against the same server.

## Runtime Model

At runtime, Noterious keeps two different vault concepts separate:

- `configured runtime vault root`: the server-applied vault root from settings and process startup
- `current vault`: the vault resolved for the current authenticated request or session

That means:

- `/api/meta` exposes both `runtimeVault` and `currentVault`
- `/api/auth/vaults` exposes the signed-in user's personal root, discovered child vaults, and current session vault
- page, task, link, and query routes run against the resolved current vault for that request

Background services are intentionally tied to the configured runtime vault root, not the per-session current vault:

- the filesystem watcher polls the configured runtime vault root path
- the ntfy notifier polls the configured runtime vault root index when that index exists

Those background services do not currently fan out across every discovered personal or child vault.

The repository includes a user-level systemd unit template at [contrib/systemd/noterious.service](/home/carnager/Code/noterious/contrib/systemd/noterious.service). Copy it to `~/.config/systemd/user/noterious.service`, adjust the paths, then run `systemctl --user daemon-reload` and `systemctl --user enable --now noterious`.

Auth is enabled for the server API. On first startup against an empty data directory, Noterious bootstraps one admin user:

- If `NOTERIOUS_AUTH_BOOTSTRAP_USERNAME` and `NOTERIOUS_AUTH_BOOTSTRAP_PASSWORD` are set, those credentials are used.
- Otherwise the server starts in first-run setup mode and the web UI lets you create the initial admin account.

The web UI now signs in through:

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/auth/vaults`
- `PUT /api/auth/vault`
- `GET /api/user/vaults`

`GET /api/auth/vaults` returns the signed-in user's root vault, discovered child vaults, and current session vault in one snapshot so the frontend can apply its per-user top-level-folders preference without stitching together multiple APIs.

## Planned Principles

1. Markdown is canonical storage.
2. The server exposes semantic APIs instead of raw text hacks.
3. Expensive derived state is computed once on the server.
4. Clients render cached or server-provided state, not full vault queries.
5. Structured edits compile back to minimal markdown patches.

## Exploratory UI

The server now ships a small embedded exploratory UI at `/`.

It is intentionally thin and API-driven:

- note-first page browser with preview-first reading and edit mode
- semantic task popup editing, including clickable tasks inside the rendered note
- page context summaries for backlinks, links, and embedded queries
- a hidden debug drawer for raw/derived views, saved queries, query lab, and SSE events
- open-task snapshot for quick navigation across the vault

The goal is fast dogfooding of the current API, not a polished long-term client yet.
