# HTTP API

Noterious exposes a JSON-first HTTP API used by the web UI and companion clients.

## Auth Model

Noterious currently behaves as a single-account deployment:

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `POST /api/auth/change-password`

`GET /api/auth/me` returns:

- `{"authenticated": false}` when there is no valid session
- `{"authenticated": false, "setupRequired": true}` on first-run setup when no account exists yet
- the authenticated user payload plus the current resolved `vault` when a session is active

When auth is enabled, every API endpoint except:

- `GET /api/healthz`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`

requires a valid session cookie and otherwise returns `401`.

## Health And Runtime

- `GET /api/healthz`
- `GET /api/meta`

`GET /api/meta` returns server runtime metadata, including:

- `runtimeVault`: the configured runtime vault root (`vaultPath`, `homePage`)
- `currentVault`: the currently resolved request/session vault
- `vaultHealth`: `healthy`, `reason`, and `message`
- `dataDir`
- `database`
- `serverTime`
- `restartRequired`

This separation matters: the configured runtime root and the current request vault are not always the same thing.

## Settings

- `GET /api/settings`
- `PUT /api/settings`
- `GET /api/user/settings`
- `PUT /api/user/settings`

`/api/settings` is for server-applied settings such as:

- vault root path and home page
- ntfy polling interval

The response includes:

- `settings`
- `appliedVault`
- `restartRequired`

`/api/user/settings` is for account-scoped settings currently stored on the server, such as:

- user home page
- ntfy topic URL
- ntfy token

Appearance preferences such as font choice, font size, date format, hotkeys, and selected theme are browser-local and are not stored through `/api/user/settings`.

## Themes

- `GET /api/themes`
- `POST /api/themes`
- `DELETE /api/themes/{id}`

`GET /api/themes` returns the built-in and uploaded theme library:

- `themes`
- `count`

`POST /api/themes` accepts `multipart/form-data` with one file field named `file`.

Rules:

- the upload must be a JSON theme file
- custom themes are stored under `<data-dir>/themes`
- duplicate theme IDs are rejected
- invalid token sets are rejected

On success it returns the created `ThemeRecord`.

`DELETE /api/themes/{id}` deletes a custom theme and returns:

```json
{
  "ok": true,
  "id": "theme-id"
}
```

Built-in themes cannot be deleted and return `409`.

## Vault Selection And Top-Level Vault Management

- `GET /api/auth/vaults`
- `PUT /api/auth/vault`
- `GET /api/user/vaults`
- `POST /api/user/vaults`
- `PUT /api/user/vaults/{id}`

`GET /api/auth/vaults` returns the current vault-selection snapshot:

- `rootVault`
- discovered top-level `vaults`
- `count`
- `currentVault`

`PUT /api/auth/vault` accepts:

```json
{
  "vaultId": 123
}
```

and changes the current session vault selection.

`GET /api/user/vaults` returns the discovered top-level vault list for the configured vault root.

`POST /api/user/vaults` creates a top-level vault folder:

```json
{
  "name": "Projects"
}
```

`PUT /api/user/vaults/{id}` renames a discovered top-level vault:

```json
{
  "name": "Work"
}
```

## Pages

- `GET /api/pages`
- `GET /api/pages/{page}`
- `PUT /api/pages/{page}`
- `PATCH /api/pages/{page}`
- `PATCH /api/pages/{page}/frontmatter`
- `GET /api/pages/{page}/derived`
- `GET /api/pages/{page}/query-blocks`
- `GET /api/pages/{page}/query-blocks/{key}`
- `GET /api/pages/{page}/query-blocks/id/{id}`
- `POST /api/pages/{page}/query-blocks/refresh`
- `POST /api/pages/{page}/query-blocks/{key}/refresh`
- `POST /api/pages/{page}/query-blocks/id/{id}/refresh`
- `GET /api/pages/{page}/backlinks`

`GET /api/pages` returns indexed page summaries with:

- `path`
- `title`
- `tags`
- `createdAt`
- `updatedAt`
- per-page counts for outgoing links, backlinks, tasks, open tasks, done tasks, and query blocks

It supports:

- `?q=...` case-insensitive substring filtering on path/title
- `?tag=...` exact case-insensitive tag filtering

`PATCH /api/pages/{page}` applies semantic page mutations such as:

- changing the semantic title
- replacing tags
- setting/removing frontmatter fields

`PATCH /api/pages/{page}/frontmatter` applies focused top-level frontmatter edits using:

```json
{
  "set": {
    "title": "Alpha",
    "tags": ["work"]
  },
  "remove": ["obsolete"]
}
```

`GET /api/pages/{page}/derived` returns additional derived state including:

- table of contents
- backlinks
- embedded query block summaries

Each embedded query block exposes:

- stable `key`
- optional authored `id`
- dataset dependency metadata
- `rowCount`
- `renderHint`
- freshness metadata such as `stale`, `staleReason`, `stalePage`, and `staleSince`

## Tasks

- `GET /api/tasks`
- `PATCH /api/tasks/{ref}`

`GET /api/tasks` returns indexed tasks plus:

- `count`
- `summary.total`
- `summary.open`
- `summary.done`
- `summary.withDue`
- `summary.withoutDue`

It supports:

- `?q=...` substring filtering on task ref, page, or text
- `?state=open|done|...`
- `?who=...` exact case-insensitive assignee filtering

`PATCH /api/tasks/{ref}` applies semantic task updates such as:

```json
{
  "due": "2026-05-01",
  "remind": "2026-04-30",
  "who": ["Ralf"],
  "state": "todo"
}
```

## Links

- `GET /api/links`

`GET /api/links` returns indexed links plus:

- `count`
- `summary.total`
- `summary.wikilink`
- `summary.markdown`
- `summary.otherKind`

It supports:

- `?q=...` substring filtering on source, target, link text, or kind
- `?sourcePage=...`
- `?targetPage=...`
- `?kind=...`

## Saved Queries

- `GET /api/queries`
- `GET /api/queries/facets`
- `GET /api/queries/tree`
- `POST /api/queries`
- `PATCH /api/queries`
- `GET /api/queries/{name}`
- `PUT /api/queries/{name}`
- `DELETE /api/queries/{name}`
- `POST /api/queries/{name}/execute`
- `POST /api/queries/{name}/analyze`
- `POST /api/queries/{name}/plan`
- `POST /api/queries/{name}/lint`
- `POST /api/queries/{name}/format`
- `POST /api/queries/{name}/suggest`
- `POST /api/queries/{name}/preview`
- `POST /api/queries/{name}/count`
- `POST /api/queries/{name}/workbench`

Saved queries carry lightweight organization metadata:

- `folder`
- `tags`

`GET /api/queries` supports:

- `?q=...`
- `?folder=...`
- `?tag=...`

`GET /api/queries/facets` returns folder and tag counts.

`GET /api/queries/tree` returns saved query summaries grouped by folder.

`PATCH /api/queries` applies bulk organization changes:

```json
{
  "names": ["open-tasks", "urgent-tasks"],
  "folder": "dashboards/ops",
  "tags": ["ops", "triage"]
}
```

The saved-query execute/analyze/plan/lint/format/suggest/preview/count/workbench endpoints run the same engines as the generic `/api/query/...` endpoints, but resolve the saved query by name first.

## Query Workbench Endpoints

- `GET /api/query/datasets`
- `GET /api/query/capabilities`
- `GET /api/query/schema`
- `GET /api/query/examples`
- `GET /api/query/editor`
- `POST /api/query/analyze`
- `POST /api/query/plan`
- `POST /api/query/lint`
- `POST /api/query/preview`
- `POST /api/query/count`
- `POST /api/query/workbench`
- `POST /api/query/suggest`
- `POST /api/query/format`
- `POST /api/query/execute`

These endpoints are meant for query editors and embedded query tooling.

Highlights:

- `/api/query/datasets` exposes dataset fields and numeric field metadata
- `/api/query/capabilities` exposes supported clauses, operators, and aggregates
- `/api/query/schema` combines datasets, capabilities, examples, and saved-query summaries
- `/api/query/editor` returns a fuller editor bootstrap payload with suggestion seeds
- `/api/query/analyze`, `/plan`, `/lint`, `/preview`, `/count`, and `/workbench` all return `200` even for invalid queries, with `valid: false` and an `error` string for inline diagnostics

## Events

- `GET /api/events`

This is an SSE endpoint used for live invalidation.

Important events include:

- `page.changed`
- `derived.changed`
- `query.changed`
- `query-block.changed`
- `task.changed`

Targeted embedded query refreshes emit `query-block.changed` with the block `page`, stable `key`, optional `id`, and a lightweight freshness snapshot.
