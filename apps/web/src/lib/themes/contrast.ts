import { t, type ThemePreset } from "./types";

export const CONTRAST_THEMES: ThemePreset[] = [
  t("mono-light", "Alto contraste claro", "contrast", false, {
    bg: "#ffffff", fg: "#000000",
    surface1: "#f0f0f0", surface2: "#e0e0e0", surface3: "#c8c8c8",
    accent: "#000000",
    text1: "#0a0a0a", text2: "#3a3a3a", text3: "#6a6a6a",
    border: "#000000",
  }),
  t("mono-dark", "Alto contraste oscuro", "contrast", true, {
    bg: "#000000", fg: "#ffffff",
    surface1: "#0a0a0a", surface2: "#1a1a1a", surface3: "#2a2a2a",
    accent: "#ffffff",
    text1: "#f4f4f4", text2: "#c4c4c4", text3: "#949494",
    border: "#ffffff",
  }),
  t("blackboard", "Pizarra negra", "contrast", true, {
    bg: "#0d1f1f", fg: "#f0fff0",
    surface1: "#142929", surface2: "#1d3737", surface3: "#274545",
    accent: "#ffffff",
    text1: "#dceadc", text2: "#9ab1a4", text3: "#6e8377",
    border: "#345555",
  }),
  t("blueprint", "Plano azul", "contrast", true, {
    bg: "#0a2342", fg: "#e0eaff",
    surface1: "#102e54", surface2: "#163c6a", surface3: "#1d4d85",
    accent: "#ffffff",
    text1: "#c9d6f0", text2: "#88a0c8", text3: "#5d7297",
    border: "#264e87",
  }),
  t("sepia-high", "Sepia alto contraste", "contrast", false, {
    bg: "#f8efd5", fg: "#1c1108",
    surface1: "#ede2bf", surface2: "#dcceaa", surface3: "#c4b283",
    accent: "#1c1108",
    text1: "#33210f", text2: "#574228", text3: "#7a6648",
    border: "#9c8454",
  }),
];
