import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { api } from "../../lib/api";

interface Props {
  comicId: string;
  pageCount: number;
  current: number;
  rtl: boolean;
  onSelect: (n: number) => void;
}

/**
 * Approximate width of a single thumbnail tile (h-24 * 2/3 aspect ratio
 * ≈ 64px) plus its 6px gap. Used as the cell-width assumption for the
 * windowed virtualization below — keeping it slightly conservative
 * means the offset math overestimates the offset by a few pixels at
 * worst, never underestimates (which would clip the active thumb).
 */
const TILE_WIDTH = 70;
/** Pages rendered outside the visible window in each direction so a
 *  fast scroll/drag doesn't reveal a blank tile before the IO observer
 *  has a chance to materialize the next chunk. */
const OVERSCAN = 12;

/**
 * Windowed thumbnail strip.
 *
 * Pre-virtualization this rendered every page as a `<button>` regardless
 * of viewport — fine for 50 pages, terrible for 1000+ (DOM construction
 * alone took >1s on mobile and the browser dropped frames every time
 * the parent re-rendered). The new implementation reserves the full
 * scroll width via two flex spacers and only mounts the buttons that
 * are within `OVERSCAN` of the visible window. The IntersectionObserver
 * for thumbnail loading is replaced by an inline `src` set on mount —
 * since we now only mount what's nearby, the lazy strategy is the
 * mount itself.
 */
export function ThumbnailStrip({ comicId, pageCount, current, rtl, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);

  // Measure the container so the visible window math has a real width.
  // ResizeObserver fires on mount + every resize so a rotated phone
  // keeps the window in sync without a manual refresh.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setContainerWidth(el.clientWidth);
    const ro = new ResizeObserver(() => {
      setContainerWidth(el.clientWidth);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Track scroll position via rAF so we don't re-render on every wheel
  // tick — one frame's worth of coalescing is plenty for a strip.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let rafId: number | null = null;
    function onScroll() {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        if (el) setScrollLeft(el.scrollLeft);
      });
    }
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, []);

  // Keep the active thumb visible. RTL is awkward: the CSSOM spec says
  // `scrollLeft` starts at 0 and goes *negative* as the user scrolls
  // (Chromium / Firefox follow this; Safari/legacy WebKit historically
  // returned positive values, but Safari 16+ matches the spec). We
  // compute a positive offset from the rightmost edge first and then
  // negate it for RTL — that single conversion lets the rest of the
  // file pretend everything is LTR. Without this, the strip always
  // snapped back to scrollLeft=0 (the rightmost tile) in RTL.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || pageCount === 0) return;
    const visualIndex = rtl ? pageCount - 1 - current : current;
    const center = visualIndex * TILE_WIDTH + TILE_WIDTH / 2;
    const viewport = el.clientWidth;
    const ltrTarget = Math.max(0, center - viewport / 2);
    el.scrollTo({ left: rtl ? -ltrTarget : ltrTarget, behavior: "smooth" });
  }, [current, pageCount, rtl]);

  const totalWidth = pageCount * TILE_WIDTH;

  // Window of indices to render. Always pad the active page so a jump
  // (slider, hotkey, bookmark) lands on a real button — otherwise the
  // first frame after the jump would show empty cells.
  //
  // RTL caveat: in CSSOM-compliant browsers `scrollLeft` is 0 at the
  // initial (rightmost) position and decreases as the user scrolls
  // toward the start of the strip. We take the absolute value so the
  // window math behaves the same regardless of direction; the visual
  // index → page index mapping is already handled by the `rtl` branch
  // in the index loop below.
  const visibleRange = useMemo(() => {
    if (pageCount === 0) return { start: 0, end: 0 };
    const visibleCount = Math.max(1, Math.ceil(containerWidth / TILE_WIDTH));
    const firstVisible = Math.floor(Math.abs(scrollLeft) / TILE_WIDTH);
    const start = Math.max(0, firstVisible - OVERSCAN);
    const end = Math.min(pageCount, firstVisible + visibleCount + OVERSCAN);
    return { start, end };
  }, [scrollLeft, containerWidth, pageCount]);

  const padLeft = visibleRange.start * TILE_WIDTH;
  const padRight = Math.max(0, totalWidth - visibleRange.end * TILE_WIDTH);

  const indices: number[] = [];
  for (let i = visibleRange.start; i < visibleRange.end; i++) {
    indices.push(rtl ? pageCount - 1 - i : i);
  }
  // Make sure the active page is always in the rendered set, even after
  // an externally-driven jump (slider drag → before scroll lands).
  if (!indices.includes(current) && current >= 0 && current < pageCount) {
    indices.push(current);
  }

  if (pageCount === 0) return null;

  return (
    <div
      ref={containerRef}
      className="reader-overlay flex h-24 overflow-x-auto overflow-y-hidden bg-ink-900/80 backdrop-blur-md"
      style={{ direction: rtl ? "rtl" : "ltr" }}
    >
      <div
        className="flex h-full items-center"
        style={{
          // Reserve the total scroll width so the scrollbar reflects
          // the full strip even when only a window is mounted. Padding
          // (instead of explicit offset divs) keeps the flex layout
          // honest and means RTL flips for free.
          paddingLeft: rtl ? padRight : padLeft,
          paddingRight: rtl ? padLeft : padRight,
          gap: "6px",
        }}
      >
        {indices.map((i) => (
          <button
            key={i}
            data-page={i}
            onClick={() => onSelect(i)}
            className={clsx(
              "relative h-full aspect-[2/3] flex-shrink-0 overflow-hidden rounded-md ring-1 transition",
              current === i ? "ring-accent ring-2" : "ring-ink-700/60 opacity-70 hover:opacity-100",
            )}
            title={`Página ${i + 1}`}
            aria-label={`Ir a la página ${i + 1}`}
          >
            <img
              alt={`Página ${i + 1}`}
              src={api.thumbUrl(comicId, i)}
              className="h-full w-full object-cover"
              loading="lazy"
              decoding="async"
              draggable={false}
            />
            <span className="absolute bottom-0.5 right-1 rounded bg-black/60 px-1 text-[10px] font-bold tabular-nums text-white">
              {i + 1}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
