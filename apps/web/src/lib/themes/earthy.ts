import { t, type ThemePreset } from "./types";

export const EARTHY_THEMES: ThemePreset[] = [
  t("clay", "Arcilla", "earthy", true, {
    bg: "#1d1813", fg: "#f0e0cd",
    surface1: "#2a221a", surface2: "#3a2d22", surface3: "#4d3b2d",
    accent: "#d97757",
    text1: "#d4c2a8", text2: "#a08d77", text3: "#766656",
    border: "#5b4738",
  }),
  t("terracotta", "Terracota", "earthy", false, {
    bg: "#f4e9dd", fg: "#3a221a",
    surface1: "#ecdcc9", surface2: "#dec5a8", surface3: "#cdaa83",
    accent: "#c2410c",
    text1: "#5a3225", text2: "#7a4c3a", text3: "#9c6a4f",
    border: "#b08766",
  }),
  t("sage", "Salvia", "earthy", false, {
    bg: "#eef2e8", fg: "#1f2a1c",
    surface1: "#e0e8d8", surface2: "#cdd9c0", surface3: "#b0c0a1",
    accent: "#4d7c0f",
    text1: "#384830", text2: "#56684e", text3: "#7a8c70",
    border: "#9aa68e",
  }),
  t("mocha", "Moca", "earthy", true, {
    bg: "#1c1612", fg: "#e6d9ca",
    surface1: "#28201a", surface2: "#382c24", surface3: "#4a3a30",
    accent: "#a78360",
    text1: "#c8b89f", text2: "#94846f", text3: "#695b4b",
    border: "#54433a",
  }),
  t("cream", "Crema", "earthy", false, {
    bg: "#fbf5e9", fg: "#3a311e",
    surface1: "#f4ead4", surface2: "#e9dcb6", surface3: "#d6c388",
    accent: "#a16207",
    text1: "#574a30", text2: "#7a6a48", text3: "#a4906c",
    border: "#bba972",
  }),
  t("parchment", "Pergamino", "earthy", false, {
    bg: "#f5ecd2", fg: "#3a2f17",
    surface1: "#ebe0c0", surface2: "#dccea0", surface3: "#c8b67d",
    accent: "#854d0e",
    text1: "#574830", text2: "#7a6948", text3: "#a48c66",
    border: "#b69d6a",
  }),
];
