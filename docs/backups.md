# Backups

Noterious is not just a vault folder.

To back up a deployment properly, back up both:

- the configured vault root
- the configured data dir

## What Lives Where

### Vault Root

The vault root contains your durable note content:

- markdown pages
- frontmatter
- inline task metadata
- uploaded files/documents stored alongside notes

### Data Dir

The data dir contains server-managed state that is **not** in the vault:

- page history
- trash
- uploaded custom themes
- auth/account state
- session-related server state
- the SQLite index database

The SQLite index is rebuildable from the vault, but the rest of the data-dir
contents are not.

So the practical rule is:

- if you only back up the vault, you keep the notes
- if you back up vault + data dir, you keep the whole Noterious deployment state

## Minimum Backup Recommendation

For a normal single-user deployment, the minimum sane backup set is:

1. the full vault root
2. the full data dir

That is enough to restore:

- notes
- uploads
- history
- trash
- custom themes
- auth state

## Restore Strategy

The safest restore order is:

1. stop the Noterious server
2. restore the vault root
3. restore the data dir
4. start the server again

If the SQLite index is stale or missing after restore, Noterious can rebuild it
from the vault content. The vault and data-dir files are the important part.

## Operational Notes

- After frontend changes, the embedded UI only updates after rebuilding the
  bundled assets and restarting the server process.
- If you package Noterious, make sure your backup plan still includes the live
  vault root and data dir, not just the binary/package files.
