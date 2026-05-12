import { useEffect, useState } from "react";

/** Pixels from the top of the viewport that count as "near the top
 *  bar". Mouse movement inside this band re-shows the toolbar.
 *  Anywhere below it just resets the idle timer without forcing the
 *  bars back on, so a click in the centre of the page (i.e. the
 *  page-turn zone) doesn't fight the auto-hide. */
const TOP_EDGE_PX = 96;
/** Same as above, anchored to the bottom for the thumbnail strip. */
const BOTTOM_EDGE_PX = 220;

/**
 * Drives the auto-hiding reader chrome. The bars become visible when:
 *   - the cursor enters the top or bottom edge zone (where the toolbars
 *     actually are — moving in the middle of the page doesn't snap
 *     them back on, which is what made every page-turn click feel like
 *     a layout earthquake)
 *   - any key is pressed
 *   - the user touches the screen (touch is intent-driven; no edge
 *     filtering necessary)
 *   - the cursor leaves the document entirely (mouseleave) — common
 *     pattern for accessing the browser's own chrome above the page
 *
 * They re-hide after `idleMs` of inactivity. Calling code can also
 * pass an explicit external trigger (page change) — Reader uses this
 * to keep the bars visible during navigation without re-hiding mid
 * page-turn animation.
 */
export function useIdleUI(idleMs = 2500): boolean {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    let timer: number | undefined;
    function arm() {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setVisible(false), idleMs);
    }
    function show() {
      setVisible(true);
      arm();
    }
    function onMouseMove(e: MouseEvent) {
      // Only count edge regions as "show me the bars" intent. In the
      // middle of the screen we still arm the idle timer (so a wiggle
      // doesn't keep the bars up forever) but we don't force visible.
      const nearTop = e.clientY <= TOP_EDGE_PX;
      const nearBottom =
        e.clientY >= window.innerHeight - BOTTOM_EDGE_PX;
      if (nearTop || nearBottom) {
        show();
      } else {
        arm();
      }
    }
    function onMouseLeave() {
      // Cursor exited the window — assume the user is reaching for
      // their browser chrome and surface the bars.
      show();
    }
    show();
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("touchstart", show);
    window.addEventListener("keydown", show);
    document.addEventListener("mouseleave", onMouseLeave);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("touchstart", show);
      window.removeEventListener("keydown", show);
      document.removeEventListener("mouseleave", onMouseLeave);
      window.clearTimeout(timer);
    };
  }, [idleMs]);
  return visible;
}
