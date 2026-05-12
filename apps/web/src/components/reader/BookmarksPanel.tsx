import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { api, type BookmarkDto } from "../../lib/api";
import { useToasts } from "../../stores/toasts";

interface Props {
  comicId: string;
  open: boolean;
  currentPage: number;
  pageCount: number;
  onClose: () => void;
  onJump: (page: number) => void;
  /** Notified whenever the bookmark list changes (initial load, add,
   *  delete) so callers can mirror the state into a quick-toggle UI. */
  onChange?: (items: BookmarkDto[]) => void;
}

/**
 * Side-panel listing bookmarks for the current comic. The panel itself is
 * the only screen real estate dedicated to bookmarks — the reader top bar
 * just gets a tiny toggle button. Adding the current page is one click;
 * notes are optional and edited in-place.
 */
export function BookmarksPanel({ comicId, open, currentPage, pageCount, onClose, onJump, onChange }: Props) {
  const [items, setItems] = useState<BookmarkDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState("");
  const push = useToasts((s) => s.push);
  // Hold the latest `onChange` in a ref so the fetch effect below doesn't
  // depend on its referential identity. Reader.tsx passes an inline
  // arrow function, which would otherwise re-fire the effect every render
  // — the effect calls onChange, which calls setBookmarkedPages in the
  // parent, which re-renders Reader, which gives us a new `onChange`
  // identity, which re-fires the effect... a perfect infinite fetch
  // loop. Using a ref decouples "what to call" from "when to call".
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Notify the parent on every committed `items` change, but skip the
  // very first render so we don't clobber Reader.tsx's own hydration of
  // `bookmarkedPages` (Reader fetches the bookmark list when the comic
  // loads, well before the panel is ever opened — firing onChange([])
  // here would wipe that state and the quick-toggle star would lose its
  // "already bookmarked" highlight until the panel was opened).
  const isInitialMount = useRef(true);
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    onChangeRef.current?.(items);
  }, [items]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    api
      .bookmarks(comicId)
      .then((r) => {
        if (cancelled) return;
        // `setItems` triggers the items-change effect above, which is
        // the single source of truth for onChange notifications. We
        // deliberately do *not* call onChange here too — that would
        // double-fire and (in StrictMode) cause flicker.
        setItems(r.items);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [open, comicId]);

  // Both `add` and `remove` use a functional state updater so the merge
  // always runs against the freshest `items` snapshot — a synchronous
  // `[...items, x]` would read whatever the closure captured when the
  // function was created, which is stale the moment two writes overlap
  // (rapid double-click on "Guardar", or deleting two bookmarks fast
  // before the first re-render lands). Notification to the parent
  // happens via the items-change effect, not here, so a single async
  // operation produces exactly one onChange even in StrictMode dev where
  // the updater itself may run twice.
  async function add() {
    const trimmed = note.trim();
    const r = await api.addBookmark(comicId, currentPage, trimmed || undefined);
    setItems((arr) => [...arr, r.bookmark].sort((a, b) => a.page - b.page));
    setNote("");
    push("Marcador añadido", "success");
  }

  async function remove(bid: string) {
    await api.deleteBookmark(bid);
    setItems((arr) => arr.filter((b) => b.id !== bid));
  }

  return (
    <aside
      className={clsx(
        // Slides in from the right. While closed we also drop pointer
        // events and reduce z-index so the offscreen aside cannot
        // intercept clicks on the comic page or the bottom toolbar
        // during page turns — the previous behaviour kept it sitting
        // on top of the reading surface even when invisible.
        "absolute right-0 top-0 h-full w-80 max-w-[90vw] transform border-l border-ink-800/60 bg-ink-900/92 backdrop-blur-sm transition-transform duration-200",
        open
          ? "translate-x-0 z-30 pointer-events-auto"
          : "translate-x-full z-0 pointer-events-none",
      )}
      aria-hidden={!open}
    >
      <header className="flex items-center justify-between px-4 py-3 border-b border-ink-800/60">
        <h2 className="text-sm font-medium text-ink-100">Marcadores</h2>
        <button
          onClick={onClose}
          aria-label="Cerrar marcadores"
          className="rounded-md px-2 py-1 text-xs text-ink-300 hover:bg-ink-800"
        >
          ✕
        </button>
      </header>

      <div className="space-y-2 px-4 py-3 border-b border-ink-800/60">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={`Nota (opcional) — pág. ${currentPage + 1}`}
          maxLength={280}
          className="w-full rounded-md bg-ink-800 border border-ink-700/60 px-2 py-1.5 text-xs text-ink-100 placeholder:text-ink-400 focus:outline-none focus:border-accent"
        />
        <button onClick={add} className="pl-btn-primary w-full !py-1.5 text-xs">
          Guardar página actual
        </button>
      </div>

      <ul className="overflow-y-auto px-2 py-2 max-h-[calc(100%-7.5rem)]">
        {loading && <li className="px-2 py-3 text-xs text-ink-400">Cargando…</li>}
        {!loading && items.length === 0 && (
          <li className="px-2 py-6 text-center text-xs text-ink-400">
            Sin marcadores aún.
          </li>
        )}
        {items.map((b) => (
          <li
            key={b.id}
            className="group flex items-start gap-2 rounded-md px-2 py-2 hover:bg-ink-800/60"
          >
            <button
              onClick={() => onJump(b.page)}
              className="flex-1 text-left"
              aria-label={`Ir a página ${b.page + 1}`}
            >
              <div className="text-xs text-ink-100">
                Página {b.page + 1} <span className="text-ink-400">/ {pageCount}</span>
              </div>
              {b.note && <div className="mt-0.5 text-xs text-ink-300 line-clamp-2">{b.note}</div>}
            </button>
            <button
              onClick={() => void remove(b.id)}
              aria-label="Eliminar marcador"
              className="opacity-0 transition-opacity group-hover:opacity-100 text-xs text-ink-400 hover:text-red-400"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
