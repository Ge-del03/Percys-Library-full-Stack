/**
 * Theme catalog entry point. The full set of presets is concatenated
 * here from the per-group tables so adding/removing/grouping themes is
 * a one-file change without editing a single 500-line registry. Every
 * existing import (`from "../lib/themes"`) keeps working — this file
 * re-exports the same public surface (`THEMES`, `THEME_GROUPS`,
 * `getTheme`, `ThemePreset`, `ThemeGroup`).
 */
import { CLASSIC_THEMES } from "./classic";
import { VIBRANT_THEMES } from "./vibrant";
import { NEON_THEMES } from "./neon";
import { EARTHY_THEMES } from "./earthy";
import { MONO_THEMES } from "./mono";
import { PASTEL_THEMES } from "./pastel";
import { CONTRAST_THEMES } from "./contrast";
import { SPECIAL_THEMES } from "./special";
import type { ThemeGroup, ThemePreset } from "./types";

export type { ThemeGroup, ThemePreset } from "./types";
export { t } from "./types";

export const THEMES: ThemePreset[] = [
  ...CLASSIC_THEMES,
  ...VIBRANT_THEMES,
  ...NEON_THEMES,
  ...EARTHY_THEMES,
  ...MONO_THEMES,
  ...PASTEL_THEMES,
  ...CONTRAST_THEMES,
  ...SPECIAL_THEMES,
];

/** Lookup a theme by id with a safe fallback to the dark default. */
export function getTheme(id: string | undefined | null): ThemePreset {
  return THEMES.find((theme) => theme.id === id) ?? THEMES[0];
}

/** Group themes for the picker UI. Order matches the section order in the picker. */
export const THEME_GROUPS: { id: ThemeGroup; label: string }[] = [
  { id: "classic", label: "Clásicos" },
  { id: "vibrant", label: "Vibrantes" },
  { id: "neon", label: "Neón" },
  { id: "earthy", label: "Tierra" },
  { id: "mono", label: "Monocromo" },
  { id: "pastel", label: "Pastel" },
  { id: "contrast", label: "Alto contraste" },
  { id: "special", label: "Especiales" },
];

/** Number of themes in each group — handy for badges and validations. */
export const THEME_COUNTS: Record<ThemeGroup, number> = {
  classic: CLASSIC_THEMES.length,
  vibrant: VIBRANT_THEMES.length,
  neon: NEON_THEMES.length,
  earthy: EARTHY_THEMES.length,
  mono: MONO_THEMES.length,
  pastel: PASTEL_THEMES.length,
  contrast: CONTRAST_THEMES.length,
  special: SPECIAL_THEMES.length,
};
