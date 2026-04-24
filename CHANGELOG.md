# Changelog

All notable changes to this project will be documented in this file.

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
- Persistent settings API and settings UI for workspace path, home page, hotkeys, and basic UI preferences.
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
