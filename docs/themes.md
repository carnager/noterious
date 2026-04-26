# Custom Themes

Noterious supports:

- built-in themes shipped with the app
- custom themes uploaded through the settings modal

Theme selection is browser-local, but the custom theme library is server-managed.

That means:

- picking a theme affects only the current browser
- uploading or deleting a custom theme affects the shared server library
- custom theme files are stored under `<data-dir>/themes`

## Theme File Format

Custom themes are JSON files with this shape:

```json
{
  "version": 1,
  "id": "my-theme",
  "name": "My Theme",
  "kind": "dark",
  "description": "Short description",
  "tokens": {
    "bg": "#181a1f",
    "bgGradientStart": "#181a1f",
    "bgGradientEnd": "#13151a",
    "bgGlowA": "rgba(133, 154, 176, 0.08)",
    "bgGlowB": "rgba(96, 120, 148, 0.06)",
    "sidebar": "rgba(22, 24, 29, 0.98)",
    "sidebarSoft": "rgba(24, 26, 31, 0.92)",
    "panel": "rgba(28, 30, 36, 0.9)",
    "panelStrong": "#242830",
    "surface": "#303641",
    "surfaceSoft": "#1f242c",
    "overlay": "rgba(25, 27, 33, 0.99)",
    "overlaySoft": "rgba(28, 31, 37, 0.95)",
    "table": "rgba(38, 42, 50, 0.9)",
    "tableHeader": "rgba(134, 164, 195, 0.1)",
    "editorOverlay": "rgba(30, 33, 39, 0.98)",
    "ink": "#dde3ea",
    "muted": "#98a5b4",
    "accent": "#86a4c3",
    "accentSoft": "rgba(134, 164, 195, 0.16)",
    "warn": "#d97777",
    "line": "rgba(134, 164, 195, 0.14)",
    "lineStrong": "rgba(134, 164, 195, 0.26)",
    "focusRing": "rgba(134, 164, 195, 0.36)",
    "selection": "rgba(134, 164, 195, 0.2)",
    "shadow": "0 16px 40px rgba(0, 0, 0, 0.34)",
    "themeColor": "#191b20"
  }
}
```

## Required Top-Level Fields

- `version`
  Must currently be `1`.
- `id`
  Unique identifier used by the API and local theme selection. If omitted during upload, the server derives one from `name`.
- `name`
  Human-readable display name shown in the settings selector.
- `kind`
  Must be `dark` or `light`. This also drives the document `color-scheme` so native controls match the theme.
- `description`
  Optional short description.
- `tokens`
  Must define every approved theme token.

## Token Reference

### Page Background

- `bg`
- `bgGradientStart`
- `bgGradientEnd`
- `bgGlowA`
- `bgGlowB`

These drive the main app background and atmospheric glow layers.

### Sidebar And Panels

- `sidebar`
- `sidebarSoft`
- `panel`
- `panelStrong`
- `surface`
- `surfaceSoft`

Use these for the left rail, pills, chips, and general elevated surfaces.

### Overlays And Editors

- `overlay`
- `overlaySoft`
- `table`
- `tableHeader`
- `editorOverlay`

These are used by:

- the user menu
- the vault switcher
- settings/help/search modals
- rendered markdown tables
- the table edit UI
- code blocks and editor-adjacent overlays

### Text And Accent Colors

- `ink`
- `muted`
- `accent`
- `accentSoft`
- `warn`

These define the readable text palette and primary interaction colors.

### Borders And Selection

- `line`
- `lineStrong`
- `focusRing`
- `selection`

These drive borders, active states, focus states, and editor selection/active-line styling.

### Effects

- `shadow`
- `themeColor`

`shadow` is a full CSS shadow string. `themeColor` updates the document meta theme color used by browsers and installed shells.

## Validation Rules

Theme uploads are validated on the server.

Rules:

- file must be `.json`
- maximum upload size is `256 KB`
- all approved tokens must be present
- unknown token keys are rejected
- `id` must be unique across built-in and custom themes
- token values must be valid CSS-style color/effect values accepted by the server validator

Arbitrary CSS is not allowed. Themes are token-only.

## Creating A Good Theme

Practical tips:

- start from an existing built-in theme and change one family of tokens at a time
- keep `ink` and `muted` readable against both `bg` and `overlay`
- test tables, code blocks, and the settings modal, not just the main note view
- for light themes, make `line` and `lineStrong` a bit stronger than your first instinct
- if a theme feels muddy, the problem is usually low contrast between `overlay`, `surface`, and `ink`

## Uploading And Removing Themes

In the web UI:

1. open `Settings`
2. go to `Appearance & Hotkeys`
3. use `Upload Theme` to upload a JSON file
4. choose the theme from the `Theme` select
5. click `Save Settings` to persist the selection in this browser

Notes:

- upload and delete actions happen immediately
- changing the selected theme previews immediately but is only saved when you save settings
- canceling the settings modal restores the previously saved theme selection
- deleting the currently active custom theme falls back to the default built-in theme

## API

Theme management uses:

- `GET /api/themes`
- `POST /api/themes`
- `DELETE /api/themes/{id}`

See [docs/api.md](/home/carnager/Code/noterious/docs/api.md:1) for endpoint details.
