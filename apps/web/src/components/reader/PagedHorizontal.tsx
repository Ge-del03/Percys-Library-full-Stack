import clsx from "clsx";
import { api } from "../../lib/api";
import { usePanZoom } from "../../hooks/usePanZoom";
import { ReaderPageImage } from "./ReaderPageImage";

interface Props {
  comicId: string;
  page: number;
  fitMode: "fit-width" | "fit-height" | "original";
  zoom: number;
  rtl: boolean;
  autoCrop: boolean;
  axis: "horizontal" | "vertical";
  onClickZone: (zone: "prev" | "next" | "ui") => void;
  onLoaded?: () => void;
  scrollRef?: React.MutableRefObject<HTMLDivElement | null>;
  imageQuality?: "high" | "balanced" | "fast";
}

export function PagedView({ comicId, page, fitMode, zoom, rtl, autoCrop, axis, onClickZone, onLoaded, scrollRef, imageQuality }: Props) {
  const { wrapperRef, panX, panY, dragging, consumeClick } = usePanZoom(zoom, page);

  function fitClass(): string {
    if (fitMode === "fit-width") return "max-w-full max-h-none w-auto h-auto";
    if (fitMode === "fit-height") return "max-h-full max-w-none h-full w-auto";
    return "w-auto h-auto"; // original
  }

  return (
    <div
      ref={wrapperRef}
      onPointerEnter={(e) => {
        if (scrollRef) scrollRef.current = e.currentTarget;
      }}
      onClick={(e) => {
        // If the user just finished a drag, swallow the click so it
        // doesn't double as a page-turn.
        if (consumeClick()) {
          e.preventDefault();
          return;
        }
        // Stop the click from bubbling up to any ancestor that might
        // also be listening for clicks (e.g. an immersive-mode toggle
        // on the reader shell). The page-turn is the user's intent;
        // we don't want a single click to fire two contradictory
        // actions ("turn page" + "toggle UI").
        e.stopPropagation();
        const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
        if (axis === "vertical") {
          // Vertical paging: top zone = prev, bottom zone = next.
          // RTL doesn't flip the vertical axis (manga-style still reads top→bottom).
          const y = e.clientY - rect.top;
          const ratio = y / rect.height;
          if (ratio < 0.33) onClickZone("prev");
          else if (ratio > 0.66) onClickZone("next");
          else onClickZone("ui");
          return;
        }
        const x = e.clientX - rect.left;
        const ratio = x / rect.width;
        if (ratio < 0.33) onClickZone(rtl ? "next" : "prev");
        else if (ratio > 0.66) onClickZone(rtl ? "prev" : "next");
        else onClickZone("ui");
      }}
      className={clsx(
        "relative h-full w-full overflow-auto grid place-items-center select-none",
        zoom > 1 && (dragging ? "cursor-grabbing" : "cursor-grab"),
      )}
    >
      <div
        className={clsx(
          "grid place-items-center will-change-transform",
          // Skip the transform transition while dragging so pan tracks
          // the cursor 1:1; keep it for zoom changes for a smoother feel.
          !dragging && "transition-transform duration-200",
        )}
        style={{ transform: `translate3d(${panX}px, ${panY}px, 0) scale(${zoom})` }}
      >
        {/* No `key` here on purpose: ReaderPageImage handles the
            src→src cross-fade itself, and re-keying on every page
            change would force a fresh mount, throw away the previous
            decoded frame, and re-introduce the placeholder flicker
            that this whole refactor is fixing. */}
        <ReaderPageImage
          src={api.pageUrl(comicId, page, autoCrop, imageQuality)}
          alt={`Página ${page + 1}`}
          loading="eager"
          fetchPriority="high"
          onLoad={() => {
            onLoaded?.();
          }}
          imgClassName={clsx("reader-page-img", fitClass())}
        />
      </div>
    </div>
  );
}
