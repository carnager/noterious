# Architecture

## Core Decision

Noterious is a server-first application whose durable content format is markdown files on disk.

The server is responsible for:

- vault access
- markdown parsing
- semantic indexing
- query execution
- derived state generation
- event streaming
- authenticated API access

The client is responsible for:

- presenting pages
- editing text
- invoking semantic edits
- caching recent state
- degraded offline behavior

## Storage Model

### Canonical Storage

- markdown page files
- frontmatter
- inline task syntax
- wiki links / markdown links

### Derived Storage

- SQLite database maintained by the server
- tables for pages, links, tasks, tags, frontmatter fields, and query caches

The SQLite index is disposable and rebuildable from the markdown vault.

Vault-scoped derived state is separated by resolved vault identity. The configured runtime vault root and user-selected current vaults are not the same concept.

Background services currently stay scoped to the configured runtime vault root:

- the filesystem watcher polls that configured vault path directly
- the ntfy notifier polls that configured vault's derived index when it exists

Request-time API handling resolves the current vault separately from auth/session state.

## Rendering Model

There are three layers:

1. Raw page source
2. Structured page metadata
3. Derived render fragments

Examples of derived fragments:

- backlinks
- linked tasks
- table of contents
- query block results
- entity summaries

## Editing Model

The system supports two edit modes:

1. Raw markdown editing
2. Semantic edits

Semantic edits target structured entities such as:

- task due date
- reminder
- assignee
- frontmatter fields
- contact details

The server applies minimal markdown rewrites and then reindexes the page.

## Events

The server emits SSE events for:

- page changed
- derived state changed
- query result changed
- task changed
- contact changed

Clients subscribe while foregrounded. Background mobile updates are optional and can later use push if needed.

## Offline Strategy

Offline support is intentionally degraded:

- cached pages remain readable
- recent edits can be queued
- derived/query-heavy views may be stale until reconnect

The system does not aim for full online/offline equivalence.
