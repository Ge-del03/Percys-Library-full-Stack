import { useEffect, useRef } from "react";
import { api } from "../../lib/api";
import clsx from "clsx";
import { usePanZoom } from "../../hooks/usePanZoom";

interface Props {
  comicId: string;
  pageCount: number;
  current: number;
  fitMode: "fit-width" | "fit-height" | "original";
  axis: "vertical" | "horizontal-paged-stack";
  autoCrop: boolean;
  zoom: number;
  onPageChange: (n: number) => void;
  /** Optional external ref to expose the scrolling container (for auto-scroll). */
  scrollRef?: React.MutableRefObject<HTMLDivElement | null>;
}

/**
 * Continuous vertical scroll. Uses IntersectionObserver to detect the
 * page closest to the viewport center and report it back.
 */
export function ContinuousView({ comicId, pageCount, current, fitMode, autoCrop, zoom, onPageChange, scrollRef }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const wrappersRef = useRef<HTMLDivElement[]>([]);
  const lastScrollSet = useRef<number>(-1);
  const { wrapperRef, panX, panY, dragging, consumeClick } = usePanZoom(zoom, `${comicId}-${current}`);

  // Scroll to the requested page on mount and whenever an external source
  // (thumbnail strip, slider, keyboard) changes `current`. The
  // IntersectionObserver below stamps `lastScrollSet` whenever it reports
  // a new page, so natural scrolls don't trigger a redundant scrollIntoView.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (lastScrollSet.current === current) return;
    const target = wrappersRef.current[current];
    if (target) {
      target.scrollIntoView({ block: "start", behavior: "auto" });
      lastScrollSet.current = current;
    }
  }, [comicId, current]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
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
          // Mark this as an observer-driven change so the scroll effect
          // skips its no-op scrollIntoView when `current` updates.
          lastScrollSet.current = best;
          onPageChange(best);
        }
      },
      { root: container, threshold: [0.4, 0.6, 0.8] },
    );
    wrappersRef.current.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [comicId, pageCount, current, onPageChange]);

  function fitClass(): string {
    if (fitMode === "fit-width") return "max-w-full w-full";
    if (fitMode === "fit-height") return "max-h-screen w-auto mx-auto";
    return "w-auto mx-auto";
  }

  return (
    <div
      ref={(el) => {
        containerRef.current = el;
        if (scrollRef) scrollRef.current = el;
      }}
      className="h-full w-full overflow-y-auto overflow-x-hidden bg-black"
    >
      <div
        ref={wrapperRef}
        onClick={(e) => {
          if (consumeClick()) e.preventDefault();
        }}
        className={clsx("mx-auto flex max-w-[1400px] flex-col items-center gap-1 py-1 will-change-transform", zoom > 1 && (dragging ? "cursor-grabbing" : "cursor-grab"))}
        style={{ transform: `translate3d(${panX}px, ${panY}px, 0) scale(${zoom})`, transformOrigin: "top center" }}
      >
        {Array.from({ length: pageCount }).map((_, i) => (
          <div
            key={i}
            data-page={i}
            ref={(el) => {
              if (el) wrappersRef.current[i] = el;
            }}
            className="w-full grid place-items-center"
          >
            <img
              src={api.pageUrl(comicId, i, autoCrop)}
              alt={`Página ${i + 1}`}
              loading="lazy"
              decoding="async"
              className={`reader-page-img ${fitClass()}`}
              draggable={false}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
