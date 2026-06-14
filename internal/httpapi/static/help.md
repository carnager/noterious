# Noterious Help

Noterious is a single-user, server-first markdown notebook. This page is built into the app, rendered like a normal note, and kept read-only on purpose.

## Basics

- Use the **Files** rail to browse notes and folders.
- Use **Quick Switcher** to jump to a note quickly or create one when there is no exact match.
- Use **Raw** to edit markdown directly and **Preview** to see the rendered view.
- If **top-level folders as vaults** is enabled, the switcher at the top of the Files rail filters the app to one top-level folder without changing canonical note paths.
- **History** shows saved revisions for the current note.
- **Trash** keeps deleted notes until you remove them permanently.

## Markdown

Noterious writes normal markdown files.

### Headings, emphasis, and links

```md
# Heading 1
## Heading 2

**bold**
*italic*
~~struck~~
`inline code`

[[Project Alpha]]
[[people/alina|Alina]]
[OpenAI](https://openai.com)
```

### Tasks

```md
- [ ] Open task
- [x] Done task
- [ ] Follow up [due: 2026-05-10]
- [ ] Leave now [remind: 2026-05-10 08:45]
- [ ] Open shopping [click: noteriousshopping://shopping]
```

`[due: ...]` adds a due date, `[remind: ...]` adds a reminder, and `[click: ...]` can attach a notification tap target.

### Tables

```md
| Name | Status |
| --- | --- |
| Alpha | Open |
| Beta | Done |
```

Slash command shortcuts:

- `/table` inserts a default table
- `/table 3 4` inserts a table with 3 columns and 4 body rows

### Files and images

- Drag and drop files onto a note to upload them.
- Use `/doc` to search existing documents and insert a link.
- Use `/file` to open the native file picker.
- Images are embedded automatically; other files are inserted as links.

## Frontmatter and Properties

Noterious stores properties in YAML frontmatter:

```md
---
tags:
  - project
  - urgent
location: Berlin
birthday: 2026-09-17
meeting_at: 2026-05-10 09:30
published: true
---
```

Use the property UI above a note to:

- add or rename fields
- change the field type
- edit tags, lists, booleans, dates, datetimes, and notifications

When a field is given an explicit type, Noterious stores hidden `_type_*` metadata in the note so empty values keep behaving like their chosen type.

Property value autocomplete is scope-local and based on other notes that use the same property key. For example, editing `location` suggests other `location` values from the current scope.

## Slash Commands

Slash commands work inside the markdown editor.

Available built-ins include:

- `/table`
- `/table 3 4`
- `/doc meeting-notes`
- `/file`
- `/due`
- `/remind`
- `/query show all contacts with birthday reminders`

`/query ...` asks the query copilot to generate a query block directly in the note.

## Queries

Queries live in fenced `query` blocks inside notes.

To write a query block manually:

````md
```query
from pages
where contains(tags, "project")
select path, title, updatedAt
sort updatedAt desc
limit 10
```
````

Main datasets:

- `pages`
- `tasks`
- `links`

Typical query flow:

1. Draft the query directly in a note.
2. Use `/query ...` when you want AI to generate a starting point inline.
3. Save the note when the query block looks right.

## Templates

Templates are normal notes stored under `_templates`.

They can define:

- default frontmatter values
- type hints for fields
- target folders
- guided fill steps

Use the Quick Switcher to create notes from templates.

## Reminders and Notifications

- Note reminders live in frontmatter fields such as `notification`.
- Task reminders live in `[remind: ...]`.
- Optional click targets can be added with sibling `*_click` frontmatter fields or task `[click: ...]` fields.
- Without an explicit click target, ntfy reminders default to `noterious://open?page=...` for the matching page.
- Noterious can deliver reminders through ntfy when notifications are configured.

## Search, History, and Recovery

- **Global Search** searches notes and tasks.
- **History** shows previous revisions of a note and can restore them.
- **Trash** keeps deleted notes until they are emptied permanently.
- Settings include backup helpers and a generated backup script for server-side backups.

## Shortcuts

Current shortcuts can be changed in **Settings → Hotkeys**.

Common defaults include:

- Quick Switcher: `Mod+Shift+L`
- Full Search: `Mod+Shift+F`
- Command Palette: `Mod+Shift+Y`
- Daily Note: `Mod+Shift+D`
- Toggle Raw Mode: `Mod+E`
- Open Help: `Mod+Shift+H`

## Tips

- Use the command palette for app actions such as opening settings, queries, or the quick switcher.
- Use the context menu in the Files tree to rename, move, or delete notes and folders.
- If a note changes on another client, Noterious tries to merge safe non-overlapping edits automatically and falls back to conflict review when needed.
