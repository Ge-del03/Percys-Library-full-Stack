import { t, type ThemePreset } from "./types";

export const CLASSIC_THEMES: ThemePreset[] = [
  t("dark", "Oscuro", "classic", true, {
    bg: "#0a0a10", fg: "#e8e8ec",
    surface1: "#15151c", surface2: "#1f1f29", surface3: "#2a2a36",
    accent: "#7c5cff",
    text1: "#dcdce4", text2: "#a8a8b3", text3: "#787884",
    border: "#3a3a47",
  }),
  t("light", "Claro", "classic", false, {
    bg: "#f6f6f9", fg: "#0a0a10",
    surface1: "#ececf2", surface2: "#dcdce4", surface3: "#c4c4ce",
    accent: "#5a3dff",
    text1: "#1c1c22", text2: "#4a4a55", text3: "#787884",
    border: "#9c9caa",
  }),
  t("manga", "Manga", "classic", true, {
    bg: "#1d1612", fg: "#f1e3c7",
    surface1: "#261d18", surface2: "#322620", surface3: "#3f2f27",
    accent: "#e0b56a",
    text1: "#d8c8a8", text2: "#a8967a", text3: "#7a6c54",
    border: "#594537",
  }),
  t("dim", "Atenuado", "classic", true, {
    bg: "#16161e", fg: "#d6d6dc",
    surface1: "#1d1d27", surface2: "#262631", surface3: "#30303c",
    accent: "#9b8cff",
    text1: "#cbcbd2", text2: "#9494a0", text3: "#666673",
    border: "#3d3d4a",
  }),
  t("slate", "Pizarra", "classic", true, {
    bg: "#0f172a", fg: "#e2e8f0",
    surface1: "#1e293b", surface2: "#334155", surface3: "#475569",
    accent: "#38bdf8",
    text1: "#cbd5e1", text2: "#94a3b8", text3: "#64748b",
    border: "#475569",
  }),
  t("midnight", "Medianoche", "classic", true, {
    bg: "#04060f", fg: "#dee3f0",
    surface1: "#0a0f1f", surface2: "#121a30", surface3: "#1c2645",
    accent: "#5b8def",
    text1: "#c8d0e2", text2: "#8794ad", text3: "#5e6a82",
    border: "#283454",
  }),
];
