# Changelog

All notable changes to ExcaliSave are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] - 2026-11-13

Safe to rely on: saves keep their images, survive clearing site data, and never fail silently.

### Added

- Pasted images are saved with each snapshot and restored with it
- Theme, zoom, background and grid (`excalidraw-state`) are saved and restored
- Warning before **New** or **Restore** discards unsaved changes
- **Undo** after deleting a save
- **Export all** saves, images included, to a JSON file, and **Import** them back
- Image count shown next to each save
- `pnpm package` script that zips the build for a release
- CI build on every push and pull request, contributing guide, issue and PR templates

### Changed

- Saves are stored in extension storage (`chrome.storage.local` with `unlimitedStorage`) instead of excalidraw.com's `localStorage`, so they no longer compete with Excalidraw for the 5 MB quota or disappear when site data is cleared
- Saves made with v0.0.1 are migrated automatically on first run
- Save list shows when each save was last updated instead of when it was created

### Fixed

- Images showed as broken after restoring a save
- Save did nothing when `localStorage` was full; failures now show an error in the panel

## [0.0.1] - 2026-04-01

First public version.

### Added

- Floating, draggable launcher and panel on excalidraw.com
- **New**, **Save** and **Save as**, with Save updating the linked file
- List of saves with **Restore** and **Delete**

[Unreleased]: https://github.com/callmegautam/ExcaliSave/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/callmegautam/ExcaliSave/compare/v0.0.1...v0.1.0
[0.0.1]: https://github.com/callmegautam/ExcaliSave/releases/tag/v0.0.1
