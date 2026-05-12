import { useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";
import clsx from "clsx";
import { usePanZoom } from "../../hooks/usePanZoom";

interface Props {
  comicId: string;
  pageCount: number;
  current: number;
  autoCrop: boolean;
  zoom: number;
  onPageChange: (n: number) => void;
  /** Optional external ref to expose the scrolling container (for auto-scroll). */
  scrollRef?: React.MutableRefObject<HTMLDivElement | null>;
  /** Pixels of vertical gap between consecutive panels. */
  pageGap?: number;
  /** Maximum width of the strip (0 = unbounded). */
  maxWidth?: number;
  /** Server-side image quality tier. */
  imageQuality?: "high" | "balanced" | "fast";
}

/**
 * Webtoon mode: vertical infinite ribbon optimised for manhwa / long-strip
 * comics. Differs from the generic Continuous mode in three ways:
 *  - Forces fit-to-width with no horizontal padding so panels touch edges
 *  - Lazy-mounts the <img> only when its placeholder is near the viewport
 *    (window of ~3 viewports) — prevents the browser from decoding 200+
 *    images at once on huge chapters.
 *  - Reserves a tall-but-collapsing aspect-ratio box for unloaded pages so
 *    the scrollbar doesn't jump as images decode in.
 */
export function WebtoonView({
  comicId,
  pageCount,
  current,
  autoCrop,
  zoom,
  onPageChange,
  scrollRef,
  pageGap = 0,
  maxWidth = 900,
  imageQuality,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const wrappersRef = useRef<HTMLDivElement[]>([]);
  const lastScrollSet = useRef(-1);
  const [loaded, setLoaded] = useState<Set<number>>(() => new Set());
  const { wrapperRef, panX, panY, dragging, consumeClick } = usePanZoom(zoom, `${comicId}-${current}`);

  // Scroll-to-page when an external source (thumb, slider, key) changes
  // `current`. The IO below stamps `lastScrollSet` on its own updates so we
  // don't fight the user's scroll.
  useEffect(() => {
    if (lastScrollSet.current === current) return;
    if (current < 0 || current >= wrappersRef.current.length) return;
    const target = wrappersRef.current[current];
    if (target) {
      target.scrollIntoView({ block: "start", behavior: "instant" });
      lastScrollSet.current = current;
    }
  }, [comicId, current]);

  // Track which page is in view (centre-ish) and report it back.
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        let bestRatio = 0;
        let best = current;
        for (const e of entries) {
          if (e.isIntersecting && e.intersectionRatio > bestRatio) {
            bestRatio = e.intersectionRatio;
            best = Number((e.target as HTMLDivElement).dataset.page);
          }
        }
        if (bestRatio > 0 && best !== current) {
          lastScrollSet.current = best;
          onPageChange(best);
        }
      },
      { root, threshold: [0.3, 0.6] },
    );
    wrappersRef.current.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [comicId, pageCount, current, onPageChange]);

  // Mount images progressively as they approach the viewport (rootMargin = 2x viewport).
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            const n = Number((e.target as HTMLDivElement).dataset.page);
            setLoaded((prev) => {
              if (prev.has(n)) return prev;
              const next = new Set(prev);
              next.add(n);
              return next;
            });
            observer.unobserve(e.target);
          }
        }
      },
      { root, rootMargin: "200% 0px 200% 0px" },
    );
    wrappersRef.current.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [comicId, pageCount]);

  // Reset loaded set when comic changes — and seed it with a window
  // around the page the user is opening to, not always [0,1,2]. If the
  // user resumes on page 47 we want pages 46/47/48 mounted, not pages
  // 0–2 which they'll never see before the IO observer fires.
  useEffect(() => {
    const seed = new Set<number>();
    for (let i = -1; i <= 1; i++) {
      const n = current + i;
      if (n >= 0 && n < pageCount) seed.add(n);
    }
    if (seed.size === 0) seed.add(0);
    setLoaded(seed);
    lastScrollSet.current = -1;
    // Intentional: only re-seed on comic switch, not on each `current`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comicId]);

  return (
    <div
      ref={(el) => {
        containerRef.current = el;
        if (scrollRef) scrollRef.current = el;
      }}
      className="h-full w-full overflow-y-auto overflow-x-hidden bg-black"
      style={{ scrollBehavior: "auto" }}
    >
      <div
        ref={wrapperRef}
        onClick={(e) => {
          if (consumeClick()) e.preventDefault();
        }}
        className={clsx("mx-auto flex w-full flex-col items-stretch will-change-transform", zoom > 1 && (dragging ? "cursor-grabbing" : "cursor-grab"))}
        style={{
          transform: `translate3d(${panX}px, ${panY}px, 0) scale(${zoom})`,
          transformOrigin: "top center",
          gap: `${pageGap}px`,
          maxWidth: maxWidth > 0 ? `${maxWidth}px` : undefined,
        }}
      >
        {Array.from({ length: pageCount }).map((_, i) => (
          <div
            key={i}
            data-page={i}
            ref={(el) => {
              if (el) wrappersRef.current[i] = el;
            }}
            // Reserve a 2:3 box so the scrollbar is stable before the
            // image decodes; once loaded the natural height takes over.
            className="relative w-full"
            style={{ minHeight: loaded.has(i) ? undefined : "120vh" }}
          >
            {loaded.has(i) ? (
              <img
                src={api.pageUrl(comicId, i, autoCrop, imageQuality)}
                alt={`Página ${i + 1}`}
                loading="lazy"
                decoding="async"
                fetchPriority={Math.abs(i - current) <= 1 ? "high" : "low"}
                draggable={false}
                className="reader-page-img block w-full h-auto select-none"
                onError={(e) => {
                  const img = e.currentTarget as HTMLImageElement;
                  if (!img.dataset.retried) {
                    img.dataset.retried = "1";
                    const base = api.pageUrl(comicId, i, autoCrop, imageQuality);
                    img.src = `${base}${base.includes("?") ? "&" : "?"}retry=${Date.now()}`;
                    return;
                  }
                  // After one retry we still couldn't load this image;
                  // notify the reader so its self-healing pipeline can
                  // re-fetch the comic metadata. Without this dispatch
                  // a stale `pageCount` keeps Webtoon scrolling into a
                  // permanent broken-image at the bottom.
                  if (typeof window !== "undefined") {
                    window.dispatchEvent(
                      new CustomEvent("reader:page-error", { detail: { src: img.src } }),
                    );
                  }
                }}
              />
            ) : (
              <div className="grid h-full place-items-center text-ink-500 text-xs">·</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
