import clsx from "clsx";
import { useEffect, useRef, useState } from "react";

interface Props {
  src: string;
  alt: string;
  containerClassName?: string;
  imgClassName?: string;
  loading?: "lazy" | "eager";
  fetchPriority?: "high" | "low" | "auto";
  onLoad?: () => void;
  onError?: () => void;
}

/** Fired when a page image fails to load after a retry. The reader
 * listens to this event and refetches the comic metadata so a stale
 * pageCount in the DB can self-heal without forcing a full reload. */
export const PAGE_ERROR_EVENT = "reader:page-error";

/** Reserves a stable, page-shaped box so the layout doesn't collapse to
 * 0×0 while the very first image is loading. Once we have one frame on
 * screen, the cross-fade keeps that frame as the placeholder for the
 * next transition and we never re-show the skeleton. */
const PLACEHOLDER_CLASSES = "min-h-[60vh] aspect-[2/3] max-h-[88vh] w-auto max-w-full";

/** Delay before showing the spinner for a pending image. Cached pages
 * resolve in <50ms, so a small delay keeps the spinner from flashing on
 * every page turn while still surfacing for genuine network waits. */
const SPINNER_DELAY_MS = 220;

/** Cross-fade page renderer.
 *
 * Keeps the last successfully-loaded image visible while the next one
 * loads in a hidden layer. When the new image fires `onLoad` it is
 * promoted to the visible layer. This eliminates the "black gap +
 * placeholder skeleton + layout shift" cycle between page turns:
 * cached neighbouring pages look instant, and uncached pages keep
 * the previous panel on screen until the new one is ready.
 */
export function ReaderPageImage({
  src,
  alt,
  containerClassName,
  imgClassName,
  loading = "lazy",
  fetchPriority = "auto",
  onLoad,
  onError,
}: Props) {
  // Visible layer: last image we managed to fully load. Stays put
  // while a new pendingSrc is loading underneath.
  const [committedSrc, setCommittedSrc] = useState(src);
  // Hidden preloader layer: the most recent src we've been asked to
  // show. When committedSrc !== pendingSrc we render the preloader
  // and wait for it to fire onLoad before swapping.
  const [pendingSrc, setPendingSrc] = useState(src);
  const [retry, setRetry] = useState(0);
  const [hasErrored, setHasErrored] = useState(false);
  // True until the FIRST successful load. While false we still draw
  // the skeleton placeholder so an opening reader doesn't flash a 0×0
  // frame. After the first commit we never show the skeleton again —
  // the previous image becomes the placeholder for transitions.
  const [hasEverLoaded, setHasEverLoaded] = useState(false);
  // Drives the spinner overlay. Only flips on after SPINNER_DELAY_MS
  // so cached transitions never flash the spinner.
  const [showSpinner, setShowSpinner] = useState(false);

  // Stable identifier for the in-flight preloader request. A stale
  // onLoad callback (e.g. user paged forward, then backward, then
  // forward again before the first response landed) can't promote the
  // wrong src to committed because it'll fail the token check.
  const pendingTokenRef = useRef(0);

  useEffect(() => {
    // src prop changed → start tracking the new pending src. Don't
    // touch committedSrc — the previous frame keeps showing.
    setPendingSrc(src);
    setRetry(0);
    setHasErrored(false);
    pendingTokenRef.current += 1;
  }, [src]);

  useEffect(() => {
    if (committedSrc === pendingSrc || hasErrored) {
      setShowSpinner(false);
      return;
    }
    const t = window.setTimeout(() => setShowSpinner(true), SPINNER_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [pendingSrc, committedSrc, hasErrored]);

  const pendingRetrySrc =
    retry > 0
      ? `${pendingSrc}${pendingSrc.includes("?") ? "&" : "?"}retry=${retry}`
      : pendingSrc;

  const showPlaceholder = !hasEverLoaded && !hasErrored;
  const transitioning = pendingSrc !== committedSrc && !hasErrored;
  const currentToken = pendingTokenRef.current;

  function handlePendingLoad(token: number) {
    if (token !== pendingTokenRef.current) return;
    setCommittedSrc(pendingSrc);
    setHasEverLoaded(true);
    setShowSpinner(false);
    setHasErrored(false);
    onLoad?.();
  }

  function handlePendingError(token: number) {
    if (token !== pendingTokenRef.current) return;
    if (retry < 1) {
      setRetry((n) => n + 1);
      return;
    }
    setHasErrored(true);
    setShowSpinner(false);
    onError?.();
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent(PAGE_ERROR_EVENT, { detail: { src: pendingSrc } }),
      );
    }
  }

  return (
    <div
      className={clsx(
        "relative grid place-items-center",
        showPlaceholder && PLACEHOLDER_CLASSES,
        containerClassName,
      )}
    >
      {showPlaceholder && (
        <div
          aria-hidden
          className="absolute inset-0 overflow-hidden rounded-md bg-white/[0.02] border border-white/5"
        >
          <div
            className="absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-white/[0.06] to-transparent"
            style={{ animation: "loading-indeterminate 1.4s ease-in-out infinite" }}
          />
        </div>
      )}

      {/* Visible layer: last successfully-loaded src. Stays put while
          a new pendingSrc is loading underneath. */}
      {!hasErrored && (
        <img
          src={committedSrc}
          alt={alt}
          loading={loading}
          fetchPriority={fetchPriority}
          decoding="async"
          draggable={false}
          className={clsx(
            "h-full w-full object-contain transition-opacity duration-150",
            imgClassName,
            // Held at opacity 0 until the first commit so the skeleton
            // is what the user sees on the very first paint. After
            // that, this layer stays opaque and new images cross-fade
            // by being promoted to committedSrc.
            hasEverLoaded ? "opacity-100" : "opacity-0",
          )}
          onLoad={() => {
            // First-load path only. After hasEverLoaded flips true,
            // committedSrc updates come from handlePendingLoad and
            // React re-uses the same <img> element (browser serves
            // from cache so the new frame paints immediately).
            if (!hasEverLoaded) {
              setHasEverLoaded(true);
              setShowSpinner(false);
              onLoad?.();
            }
          }}
          onError={() => {
            // Visible-layer errors only matter on first load; once
            // committed, errors come from the pending preloader.
            if (hasEverLoaded) return;
            if (retry < 1) {
              setRetry((n) => n + 1);
              return;
            }
            setHasErrored(true);
            onError?.();
            if (typeof window !== "undefined") {
              window.dispatchEvent(
                new CustomEvent(PAGE_ERROR_EVENT, { detail: { src: committedSrc } }),
              );
            }
          }}
        />
      )}

      {/* Hidden preloader: actually fetches the new src. When this
          fires onLoad, we promote it to committedSrc. The browser
          caches the response so the visible <img> can paint
          immediately on the next render. */}
      {transitioning && (
        <img
          // Key on src + token so React mounts a fresh element every
          // time the pending target changes — onLoad fires reliably
          // even if the URL is identical to a previous one.
          key={`pending-${currentToken}-${pendingRetrySrc}`}
          src={pendingRetrySrc}
          alt=""
          aria-hidden
          decoding="async"
          fetchPriority={fetchPriority}
          loading="eager"
          draggable={false}
          className="absolute inset-0 pointer-events-none opacity-0 h-full w-full object-contain"
          onLoad={() => handlePendingLoad(currentToken)}
          onError={() => handlePendingError(currentToken)}
        />
      )}

      {showSpinner && !hasErrored && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="flex items-center gap-2 rounded-full bg-ink-900/80 px-4 py-2 text-xs font-medium text-ink-200 shadow-lg backdrop-blur">
            <span
              aria-hidden
              className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-accent border-t-transparent"
            />
            Cargando página…
          </div>
        </div>
      )}

      {hasErrored && (
        <div className="absolute inset-0 grid place-items-center p-4 text-center">
          <div className="flex flex-col items-center gap-3 max-w-xs">
            <div className="grid h-12 w-12 place-items-center rounded-2xl border border-red-400/30 bg-red-500/10 text-red-200 text-xl font-black">
              !
            </div>
            <div className="rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-2 text-xs font-semibold text-red-100">
              Página no disponible
            </div>
            <button
              type="button"
              onClick={() => {
                setHasErrored(false);
                setRetry((n) => n + 1);
              }}
              className="rounded-md border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-200 hover:bg-white/10"
            >
              Reintentar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
