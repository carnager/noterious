# Noterious TODO

Current direction: Noterious is a single-user, server-first markdown notebook.
Notes stay as markdown files on disk. The goal is not multi-user sync, a plugin
platform, or a database-first rewrite. This list focuses on the highest-value
missing product and reliability work still open in the current app.

## Priority 1: Conflict Recovery

- [ ] Add broader end-to-end coverage for multi-client editing.
      Important cases:
      - live `page.changed` event -> fetch -> merge -> editor update
      - overlapping edit conflicts
      - remote changes while semantic editors are open
- [ ] Keep hardening the conflict flow around structured editors and non-text UI
      state so the fallback remains conservative and never drops hidden draft
      state.

## Priority 2: Backup And Restore

- [ ] Decide whether to add a real restore flow beyond the current docs,
      manifest, and generated backup script helpers.

## Priority 3: Attachments And Assets

- [ ] Decide whether task click targets should get bracket syntax parity with
      reminders (`[click: ...]` vs `click:: ...`).

## Priority 4: AI Query Copilot

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

## Priority 5: Automation And Integrations

- [ ] Add generic outbound automation hooks.
      Candidate events:
      - page changed
      - task changed
      - reminder fired
      - query result refreshed
      This should stay generic (webhooks / simple hooks), not app-specific.
- [ ] Make notification tap-target behavior easier to discover in the UI,
      especially note `*_click` fields and task click targets.
      The basic docs already exist; the missing part is product-level
      discoverability in the app itself.

## Priority 6: Single-User Admin Polish

- [ ] Improve operational docs for upgrades and operational recovery.
      Rebuild/generated-asset notes already exist, but the overall upgrade flow
      is still fairly engineer-facing.
- [ ] Extend the runtime/debug surface with deeper operational state:
      - watcher state
      - index freshness
      - notification status
      - restart-required reasons
- [ ] Add a concrete maintainer release checklist that ties together:
      - generated frontend bundles
      - PKGBUILD release bumps
      - Nix pin examples
      - GitHub release/tag flow

## Nice To Have

- [ ] Follow up on the note move/rename UX:
      - path validation feedback while typing
      - folder suggestions/autocomplete
- [ ] Better attachment insertion UX beyond `/file`:
      - recent uploads
      - quick replace/remove actions for inline images

## Current Stop Point

- [ ] Next most useful slices:
      - end-to-end merge/conflict coverage
      - local Ollama override for AI query generation
      - task click syntax parity
