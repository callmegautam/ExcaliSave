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

const listScroll =
  "overflow-y-auto max-h-[260px] flex flex-col gap-1.5 pr-0.5 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded [&::-webkit-scrollbar-thumb]:bg-[#45475a]";

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
        <div
          key={s.id}
          className="flex items-center gap-1.5 rounded-lg border border-white/5 bg-[#313244] p-2"
        >
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium text-[#f5c2e7]">{s.label}</div>
            <div className="mt-0.5 text-[11px] text-[#6c7086]">
              {formatWhen(s.createdAt)}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <button
              type="button"
              className="cursor-pointer rounded-md border-0 bg-[#a6e3a1] px-2 py-1 text-[11px] font-semibold text-[#11111b] hover:bg-[#b8f2b3]"
              onClick={() => handleRestore(s)}
            >
              Restore
            </button>
            <button
              type="button"
              className="cursor-pointer rounded-md border border-[rgba(243,139,168,0.35)] bg-transparent px-2 py-1 text-[11px] font-semibold text-[#f38ba8] hover:bg-[rgba(243,139,168,0.12)]"
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
    <div
      ref={hostRef}
      className="flex flex-col items-end gap-2.5 font-sans text-[13px] leading-snug"
    >
      <button
        type="button"
        className="size-12 shrink-0 cursor-pointer rounded-full border-0 bg-transparent p-0 shadow-[0_4px_16px_rgba(0,0,0,0.35),0_0_0_1px_rgba(255,255,255,0.12)] transition-all duration-150 ease-out hover:scale-105 hover:shadow-[0_6px_20px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.18)] active:scale-[0.97]"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        title={open ? "Hide ExcaliSave" : "ExcaliSave"}
      >
        <span
          className="flex size-full items-center justify-center overflow-hidden rounded-full"
          aria-hidden
        >
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
          className="flex w-[280px] max-h-[min(420px,calc(100vh-88px))] flex-col gap-2.5 rounded-[10px] bg-[#1e1e2e] p-3 text-[#cdd6f4] shadow-[0_4px_24px_rgba(0,0,0,0.35),0_0_0_1px_rgba(255,255,255,0.06)]"
          id={panelId}
          role="region"
          aria-label="ExcaliSave"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-semibold tracking-wide text-[#cba6f7]">
              ExcaliSave
            </div>
            <button
              type="button"
              className="size-8 shrink-0 cursor-pointer rounded-lg border-0 bg-transparent p-0 text-[22px] leading-none text-[#a6adc8] transition-colors hover:bg-white/10 hover:text-[#cdd6f4]"
              onClick={() => setOpen(false)}
              aria-label="Close"
            >
              ×
            </button>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="w-full cursor-pointer rounded-lg border-0 bg-[#45475a] px-2.5 py-2 text-[13px] font-semibold text-[#f5e0dc] transition-all hover:bg-[#585b70] active:scale-[0.98]"
              onClick={handleNew}
            >
              New
            </button>
          </div>
          <div className="flex flex-col gap-1.5">
            <label
              className="text-[11px] font-normal uppercase tracking-wider text-[#a6adc8]"
              htmlFor={saveNameFieldId}
            >
              Save name
            </label>
            <input
              ref={saveNameInputRef}
              id={saveNameFieldId}
              className="box-border w-full rounded-lg border border-white/10 bg-[#181825] px-2.5 py-2 text-[13px] text-[#cdd6f4] outline-none transition-colors placeholder:text-[#6c7086] focus:border-[#89b4fa]"
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
              className="w-full cursor-pointer rounded-lg border-0 bg-[#89b4fa] px-2.5 py-2 text-[13px] font-semibold text-[#11111b] transition-all hover:bg-[#b4befe] active:scale-[0.98]"
              onClick={handleSave}
            >
              Save
            </button>
            {saveError && (
              <p className="m-0 text-xs text-[#f38ba8]">{saveError}</p>
            )}
          </div>
          <p className="text-[11px] leading-[1.35] text-[#6c7086]">
            New clears <code className="rounded bg-black/25 px-1 font-mono text-[10px]">excalidraw</code> and reloads. Snapshots live in{" "}
            <code className="rounded bg-black/25 px-1 font-mono text-[10px]">
              excaliSave_snapshots
            </code>
            .
          </p>
          <div className="flex min-h-0 flex-col">
            <div className="mb-1.5 text-[11px] uppercase tracking-wider text-[#a6adc8]">
              Saved
            </div>
            <div className={listScroll}>
              {snapshots.length === 0 ? (
                <div className="px-1 py-2 text-center text-xs text-[#6c7086]">
                  No saves yet.
                </div>
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
