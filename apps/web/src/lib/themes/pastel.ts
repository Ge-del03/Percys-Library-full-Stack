import { t, type ThemePreset } from "./types";

export const PASTEL_THEMES: ThemePreset[] = [
  t("cotton", "Algodón", "pastel", false, {
    bg: "#f5f3ff", fg: "#1e1b4b",
    surface1: "#ebe7fb", surface2: "#dcd5f5", surface3: "#c5bbeb",
    accent: "#7c3aed",
    text1: "#312e6d", text2: "#5b58a8", text3: "#8c89c9",
    border: "#b8b1dd",
  }),
  t("peach", "Durazno", "pastel", false, {
    bg: "#fff1ec", fg: "#3d1f0f",
    surface1: "#fde4d8", surface2: "#fbd2bd", surface3: "#f6b896",
    accent: "#ea580c",
    text1: "#5a3520", text2: "#82533a", text3: "#b07c60",
    border: "#dc9974",
  }),
  t("mint", "Menta", "pastel", false, {
    bg: "#ecfdf5", fg: "#022c22",
    surface1: "#d1fae5", surface2: "#a7f3d0", surface3: "#6ee7b7",
    accent: "#059669",
    text1: "#064e3b", text2: "#0f7560", text3: "#3ba288",
    border: "#86d3b4",
  }),
  t("lilac", "Lila", "pastel", false, {
    bg: "#faf5ff", fg: "#3b0764",
    surface1: "#f3e8ff", surface2: "#e9d5ff", surface3: "#d8b4fe",
    accent: "#9333ea",
    text1: "#581c87", text2: "#7e3eb0", text3: "#a778cd",
    border: "#cda9e3",
  }),
  t("sky", "Cielo", "pastel", false, {
    bg: "#f0f9ff", fg: "#082f49",
    surface1: "#dcefff", surface2: "#bae0fd", surface3: "#7cc8fa",
    accent: "#0284c7",
    text1: "#0c4a6e", text2: "#216892", text3: "#4f8bb0",
    border: "#8ac6e5",
  }),
  t("blossom", "Flor", "pastel", false, {
    bg: "#fdf2f8", fg: "#500724",
    surface1: "#fce7f3", surface2: "#fbcfe8", surface3: "#f9a8d4",
    accent: "#db2777",
    text1: "#831843", text2: "#a83a64", text3: "#cf7099",
    border: "#e0a4be",
  }),
];
