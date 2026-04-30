# Noterious TODO

Current direction: Noterious is a single-user, server-first markdown notebook.
Notes stay as markdown files on disk. The goal is not multi-user sync, a plugin
platform, or a database-first rewrite. This list focuses on the highest-value
missing product and reliability work in the current app.

## Priority 1: Conflict Recovery

- [x] Build a real conflict-resolution UI for page save conflicts and unsafe
      remote-change merges.
      Today Noterious can auto-merge non-overlapping edits, but fallback is
      still mostly "warn and reload/save again". It needs a proper flow that
      shows local vs remote vs base content and lets the user choose or merge
      manually.
- [x] Add an explicit "review remote changes" path when auto-merge is blocked
      by unsafe UI state (property draft, inline table editor, title edit).
- [ ] Add broader end-to-end coverage for multi-client editing:
      - live `page.changed` event -> fetch -> merge -> editor update
      - overlapping edit conflicts
      - remote changes while semantic editors are open

## Priority 2: Backup And Restore

- [x] Document and surface a first-class backup strategy for the full
      deployment, not just per-page history.
      The vault is not the whole state: themes, auth, history, trash, and the
      disposable index live under the data dir.
- [x] Export deployment metadata and backup instructions from the UI.
      Done today:
      - backup manifest download
      - generated shell backup script
      - runtime path visibility in Settings
- [ ] Add a simple restore flow or restore validation aid.
      Minimum useful scope:
      - validate that a backup set matches the current deployment paths
      - make the restore order obvious at restore time, not only in docs
- [ ] Decide whether full-vault restore belongs in the UI, API, or docs-only
      operational tooling.

## Priority 3: Attachments And Assets

- [ ] Turn attachment placement into an explicit product decision.
      Uploads currently work and are stored near the note path, but there is no
      user-facing policy around:
      - same folder as note
      - per-folder asset subfolder
      - fixed attachment folder
- [ ] Surface orphaned files or unused uploads.
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
- [x] Expose core runtime state in Settings:
      - listen address
      - current scope
      - server time
      - restart-required flag
      - vault health
- [ ] Extend the runtime/debug surface with deeper operational state:
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

- [x] Let the note title field edit the full path so rename and move are one
      flow.
- [ ] Follow up on the note move/rename UX:
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

## Current Stop Point

- [x] Conflict recovery UI, backup helpers, upload target visibility, and basic
      runtime admin status are all in place.
- [ ] Next most useful slice:
      - end-to-end merge/conflict coverage, or
      - restore validation flow, or
      - attachment policy decision
