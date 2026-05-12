import { t, type ThemePreset } from "./types";

export const NEON_THEMES: ThemePreset[] = [
  t("synthwave", "Synthwave", "neon", true, {
    bg: "#0e0226", fg: "#f3e7ff",
    surface1: "#180838", surface2: "#241050", surface3: "#311a6f",
    accent: "#ff5cf2",
    text1: "#dcccf2", text2: "#9c8ec3", text3: "#6e6597",
    border: "#3b1f7d",
  }),
  t("cyberpunk", "Cyberpunk", "neon", true, {
    bg: "#0c0c1a", fg: "#fff04d",
    surface1: "#15152a", surface2: "#1e1e3f", surface3: "#2a2a55",
    accent: "#ff2bd6",
    text1: "#fbe79e", text2: "#bba56b", text3: "#83734b",
    border: "#3b3b6e",
  }),
  t("tron", "Tron", "neon", true, {
    bg: "#000814", fg: "#a8ecff",
    surface1: "#001324", surface2: "#001f3a", surface3: "#002d54",
    accent: "#00d9ff",
    text1: "#9ad9ee", text2: "#5d99af", text3: "#3e6878",
    border: "#003d6e",
  }),
  t("miami", "Miami", "neon", true, {
    bg: "#1a0928", fg: "#ffe0f0",
    surface1: "#241036", surface2: "#311949", surface3: "#412565",
    accent: "#ff007a",
    text1: "#f6c4dc", text2: "#bd8ca7", text3: "#876377",
    border: "#562c7a",
  }),
  t("electric", "Eléctrico", "neon", true, {
    bg: "#020317", fg: "#dcf3ff",
    surface1: "#0b0c25", surface2: "#131638", surface3: "#1e2452",
    accent: "#3b82f6",
    text1: "#bfd7ee", text2: "#8295b1", text3: "#576683",
    border: "#22335e",
  }),
  t("neon-night", "Noche neón", "neon", true, {
    bg: "#08001a", fg: "#d3ffd1",
    surface1: "#11062a", surface2: "#1c0d3f", surface3: "#291557",
    accent: "#39ff14",
    text1: "#bdd9bb", text2: "#7fa07d", text3: "#577057",
    border: "#321967",
  }),
];
