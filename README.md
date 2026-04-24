# Noterious

Noterious is a server-first, markdown-backed knowledge base designed for fast clients, structured queries, and companion/mobile integrations.

## Goals

- Markdown files remain the source of truth.
- The server owns indexing, querying, rendering, events, and API access.
- Clients stay thin and fast, especially on weak devices.
- Offline support is graceful degradation, not full offline equivalence.
- UI sugar edits semantic entities and round-trips back to markdown cleanly.

## Product Shape

- Go server
- Vault on disk
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

For local iteration you can also run the app directly without creating a binary first:

```bash
npm run build:ui
go run ./cmd/noterious
```

Important: the web UI is served through Go `embed`, so after `npm run build:ui` you must restart the Go process for updated frontend assets to be included.

The repository also includes CI that rebuilds the embedded frontend assets and fails if committed generated files are stale.

By default the app uses:

- vault: `./vault`
- data dir: `./data`
- listen address: `:8080`

These can be overridden with:

- `NOTERIOUS_VAULT_PATH`
- `NOTERIOUS_DATA_DIR`
- `NOTERIOUS_LISTEN_ADDR`
- `NOTERIOUS_HOME_PAGE`
- `NOTERIOUS_WATCH_INTERVAL`
- `NOTERIOUS_NTFY_TOPIC_URL`
- `NOTERIOUS_NTFY_TOKEN`
- `NOTERIOUS_NTFY_INTERVAL`

If `NOTERIOUS_NTFY_TOPIC_URL` is set, the server will periodically scan open tasks and push ntfy notifications when a task reminder is due, or when the due date is reached if no explicit reminder is set. Due-only dates are delivered at 09:00 server-local time.

## Planned Principles

1. Markdown is canonical storage.
2. The server exposes semantic APIs instead of raw text hacks.
3. Expensive derived state is computed once on the server.
4. Clients render cached or server-provided state, not full vault queries.
5. Structured edits compile back to minimal markdown patches.

## Next Steps

1. Implement vault scanning and page loading.
2. Define the SQLite schema for pages, links, tasks, and frontmatter.
3. Add a first page API returning raw source plus derived metadata.
4. Add query block parsing and execution against the server index.
5. Add SSE invalidation for page and query results.

## Exploratory UI

The server now ships a small embedded exploratory UI at `/`.

It is intentionally thin and API-driven:

- note-first page browser with preview-first reading and edit mode
- semantic task popup editing, including clickable tasks inside the rendered note
- page context summaries for backlinks, links, and embedded queries
- a hidden debug drawer for raw/derived views, saved queries, query lab, and SSE events
- open-task snapshot for quick navigation across the vault

The goal is fast dogfooding of the current API, not a polished long-term client yet.
