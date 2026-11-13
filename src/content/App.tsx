import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { GITHUB_REPO_URL } from "../constants";
import {
  clearCanvas,
  currentFingerprint,
  getActiveSnapshotId,
  readCanvas,
  setActiveSnapshotId,
  writeCanvas,
} from "../lib/excalidraw";
import {
  countMissingImages,
  createSnapshot,
  deleteSnapshot,
  exportAll,
  getSnapshotData,
  importAll,
  listSnapshots,
  migrateLegacySnapshots,
  onSnapshotsChanged,
  restoreDeleted,
  updateSnapshot,
  type DeletedSnapshot,
  type SnapshotMeta,
} from "../lib/storage";

const UNDO_MS = 8000;

type Confirm = { message: string; confirmLabel: string; run: () => void };
type Undo = { deleted: DeletedSnapshot; wasActive: boolean };

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function downloadJson(filename: string, value: unknown): void {
  const blob = new Blob([JSON.stringify(value)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

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
  "overflow-y-auto max-h-[min(420px,55vh)] flex flex-col gap-1.5 pr-0.5 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded [&::-webkit-scrollbar-thumb]:bg-[#45475a]";

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="currentColor"
      aria-hidden
    >
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
    </svg>
  );
}

export function App() {
  const panelId = useId();
  const saveNameFieldId = useId();
  const fabGradId = useId().replace(/:/g, "");
  const hostRef = useRef<HTMLDivElement | null>(null);
  const saveNameInputRef = useRef<HTMLInputElement | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const undoTimerRef = useRef<number | undefined>(undefined);
  const [pos, setPos] = useState({ right: 12, top: 12 });
  const [open, setOpen] = useState(false);
  const [snapshots, setSnapshots] = useState<SnapshotMeta[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(() =>
    getActiveSnapshotId(),
  );
  const [saveName, setSaveName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [undo, setUndo] = useState<Undo | null>(null);

  const activeSnapshot = useMemo(
    () => snapshots.find((s) => s.id === activeId) ?? null,
    [snapshots, activeId],
  );

  const linkActive = useCallback((id: string | null) => {
    setActiveSnapshotId(id);
    setActiveId(id);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const list = await listSnapshots();
      setSnapshots(list);
      setLoaded(true);
      const id = getActiveSnapshotId();
      if (id && !list.some((s) => s.id === id)) linkActive(null);
    } catch (err) {
      setError(errorText(err));
    }
  }, [linkActive]);

  useEffect(() => {
    let cancelled = false;
    migrateLegacySnapshots()
      .then((moved) => {
        if (!cancelled && moved > 0) {
          setNotice(`Moved ${plural(moved, "save")} to extension storage.`);
        }
      })
      .catch((err) => !cancelled && setError(errorText(err)))
      .finally(() => !cancelled && void refresh());
    const unsubscribe = onSnapshotsChanged(() => void refresh());
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [refresh]);

  useEffect(() => () => window.clearTimeout(undoTimerRef.current), []);

  const run = useCallback(async (task: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await task();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }, []);

  const hasUnsavedChanges = useCallback((): boolean => {
    const now = currentFingerprint();
    return activeSnapshot ? now !== activeSnapshot.fingerprint : now !== "";
  }, [activeSnapshot]);

  const guardUnsaved = useCallback(
    (confirmLabel: string, action: () => void) => {
      if (!hasUnsavedChanges()) {
        action();
        return;
      }
      setConfirm({
        message: activeSnapshot
          ? `"${activeSnapshot.label}" has unsaved changes. They will be lost.`
          : "This canvas is not saved. It will be lost.",
        confirmLabel,
        run: action,
      });
    },
    [activeSnapshot, hasUnsavedChanges],
  );

  useLayoutEffect(() => {
    const root = hostRef.current?.getRootNode();
    if (root instanceof ShadowRoot) {
      const h = root.host as HTMLElement;
      h.style.position = "fixed";
      h.style.right = `${pos.right}px`;
      h.style.top = `${pos.top}px`;
      h.style.left = "auto";
      h.style.bottom = "auto";
      h.style.zIndex = "2147483646";
    }
  }, [pos]);

  const startDrag = useCallback(
    (e: ReactPointerEvent, opts?: { onClickIfStill?: () => void }) => {
      if (e.button !== 0) return;
      const startX = e.clientX;
      const startY = e.clientY;
      const startRight = pos.right;
      const startTop = pos.top;
      let moved = false;

      const onMove = (ev: PointerEvent) => {
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) > 5) {
          moved = true;
        }
        const w = window.innerWidth;
        const h = window.innerHeight;
        setPos({
          right: clamp(startRight - (ev.clientX - startX), 0, w - 8),
          top: clamp(startTop + (ev.clientY - startY), 0, h - 8),
        });
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        if (!moved && opts?.onClickIfStill) opts.onClickIfStill();
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [pos.right, pos.top],
  );

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
    if (!open) {
      setConfirm(null);
      return;
    }
    setError(null);
    queueMicrotask(() => saveNameInputRef.current?.focus());
  }, [open]);

  const handleNew = useCallback(() => {
    guardUnsaved("Discard and start new", () => {
      clearCanvas();
      window.location.reload();
    });
  }, [guardUnsaved]);

  const savedNotice = (label: string, missing: number) =>
    missing > 0
      ? `Saved "${label}", but ${plural(missing, "image")} were not ready yet. Save again in a moment.`
      : `Saved "${label}".`;

  const handleSaveUpdate = useCallback(() => {
    void run(async () => {
      if (!activeSnapshot) {
        setError("No file is linked. Use Save as to create one.");
        return;
      }
      const data = await readCanvas();
      if (!data) {
        setError("Nothing to save: the canvas is empty.");
        return;
      }
      const meta = await updateSnapshot(activeSnapshot.id, data, saveName);
      if (!meta) {
        setError("Could not save: that file no longer exists.");
        linkActive(null);
        await refresh();
        return;
      }
      setSaveName("");
      await refresh();
      setNotice(savedNotice(meta.label, countMissingImages(data)));
    });
  }, [activeSnapshot, linkActive, refresh, run, saveName]);

  const handleSaveAs = useCallback(() => {
    void run(async () => {
      const data = await readCanvas();
      if (!data) {
        setError("Nothing to save: the canvas is empty.");
        return;
      }
      const meta = await createSnapshot(saveName.trim() || defaultSaveLabel(), data);
      setSaveName("");
      await refresh();
      linkActive(meta.id);
      setNotice(savedNotice(meta.label, countMissingImages(data)));
    });
  }, [linkActive, refresh, run, saveName]);

  const handleRestore = useCallback(
    (snap: SnapshotMeta) => {
      guardUnsaved("Discard and restore", () => {
        void run(async () => {
          const data = await getSnapshotData(snap.id);
          if (!data) {
            setError(`Could not restore "${snap.label}": its data is missing.`);
            return;
          }
          await writeCanvas(data);
          linkActive(snap.id);
          window.location.reload();
        });
      });
    },
    [guardUnsaved, linkActive, run],
  );

  const handleDelete = useCallback(
    (snap: SnapshotMeta) => {
      void run(async () => {
        const deleted = await deleteSnapshot(snap.id);
        if (!deleted) return;
        const wasActive = snap.id === activeId;
        if (wasActive) linkActive(null);
        await refresh();
        window.clearTimeout(undoTimerRef.current);
        setUndo({ deleted, wasActive });
        undoTimerRef.current = window.setTimeout(() => setUndo(null), UNDO_MS);
      });
    },
    [activeId, linkActive, refresh, run],
  );

  const handleUndo = useCallback(() => {
    if (!undo) return;
    window.clearTimeout(undoTimerRef.current);
    setUndo(null);
    void run(async () => {
      await restoreDeleted(undo.deleted);
      await refresh();
      if (undo.wasActive) linkActive(undo.deleted.meta.id);
    });
  }, [linkActive, refresh, run, undo]);

  const handleExport = useCallback(() => {
    void run(async () => {
      const backup = await exportAll();
      if (backup.snapshots.length === 0) {
        setError("Nothing to export yet.");
        return;
      }
      const day = new Date().toISOString().slice(0, 10);
      downloadJson(`excalisave-backup-${day}.json`, backup);
      setNotice(`Exported ${plural(backup.snapshots.length, "save")}.`);
    });
  }, [run]);

  const handleImportFile = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      void run(async () => {
        const { added, skipped } = await importAll(await file.text());
        await refresh();
        setNotice(
          `Imported ${plural(added, "save")}` +
            (skipped > 0 ? `, skipped ${skipped} already present or invalid.` : "."),
        );
      });
    },
    [refresh, run],
  );

  const onSaveNameKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLInputElement>) => {
      if (e.key !== "Enter" || busy) return;
      if (activeSnapshot) handleSaveUpdate();
      else handleSaveAs();
    },
    [activeSnapshot, busy, handleSaveAs, handleSaveUpdate],
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
              {formatWhen(s.updatedAt)}
              {s.imageCount > 0 && ` · ${plural(s.imageCount, "image")}`}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <button
              type="button"
              disabled={busy}
              className="cursor-pointer rounded-md border-0 bg-[#a6e3a1] px-2 py-1 text-[11px] font-semibold text-[#11111b] hover:bg-[#b8f2b3] disabled:cursor-not-allowed disabled:opacity-40"
              onClick={() => handleRestore(s)}
            >
              Restore
            </button>
            <button
              type="button"
              disabled={busy}
              className="cursor-pointer rounded-md border border-[rgba(243,139,168,0.35)] bg-transparent px-2 py-1 text-[11px] font-semibold text-[#f38ba8] hover:bg-[rgba(243,139,168,0.12)] disabled:cursor-not-allowed disabled:opacity-40"
              onClick={() => handleDelete(s)}
            >
              Delete
            </button>
          </div>
        </div>
      )),
    [busy, snapshots, handleDelete, handleRestore],
  );

  return (
    <div
      ref={hostRef}
      className="flex flex-col items-end gap-2.5 font-sans text-[13px] leading-snug"
    >
      <button
        type="button"
        className="size-12 shrink-0 cursor-grab touch-none select-none rounded-full border-0 bg-transparent p-0 shadow-[0_4px_16px_rgba(0,0,0,0.35),0_0_0_1px_rgba(255,255,255,0.12)] transition-all duration-150 ease-out hover:scale-105 hover:shadow-[0_6px_20px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.18)] active:cursor-grabbing active:scale-[0.97]"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        title="Drag to move · Click to open or close"
        onPointerDown={(e) =>
          startDrag(e, { onClickIfStill: () => setOpen((v) => !v) })
        }
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
          className="flex w-[280px] max-h-[min(520px,calc(100vh-24px))] flex-col gap-2.5 rounded-[10px] bg-[#1e1e2e] p-3 text-[#cdd6f4] shadow-[0_4px_24px_rgba(0,0,0,0.35),0_0_0_1px_rgba(255,255,255,0.06)]"
          id={panelId}
          role="region"
          aria-label="ExcaliSave"
        >
          <div
            className="flex cursor-grab touch-none select-none items-center justify-between gap-2 rounded-lg px-0 py-0.5 active:cursor-grabbing"
            onPointerDown={(e) => {
              if ((e.target as HTMLElement).closest("a, button")) return;
              startDrag(e);
            }}
          >
            <div className="min-w-0 flex-1 text-sm font-semibold tracking-wide text-[#cba6f7]">
              ExcaliSave
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <a
                href={GITHUB_REPO_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex size-8 items-center justify-center rounded-lg text-[#a6adc8] transition-colors hover:bg-white/10 hover:text-[#cdd6f4]"
                title="View on GitHub"
                aria-label="View ExcaliSave on GitHub"
                onPointerDown={(e) => e.stopPropagation()}
              >
                <GitHubIcon />
              </a>
              <button
                type="button"
                className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border-0 bg-transparent p-0 text-[22px] leading-none text-[#a6adc8] transition-colors hover:bg-white/10 hover:text-[#cdd6f4]"
                onClick={() => setOpen(false)}
                aria-label="Close"
                onPointerDown={(e) => e.stopPropagation()}
              >
                ×
              </button>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              className="w-full cursor-pointer rounded-lg border-0 bg-[#45475a] px-2.5 py-2 text-[13px] font-semibold text-[#f5e0dc] transition-all hover:bg-[#585b70] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
              onClick={handleNew}
            >
              New
            </button>
          </div>
          {confirm && (
            <div
              role="alertdialog"
              aria-label="Unsaved changes"
              className="flex flex-col gap-2 rounded-lg border border-[rgba(249,226,175,0.35)] bg-[rgba(249,226,175,0.08)] p-2 text-xs text-[#f9e2af]"
            >
              <p className="m-0">{confirm.message}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="flex-1 cursor-pointer rounded-md border-0 bg-[#f38ba8] px-2 py-1.5 text-[12px] font-semibold text-[#11111b] hover:bg-[#f5a3ba]"
                  onClick={() => {
                    const action = confirm.run;
                    setConfirm(null);
                    action();
                  }}
                >
                  {confirm.confirmLabel}
                </button>
                <button
                  type="button"
                  className="flex-1 cursor-pointer rounded-md border border-white/15 bg-[#313244] px-2 py-1.5 text-[12px] font-semibold text-[#cdd6f4] hover:bg-[#45475a]"
                  onClick={() => setConfirm(null)}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          <div className="rounded-lg bg-[#181825] px-2 py-1.5 text-[11px] leading-snug text-[#a6adc8]">
            {activeSnapshot ? (
              <>
                Linked:{" "}
                <span className="font-medium text-[#f5c2e7]">
                  {activeSnapshot.label}
                </span>
                . Save updates this entry; Save as creates a new one.
              </>
            ) : (
              <>
                No file linked.{" "}
                <span className="text-[#cdd6f4]">Save as</span> creates a file
                and links it; then{" "}
                <span className="text-[#cdd6f4]">Save</span> updates it.
              </>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <label
              className="text-[11px] font-normal uppercase tracking-wider text-[#a6adc8]"
              htmlFor={saveNameFieldId}
            >
              {activeSnapshot ? "Name (optional)" : "Save name"}
            </label>
            <input
              ref={saveNameInputRef}
              id={saveNameFieldId}
              className="box-border w-full rounded-lg border border-white/10 bg-[#181825] px-2.5 py-2 text-[13px] text-[#cdd6f4] outline-none transition-colors placeholder:text-[#6c7086] focus:border-[#89b4fa]"
              type="text"
              placeholder={
                activeSnapshot
                  ? `Keep “${activeSnapshot.label}” or type a new name`
                  : defaultSaveLabel()
              }
              value={saveName}
              onChange={(e) => {
                setSaveName(e.target.value);
                setError(null);
              }}
              onKeyDown={onSaveNameKeyDown}
              autoComplete="off"
            />
            <div className="flex gap-2">
              <button
                type="button"
                disabled={!activeSnapshot || busy}
                title={
                  !activeSnapshot
                    ? "Link a file with Restore or Save as first"
                    : `Update “${activeSnapshot.label}”`
                }
                className="flex-1 cursor-pointer rounded-lg border-0 bg-[#89b4fa] px-2.5 py-2 text-[13px] font-semibold text-[#11111b] transition-all hover:bg-[#b4befe] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-[#89b4fa]"
                onClick={handleSaveUpdate}
              >
                Save
              </button>
              <button
                type="button"
                disabled={busy}
                className="flex-1 cursor-pointer rounded-lg border border-white/15 bg-[#313244] px-2.5 py-2 text-[13px] font-semibold text-[#cdd6f4] transition-all hover:bg-[#45475a] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
                onClick={handleSaveAs}
              >
                Save as
              </button>
            </div>
            {error && (
              <p role="alert" className="m-0 text-xs text-[#f38ba8]">
                {error}
              </p>
            )}
            {notice && !error && (
              <p role="status" className="m-0 text-xs text-[#a6e3a1]">
                {notice}
              </p>
            )}
          </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="mb-1.5 text-[11px] uppercase tracking-wider text-[#a6adc8]">
              Saved
            </div>
            <div className={listScroll}>
              {snapshots.length === 0 ? (
                <div className="px-1 py-2 text-center text-xs text-[#6c7086]">
                  {loaded ? "No saves yet." : "Loading..."}
                </div>
              ) : (
                rows
              )}
            </div>
          </div>
          {undo && (
            <div
              role="status"
              className="flex items-center justify-between gap-2 rounded-lg bg-[#313244] px-2 py-1.5 text-xs text-[#cdd6f4]"
            >
              <span className="min-w-0 truncate">
                Deleted "{undo.deleted.meta.label}"
              </span>
              <button
                type="button"
                className="shrink-0 cursor-pointer rounded-md border-0 bg-transparent px-2 py-1 text-[12px] font-semibold text-[#89b4fa] hover:bg-white/10"
                onClick={handleUndo}
              >
                Undo
              </button>
            </div>
          )}
          <div className="flex gap-2 border-t border-white/5 pt-2">
            <button
              type="button"
              disabled={busy}
              className="flex-1 cursor-pointer rounded-md border border-white/10 bg-transparent px-2 py-1.5 text-[12px] font-medium text-[#a6adc8] hover:bg-white/5 hover:text-[#cdd6f4] disabled:cursor-not-allowed disabled:opacity-40"
              title="Download every save, with images, as one JSON file"
              onClick={handleExport}
            >
              Export all
            </button>
            <button
              type="button"
              disabled={busy}
              className="flex-1 cursor-pointer rounded-md border border-white/10 bg-transparent px-2 py-1.5 text-[12px] font-medium text-[#a6adc8] hover:bg-white/5 hover:text-[#cdd6f4] disabled:cursor-not-allowed disabled:opacity-40"
              title="Add saves from an ExcaliSave backup file"
              onClick={() => importInputRef.current?.click()}
            >
              Import
            </button>
            <input
              ref={importInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={handleImportFile}
            />
          </div>
        </div>
      )}
    </div>
  );
}
