# HTTP API

## Principles

- JSON-first API
- semantic resources over raw implementation leaks
- stable companion-facing endpoints
- SSE for invalidation

## Initial Endpoints

### Health

- `GET /api/healthz`
- `GET /api/meta`

### Pages

- `GET /api/pages`
- `GET /api/pages/{page}`
- `PUT /api/pages/{page}`
- `PATCH /api/pages/{page}`
- `PATCH /api/pages/{page}/frontmatter`
- `GET /api/pages/{page}/derived`
- `GET /api/pages/{page}/query-blocks`
- `POST /api/pages/{page}/query-blocks/refresh`
- `GET /api/pages/{page}/query-blocks/{key}`
- `GET /api/pages/{page}/query-blocks/id/{id}`
- `POST /api/pages/{page}/query-blocks/{key}/refresh`
- `POST /api/pages/{page}/query-blocks/id/{id}/refresh`
- `GET /api/pages/{page}/backlinks`

### Tasks

- `GET /api/tasks`
- `PATCH /api/tasks/{ref}`

### Links

- `GET /api/links`

### Saved Queries

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

### Queries

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

`GET /api/pages` returns indexed page summaries (`path`, `title`, `createdAt`, `updatedAt`) plus direct `tags` and per-page `counts` for `outgoingLinks`, `backlinks`, `tasks`, `openTasks`, `doneTasks`, and `queryBlocks`, along with a top-level `count`. It accepts optional `?q=...` filtering, using a case-insensitive substring match on page path or title, and optional `?tag=...` filtering for an exact case-insensitive tag match; it echoes the applied `query` and `tag` strings in the response.

`PATCH /api/pages/{page}` applies semantic page mutations. The current supported shapes are `{"title":"Renamed Alpha"}`, `{"title":""}` to remove the semantic title and fall back to the inferred page title, `{"tags":["work","urgent"]}`, `{"tags":[]}` to remove semantic tags, and `{"frontmatter":{"set":{...},"remove":[...]}}`; all rewrite top-level frontmatter, reindex the page, and emit the usual page/query invalidation events.

`PATCH /api/pages/{page}/frontmatter` applies semantic top-level frontmatter edits using a body like `{"set":{"title":"Alpha","tags":["work"]},"remove":["obsolete"]}`. The current implementation supports top-level scalar values and lists, rewrites the markdown frontmatter block, reindexes the page, and emits the usual page/query invalidation events.

`GET /api/tasks` returns indexed tasks plus a `count` and a `summary` object with `total`, `open`, `done`, `withDue`, and `withoutDue`. It accepts optional `?q=...` filtering, using a case-insensitive substring match on task ref, page, or text, optional `?state=...` filtering, and optional `?who=...` filtering for an exact case-insensitive assignee match. `state=open` returns unfinished tasks, `state=done` returns completed tasks, and any other value matches the indexed task state string. The summary is computed over the filtered result set.

`GET /api/links` returns indexed links plus a `count` and a `summary` object with `total`, `wikilink`, `markdown`, and `otherKind`. It accepts optional `?q=...` filtering, using a case-insensitive substring match on `sourcePage`, `targetPage`, `linkText`, or `kind`, plus optional exact case-insensitive `?sourcePage=...`, `?targetPage=...`, and `?kind=...` filters. The summary is computed over the filtered result set.

`GET /api/queries` returns saved named query resources plus a top-level `count`. Saved queries now carry lightweight organization metadata: `folder` and `tags`. The endpoint accepts optional `?q=...` filtering, using a case-insensitive substring match on saved query `name`, `title`, `description`, `folder`, or tags, plus optional exact case-insensitive `?folder=...` and `?tag=...` filters. It echoes the applied `query`, `folder`, and `tag` values in the response.

`GET /api/queries/facets` returns saved query folder and tag counts for building navigation UIs. It accepts the same optional `?q=...`, `?folder=...`, and `?tag=...` filters as `GET /api/queries`, and returns filtered `folders`, filtered `tags`, and the resulting top-level `count`.

`GET /api/queries/tree` returns saved query summaries grouped by `folder`, with each folder bucket containing its own `count` and `queries`. It accepts the same optional `?q=...`, `?folder=...`, and `?tag=...` filters as `GET /api/queries`, and returns the filtered grouped tree plus the resulting top-level `count`.

`POST /api/queries` creates or overwrites a saved query from `name`, optional `title`, optional `description`, optional `folder`, optional `tags`, and `query`, returning the persisted resource with `createdAt` and `updatedAt`. `GET /api/queries/{name}`, `PUT /api/queries/{name}`, and `DELETE /api/queries/{name}` provide direct resource CRUD for one saved query.

`PATCH /api/queries` applies bulk organization changes to multiple saved queries at once. The current supported shape is `{"names":["open-tasks","urgent-tasks"],"folder":"dashboards/ops","tags":["ops","triage"]}`. `names` is required, and at least one mutable field must be present. The response returns the updated saved queries plus `count`.

`POST /api/queries/{name}/execute` resolves a saved query by name and runs it through the same execution path as `POST /api/query/execute`. The response includes the saved query metadata plus a `result` object with `columns` and `rows`.

`POST /api/queries/{name}/analyze`, `POST /api/queries/{name}/plan`, and `POST /api/queries/{name}/lint` resolve a saved query by name and run it through the same non-executing introspection helpers as their `/api/query/...` counterparts. Each response includes the saved query metadata plus the corresponding `analyze`, `plan`, or `lint` object.

`POST /api/queries/{name}/format` resolves a saved query by name and runs it through the same formatter as `POST /api/query/format`. The response includes the saved query metadata plus a `format` object with `valid`, `formatted`, and any parse error details.

`POST /api/queries/{name}/suggest` resolves a saved query by name and runs it through the same suggestion engine as `POST /api/query/suggest`, using the saved query text as the query context. The request can still provide `clause`, `dataset`, and `prefix`, and the response includes the saved query metadata plus a `suggest` object.

`POST /api/queries/{name}/preview` resolves a saved query by name and runs it through the same preview path as `POST /api/query/preview`. The request accepts optional `limit`, and the response includes the saved query metadata plus a `preview` object with sampled rows, `columns`, `count`, `limit`, and `truncated`.

`POST /api/queries/{name}/count` resolves a saved query by name and runs it through the same counting path as `POST /api/query/count`. The response includes the saved query metadata plus a `count` object with the computed row count and plan metadata.

`POST /api/queries/{name}/workbench` resolves a saved query by name and runs it through the same bundled editor-analysis path as `POST /api/query/workbench`. The request accepts optional `previewLimit`, and the response includes the saved query metadata plus a `workbench` object containing `analyze`, `plan`, `lint`, `preview`, and `count`.

`GET /api/query/datasets` returns the built-in query datasets plus ordered field metadata, including which fields are numeric. Clients can use it to discover the current `from ...` surface without hardcoding the query-language docs.

`GET /api/query/capabilities` returns the currently supported query operators, aggregate forms, and top-level clauses. Clients can use it alongside `/api/query/datasets` to drive query builders without scraping the language docs.

`GET /api/query/schema` returns the combined query discovery payload in one response: datasets, capabilities, built-in examples, saved query summaries, and lightweight counts for those groups. Saved query summaries are intentionally lightweight and currently include `name`, `title`, `description`, `folder`, `tags`, and `updatedAt`. Clients can use it to bootstrap a query UI in a single round-trip.

`GET /api/query/examples` returns built-in example queries with names, descriptions, and dataset tags. It accepts optional `?dataset=...` filtering so clients can fetch just the starter queries relevant to one dataset.

`GET /api/query/editor` returns a fuller query-editor bootstrap payload: the combined schema, including saved query summaries, root clause suggestions, clause-level suggestion seeds, and dataset-specific suggestion seeds for the main field-driven clauses. Clients can use it to initialize an editor without immediately calling both discovery and suggestion endpoints.

`POST /api/query/analyze` parses and validates a query without executing it. It returns `valid`, the normalized parsed query when valid, referenced fields grouped by clause, projected column names, and simple `aggregate` / `grouped` / `distinct` flags. Invalid queries still return `200` with `valid: false` and an `error` string so clients can show inline diagnostics without treating validation as transport failure.

`POST /api/query/plan` returns a lightweight execution summary for a query without running it. The response includes `mode` (`rows`, `aggregate`, or `grouped-aggregate`), projected columns, clause-level field references, and simple clause counts. Invalid queries return `200` with `valid: false` and an `error` string, matching the rest of the editor-oriented query endpoints.

`POST /api/query/lint` returns non-fatal warnings for a query without executing it. The first lint pass focuses on structural issues such as implicit `select *`, duplicated `where` / `having` filters, duplicated `group by` / `order by` fields, and duplicated projected columns. Invalid queries still return `200` with `valid: false` and an `error` string.

`POST /api/query/preview` returns a capped sample of query results plus plan metadata. The request accepts `query` and optional `limit`; the response includes `plan`, `columns`, sampled `rows`, the applied `limit`, `count`, and `truncated` when the sample was clipped. Invalid queries still return `200` with `valid: false` and an `error` string.

`POST /api/query/count` returns the number of rows the query would produce, after applying the query’s actual semantics such as grouping, distinct projection, limit, and offset. The response includes `count` plus `plan`. Invalid queries still return `200` with `valid: false` and an `error` string.

`POST /api/query/workbench` bundles the main editor-side query helpers into one response: `analyze`, `plan`, `lint`, `preview`, and `count`. The request accepts `query` and optional `previewLimit`. Clients can use it to refresh the full query workbench state in one round-trip instead of calling the individual helper endpoints separately.

`POST /api/query/suggest` returns lightweight editor suggestions for a query clause. The request accepts optional `query`, `dataset`, `clause`, and `prefix`; the response echoes normalized `dataset` / `clause` / `prefix` plus `suggestions` and `count`. Suggestions are intentionally lightweight and clause-driven: datasets for `from`, fields plus operators for `where`, fields plus aggregates for `select`, grouped projected columns for grouped `having` / `order by`, and simple prefix filtering over the suggestion values.

`POST /api/query/format` parses a query and returns a canonical serialized form in `formatted`. It preserves fenced query blocks, including an authored `id=...` header when present, but normalizes the inner query to the server’s clause order and parser-resolved references. Invalid queries return `200` with `valid: false` and an `error` string, matching `/api/query/analyze`.

`GET /api/pages/{page}/derived` includes `queryBlocks`. Each block exposes a stable computed `key`, an optional `id` when the source markdown uses a fenced header like ` ```query id=my-block `, dependency metadata (`datasets` plus optional `matchPage` for scoped page/path filters), lightweight result-shape metadata (`rowCount` plus `renderHint` such as `table`, `list`, `empty`, or `error`), and freshness metadata: `stale`, `staleReason`, optional `stalePage`, and `staleSince` when indexed source pages are newer than the cached query result.

`GET /api/pages/{page}/query-blocks` returns just the enriched embedded query block list for a page, plus a `count`, without the rest of the derived page payload.

`POST /api/pages/{page}/query-blocks/refresh` recomputes all embedded query blocks on that page, updates the cached results, and returns the refreshed enriched block list plus `count`.

`GET /api/pages/{page}/query-blocks/{key}` returns a single enriched query block payload for targeted refresh by stable block key.

`GET /api/pages/{page}/query-blocks/id/{id}` returns a single enriched query block payload by explicit authored query block ID.

`POST /api/pages/{page}/query-blocks/{key}/refresh` recomputes one embedded query block, updates the cached result, and returns the refreshed enriched block payload.

`POST /api/pages/{page}/query-blocks/id/{id}/refresh` does the same targeted recompute, but resolves the block by explicit authored ID instead of computed key.

### Events

- `GET /api/events`

Targeted query block refresh emits `query-block.changed` with the block `page`, stable `key`, optional `id`, and lightweight block snapshot fields including `rowCount`, `renderHint`, `updatedAt`, and `stale`, followed by the usual derived/query invalidation for that page.

Automatic query cache refreshes triggered by page/task writes or external vault edits also emit `query-block.changed` for each recomputed embedded block, with the same lightweight snapshot fields, before the page-level `derived.changed` and `query.changed` events.

`query.changed` now also includes `blockCount` plus a `blocks` array of the changed embedded block summaries. When exactly one block changed, the event also keeps top-level `key` and `id` for convenience and backward compatibility.

## Example Semantic Task Patch

```json
{
  "due": "2026-05-01",
  "remind": "2026-04-30",
  "who": ["Ralf"],
  "state": "todo"
}
```

The server resolves the task reference, rewrites markdown, reindexes, and emits invalidation events.
