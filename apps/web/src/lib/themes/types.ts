/**
 * Theme types and the `t()` helper used by every preset table.
 *
 * The theme catalog is split across one file per category
 * (classic / vibrant / neon / earthy / mono / pastel / contrast /
 * special). Each table imports `t` from here, declares its presets, and
 * the umbrella `themes/index.ts` concatenates them into a single
 * `THEMES` array. This keeps a single mental model — "every theme is
 * a row in a table" — without forcing all 50+ rows into one giant file.
 */
export type ThemeGroup =
  | "classic"
  | "vibrant"
  | "neon"
  | "earthy"
  | "mono"
  | "pastel"
  | "contrast"
  | "special";

export interface ThemePreset {
  /** Stable kebab-case id persisted in Settings.theme. */
  id: string;
  /** User-facing label. */
  name: string;
  /** "dark" tells the browser to colour-scheme native UI
   *  (form controls, scrollbars, selection) appropriately. */
  dark: boolean;
  /** Body background. */
  bg: string;
  /** Body foreground (default text). */
  fg: string;
  /** Cards / panels (Tailwind .bg-ink-800 surface). */
  surface1: string;
  /** Hover / inset surfaces (Tailwind .bg-ink-700 surface). */
  surface2: string;
  /** Stronger separators (.bg-ink-600). */
  surface3: string;
  /** Accent for buttons, highlights, progress. */
  accent: string;
  /** Secondary text. Falls back to text1 if omitted. */
  text1: string;
  /** Tertiary / muted text. */
  text2: string;
  /** Quaternary / placeholder. */
  text3: string;
  /** Border colour (used for ink-700/60 etc.). */
  border: string;
  /** Reader shell background (immersive area). */
  readerBg: string;
  /** Optional: scrollbar thumb (defaults to fg-mixed). */
  scrollbar?: string;
  /** Tag for grouping in the picker UI. */
  group: ThemeGroup;
}

interface ThemeColors {
  bg: string;
  fg: string;
  surface1: string;
  surface2: string;
  surface3: string;
  accent: string;
  text1: string;
  text2: string;
  text3: string;
  border: string;
  readerBg?: string;
}

/**
 * Concise constructor used by every preset table. Falls back to a
 * very dark reader background for dark themes (and the body bg for
 * light ones) so the immersive area doesn't strobe when transitioning
 * from the library shell.
 */
export function t(
  id: string,
  name: string,
  group: ThemeGroup,
  dark: boolean,
  c: ThemeColors,
): ThemePreset {
  return {
    id,
    name,
    group,
    dark,
    ...c,
    readerBg: c.readerBg ?? (dark ? "#050507" : c.bg),
  };
}
