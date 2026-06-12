# Noterious TODO

Current direction: Noterious is a single-user, server-first markdown notebook.
Notes stay as markdown files on disk. The goal is not multi-user sync, a plugin
platform, or a database-first rewrite. This list focuses on the highest-value
missing product and reliability work still open in the current app.

## Priority 1: Editor Rendering Refactor

Goal: replace the full-document decoration rebuild and the duplicated
raw-to-rendered position math in the editable rendered mode with incremental
updates and one shared position-mapping module. This is the structural fix for
a whole family of recurring bugs; the notes below should let a fresh session
start without re-deriving the analysis.

### Why (symptom history)

These were all patched individually but share one root cause:

- commit `e8adc6e` "Fix task toggle scrolling and flicker" — added manual
  scroll snapshot/restore (`frontend/editor.ts:78-138`) because toggling a
  task recreated unrelated widgets and jumped the viewport
- commit `7e041de` "Fix rendered editor click hitbox drift" — CSS
  compensation in `MarkdownTableWidget` because CodeMirror block-widget
  height measurement misses child margins
- still open: `ArrowLeft`/`ArrowRight` inside rendered document links snap
  to the first/last character instead of stepping through the link text

Root cause: rendered (visual) and raw (markdown source) positions are
treated as separate spaces that several pieces of code re-synchronize
independently, and every change rebuilds the entire rendered layer.

### Current architecture facts (verified 2026-06-12)

- Editor: CodeMirror 6, `frontend/editor.ts` (~3,650 lines).
- The rendered mode is built from decorations plus ~13 `WidgetType`
  subclasses defined at `frontend/editor.ts:228-792` (WikiLinkWidget,
  TaskCheckboxWidget, MarkdownTableWidget, QueryBlockWidget,
  ReferenceDefinitionsWidget, ...).
- `buildRenderedDecorations(state)` (`frontend/editor.ts:2397`, ~500 lines)
  walks every line of the document and rebuilds ALL decorations plus the
  parallel `atomicRanges` set.
- It is driven by `renderedDecorationsField`
  (`frontend/editor.ts:2896`): the field rebuilds on every doc change AND
  on every selection change (cursor movement), because revealing raw
  markdown around the cursor is selection-dependent. So the O(document)
  rebuild runs on every keystroke and every arrow press.
- Block helpers `markdownTableBlockAt` / `markdownCodeFenceBlockAt`
  (`frontend/markdown.ts`) rescan from the top of the document on each call.
- Position math is duplicated in `renderedTableArrowTarget`
  (`frontend/editor.ts:1270`), `renderedTaskArrowTarget` (`:1312`),
  `renderedCodeBlockArrowTarget` (`:1341`), consumed around `:1474`; click
  handling and the scroll band-aid each do their own variant.
- Frontmatter is hidden via `renderedBodyBoundaryStart`
  (`frontend/markdown.ts`) — all line math is offset by it; keep that in
  mind for any cached mapping.

### Suggested plan (phases, each independently shippable)

1. **Shared position mapping.** Extract one module (e.g.
   `frontend/renderedPositions.ts`) that answers, from `(EditorState,
   offset)`: which rendered block contains this offset, what raw prefix is
   hidden before it, and what the arrow/click target should be. Port the
   three `rendered*ArrowTarget` functions and the click-position code onto
   it; delete the duplicated prefix math. Pure functions over line text —
   unit-testable without DOM.
2. **Per-block decoration builders.** Split `buildRenderedDecorations`
   into builders keyed by block range (paragraph, table, code fence, query
   block, reference definitions). Memoize per-line inline parses
   (`parseInlineMarkdownTree` in `frontend/markdown.ts`) keyed by line text.
3. **Incremental updates in the StateField.**
   - Selection-only transactions: only the block that lost the cursor and
     the block that gained it change their revealed state — rebuild those
     two, keep every other decoration via `RangeSet.map`.
   - Doc-change transactions: use `transaction.changes.iterChanges()` to
     find affected block ranges, rebuild only those, map the rest through
     the changes.
   - Effects (`setRenderModeEffect`, `setViewOnlyEffect`, `setTasksEffect`,
     code-block expansion effects) keep forcing a full rebuild — rare.
   - `atomicRanges` must stay in lockstep with the decorations; rebuild
     them from the same per-block results.
4. **Remove the band-aids.** Once unrelated widgets stop being recreated,
   the scroll snapshot/restore (`frontend/editor.ts:78-138`) should be
   unnecessary — verify with the task-toggle tests, then delete. Re-check
   whether the table hitbox CSS compensation is still needed.

### Acceptance criteria

- All existing tests pass unchanged: `npx vitest run` (288+ tests;
  `frontend/editorUi.test.ts` is a mounted-EditorView harness encoding the
  cursor-behavior contract — treat it as the spec).
- Typing or moving the cursor in a 1,000+ line note rebuilds only the
  affected block(s) — assert by counting block-builder invocations in a test.
- Arrow keys step through rendered link text per character (closes the
  open Priority-1 item below).
- Task toggle does not jump the viewport even with the scroll band-aid
  removed.

### Gotchas

- Widget `eq()` correctness becomes critical once DOM reuse matters:
  `ReferenceDefinitionsWidget.eq()` currently compares via
  `JSON.stringify` — replace with field comparison while in there.
- `markdownTableBlockAt`/`markdownCodeFenceBlockAt` results depend on lines
  ABOVE the block (fence state); a per-block cache needs invalidation from
  the topmost changed line downward, not just the changed range.
- After frontend changes run `npm run typecheck`, `npx vitest run`, then
  `npm run build:ui` and commit the regenerated
  `internal/httpapi/static/app.js` / `editor.bundle.js` (CI `verify:ui`
  fails otherwise). The Go server embeds these, so restart to see changes.

## Priority 1b: Conflict Recovery

- [ ] Keep hardening the remaining structured-editor edge cases so the
      fallback stays conservative and never drops hidden draft state.
      Most plain markdown conflict paths are now covered; what remains is
      mainly the last inline-table and future semantic-editor edge cases.
- [ ] Fix cursor navigation inside rendered document links so `ArrowLeft`
      and `ArrowRight` step through the link text instead of snapping to the
      first or last character. (Expected to fall out of the rendering
      refactor above — do not fix separately first.)

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

- [x] Generic outbound automation hooks — shipped as webhooks
      (`/api/webhooks`, see docs/api.md): page/task/query change events plus
      `reminder.fired`, optional HMAC signatures, best-effort delivery.
- [ ] Frontend settings UI for the new automation features, which are
      currently API-only:
      - API token management (create/list/revoke; backend done, see
        `/api/auth/tokens`)
      - webhook management (backend done, see `/api/webhooks`)
      - a repeat option in the task date editor (backend done via
        `[repeat: ...]`, see help page)

## Nice To Have

- [ ] Better attachment insertion UX beyond `/file`:
      - recent uploads
      - quick replace/remove actions for inline images

## Current Stop Point

- [ ] Next most useful slices:
      - editor rendering refactor (Priority 1 above, fully scoped)
      - settings UI for tokens/webhooks/repeat (Priority 4 above)
      - last structured-editor conflict edge cases
      - decide whether restore should become a real product flow
      - local Ollama override for AI query generation
