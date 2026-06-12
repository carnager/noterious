# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added
- API bearer tokens for automation clients: `GET/POST /api/auth/tokens` and `DELETE /api/auth/tokens/<id>`, with `Authorization: Bearer ntr_...` accepted on all authenticated endpoints. Token management requires a browser session; only token hashes are stored.
- Full-text search index (SQLite FTS5) behind `/api/search` page results, with bm25 relevance ranking that weights path and title matches above body matches. Existing databases are backfilled automatically on first start; mid-word fragment queries still fall back to the previous substring scan.
- Optional page-history retention via `NOTERIOUS_HISTORY_MAX_REVISIONS` and `NOTERIOUS_HISTORY_MAX_AGE`. Defaults keep every revision; when set, older revisions are pruned on save and the newest revision is always kept.

### Fixed
- Note saves and history/trash writes are now atomic (temp file plus rename), so a crash mid-write can no longer leave a torn note or revision behind.
- Login attempts are rate limited per client address (10 failures per 15 minutes), so the single account can no longer be brute-forced unthrottled.
- Both SQLite connection pools now set `busy_timeout=5000` via the DSN, preventing spurious `SQLITE_BUSY` errors when auth and index access overlap on the shared database file.

## [v0.1.27] - 2026-05-09

### Added
- Appearance settings now include a client-side option to keep rendered code blocks always expanded.

### Fixed
- Toggling rendered task checkboxes in the note editor no longer jumps the viewport or flickers from full note reloads.
- Rendered task toggles now update locally without polluting undo history, while still refreshing surrounding task/query state in the background.

## [v0.1.26] - 2026-05-08

### Fixed
- Added a local TypeScript declaration shim for `node-emoji`, so frontend builds do not depend on external package type discovery and no longer fail in stricter environments such as some Nix setups.

## [v0.1.25] - 2026-05-08

### Added
- Rendered notes now have a dedicated view-only mode, so query results and other rendered content can be selected and copied without entering edit state.
- Notes, folders, and documents in the tree now support inline create/rename, while move actions use a separate full-path destination picker with keyboard navigation.
- Markdown note links can now target heading anchors, and the note header now exposes undo and redo controls directly.

### Changed
- Tree move flows now use a cleaner rofi-like folder picker that always shows full absolute-style paths, confirms on `Enter`, and separates rename from move in the context menu.
- Tree actions now use clearer note/folder creation icons, and the web UI consistently treats the note surface as one of three states: raw, editable rendered, or view-only rendered.

### Fixed
- Moving a folder now rewrites affected page and document references instead of leaving stale links behind.
- Rendered view-only mode now keeps the note passive without breaking text selection.

## [v0.1.24] - 2026-05-08

### Added
- Attachment uploads can now target a specific vault-relative folder, with autocomplete suggestions in settings from known folders and document directories.
- The Files rail now supports drag-to-resize on desktop and shows overflow tooltips for truncated tree labels.
- The rendered editor regression harness now covers raw-link fallback for markdown document links and `[[...]]` links in addition to the broader render-mode cursor matrix.

### Changed
- Top-level folders are now always treated as scopes in the web UI; the old single-vault toggle and vault-path editing controls are gone from settings.
- Markdown rendering is broader and more consistent across preview and editor render mode, including parser-backed inline handling, footnotes, abbreviations, emoji, definition lists, simple HTML, and more complete link handling.
- The top bar now stays visible while scrolling, and links are styled with stronger accent coloring in preview and render mode.

### Fixed
- Drag-and-drop of tree documents, images, and external files into notes is more reliable, and uploads respect the configured placement including the new fixed-folder mode.
- Document links with spaces now resolve, rewrite, and count usage correctly even when authored externally or wrapped/encoded in markdown.
- Rendered editor navigation no longer jumps through tables, code blocks, blockquotes, or links, and entering a rendered markdown or wiki link now reveals the full raw markup for normal filename/path editing.

## [v0.1.23] - 2026-05-07

### Added
- Browser notifications can now surface recent task and note reminders directly in the web client, with persisted sent-state tracking to avoid duplicate local alerts.
- Document move/rename flows now include page-relative path assistance and can rewrite affected markdown document links automatically when files move.
- The rendered editor now has a mounted UI regression harness that exercises real cursor movement across tasks, tables, code fences, hidden prefixes, and render/raw transitions.

### Changed
- ntfy reminders now default to the Noterious Android deep link `noterious://open?page=...` when no explicit `[click: ...]` or `*_click` override is present.
- The Files rail now hides document entries by default, and the tag filter section starts collapsed behind an explicit disclosure toggle.
- Inline markdown rendering now runs through a shared parser-backed path for the web preview and editor render mode instead of separate regex-only handling.

### Fixed
- The daily note hotkey now opens an existing daily note instead of overwriting it when the page already exists.
- Rendered editor navigation no longer jumps unexpectedly around tasks, tables, code blocks, hidden prefixes, or selection-extending moves such as `Shift+Up`, and `Home`/`End` now behave consistently in render mode.
- Markdown rendering now covers more real-world content correctly, including reference links, bare URLs, nested blockquotes and lists, allowed inline HTML, simple HTML blocks, and inline/block math styling.
- Tag-filtered page trees now hide folders that do not contain any visible matching notes.

## [v0.1.22] - 2026-05-05

### Added
- A built-in readonly Help page now opens inside the normal note view and documents markdown, properties, queries, slash commands, and shortcuts.
- Attachment uploads are now configurable (`same-folder`, `vault-root`, or `note-subfolder`), and the Documents picker can surface unused uploads.
- Settings can now validate backup manifests and show richer runtime state, including watcher/notification status, restart reasons, and recent watcher activity.
- Frontmatter property editors now offer scope-local value autocomplete based on the same property key.

### Changed
- The old dedicated Queries workbench has been removed; inline query blocks and `/query ...` are now the supported query-authoring flow.
- Notes now persist explicit per-note `_type_*` metadata for property kinds, so empty date/datetime/notification/tag/list fields stay typed.
- Note and folder create/rename dialogs now use keyboardable autocomplete popups with live path feedback instead of pill-based suggestions.
- Task reminder click targets now normalize to `[click: ...]`, while legacy `click:: ...` syntax continues to parse.

### Fixed
- Empty folders now remain visible in the page tree, and creating a folder no longer forces creation of an initial note.
- Remote page sync and conflict handling are now more conservative around inline property editors, task/date pickers, title rename, and other semantic UI state.
- Renaming a note to a name that matches an existing folder now works correctly.

## [v0.1.21] - 2026-05-03

### Added
- A server-managed AI query copilot can now draft Noterious queries from natural-language prompts through the new `/query ...` slash command, with grounded validation and one repair pass.

### Changed
- Query blocks generated inline now refresh their rendered results immediately after save instead of waiting for a page reload.
- The settings dialog now uses clearer one-dimensional grouping, with separate Appearance and Hotkeys sections and more coherent Vault/Server placement.
- Built-in hotkey defaults now use `Mod+Shift+D` for the daily note, `Mod+Shift+H` for help, and `Mod+E` for raw mode.

### Fixed
- Tree, trash, history, task, and theme actions no longer rely on browser `prompt()` / `confirm()` dialogs; they now use in-app dialogs that match the rest of the UI.

## [v0.1.20] - 2026-05-01

### Added
- The bundled frontend now ships a generated PNG/ICO app icon set from the project logo for browser tabs, installable PWA icons, and Apple touch icons.

### Changed
- Top-level folder scope mode now keeps canonical full paths throughout the page tree and only shortens labels for display, so scopes behave more like a filtered view/default prefix than a second path system.

### Fixed
- Inline `due` and `remind` pickers now flip upward and stay within the viewport when opened near the bottom of the page.
- Rendered tasks with inline `due`/`remind` fields now move one logical line at a time with Up/Down instead of skipping tasks.
- Creating notes inside folders in top-level scope mode no longer drops them into the scope root, and folders with repeated names inside a scope resolve correctly.

## [v0.1.19] - 2026-04-30

### Added
- A conflict recovery dialog now handles page save conflicts and unsafe remote-change reviews with base/local/remote versions plus an editable resolution buffer.
- The Settings backup section can now download both a deployment backup manifest JSON and a generated shell backup script, and also exposes live runtime status such as listen address, current scope, vault health, and restart-required state.

### Changed
- The Documents modal and `/file` flow now make the upload destination explicit, so attachments clearly land in the current note folder or vault root as appropriate.
- The settings backup/runtime sections now render as stable metadata panels instead of dark readonly mini-forms, and the settings dialog keeps a fixed height when switching sections.

## [v0.1.18] - 2026-04-29

### Added
- The page save API now accepts `baseRawMarkdown` for automatic three-way merges, and the bundled web UI plus Android shopping companion send it on saves.
- The slash menu `/table` command now accepts optional dimensions like `/table 3 4`, and the inline table editor can delete rows and columns in addition to adding them.

### Changed
- The bundled web UI now auto-merges non-overlapping external page edits into the open editor buffer and only falls back to the remote-change warning when edits overlap or transient non-markdown draft UI is active.

### Fixed
- Empty rendered table rows now keep the same visual height as filled rows instead of collapsing.

## [v0.1.17] - 2026-04-29

### Added
- Uploaded images now render as inline embeds in markdown links and rendered-mode previews, and the slash menu now includes `/file` to open the native file picker for note attachments.
- The HTTP API now accepts an optional `X-Noterious-Client-Id` header so browser tabs and companion clients can attribute their own writes explicitly.

### Changed
- The web UI now sends a per-tab client ID automatically, and watcher-driven invalidation echoes reuse recent origins when they match the same acknowledged file change.

### Fixed
- Same-session page saves, task edits, and frontmatter changes no longer spuriously show the “changed on another device” toast.

## [v0.1.16] - 2026-04-29

### Added
- Reminder click targets can now be attached to both tasks and note frontmatter notifications, and are forwarded to ntfy so tapping a notification can open a URL or custom app URI.
- SQLite task indexing now persists reminder click targets, with focused regression coverage for parsing, migrations, patching, and notification delivery.

### Changed
- Frontmatter `*_click` reminder companion fields now stay plain text in the UI and template/type heuristics instead of being mistaken for datetime-like properties.

### Fixed
- The Help hotkey now works from typing contexts when the configured binding is a real shortcut rather than text input.
- Hotkey guidance in settings now distinguishes correctly between the current default, other safe custom bindings, and genuinely safer alternatives.

## [v0.1.15] - 2026-04-28

### Fixed
- Rendered-mode task lines now treat hidden markdown prefixes as atomic cursor ranges, so moving right from the start of a task jumps straight to the first visible task character instead of stepping through invisible checkbox syntax.

## [v0.1.14] - 2026-04-28

### Added
- Dedicated template documentation in `docs/templates.md`, covering vault-native template discovery, placeholders, guided fill, and a full contact-note example.

### Changed
- Scope-wide tags now live inside the Files rail as a live tree filter instead of a separate rail tab, and they are rendered as hashtag-style filters with counts.
- Frontmatter property editing now keeps key/value focus aligned with the action, including key-first rename flows and better list/tag entry handling during property creation.

### Fixed
- Pending typed tag/list values are now preserved when adding frontmatter properties instead of being dropped unless a separator was pressed first.
- The frontmatter notification property control now matches the rest of the UI better and keeps its type label readable.
- The Files rail tag section now stays anchored to the bottom while the page tree above it owns the scrolling area.

## [v0.1.13] - 2026-04-28

### Added
- Vault-native note templates under `_templates/`, including template-scoped target folders, typed frontmatter field hints, and quick-switcher create actions.
- Guided template filling for essential fields so templated notes can step through important contact/date fields without keeping template markers in the final note.
- Frontmatter `notification` as a first-class property kind, with note-level reminder delivery in addition to task reminders.
- A `flake.nix`, Nix package, and multi-instance NixOS module with `services.noterious.instances.<name>`.
- `NOTERIOUS_AUTH_BOOTSTRAP_PASSWORD_FILE` support for secret-file based unattended provisioning.
- Focused frontend regression coverage for templates and tree rendering behavior.

### Changed
- Rendered task checkboxes now use native checkbox visuals inside the editor widget while keeping the existing CodeMirror event model.
- Hotkey settings now use browser-aware defaults, duplicate/conflict analysis, and inline warnings for likely browser-reserved shortcuts.
- Property creation and template flows now better match the current frontmatter model, including dedicated support for tags and notification/datetime-like fields.
- The documented Nix flake flow now uses the moving `latest` tag for tracking the newest release, while still supporting explicit version tags for pinned installs.

### Fixed
- Task toggling in rendered mode now resolves tasks correctly even when frontmatter is present above the note body.
- Caret placement after pressing `Enter` at the end of a task line is aligned correctly in rendered mode.
- Rendered-mode frontmatter is now treated as a hard boundary, including the blank separator space below it, so cursor movement and backspace do not cross into hidden frontmatter.
- Tree folders can now be collapsed even when the currently selected note lives inside that folder.
- The settings modal now keeps the page fixed and makes the active section scroll internally instead of overflowing the viewport.
- Frontmatter add/edit flows now better preserve typed fields such as dates, notifications, tags, and booleans.

## [v0.1.12] - 2026-04-27

### Fixed
- Editing inside an already closed wikilink like `[[foo]]` no longer reopens the create-link slash menu mid-word.

## [v0.1.11] - 2026-04-27

### Added
- A broader built-in theme pack including GitHub, Gruvbox, Rosé Pine, Ayu, Everforest, Tokyo Night, Kanagawa, and One Dark variants.
- A packaged user-level systemd service template and an Arch Linux `PKGBUILD`.

### Changed
- `due` and `remind` now follow a date-plus-time model: `due` stays date-only, while `remind` is treated as a time-of-day refinement for notifications.
- Home page selection is now fully client-side, including the root/unscoped case; the remaining server-side homepage config and API fields were removed.
- The settings theme picker now merges the frontend built-in theme library with server-provided custom themes, so newly shipped built-ins appear without waiting on backend theme metadata.
- The desktop sidebar now uses a flatter docked pane layout and stays fixed from top to bottom instead of floating with page scroll.

### Fixed
- Scoped query results and derived query blocks no longer leak task data from a previously selected scope.
- Remote-change toasts no longer fire for the current browser tab’s own edits and now only surface real external page changes.
- Scope switching no longer leaves a stale page from the previous scope open when the new scope has no remembered page.
- Help modal styling and related shortcut/keycap surfaces now follow the active theme instead of keeping hard-coded dark colors.
- Renaming a note now updates scoped relative wiki links consistently, including repeated renames of the same page.

## [v0.1.10] - 2026-04-26

### Added
- The sidebar Tasks panel now loads vault-wide tasks for the current scope instead of only tasks from the selected page.
- Task panel filters are now combinable and include a `Current Page` toggle alongside `Not Done`, `Has Due`, and `Reminders`.

### Changed
- The abandoned multi-vault backend model has been fully collapsed into a single-store architecture with top-level-folder scope filtering.
- Scope selection is now client/request-driven instead of being persisted through auth/session or per-vault backend storage.
- Vault discovery and rename/create flows are now filesystem-backed directly from the configured vault root.
- Large parts of the HTTP API were moved onto typed response payloads and method-aware routing, reducing ad-hoc maps and manual method switching.
- The backend event broker and HTTP logging paths were simplified and hardened for normal server operation.

### Fixed
- Scoped tree rendering now shows the contents of the selected top-level folder instead of redundantly showing the selected folder as the tree root.
- Theme selection no longer flashes the default dark theme briefly when switching scope or reloading.
- Query result cells now render inline markdown such as bold and italic markup instead of showing the raw markers.
- Event subscriber cleanup no longer risks double-close panics, and dropped SSE events are now observable through broker accounting and warning logs.
- Successful request logging is restored for normal API traffic, while noisy health/SSE endpoints remain suppressed.
- Vault/folder HTTP error handling now uses real sentinel errors instead of string matching, and duplicate top-level vault creation now returns a proper conflict.

## [v0.1.9] - 2026-04-26

### Added
- Pasting a URL into the editor auto-creates markdown link syntax; when text is selected the selection becomes the link label.
- Typing a bare URL and pressing Space or Enter auto-converts it to `[url](url)` markdown link syntax.
- Inline markdown rendering (bold, italic, code, strikethrough, wiki links, markdown links) now works inside table cells, list items, and the sidebar task list.
- Task filter buttons (Not Done, Has Due, Reminders, All) in the sidebar tasks panel.
- Checkboxes on sidebar task items to toggle done/not-done directly without navigating to the task.
- Bare URLs in the editor are rendered as clickable external links.

### Fixed
- Tab key now works in the editor for indentation.
- Rename now supports full folder paths (e.g. `folder/subfolder/name`).
- Sidebar font-size increase no longer cuts off the page tree; rail panels scroll within their fixed viewport.
- Task panel items now use theme-aware colors instead of hard-coded backgrounds.

## [v0.1.8] - 2026-04-26

### Added
- First-class theme management with built-in themes, browser-local theme selection, and server-managed custom theme upload/delete.
- A larger built-in theme library including Arc, Arc Dark, Nord, Dracula, Solarized, Catppuccin, and Base16 variants.
- Dedicated user-facing theme authoring documentation covering the JSON theme format and token reference.

### Changed
- The web UI now applies themes across the sidebar, settings modal, user menu, vault switcher, rendered tables, and the table editor.
- The README is now user-focused and the API and architecture docs now match the current single-account, top-level-vault, theme-enabled app model.

### Fixed
- Code blocks, active-line highlighting, modal controls, and topbar path styling now follow the selected theme instead of leaking static dark-theme styling.
- The desktop sidebar no longer grows with long page content and now scrolls within its own fixed viewport height.
- The page-tree right-click context menu, slash menu, embedded query edit button, and other overlay controls now follow the active theme instead of keeping hard-coded dark styling.
- Embedded query blocks now read as derived content with a soft themed shell and label, while active-line markup reveals for headings, links, and inline task properties now adapt better across light and dark themes.
- Calendar and task-date popup controls now follow the active theme instead of keeping dark fixed button and day-cell styling.
- Editor syntax highlighting now derives from the active theme instead of using a hard-coded Solarized palette, so markup tokens like headings and inline property syntax no longer stay cyan across every theme.

## [v0.1.7] - 2026-04-26

### Added
- Shared vault-resolution flow for auth and request handling, plus regression coverage for first-use index creation when switching into an unindexed top-level vault.
- Focused frontend regression coverage for settings persistence so client-preference rerenders no longer wipe unsaved notification fields.

### Changed
- Collapsed the runtime model back to one configured vault root with optional top-level folder switching, removing the old per-user-root vault layout.
- Simplified auth toward a single-account deployment model, including setup wording, session/runtime terminology, and settings flow.
- Separated `/api/meta` runtime-vault state from current session-vault state so server config and active request scope are exposed distinctly.
- Startup indexing and notification polling now stay lazy around the configured root instead of eagerly creating index state on boot.
- Split large frontend UI surfaces out of `frontend/app.ts` into dedicated modules for session UI, settings, help, palettes, history/trash, page tree operations, client preferences, and inline editors.

### Fixed
- User notification settings now persist correctly when saving from the settings dialog, including ntfy topic/token fields.
- Rendered table editing now matches the visual table metrics more closely, uses a softer active-cell fill, and supports consistent `Enter`/`Escape` finish and cancel shortcuts.
- Rendered table navigation no longer exposes raw markdown as part of the upward movement workaround attempts; table editing stays behind the dedicated table editor UI.

## [v0.1.6] - 2026-04-25

### Added
- First-run account setup with `Create The First Account` flow for fresh installs, plus forced bootstrap password rotation before normal API access is restored.
- Per-user notification settings backed by the auth store and exposed through `/api/user/settings`.
- Sidebar settings layout with separate account and runtime sections.

### Changed
- Appearance and hotkey preferences now stay in the browser instead of being stored as shared server settings.
- ntfy delivery now routes to each user's configured topic/token instead of one global server-wide target.
- Home page preference is now tied to the signed-in user while still being managed from the tree context menu.

### Fixed
- Auth bootstrap/setup state now reaches the UI correctly, so fresh servers show setup instead of the generic login form.
- Graceful shutdown no longer times out when SSE clients are connected.
- Fresh empty vaults now still show the root row in the file tree, so the first note can be created immediately.
- Saving settings now closes the dialog consistently.

## [v0.1.5] - 2026-04-25

### Added
- Session-cookie authentication with bootstrap account creation, login/logout/session endpoints, and API protection for non-public routes.
- A runtime vault-selection layer around the existing single-vault runtime, exposed through auth and meta responses.
- Vault health detection in backend metadata so missing or unreadable vault paths are surfaced explicitly.
- Structured server logging for startup, shutdown, watcher/notifier lifecycle, ntfy deliveries, and noteworthy HTTP requests.

### Changed
- Backend internals are now vault-aware: index, query refresh, history/trash, watcher invalidation, and SSE all resolve within the active vault boundary.
- Vault-scoped backend storage now keeps the filesystem model intact: one vault still maps to one real vault directory with real markdown pages and attachments.
- `/due` and `/remind` now open the inline picker immediately after insertion instead of only inserting text.
- Quote rendering now uses clearer indentation, spacing, italics, and a proper left rule.

### Fixed
- Due/remind picker apply no longer visibly snaps the editor to line 1 before focus is restored.
- Task-date picker interactions now participate in the same note-focus restore flow as the rest of the UI.
- Firefox quote styling now respects the intended spacing instead of collapsing against the text.
- Default-vault indexing/history state now migrates cleanly into vault-scoped storage instead of being stranded in legacy global paths.

## [v0.1.4] - 2026-04-24

### Added
- Page revision history backed by real markdown snapshots, with restore support and change-focused previews in the UI.
- Trash for deleted pages, including restore, permanent delete, and `Empty Trash` support.
- Per-page history purge action and history cleanup on permanent delete.
- Folder delete now moves descendant pages to trash instead of hard-deleting them immediately.
- Tree rename actions for pages and folders, now using consistent SVG icons.
- Task keyboard reordering and indentation shortcuts with subtree-aware movement.

### Changed
- Table editing now uses an overlay editor aligned with the rendered table instead of fragile inline widget inputs.
- Table editor navigation supports `Tab`/`Shift+Tab`, row/column insertion after the current position, `Enter` to finish, and `Esc` to cancel.
- Revision creation is now coalesced within a short window to avoid autosave-spam in history.
- Restore actions no longer prompt for confirmation; restores snapshot current content first so they remain reversible.
- Tree labels now show tooltips and expand to two lines on hover/focus/selection for long filenames.
- Deleting the currently selected page now selects the previous page when possible.

### Fixed
- Shared editor focus reclaim bugs that were snapping the caret back to the first line after table edits.
- Editor focus restoration when closing overlays and returning from another window, so the edit area regains focus consistently.
- Firefox-specific missing icons for task checkboxes, rename actions, and the rail toggle.
- Rendered task indentation so subtasks keep visible nesting in preview mode.
- Root-level drag/drop, rename, and tree action visibility issues.

## [v0.1.3] - 2026-04-24

### Added
- Ntfy-based due and reminder notifications with persisted delivery state and settings UI controls.
- App-controlled date/time display preferences with `Browser Default`, `ISO`, and `DE` modes.
- Daily note command and configurable hotkey, creating or opening `Inbox/YYYY-MM-DD`.
- Inline due and reminder picker for task metadata, plus slash commands for inserting due/remind markup quickly.
- CLI flags for custom listen address and port.
- Root `TODO.md` for follow-up work such as vault health, multi-vault support, and companion app ideas.

### Changed
- Note titles now come from filenames instead of headings, and the title field renames the file in place.
- Rendered page links now show only the filename/leaf while keeping the underlying page path.
- Frontmatter date/datetime editors now respect the app's date/time display preference.
- Task dates moved to bracket syntax like `[due: 2026-04-24]` and `[remind: 2026-04-24 09:00]`, while legacy `due::` syntax remains readable.
- Daily note, reminder, and task-date interactions are now more direct and editor-focused instead of modal-driven.

### Fixed
- Frontmatter YAML list values for fields like `phone_work` and `email` being dropped from indexed JSON.
- Ctrl/Cmd-click task editing regressions and task-line rendering issues around visible text and inline metadata.
- Task date rendering and task modal date fields ignoring the app's custom locale preference.
- Rendered query task links and aliased task columns losing click-through behavior.
- Browser-safe hotkey handling and help surface discoverability.

## [v0.1.1] - 2026-04-24

### Added
- Persistent settings API and settings UI for vault path, home page, hotkeys, and basic UI preferences.
- Built-in help modal with discoverable shortcuts and command-surface explanations.
- Quick switcher, command palette, full search, and document picker as separate browser-safe surfaces.
- Vault-native document attachments with upload, picker, slash command support, and relative markdown links.
- Drag-and-drop movement for pages and folders in the file tree, including moving nested items back to vault root.
- Syntax highlighting and copy buttons for fenced code blocks.

### Changed
- Refactored the frontend into strict TypeScript modules with broader unit test coverage.
- Reworked slash commands toward an Obsidian-like model, including wikilink and embed pickers triggered by `[[` and `![[`.
- Improved rendered editor behavior so links and headings expose raw markdown when the caret moves onto them.
- Split top-level navigation into distinct quick switcher, global search, and command palette flows with visible help and safer browser shortcuts.
- Added desktop rail toggling, sidebar cleanup, hover actions for folders and pages, and better note/editor scrollbar behavior.
- Switched dashboard task labeling to use query aliases instead of frontend-only header guessing.

### Fixed
- Duplicate history entries when navigating rendered links.
- Command palette actions staying open after selection.
- Root-level drag-and-drop failing because nested drag payloads were overwritten by ancestor folders.
- Query tables wrapping multi-number phone fields instead of stacking them line by line.
- Various rendered-mode editing issues around links, headings, active-line highlighting, and code block presentation.

## [v0.1.0] - 2026-04-24

### Added
- Initial public release.
