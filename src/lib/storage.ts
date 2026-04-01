export const LS_KEY_EXCALIDRAW = "excalidraw";
export const LS_KEY_SNAPSHOTS = "excaliSave_snapshots";

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
  return snap;
}

export function removeSnapshot(id: string): void {
  const next = listSnapshots().filter((s) => s.id !== id);
  writeSnapshots(next);
}

export function restoreSnapshot(data: string): void {
  window.localStorage.setItem(LS_KEY_EXCALIDRAW, data);
}
