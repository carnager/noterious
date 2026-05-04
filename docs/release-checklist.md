# Release Checklist

This is the maintainer checklist for cutting a Noterious release.

## Prepare

1. Make sure you are on the intended release branch, usually `main`.
2. Make sure the worktree is clean except for the planned release changes.
3. Review [CHANGELOG.md](/home/carnager/Code/noterious/CHANGELOG.md:1).
4. Review [README.md](/home/carnager/Code/noterious/README.md:1) if any user-visible
   behavior or setup guidance changed.

## Build And Verify

1. Rebuild generated frontend assets:

```bash
npm run build:ui
```

2. Verify generated bundles are committed:

```bash
npm run verify:ui
```

3. Run the relevant tests for the release.

Minimum baseline:

```bash
npm run typecheck
go test ./...
```

If the full test suite is too broad for the specific release, at least run the
focused Go/UI tests that cover the changed areas and record that scope in the
release notes.

## Packaging

1. Update [PKGBUILD](/home/carnager/Code/noterious/PKGBUILD:1) to the new release version.
2. If README examples pin a fixed version tag, update those examples too.
3. Keep the Nix guidance consistent:
   - moving release example should use `github:carnager/noterious/latest`
   - fixed example should use the new explicit tag like `v0.x.y`

## Commit The Release

1. Commit the release metadata changes.
2. Use a release commit message such as:

```text
Release v0.x.y
```

## Tagging

1. Create the annotated version tag:

```bash
git tag -a v0.x.y -m "Release v0.x.y"
```

2. Move `latest` to the same release commit:

```bash
git tag -fa latest -m "Release latest -> v0.x.y"
```

## Push

1. Push the branch:

```bash
git push origin main
```

2. Push the version tag:

```bash
git push origin v0.x.y
```

3. Force-push the moving `latest` tag:

```bash
git push origin latest --force
```

## Publish The GitHub Release

1. Create the GitHub release from `v0.x.y`.
2. Make sure the release title matches the version.
3. Summarize the user-visible changes, not just the internal refactors.

## Final Sanity Check

Verify all three point to the same commit:

```bash
git rev-parse HEAD
git rev-parse v0.x.y^{}
git rev-parse latest^{}
```

Also check:

- the GitHub release exists
- the latest tag points at the release commit
- the repo still has a clean worktree
