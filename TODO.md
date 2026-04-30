# Noterious TODO

Current direction: Noterious is a single-user, server-first markdown notebook.
Notes stay as markdown files on disk. The goal is not multi-user sync, a plugin
platform, or a database-first rewrite. This list focuses on the highest-value
missing product and reliability work in the current app.

## Priority 1: Conflict Recovery

- [ ] Build a real conflict-resolution UI for page save conflicts and unsafe
      remote-change merges.
      Today Noterious can auto-merge non-overlapping edits, but fallback is
      still mostly "warn and reload/save again". It needs a proper flow that
      shows local vs remote vs base content and lets the user choose or merge
      manually.
- [ ] Add an explicit "review remote changes" path when auto-merge is blocked
      by unsafe UI state (property draft, inline table editor, title edit).
- [ ] Add broader end-to-end coverage for multi-client editing:
      - live `page.changed` event -> fetch -> merge -> editor update
      - overlapping edit conflicts
      - remote changes while semantic editors are open

## Priority 2: Backup And Restore

- [ ] Document and surface a first-class backup strategy for the full
      deployment, not just per-page history.
      The vault is not the whole state: themes, auth, history, trash, and the
      disposable index live under the data dir.
- [ ] Add a simple export/import or backup/restore admin flow.
      Minimum useful scope:
      - export deployment metadata/instructions
      - restore from data-dir + vault backup safely
      - make it obvious what must be backed up
- [ ] Decide whether full-vault restore belongs in the UI, API, or docs-only
      operational tooling.

## Priority 3: Attachments And Assets

- [ ] Turn attachment placement into an explicit product decision.
      Uploads currently work and are stored near the note path, but there is no
      user-facing policy around:
      - same folder as note
      - per-folder asset subfolder
      - fixed attachment folder
- [ ] Add basic asset management visibility:
      - show where uploads will go
      - make image/file behavior consistent in rendered mode
      - consider surfacing orphaned files or unused uploads
- [ ] Decide whether task click targets should get bracket syntax parity with
      reminders (`[click: ...]` vs `click:: ...`).

## Priority 4: Automation And Integrations

- [ ] Add generic outbound automation hooks.
      Candidate events:
      - page changed
      - task changed
      - reminder fired
      - query result refreshed
      This should stay generic (webhooks / simple hooks), not app-specific.
- [ ] Make notification tap-target behavior easier to discover in the docs and
      UI, especially note `*_click` fields and task click targets.

## Priority 5: Single-User Admin Polish

- [ ] Improve operational docs for upgrades, rebuilds, and generated assets.
      The current flow is workable but still fairly engineer-facing.
- [ ] Add a small admin/debug surface for runtime health:
      - watcher state
      - index freshness
      - notification status
      - restart-required reasons
- [ ] Tighten release checklist documentation for:
      - generated frontend bundles
      - PKGBUILD release bumps
      - Nix pin examples
      - GitHub release/tag flow

## Nice To Have

- [ ] More polished note move/rename UX now that the title field can edit full
      paths.
      Possible follow-ups:
      - path validation feedback while typing
      - folder suggestions/autocomplete
      - clearer "rename" vs "move" affordances
- [ ] Better attachment insertion UX beyond `/file`:
      - recent uploads
      - drag/drop feedback
      - quick replace/remove actions for inline images
- [ ] Additional recovery tools around page history:
      - diff view improvements
      - restore preview polish
      - easier copy-from-revision flow
