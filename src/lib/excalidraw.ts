const LS_KEY_ELEMENTS = "excalidraw";
const LS_KEY_APP_STATE = "excalidraw-state";
const LS_KEY_ACTIVE_SNAPSHOT = "excaliSave_activeSnapshotId";

// Excalidraw stores pasted images through idb-keyval under this database/store.
const FILES_DB = "files-db";
const FILES_STORE = "files-store";

export type BinaryFile = {
  id: string;
  mimeType: string;
  dataURL: string;
  created: number;
  lastRetrieved?: number;
  [key: string]: unknown;
};

export type CanvasData = {
  elements: string;
  appState: string | null;
  files: Record<string, BinaryFile>;
};

type ElementLike = {
  [key: string]: unknown;
  id?: unknown;
  version?: unknown;
  type?: unknown;
  fileId?: unknown;
  isDeleted?: unknown;
};

function parseElements(raw: string | null): ElementLike[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((e): e is ElementLike => e !== null && typeof e === "object")
      : [];
  } catch {
    return [];
  }
}

function liveElements(raw: string | null): ElementLike[] {
  return parseElements(raw).filter((e) => e.isDeleted !== true);
}

// Fields Excalidraw rewrites on load or on every edit without the drawing itself changing.
const VOLATILE_KEYS = new Set(["version", "versionNonce", "updated", "index"]);

// Excalidraw fills in defaults on load (null -> [], missing -> null), so treat all of them as absent.
function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || (Array.isArray(value) && value.length === 0);
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj)
      .filter((k) => !VOLATILE_KEYS.has(k) && !isEmpty(obj[k]))
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

// cyrb53, a small non-cryptographic string hash.
function hash(str: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/**
 * Identity of what is drawn, used to detect unsaved changes. Ignores fields
 * Excalidraw rewrites on load so a freshly restored canvas counts as saved.
 */
export function fingerprint(elementsRaw: string | null): string {
  const live = liveElements(elementsRaw);
  if (live.length === 0) return "";
  const parts = live.map(canonical).sort();
  return hash(parts.join("\n"));
}

export function referencedFileIds(elementsRaw: string | null): string[] {
  const ids = new Set<string>();
  for (const e of liveElements(elementsRaw)) {
    if (e.type === "image" && typeof e.fileId === "string") ids.add(e.fileId);
  }
  return [...ids];
}

function readLocal(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function readElementsRaw(): string | null {
  return readLocal(LS_KEY_ELEMENTS);
}

export function currentFingerprint(): string {
  return fingerprint(readElementsRaw());
}

export function getActiveSnapshotId(): string | null {
  return readLocal(LS_KEY_ACTIVE_SNAPSHOT);
}

export function setActiveSnapshotId(id: string | null): void {
  try {
    if (id === null) window.localStorage.removeItem(LS_KEY_ACTIVE_SNAPSHOT);
    else window.localStorage.setItem(LS_KEY_ACTIVE_SNAPSHOT, id);
  } catch {
    /* storage unavailable, the link is a convenience only */
  }
}

function openFilesDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(FILES_DB);
    // If Excalidraw has not created the database yet, create it the same way
    // idb-keyval would so Excalidraw can still use it afterwards.
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(FILES_STORE)) {
        req.result.createObjectStore(FILES_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function readFiles(ids: string[]): Promise<Record<string, BinaryFile>> {
  if (ids.length === 0) return {};
  const db = await openFilesDb();
  try {
    if (!db.objectStoreNames.contains(FILES_STORE)) return {};
    const store = db.transaction(FILES_STORE, "readonly").objectStore(FILES_STORE);
    const entries = await Promise.all(
      ids.map(
        (id) =>
          new Promise<[string, BinaryFile | undefined]>((resolve, reject) => {
            const req = store.get(id);
            req.onsuccess = () => resolve([id, req.result as BinaryFile | undefined]);
            req.onerror = () => reject(req.error);
          }),
      ),
    );
    const files: Record<string, BinaryFile> = {};
    for (const [id, file] of entries) if (file) files[id] = file;
    return files;
  } finally {
    db.close();
  }
}

async function writeFiles(files: Record<string, BinaryFile>): Promise<void> {
  const list = Object.entries(files);
  if (list.length === 0) return;
  const db = await openFilesDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(FILES_STORE, "readwrite");
      const store = tx.objectStore(FILES_STORE);
      const now = Date.now();
      for (const [id, file] of list) store.put({ ...file, lastRetrieved: now }, id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/**
 * Excalidraw writes the scene to localStorage on a ~300 ms debounce and flushes
 * it immediately when the window loses focus. A synthetic blur triggers that
 * flush so a save right after an edit (Ctrl+S) does not miss the last change.
 */
export function flushExcalidrawSave(): void {
  window.dispatchEvent(new Event("blur"));
}

/** Reads everything needed to rebuild the current canvas, including images. */
export async function readCanvas(): Promise<CanvasData | null> {
  flushExcalidrawSave();
  const elements = readElementsRaw();
  if (elements === null || elements === "") return null;
  const files = await readFiles(referencedFileIds(elements));
  return { elements, appState: readLocal(LS_KEY_APP_STATE), files };
}

/** Writes a saved canvas back into Excalidraw's storage. Caller reloads the page. */
export async function writeCanvas(data: CanvasData): Promise<void> {
  await writeFiles(data.files);
  window.localStorage.setItem(LS_KEY_ELEMENTS, data.elements);
  if (data.appState !== null) {
    window.localStorage.setItem(LS_KEY_APP_STATE, data.appState);
  }
}

const SS_KEY_RESTORED = "excaliSave_restoredId";

/** Marks that the next page load is the result of restoring this save. */
export function markRestored(id: string): void {
  try {
    window.sessionStorage.setItem(SS_KEY_RESTORED, id);
  } catch {
    /* ignore */
  }
}

export function takeRestoredMark(): string | null {
  try {
    const id = window.sessionStorage.getItem(SS_KEY_RESTORED);
    window.sessionStorage.removeItem(SS_KEY_RESTORED);
    return id;
  } catch {
    return null;
  }
}

export function clearCanvas(): void {
  try {
    window.localStorage.removeItem(LS_KEY_ELEMENTS);
  } catch {
    /* ignore */
  }
  setActiveSnapshotId(null);
}

/** Legacy v0.0.1 storage, read once for migration. */
export const LEGACY_LS_KEY_SNAPSHOTS = "excaliSave_snapshots";

export function readLegacySnapshotsRaw(): string | null {
  return readLocal(LEGACY_LS_KEY_SNAPSHOTS);
}

export function removeLegacySnapshots(): void {
  try {
    window.localStorage.removeItem(LEGACY_LS_KEY_SNAPSHOTS);
  } catch {
    /* ignore */
  }
}
