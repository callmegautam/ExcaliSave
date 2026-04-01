# ExcaliSave

**ExcaliSave** is a [Manifest V3](https://developer.chrome.com/docs/extensions/mv3/) Chrome extension for [**excalidraw.com**](https://excalidraw.com/). It adds a small floating control on the page so you can **save named snapshots** of your canvas to the browser’s `localStorage`, **restore** them later, and **overwrite** the current linked save when you keep editing the same file.

There is no server and no account—everything stays in your browser on that origin.

---

## Features

- **Floating launcher** — A draggable gradient button opens the panel; drag it anywhere on the screen so it stays out of your way.
- **Panel** — Also draggable from the header (title row). GitHub link and close button do not start a drag.
- **New** — Clears Excalidraw’s `excalidraw` canvas key and reloads the tab (and clears the “linked” snapshot pointer).
- **Save** — Updates the **currently linked** snapshot with the latest canvas data. Optional rename via the name field.
- **Save as** — Creates a **new** snapshot and links it for future **Save** operations.
- **Linked file** — After **Restore** or **Save as**, the extension remembers which snapshot you are editing so **Save** overwrites that entry instead of duplicating it.
- **Saved list** — Restore or delete snapshots; scrollable list for many saves.
- **Keyboard** — **Enter** in the name field runs **Save** if a file is linked, otherwise **Save as**. **Escape** closes the panel (click outside closes too).

---

## Tech stack

| Area | Choice |
|------|--------|
| UI | [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) |
| Styling | [Tailwind CSS v4](https://tailwindcss.com/) (injected into a [Shadow DOM](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_shadow_DOM) so Excalidraw’s CSS does not clash) |
| Build | [Vite 6](https://vitejs.dev/) + [@crxjs/vite-plugin](https://crxjs.dev/vite-plugin/) |

---

## Requirements

- [Node.js](https://nodejs.org/) (LTS recommended) and npm, **or** [pnpm](https://pnpm.io/)
- [Google Chrome](https://www.google.com/chrome/) (or another Chromium browser that supports MV3 extensions)
- For icon regeneration: [ImageMagick](https://imagemagick.org/) (`magick` on PATH)

---

## Install (load unpacked)

1. Clone the repository and install dependencies:

   ```bash
   git clone https://github.com/callmegautam/ExcaliSave.git
   cd ExcaliSave
   npm install
   ```

2. Build the extension:

   ```bash
   npm run build
   ```

3. In Chrome, open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and select the **`dist`** folder inside this project.

4. Open [excalidraw.com](https://excalidraw.com/) — the ExcaliSave launcher should appear (top-right by default until you drag it).

---

## Development

```bash
npm install
npm run dev
```

Use the [@crxjs](https://crxjs.dev/vite-plugin/) workflow: after code changes, reload the extension on `chrome://extensions` (and refresh the Excalidraw tab) so the content script updates.

```bash
npm run build    # production build → dist/
npm run preview  # optional Vite preview
```

### Regenerate toolbar icons from `public/logo.jpeg`

Chrome expects **PNG** icons. After changing the source JPEG:

```bash
npm run generate-icons
npm run build
```

Requires ImageMagick (`magick`). Outputs `public/icon16.png` … `icon128.png`; the manifest references those files.

---

## How it uses storage

All keys live on **`https://excalidraw.com`** (same as the page).

| Key | Purpose |
|-----|---------|
| `excalidraw` | Excalidraw’s serialized canvas; read/written by the app and this extension |
| `excaliSave_snapshots` | JSON array of snapshots: `{ id, label, createdAt, data }` |
| `excaliSave_activeSnapshotId` | ID of the snapshot linked to the current session (for **Save** vs **Save as**) |

Data does **not** sync across devices or browsers. Very large scenes may hit `localStorage` quota (~5 MB per origin).

### Limitations

- If **New** does not fully clear the board, Excalidraw may also persist data in **IndexedDB**. In that case inspect **Application** → **Storage** in DevTools on excalidraw.com.
- This extension only runs on **`https://excalidraw.com/*`** (see `manifest.json`).

---

## Project layout (overview)

| Path | Role |
|------|------|
| `manifest.json` | MV3 manifest (content script, icons, `homepage_url`) |
| `src/content/main.tsx` | Mounts React into Shadow DOM |
| `src/content/App.tsx` | UI: launcher, panel, drag logic, saves list |
| `src/lib/storage.ts` | `localStorage` helpers |
| `src/constants.ts` | Author metadata and GitHub repo URL |
| `public/logo.jpeg` | Source artwork for generated PNG icons |

---

## Author

**Gautam Suthar**

- Email: [iamgautamsuthar@outlook.com](mailto:iamgautamsuthar@outlook.com)
- GitHub: [@callmegautam](https://github.com/callmegautam)

Repository: [github.com/callmegautam/ExcaliSave](https://github.com/callmegautam/ExcaliSave)

---

## License

No license file is bundled in this repository by default. Add one (for example MIT or Apache-2.0) if you plan to publish or distribute the extension.
