export const LS_KEY_EXCALIDRAW = "excalidraw";
export const LS_KEY_SNAPSHOTS = "excaliSave_snapshots";
/** Which snapshot the current canvas is tied to (restore / last save as / last update). Cleared on New. */
export const LS_KEY_ACTIVE_SNAPSHOT = "excaliSave_activeSnapshotId";

export type Snapshot = {
  id: string;
  label: string;
  createdAt: number;
  /** Raw string from localStorage `excalidraw` */
  data: string;
};

function parseSnapshots(raw: string | null): Snapshot[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isSnapshot);
  } catch {
    return [];
  }
}

function isSnapshot(x: unknown): x is Snapshot {
  if (x === null || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.label === "string" &&
    typeof o.createdAt === "number" &&
    typeof o.data === "string"
  );
}

export function getExcalidrawRaw(): string | null {
  try {
    return window.localStorage.getItem(LS_KEY_EXCALIDRAW);
  } catch {
    return null;
  }
}

export function clearExcalidrawCanvas(): void {
  try {
    window.localStorage.removeItem(LS_KEY_EXCALIDRAW);
    window.localStorage.removeItem(LS_KEY_ACTIVE_SNAPSHOT);
  } catch {
    /* ignore */
  }
}

export function listSnapshots(): Snapshot[] {
  try {
    return parseSnapshots(window.localStorage.getItem(LS_KEY_SNAPSHOTS));
  } catch {
    return [];
  }
}

function writeSnapshots(snapshots: Snapshot[]): void {
  window.localStorage.setItem(LS_KEY_SNAPSHOTS, JSON.stringify(snapshots));
}

export function getActiveSnapshotId(): string | null {
  try {
    return window.localStorage.getItem(LS_KEY_ACTIVE_SNAPSHOT);
  } catch {
    return null;
  }
}

export function setActiveSnapshotId(id: string | null): void {
  try {
    if (id === null) {
      window.localStorage.removeItem(LS_KEY_ACTIVE_SNAPSHOT);
    } else {
      window.localStorage.setItem(LS_KEY_ACTIVE_SNAPSHOT, id);
    }
  } catch {
    /* ignore */
  }
}

/** Resolves the active snapshot or clears a stale id. */
export function getActiveSnapshot(): Snapshot | null {
  const id = getActiveSnapshotId();
  if (!id) return null;
  const s = listSnapshots().find((x) => x.id === id) ?? null;
  if (!s) setActiveSnapshotId(null);
  return s;
}

export function addSnapshot(label: string, data: string): Snapshot {
  const snapshots = listSnapshots();
  const snap: Snapshot = {
    id: crypto.randomUUID(),
    label,
    createdAt: Date.now(),
    data,
  };
  snapshots.unshift(snap);
  writeSnapshots(snapshots);
  setActiveSnapshotId(snap.id);
  return snap;
}

export function updateSnapshot(
  id: string,
  data: string,
  label?: string,
): boolean {
  const snapshots = listSnapshots();
  const i = snapshots.findIndex((s) => s.id === id);
  if (i === -1) return false;
  const prev = snapshots[i];
  const nextLabel =
    label !== undefined && label.trim() !== "" ? label.trim() : prev.label;
  snapshots[i] = { ...prev, data, label: nextLabel };
  writeSnapshots(snapshots);
  return true;
}

export function removeSnapshot(id: string): void {
  const next = listSnapshots().filter((s) => s.id !== id);
  writeSnapshots(next);
  if (getActiveSnapshotId() === id) {
    setActiveSnapshotId(null);
  }
}

export function restoreSnapshot(data: string): void {
  window.localStorage.setItem(LS_KEY_EXCALIDRAW, data);
}
