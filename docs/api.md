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

- `GET /api/pages/{page}`
- `PUT /api/pages/{page}`
- `GET /api/pages/{page}/derived`
- `GET /api/pages/{page}/backlinks`

### Tasks

- `GET /api/tasks`
- `PATCH /api/tasks/{ref}`

### Queries

- `POST /api/query/execute`

### Events

- `GET /api/events`

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
