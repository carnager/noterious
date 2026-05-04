# Operations

This document is the practical operations guide for a normal single-user
Noterious deployment.

It focuses on:

- upgrades
- restarts
- recovery after failed upgrades
- what to verify after changes

For backup layout and restore order, also see
[docs/backups.md](/home/carnager/Code/noterious/docs/backups.md:1).

## Runtime Facts

A Noterious deployment is made up of:

1. the running server binary or package
2. the vault root
3. the data dir

The vault root contains notes and uploads. The data dir contains server-managed
state such as history, trash, auth state, themes, and the SQLite index.

## Before Any Upgrade

Before upgrading a real deployment:

1. Back up the full vault root.
2. Back up the full data dir.
3. If available, download and keep the backup manifest and backup script from
   Settings.
4. If you are restoring onto a different machine or path, validate the backup
   manifest against the target deployment first.

## Upgrade Flow

The safe upgrade sequence is:

1. stop the running Noterious service
2. install the new binary/package/container image
3. keep the same vault root and data dir
4. start the service again
5. open Settings and check the runtime status block

After restart, verify at least:

- vault health is healthy
- current scope resolves as expected
- restart required is `No`, or at least the reasons are understood
- watcher and notification status match your deployment expectations

## Frontend Bundle Changes

The web UI is served from embedded generated assets.

If frontend code changed, you must rebuild:

```bash
npm run build:ui
```

If you want to verify the generated files are committed:

```bash
npm run verify:ui
```

The running Go server must then be restarted so it serves the rebuilt embedded
files.

## Package Upgrade Notes

### Source / Manual Binary

- rebuild the binary
- rebuild the embedded UI if frontend code changed
- restart the service/process

### PKGBUILD / Release Tarball

- the release tarball is expected to already contain generated frontend assets
- do not ship a tarball that requires consumers to run the frontend build first

### Nix / NixOS

- the flake package builds from the pinned source revision
- consumers using the moving `latest` tag still need to update their flake input
  or lockfile before they get a newer release
- after a NixOS switch, verify the runtime status block in Settings the same way
  as any other deployment

## Recovery After A Bad Upgrade

If the new version starts but behaves incorrectly:

1. stop the service
2. restore the previous binary/package if needed
3. restore vault root and data dir from backup if state changed incompatibly
4. start the service again
5. verify vault health and key note pages

If the SQLite index is stale or missing after recovery, Noterious can rebuild it
from the restored vault content. The vault root and data dir are the important
parts.

## Recovery After Frontend Mismatch

If the UI looks stale or broken after deploying new code:

1. confirm the new frontend bundle was rebuilt
2. restart the Go server so the embedded assets are served
3. hard-reload the browser tab if the old `app.js` is still cached

## Recovery After Vault Problems

If the configured vault path is missing or unreadable:

- the runtime status and vault health banner should show it
- Noterious may still show previously indexed data
- fix the filesystem path or mount first
- then restart if the runtime settings changed

## Fast Sanity Check

After any meaningful operational change, this is the shortest useful check:

1. open the app
2. open Settings
3. verify vault health, watcher status, notification status, and restart status
4. open a normal note
5. create or edit one small note successfully
