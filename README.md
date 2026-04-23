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
