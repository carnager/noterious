# Noterious TODO

Current direction: Noterious is a single-user, server-first markdown notebook.
Notes stay as markdown files on disk. The goal is not multi-user sync, a plugin
platform, or a database-first rewrite. This list focuses on the highest-value
missing product and reliability work still open in the current app.

## Priority 1: Editor Rendering Refactor — DONE (2026-06-12)

Shipped in four phases (commits `edd697e`, `d668ea9`, `f2c6831`, `708100b`):

1. `frontend/renderedPositions.ts` now owns all raw↔rendered position math:
   hidden-prefix lengths, the three arrow-target functions (pure, over line
   text, unit tested), inline link spans, and block segmentation
   (`scanRenderedBlocks`).
2. `buildRenderedDecorations` is split into per-block builders (frontmatter,
   reference runs, table, query, math, code, single line) emitting range
   specs; block scanning uses a structure-only `markdownTableBlockRangeAt`.
3. The decorations StateField caches built specs per block, keyed by the
   block's raw lines, reveal/selection state, neighbor lines, resolved task
   entry, and query result HTML, plus a document-wide key. Unchanged blocks
   reuse cached specs (and widget instances) shifted by the position delta.
   Typing or cursor movement in a 1,000-line note rebuilds ≤3 blocks
   (asserted via `debugRenderedBlockBuilds` in `editorUi.test.ts`); task
   toggles rebuild only the toggled line.
4. Horizontal arrows now step into widget-rendered links (images,
   label-less document links) instead of snapping across them; label-styled
   links already stepped via partial atomic ranges (existing tests encode
   that contract).

Band-aids re-checked and deliberately kept:

- Scroll snapshot/restore (`focusEditorView`) stays: it implements the
  public `focus({preventScroll})` API used ~20× across `app.ts` and guards
  against focus-induced scrolling, which is unrelated to widget recreation
  (now fixed by the cache).
- The `MarkdownTableWidget` padding compensation stays: CodeMirror block
  widget height measurement still excludes child margins regardless of
  rebuild frequency.

Known follow-up (optional): documents containing reference definitions fall
back to full rebuilds while editing, because definition offsets are part of
the document-wide cache key (rendered links bake
`data-reference-definition-offset` jump targets). Resolving the offset at
click time by label instead would restore incrementality for those notes.

Reminder for any frontend change: run `npm run typecheck`, `npx vitest run`,
then `npm run build:ui` and commit the regenerated
`internal/httpapi/static/app.js` / `editor.bundle.js` (CI `verify:ui` fails
otherwise). The Go server embeds these, so restart to see changes.

## Priority 1b: Conflict Recovery

- [ ] Keep hardening the remaining structured-editor edge cases so the
      fallback stays conservative and never drops hidden draft state.
      Most plain markdown conflict paths are now covered; what remains is
      mainly the last inline-table and future semantic-editor edge cases.
- [x] Fix cursor navigation inside rendered document links so `ArrowLeft`
      and `ArrowRight` step through the link text instead of snapping to the
      first or last character. (Shipped with the rendering refactor above.)

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
- [x] Frontend settings UI for the new automation features (2026-06-12):
      - API token management lives in the new Automation settings section
        (create with one-time plaintext display and copy, list, revoke)
      - webhook management in the same section (create with label/URL/
        events/secret, delivery state display, delete)
      - the task due-date picker has a Repeat row (presets plus custom
        intervals like `2w`, clearable)

## Nice To Have

- [ ] Better attachment insertion UX beyond `/file`:
      - recent uploads
      - quick replace/remove actions for inline images

## Current Stop Point

- [ ] Next most useful slices:
      - last structured-editor conflict edge cases
      - decide whether restore should become a real product flow
      - local Ollama override for AI query generation
      - better attachment insertion UX (nice-to-have above)
