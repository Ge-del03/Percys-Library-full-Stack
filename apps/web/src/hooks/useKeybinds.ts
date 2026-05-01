import { useEffect } from "react";
import type { ShortcutMap } from "../lib/shortcuts";

interface Bindings {
  next: () => void;
  prev: () => void;
  toggleFs: () => void;
  toggleStrip: () => void;
  exit: () => void;
  toggleBookmarks?: () => void;
  /** Jump to a fraction of the comic in [0,1]. Optional so callers
   *  that don't care about percentage jumps just skip the binding. */
  jumpFraction?: (fraction: number) => void;
  /** Step to the first / last page. */
  jumpHome?: () => void;
  jumpEnd?: () => void;
  /** Open the "go to page" prompt. */
  goto?: () => void;
  /** Reset zoom to 1 (Ctrl+0). */
  resetZoom?: () => void;
  /** Toggle the keyboard-shortcuts help overlay. */
  toggleHelp?: () => void;
  /** If false, ArrowUp/ArrowDown won't turn pages (useful for scroll modes). */
  allowVerticalArrowPaging?: boolean;
  /** Optional custom ArrowDown behavior when vertical paging is disabled. */
  onArrowDown?: () => void;
  /** Optional custom ArrowUp behavior when vertical paging is disabled. */
  onArrowUp?: () => void;
  shortcuts?: ShortcutMap;
}

export function useKeybinds(b: Bindings, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      // Ctrl+0 resets zoom. Handled before the digit-jumpFraction branch
      // because that branch explicitly excludes ctrl-modified digits.
      if ((e.ctrlKey || e.metaKey) && e.key === "0" && b.resetZoom) {
        e.preventDefault();
        b.resetZoom();
        return;
      }
      // Number keys 1..9 jump to roughly that decile of the comic; 0 = end.
      if (b.jumpFraction && /^[0-9]$/.test(e.key) && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        const n = parseInt(e.key, 10);
        b.jumpFraction(n === 0 ? 1 : n / 10);
        return;
      }
      const nextKey = b.shortcuts?.next ?? "ArrowRight";
      const prevKey = b.shortcuts?.prev ?? "ArrowLeft";
      const fsKey = b.shortcuts?.toggleFs ?? "f";
      const stripKey = b.shortcuts?.toggleStrip ?? "t";
      const bookmarksKey = b.shortcuts?.toggleBookmarks ?? "b";
      const gotoKey = b.shortcuts?.goto ?? "g";
      const helpKey = b.shortcuts?.toggleHelp ?? "?";
      const exitKey = b.shortcuts?.exit ?? "Escape";
      if (e.key === nextKey) {
        e.preventDefault();
        b.next();
        return;
      }
      if (e.key === prevKey) {
        e.preventDefault();
        b.prev();
        return;
      }
      if (e.key.toLowerCase() === fsKey.toLowerCase()) {
        e.preventDefault();
        b.toggleFs();
        return;
      }
      if (e.key.toLowerCase() === stripKey.toLowerCase()) {
        e.preventDefault();
        b.toggleStrip();
        return;
      }
      if (e.key.toLowerCase() === bookmarksKey.toLowerCase() && b.toggleBookmarks) {
        e.preventDefault();
        b.toggleBookmarks();
        return;
      }
      if (e.key.toLowerCase() === gotoKey.toLowerCase() && b.goto) {
        e.preventDefault();
        b.goto();
        return;
      }
      if (e.key === helpKey && b.toggleHelp) {
        e.preventDefault();
        b.toggleHelp();
        return;
      }
      if (e.key === exitKey) {
        b.exit();
        return;
      }
      switch (e.key) {
        case "PageDown":
        case " ":
          e.preventDefault();
          b.next();
          break;
        case "ArrowDown":
          if (b.allowVerticalArrowPaging === false) {
            if (b.onArrowDown) {
              e.preventDefault();
              b.onArrowDown();
            }
            return;
          }
          e.preventDefault();
          b.next();
          break;
        case "PageUp":
          e.preventDefault();
          b.prev();
          break;
        case "ArrowUp":
          if (b.allowVerticalArrowPaging === false) {
            if (b.onArrowUp) {
              e.preventDefault();
              b.onArrowUp();
            }
            return;
          }
          e.preventDefault();
          b.prev();
          break;
        case "Home":
          e.preventDefault();
          b.jumpHome?.();
          break;
        case "End":
          e.preventDefault();
          b.jumpEnd?.();
          break;
        default:
          break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [b, enabled]);
}
