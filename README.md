# Noterious

Noterious is a server-first markdown notebook. Your notes stay as markdown files on disk, while the server handles indexing, queries, rendering, history, notifications, and the web UI.

## What It Does

- keeps markdown files as the source of truth
- serves a web UI for browsing, editing, tasks, backlinks, and embedded queries
- builds a disposable SQLite index for fast search and query execution
- supports vault-native note templates under `_templates/`
- sends notifications from both task reminders and note frontmatter notification fields
- supports one account per deployment
- can treat top-level folders under the vault root as switchable vault scopes
- supports built-in and custom UI themes
- ships Nix packaging plus a multi-instance NixOS module

## Quick Start

Requirements:

- Go
- Node.js and npm

Install frontend dependencies:

```bash
npm install
```

Build the embedded UI:

```bash
npm run build:ui
```

Run the server:

```bash
go run ./cmd/noterious
```

Or build a binary first:

```bash
go build -o noterious ./cmd/noterious
./noterious
```

By default Noterious uses:

- vault root: `./vault`
- data dir: `./data`
- listen address: `:3000`

Open `http://localhost:3000`.

On first startup against an empty data directory:

- if `NOTERIOUS_AUTH_BOOTSTRAP_USERNAME` and `NOTERIOUS_AUTH_BOOTSTRAP_PASSWORD` are set, that account is created automatically
- otherwise the web UI starts in first-run setup mode and asks you to create the initial account

## Vault Model

Noterious has one configured vault root on disk.

That root is itself a valid note space:

- `<vault-root>`

Optional switchable vault scopes are just direct child folders below it:

- `<vault-root>/<top-level-folder>`

If you enable `Use top-level folders as vaults` in settings, the UI can switch between those top-level folders. This is a UI/runtime scope feature, not a separate storage backend.

Background services stay rooted at the configured vault root:

- the filesystem watcher polls the configured root
- the ntfy notifier polls the configured root index when it exists

Request-time page/task/query routes run against the currently selected vault scope for that session.

## Templates

Templates are regular markdown notes stored in `_templates/`.

- global templates live under `<vault-root>/_templates`
- scoped templates can also live under `<vault-root>/<top-level-folder>/_templates`
- creating a note from a template copies the template body and frontmatter scaffold
- the created note stays clean markdown; template metadata is not kept in the resulting note

Supported template metadata keys:

- `_template_label`
- `_template_folder`
- `_template_bool`
- `_template_date`
- `_template_datetime`
- `_template_notification`
- `_template_tags`
- `_template_list`

Example:

```md
---
_template_label: Contact
_template_folder: contacts
_template_date:
  - birthday
_template_bool:
  - birthday_reminder
_template_tags:
  - tags
vorname: ""
nachname: ""
birthday: ""
birthday_reminder: false
tags:
  - contact
---

## Notizen
```

## Notifications

Noterious supports reminders in two places:

- task reminders via `[remind: YYYY-MM-DD HH:MM]`
- note frontmatter fields such as `notification`, `notify`, `remind`, `reminder`, or `*_notification`

For note frontmatter, `notification` is the dedicated datetime-like field kind in the UI.
Example:

```md
---
notification: 2026-05-01 09:00
---
```

## Themes

Theme selection is browser-local.

- built-in themes ship with the app
- custom themes are uploaded through the settings modal
- uploaded theme files are stored on the server under `<data-dir>/themes`
- deleting a custom theme removes it from the shared server theme library

To create your own themes, see [docs/themes.md](/home/carnager/Code/noterious/docs/themes.md:1).

## Configuration

Useful environment variables:

- `NOTERIOUS_VAULT_PATH`
- `NOTERIOUS_DATA_DIR`
- `NOTERIOUS_LISTEN_ADDR`
- `NOTERIOUS_WATCH_INTERVAL`
- `NOTERIOUS_NTFY_INTERVAL`
- `NOTERIOUS_AUTH_COOKIE_NAME`
- `NOTERIOUS_AUTH_SESSION_TTL`
- `NOTERIOUS_AUTH_BOOTSTRAP_USERNAME`
- `NOTERIOUS_AUTH_BOOTSTRAP_PASSWORD`
- `NOTERIOUS_AUTH_BOOTSTRAP_PASSWORD_FILE`

CLI flags currently support:

- `--listen-addr`
- `--port`
- `--data-dir`
- `--vault-dir`

CLI flags override the corresponding environment variables.

## Development

Rebuild the embedded UI after frontend changes:

```bash
npm run build:ui
```

Verify committed generated assets:

```bash
npm run verify:ui
```

The UI is served through Go `embed`, so after rebuilding the frontend you must restart the Go process to pick up the new files.

## Docs

- [docs/api.md](/home/carnager/Code/noterious/docs/api.md:1) for HTTP endpoints
- [docs/query-language.md](/home/carnager/Code/noterious/docs/query-language.md:1) for embedded query syntax
- [docs/architecture.md](/home/carnager/Code/noterious/docs/architecture.md:1) for runtime/storage structure
- [docs/themes.md](/home/carnager/Code/noterious/docs/themes.md:1) for custom theme authoring

## Service Setup

The repository includes a user-level systemd unit at [contrib/systemd/noterious.service](/home/carnager/Code/noterious/contrib/systemd/noterious.service:1).

For packaged installs, enable it directly:

```bash
systemctl --user daemon-reload
systemctl --user enable --now noterious
```

For source installs, copy it to `~/.config/systemd/user/noterious.service`, adjust `ExecStart` and the path environment variables, then run:

```bash
systemctl --user daemon-reload
systemctl --user enable --now noterious
```

## Nix / NixOS

The repository now includes:

- a `flake.nix`
- a build package at [nix/package.nix](/home/carnager/Code/noterious/nix/package.nix:1)
- a NixOS module at [nix/module.nix](/home/carnager/Code/noterious/nix/module.nix:1)

Build the package directly with:

```bash
nix build .#noterious
```

To use the NixOS module, import `inputs.noterious.nixosModules.default` and configure one or more instances:

```nix
{
  imports = [ inputs.noterious.nixosModules.default ];

  services.noterious.instances = {
    main = {
      enable = true;
      port = 3000;
      vaultDir = "/srv/noterious/main/vault";
    };

    work = {
      enable = true;
      port = 3001;
      vaultDir = "/srv/noterious/work/vault";
      openFirewall = true;
    };
  };
}
```

Each enabled instance creates a systemd service named `noterious@<instance>.service`.
Bootstrap secrets can be provided through `services.noterious.instances.<name>.bootstrapPasswordFile`.

## Arch Linux

A release-oriented [PKGBUILD](/home/carnager/Code/noterious/PKGBUILD:1) is included at the repository root.

- it builds the embedded-server binary with Go
- it installs the user unit to `/usr/lib/systemd/user/noterious.service`
- it expects the release tarball to already include the generated frontend assets
