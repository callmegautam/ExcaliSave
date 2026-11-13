# Contributing

Thanks for wanting to help. ExcaliSave is small, so the process is light.

## Setup

```bash
pnpm install
pnpm dev
```

Load `dist/` in `chrome://extensions` with **Load unpacked** (Developer mode on) and open excalidraw.com.

## Branches

- `main`: the latest release, every commit on it is tagged `vX.Y.Z`
- `develop`: the next release, open pull requests against this branch
- `feature/<name>` and `fix/<name>`: branch off `develop` for your change
- `release/X.Y.Z`: cut from `develop` to bump versions and finalize the changelog, then merged into `main` and back into `develop`

## Pull requests

- Keep each PR to one change and describe how you tested it on excalidraw.com
- `pnpm build` must pass (CI runs it on every PR)
- Add a line under **Unreleased** in `CHANGELOG.md` for anything user facing

## Releases

1. Branch `release/X.Y.Z` from `develop`
2. Bump `version` in `package.json` and `manifest.json`, move **Unreleased** in `CHANGELOG.md` under the new version
3. Merge into `main`, tag `vX.Y.Z`, merge `main` back into `develop`
4. `pnpm package` and attach the zip to the GitHub release
