# Changelog

All notable changes to this project will be documented in this file.

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
