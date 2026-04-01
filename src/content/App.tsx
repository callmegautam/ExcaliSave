import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  addSnapshot,
  clearExcalidrawCanvas,
  getExcalidrawRaw,
  listSnapshots,
  removeSnapshot,
  restoreSnapshot,
  type Snapshot,
} from "../lib/storage";

function formatWhen(ts: number): string {
  try {
    return new Date(ts).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return String(ts);
  }
}

function defaultSaveLabel(): string {
  return `Save ${new Date().toLocaleString()}`;
}

export function App() {
  const panelId = useId();
  const saveNameFieldId = useId();
  const fabGradId = useId().replace(/:/g, "");
  const hostRef = useRef<HTMLDivElement | null>(null);
  const saveNameInputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [snapshots, setSnapshots] = useState<Snapshot[]>(() =>
    listSnapshots(),
  );
  const [saveName, setSaveName] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setSnapshots(listSnapshots());
  }, []);

  useEffect(() => {
    const el = hostRef.current?.getRootNode();
    const host =
      el instanceof ShadowRoot ? el.host : hostRef.current?.parentElement;
    if (!host || !(host instanceof HTMLElement)) return;

    const onPointerDown = (e: PointerEvent) => {
      const path = e.composedPath();
      if (path.includes(host)) return;
      setOpen(false);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    setSaveError(null);
    queueMicrotask(() => saveNameInputRef.current?.focus());
  }, [open]);

  const handleNew = useCallback(() => {
    clearExcalidrawCanvas();
    window.location.reload();
  }, []);

  const handleSave = useCallback(() => {
    const raw = getExcalidrawRaw();
    if (raw === null || raw === "") {
      setSaveError("Nothing to save: canvas storage is empty.");
      return;
    }
    setSaveError(null);
    const fallback = defaultSaveLabel();
    const label = saveName.trim() || fallback;
    addSnapshot(label, raw);
    setSaveName("");
    refresh();
  }, [refresh, saveName]);

  const handleRestore = useCallback((snap: Snapshot) => {
    restoreSnapshot(snap.data);
    window.location.reload();
  }, []);

  const handleDelete = useCallback(
    (id: string) => {
      removeSnapshot(id);
      refresh();
    },
    [refresh],
  );

  const rows = useMemo(
    () =>
      snapshots.map((s) => (
        <div key={s.id} className="excali-row">
          <div className="excali-row-main">
            <div className="excali-row-title">{s.label}</div>
            <div className="excali-row-meta">{formatWhen(s.createdAt)}</div>
          </div>
          <div className="excali-row-actions">
            <button
              type="button"
              className="excali-btn-sm excali-btn-restore"
              onClick={() => handleRestore(s)}
            >
              Restore
            </button>
            <button
              type="button"
              className="excali-btn-sm excali-btn-delete"
              onClick={() => handleDelete(s.id)}
            >
              Delete
            </button>
          </div>
        </div>
      )),
    [snapshots, handleDelete, handleRestore],
  );

  return (
    <div className="excali-root" ref={hostRef}>
      <button
        type="button"
        className="excali-fab"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        title={open ? "Hide ExcaliSave" : "ExcaliSave"}
      >
        <span className="excali-fab-icon" aria-hidden>
          <svg viewBox="0 0 32 32" width="24" height="24" fill="none">
            <circle cx="16" cy="16" r="15" fill={`url(#${fabGradId})`} />
            <path
              d="M10 12h12v2H10v-2zm0 4h12v2H10v-2zm0 4h8v2h-8v-2z"
              fill="#11111b"
              opacity="0.92"
            />
            <defs>
              <linearGradient id={fabGradId} x1="6" y1="6" x2="26" y2="26">
                <stop stopColor="#cba6f7" />
                <stop offset="1" stopColor="#89b4fa" />
              </linearGradient>
            </defs>
          </svg>
        </span>
      </button>
      {open && (
        <div
          className="excali-panel"
          id={panelId}
          role="region"
          aria-label="ExcaliSave"
        >
          <div className="excali-panel-top">
            <div className="excali-header">ExcaliSave</div>
            <button
              type="button"
              className="excali-close"
              onClick={() => setOpen(false)}
              aria-label="Close"
            >
              ×
            </button>
          </div>
          <div className="excali-actions">
            <button
              type="button"
              className="excali-btn excali-btn-new excali-btn-block"
              onClick={handleNew}
            >
              New
            </button>
          </div>
          <div className="excali-save-block">
            <label className="excali-label" htmlFor={saveNameFieldId}>
              Save name
            </label>
            <input
              ref={saveNameInputRef}
              id={saveNameFieldId}
              className="excali-input"
              type="text"
              placeholder={defaultSaveLabel()}
              value={saveName}
              onChange={(e) => {
                setSaveName(e.target.value);
                setSaveError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
              }}
              autoComplete="off"
            />
            <button
              type="button"
              className="excali-btn excali-btn-save excali-btn-save-full"
              onClick={handleSave}
            >
              Save
            </button>
            {saveError && <p className="excali-error">{saveError}</p>}
          </div>
          <p className="excali-hint">
            New clears <code>excalidraw</code> and reloads. Snapshots live in{" "}
            <code>excaliSave_snapshots</code>.
          </p>
          <div className="excali-list-wrap">
            <div className="excali-list-label">Saved</div>
            <div className="excali-list">
              {snapshots.length === 0 ? (
                <div className="excali-empty">No saves yet.</div>
              ) : (
                rows
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
