import {
  fingerprint,
  readLegacySnapshotsRaw,
  referencedFileIds,
  removeLegacySnapshots,
  type BinaryFile,
  type CanvasData,
} from "./excalidraw";
import { renderThumbnail } from "./thumbnail";

const KEY_INDEX = "index";
const KEY_PREFS = "prefs";
const dataKey = (id: string) => `snap:${id}`;
const thumbKey = (id: string) => `thumb:${id}`;

export const EXPORT_FORMAT = "excalisave-backup";
export const EXPORT_VERSION = 1;

export type SnapshotMeta = {
  id: string;
  label: string;
  createdAt: number;
  updatedAt: number;
  fingerprint: string;
  imageCount: number;
};

export type ExportedSnapshot = SnapshotMeta & CanvasData;

export type ExportFile = {
  format: typeof EXPORT_FORMAT;
  version: number;
  exportedAt: number;
  snapshots: ExportedSnapshot[];
};

export class StorageError extends Error {}

function friendly(err: unknown, action: string): StorageError {
  const msg = err instanceof Error ? err.message : String(err);
  if (/context invalidated/i.test(msg)) {
    return new StorageError(
      "ExcaliSave was updated or reloaded. Refresh this page and try again.",
    );
  }
  if (/quota/i.test(msg)) {
    return new StorageError(`Could not ${action}: browser storage is full.`);
  }
  return new StorageError(`Could not ${action}: ${msg}`);
}

async function get<T>(key: string): Promise<T | undefined> {
  const res = await chrome.storage.local.get(key);
  return res[key] as T | undefined;
}

function isMeta(x: unknown): x is SnapshotMeta {
  if (x === null || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.label === "string" &&
    typeof o.createdAt === "number" &&
    typeof o.updatedAt === "number" &&
    typeof o.fingerprint === "string" &&
    typeof o.imageCount === "number"
  );
}

function isCanvasData(x: unknown): x is CanvasData {
  if (x === null || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.elements === "string" &&
    (o.appState === null || typeof o.appState === "string") &&
    o.files !== null &&
    typeof o.files === "object"
  );
}

async function readIndex(): Promise<SnapshotMeta[]> {
  const raw = await get<unknown>(KEY_INDEX);
  return Array.isArray(raw) ? raw.filter(isMeta) : [];
}

function metaFor(
  base: Pick<SnapshotMeta, "id" | "label" | "createdAt" | "updatedAt">,
  data: CanvasData,
): SnapshotMeta {
  return {
    ...base,
    fingerprint: fingerprint(data.elements),
    imageCount: Object.keys(data.files).length,
  };
}

async function thumbnailEntry(id: string, data: CanvasData): Promise<Record<string, string>> {
  try {
    const thumb = await renderThumbnail(data);
    return thumb ? { [thumbKey(id)]: thumb } : {};
  } catch {
    return {};
  }
}

export async function listSnapshots(): Promise<SnapshotMeta[]> {
  try {
    return await readIndex();
  } catch (err) {
    throw friendly(err, "load saves");
  }
}

export async function getSnapshotData(id: string): Promise<CanvasData | null> {
  try {
    const data = await get<unknown>(dataKey(id));
    return isCanvasData(data) ? data : null;
  } catch (err) {
    throw friendly(err, "read the save");
  }
}

export async function createSnapshot(
  label: string,
  data: CanvasData,
): Promise<SnapshotMeta> {
  const now = Date.now();
  const meta = metaFor(
    { id: crypto.randomUUID(), label, createdAt: now, updatedAt: now },
    data,
  );
  try {
    const thumb = await thumbnailEntry(meta.id, data);
    const index = await readIndex();
    await chrome.storage.local.set({ [dataKey(meta.id)]: data, ...thumb });
    await chrome.storage.local.set({ [KEY_INDEX]: [meta, ...index] });
    return meta;
  } catch (err) {
    throw friendly(err, "save");
  }
}

export async function updateSnapshot(
  id: string,
  data: CanvasData,
  label?: string,
): Promise<SnapshotMeta | null> {
  try {
    const index = await readIndex();
    const i = index.findIndex((s) => s.id === id);
    if (i === -1) return null;
    const prev = index[i];
    const nextLabel = label?.trim() ? label.trim() : prev.label;
    const meta = metaFor(
      { id, label: nextLabel, createdAt: prev.createdAt, updatedAt: Date.now() },
      data,
    );
    const next = [...index];
    next[i] = meta;
    const thumb = await thumbnailEntry(id, data);
    await chrome.storage.local.set({ [dataKey(id)]: data, ...thumb, [KEY_INDEX]: next });
    return meta;
  } catch (err) {
    throw friendly(err, "save");
  }
}

/**
 * Excalidraw normalizes a scene when it loads it (fills defaults, migrates old
 * fields). Recording the normalized fingerprint keeps a just-restored canvas
 * from showing up as changed.
 */
export async function rebaselineFingerprint(id: string, fp: string): Promise<void> {
  const index = await readIndex();
  const i = index.findIndex((s) => s.id === id);
  if (i === -1 || index[i].fingerprint === fp) return;
  const next = [...index];
  next[i] = { ...index[i], fingerprint: fp };
  await chrome.storage.local.set({ [KEY_INDEX]: next });
}

export type DeletedSnapshot = {
  meta: SnapshotMeta;
  data: CanvasData | null;
  position: number;
};

export async function deleteSnapshot(id: string): Promise<DeletedSnapshot | null> {
  try {
    const index = await readIndex();
    const position = index.findIndex((s) => s.id === id);
    if (position === -1) return null;
    const meta = index[position];
    const data = await getSnapshotData(id);
    await chrome.storage.local.set({
      [KEY_INDEX]: index.filter((s) => s.id !== id),
    });
    await chrome.storage.local.remove([dataKey(id), thumbKey(id)]);
    return { meta, data, position };
  } catch (err) {
    throw friendly(err, "delete");
  }
}

export async function restoreDeleted(deleted: DeletedSnapshot): Promise<void> {
  if (!deleted.data) return;
  try {
    const index = await readIndex();
    if (index.some((s) => s.id === deleted.meta.id)) return;
    const next = [...index];
    next.splice(Math.min(deleted.position, next.length), 0, deleted.meta);
    await chrome.storage.local.set({ [dataKey(deleted.meta.id)]: deleted.data });
    await chrome.storage.local.set({ [KEY_INDEX]: next });
  } catch (err) {
    throw friendly(err, "undo the delete");
  }
}

export async function exportAll(): Promise<ExportFile> {
  try {
    const index = await readIndex();
    const snapshots: ExportedSnapshot[] = [];
    for (const meta of index) {
      const data = await getSnapshotData(meta.id);
      if (data) snapshots.push({ ...meta, ...data });
    }
    return {
      format: EXPORT_FORMAT,
      version: EXPORT_VERSION,
      exportedAt: Date.now(),
      snapshots,
    };
  } catch (err) {
    throw friendly(err, "export");
  }
}

function toCanvasData(s: Record<string, unknown>): CanvasData | null {
  const candidate = {
    elements: s.elements,
    appState: s.appState ?? null,
    files: s.files ?? {},
  };
  return isCanvasData(candidate)
    ? {
        elements: candidate.elements,
        appState: candidate.appState,
        files: candidate.files as Record<string, BinaryFile>,
      }
    : null;
}

export type ImportResult = { added: number; skipped: number };

/** Adds snapshots from a backup file. Saves that already exist (same id) are kept as they are. */
export async function importAll(text: string): Promise<ImportResult> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new StorageError("That file is not valid JSON.");
  }
  const file = parsed as Partial<ExportFile> | null;
  if (
    !file ||
    file.format !== EXPORT_FORMAT ||
    typeof file.version !== "number" ||
    !Array.isArray(file.snapshots)
  ) {
    throw new StorageError("That file is not an ExcaliSave backup.");
  }
  if (file.version > EXPORT_VERSION) {
    throw new StorageError(
      "That backup was made by a newer ExcaliSave. Update the extension first.",
    );
  }

  try {
    const index = await readIndex();
    const known = new Set(index.map((s) => s.id));
    const added: SnapshotMeta[] = [];
    const writes: Record<string, CanvasData> = {};
    let skipped = 0;

    for (const raw of file.snapshots as unknown[]) {
      if (raw === null || typeof raw !== "object") {
        skipped++;
        continue;
      }
      const s = raw as Record<string, unknown>;
      const data = toCanvasData(s);
      if (!data || typeof s.id !== "string" || known.has(s.id)) {
        skipped++;
        continue;
      }
      const createdAt = typeof s.createdAt === "number" ? s.createdAt : Date.now();
      const meta = metaFor(
        {
          id: s.id,
          label: typeof s.label === "string" && s.label.trim() ? s.label : "Imported",
          createdAt,
          updatedAt: typeof s.updatedAt === "number" ? s.updatedAt : createdAt,
        },
        data,
      );
      known.add(meta.id);
      added.push(meta);
      writes[dataKey(meta.id)] = data;
    }

    if (added.length > 0) {
      await chrome.storage.local.set(writes);
      await chrome.storage.local.set({ [KEY_INDEX]: [...added, ...index] });
    }
    return { added: added.length, skipped };
  } catch (err) {
    throw friendly(err, "import");
  }
}

type LegacySnapshot = { id: string; label: string; createdAt: number; data: string };

function isLegacy(x: unknown): x is LegacySnapshot {
  if (x === null || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.label === "string" &&
    typeof o.createdAt === "number" &&
    typeof o.data === "string"
  );
}

/**
 * v0.0.1 kept snapshots in excalidraw.com's localStorage, which shares a ~5 MB
 * quota with Excalidraw and is wiped with site data. Move them into extension
 * storage once, then free the old key.
 */
export async function migrateLegacySnapshots(): Promise<number> {
  try {
    const raw = readLegacySnapshotsRaw();
    if (raw === null) return 0;
    let legacy: LegacySnapshot[] = [];
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) legacy = parsed.filter(isLegacy);
    } catch {
      legacy = [];
    }

    const index = await readIndex();
    const known = new Set(index.map((s) => s.id));
    const migrated: SnapshotMeta[] = [];
    const writes: Record<string, CanvasData> = {};
    for (const s of legacy) {
      if (known.has(s.id)) continue;
      const data: CanvasData = { elements: s.data, appState: null, files: {} };
      migrated.push(
        metaFor(
          { id: s.id, label: s.label, createdAt: s.createdAt, updatedAt: s.createdAt },
          data,
        ),
      );
      writes[dataKey(s.id)] = data;
    }

    if (migrated.length > 0) {
      await chrome.storage.local.set(writes);
      await chrome.storage.local.set({ [KEY_INDEX]: [...index, ...migrated] });
    }
    removeLegacySnapshots();
    return migrated.length;
  } catch (err) {
    throw friendly(err, "move old saves to extension storage");
  }
}

/** Thumbnails for the given saves, rendering and storing any that are missing. */
export async function loadThumbnails(
  ids: string[],
  onRendered?: (id: string, thumb: string) => void,
): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  const stored = await chrome.storage.local.get(ids.map(thumbKey));
  const thumbs: Record<string, string> = {};
  const missing: string[] = [];
  for (const id of ids) {
    const t = stored[thumbKey(id)];
    if (typeof t === "string") thumbs[id] = t;
    else missing.push(id);
  }
  void (async () => {
    for (const id of missing) {
      try {
        const data = await getSnapshotData(id);
        if (!data) continue;
        const entry = await thumbnailEntry(id, data);
        if (!entry[thumbKey(id)]) continue;
        await chrome.storage.local.set(entry);
        onRendered?.(id, entry[thumbKey(id)]);
      } catch {
        /* a missing thumbnail is cosmetic */
      }
    }
  })();
  return thumbs;
}

export type SortOrder = "updated" | "created" | "name";
export const AUTOSAVE_CHOICES = [0, 2, 5, 10] as const;
export type AutosaveMinutes = (typeof AUTOSAVE_CHOICES)[number];

export type Prefs = { sort: SortOrder; autosaveMinutes: AutosaveMinutes };

export const DEFAULT_PREFS: Prefs = { sort: "updated", autosaveMinutes: 0 };

export async function getPrefs(): Promise<Prefs> {
  try {
    const raw = await get<Partial<Prefs>>(KEY_PREFS);
    const sort: SortOrder =
      raw?.sort === "created" || raw?.sort === "name" ? raw.sort : DEFAULT_PREFS.sort;
    const autosaveMinutes = AUTOSAVE_CHOICES.find((m) => m === raw?.autosaveMinutes) ?? 0;
    return { sort, autosaveMinutes };
  } catch {
    return DEFAULT_PREFS;
  }
}

export async function setPrefs(prefs: Prefs): Promise<void> {
  try {
    await chrome.storage.local.set({ [KEY_PREFS]: prefs });
  } catch (err) {
    throw friendly(err, "save settings");
  }
}

export function sortSnapshots(list: SnapshotMeta[], order: SortOrder): SnapshotMeta[] {
  const sorted = [...list];
  if (order === "name") {
    sorted.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base", numeric: true }));
  } else if (order === "created") {
    sorted.sort((a, b) => b.createdAt - a.createdAt);
  } else {
    sorted.sort((a, b) => b.updatedAt - a.updatedAt);
  }
  return sorted;
}

export function onSnapshotsChanged(cb: () => void): () => void {
  const listener = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: string,
  ) => {
    if (area === "local" && KEY_INDEX in changes) cb();
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

export function countMissingImages(data: CanvasData): number {
  return referencedFileIds(data.elements).filter((id) => !(id in data.files)).length;
}
