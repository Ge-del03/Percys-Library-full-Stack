import { useEffect } from "react";
import { keysMatch, type ShortcutMap } from "../lib/shortcuts";

interface Bindings {
  next: () => void;
  prev: () => void;
  toggleFs: () => void;
  toggleStrip: () => void;
  exit: () => void;
  toggleBookmarks?: () => void;
  /** Add or remove a bookmark on the current page without opening the panel. */
  quickBookmark?: () => void;
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
      // Bail out only when the user is typing into a real text field —
      // not when focus is on the page/zoom slider (`<input type="range">`)
      // or a checkbox, because those don't accept text and we want our
      // global reader shortcuts (Arrow keys, Esc, etc.) to take over even
      // if the slider happens to hold focus. Without this, ArrowDown on
      // a focused slider would silently decrement the slider instead of
      // scrolling the comic, which is exactly the "click outside first"
      // bug users keep hitting.
      const target = e.target;
      if (target instanceof HTMLTextAreaElement) return;
      if (target instanceof HTMLInputElement) {
        const textTypes = new Set([
          "text",
          "search",
          "email",
          "password",
          "number",
          "url",
          "tel",
          "date",
          "datetime-local",
          "month",
          "time",
          "week",
        ]);
        if (textTypes.has(target.type)) return;
        // For non-text inputs (range, checkbox, radio, color, file…) we
        // still want our shortcut to run, but we also blur the control
        // so subsequent presses go to the document body and the slider
        // stops jittering as the user hits arrow keys.
        target.blur();
      }
      if (target instanceof HTMLElement && target.isContentEditable) return;
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
      const quickBookmarkKey = b.shortcuts?.quickBookmark ?? "m";
      const gotoKey = b.shortcuts?.goto ?? "g";
      const helpKey = b.shortcuts?.toggleHelp ?? "?";
      const exitKey = b.shortcuts?.exit ?? "Escape";
      // Match the user's customised bindings BEFORE the hard-coded
      // PageUp/PageDown/Space defaults. `keysMatch` makes single-letter
      // bindings work regardless of capitalisation (Shift+a, Caps Lock).
      if (keysMatch(nextKey, e.key)) {
        e.preventDefault();
        b.next();
        return;
      }
      if (keysMatch(prevKey, e.key)) {
        e.preventDefault();
        b.prev();
        return;
      }
      if (keysMatch(fsKey, e.key)) {
        e.preventDefault();
        b.toggleFs();
        return;
      }
      if (keysMatch(stripKey, e.key)) {
        e.preventDefault();
        b.toggleStrip();
        return;
      }
      if (keysMatch(bookmarksKey, e.key) && b.toggleBookmarks) {
        e.preventDefault();
        b.toggleBookmarks();
        return;
      }
      if (keysMatch(quickBookmarkKey, e.key) && b.quickBookmark) {
        e.preventDefault();
        b.quickBookmark();
        return;
      }
      if (keysMatch(gotoKey, e.key) && b.goto) {
        e.preventDefault();
        b.goto();
        return;
      }
      if (keysMatch(helpKey, e.key) && b.toggleHelp) {
        e.preventDefault();
        b.toggleHelp();
        return;
      }
      if (keysMatch(exitKey, e.key)) {
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
