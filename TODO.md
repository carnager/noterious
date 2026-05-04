# Noterious TODO

Current direction: Noterious is a single-user, server-first markdown notebook.
Notes stay as markdown files on disk. The goal is not multi-user sync, a plugin
platform, or a database-first rewrite. This list focuses on the highest-value
missing product and reliability work still open in the current app.

## Priority 1: Conflict Recovery

- [ ] Keep hardening the remaining structured-editor edge cases so the
      fallback stays conservative and never drops hidden draft state.
      Most plain markdown conflict paths are now covered; what remains is
      mainly the last inline-table and future semantic-editor edge cases.

## Priority 2: Backup And Restore

- [ ] Decide whether to add a real restore flow beyond the current docs,
      manifest, generated backup script, and manifest validation helpers.

## Priority 3: AI Query Copilot

- [ ] Add a per-client local LLM override for query generation.
      Product shape:
      - server-managed AI stays the default
      - capable clients can override it with a local Ollama endpoint
      - local mode is configured per client, not globally on the server
- [ ] Keep query validation, formatting, and preview on the Noterious server
      even when generation happens locally.
      The local model should draft the query; Noterious should remain the source
      of truth for query semantics and preview execution.
- [ ] Define a richer local-only prompt context for privacy-preserving
      vault-aware generation.
      Candidate inputs for local mode:
      - real property names
      - tag vocabulary
      - common field patterns
      - maybe saved-query/query-history context
      This should not automatically become remote-provider context.
- [ ] Add client UX that makes the AI mode explicit:
      - server AI
      - local AI override
      - connectivity/CORS guidance for Ollama
      - clear indication that `localhost` means the client machine

## Priority 4: Automation And Integrations

- [ ] Add generic outbound automation hooks.
      Candidate events:
      - page changed
      - task changed
      - reminder fired
      - query result refreshed
      This should stay generic (webhooks / simple hooks), not app-specific.

## Nice To Have

- [ ] Better attachment insertion UX beyond `/file`:
      - recent uploads
      - quick replace/remove actions for inline images

## Current Stop Point

- [ ] Next most useful slices:
      - last structured-editor conflict edge cases
      - decide whether restore should become a real product flow
      - local Ollama override for AI query generation
      - generic outbound automation hooks
