import { t, type ThemePreset } from "./types";

export const MONO_THEMES: ThemePreset[] = [
  t("graphite", "Grafito", "mono", true, {
    bg: "#101012", fg: "#dcdcde",
    surface1: "#19191c", surface2: "#232328", surface3: "#2e2e34",
    accent: "#a3a3ae",
    text1: "#c8c8cc", text2: "#94949c", text3: "#5e5e68",
    border: "#3a3a40",
  }),
  t("paper", "Papel", "mono", false, {
    bg: "#ffffff", fg: "#0a0a0a",
    surface1: "#f3f3f3", surface2: "#e5e5e5", surface3: "#d4d4d4",
    accent: "#262626",
    text1: "#171717", text2: "#525252", text3: "#a3a3a3",
    border: "#a3a3a3",
  }),
  t("charcoal", "Carbón", "mono", true, {
    bg: "#0c0c0d", fg: "#cfcfd1",
    surface1: "#161618", surface2: "#202024", surface3: "#2c2c31",
    accent: "#94949c",
    text1: "#bababd", text2: "#828289", text3: "#52525a",
    border: "#34343a",
  }),
  t("ash", "Ceniza", "mono", true, {
    bg: "#1a1a1c", fg: "#d6d6d8",
    surface1: "#222226", surface2: "#2c2c31", surface3: "#3a3a40",
    accent: "#71717a",
    text1: "#bdbdc0", text2: "#878789", text3: "#5d5d62",
    border: "#42424a",
  }),
  t("ink", "Tinta", "mono", true, {
    bg: "#050507", fg: "#bcbcc0",
    surface1: "#0c0c10", surface2: "#15151a", surface3: "#1f1f24",
    accent: "#737380",
    text1: "#a8a8ac", text2: "#73737a", text3: "#46464c",
    border: "#262630",
  }),
  t("snow", "Nieve", "mono", false, {
    bg: "#f8fafc", fg: "#0f172a",
    surface1: "#eff2f7", surface2: "#e1e6ee", surface3: "#cbd2dc",
    accent: "#0f172a",
    text1: "#1e293b", text2: "#475569", text3: "#94a3b8",
    border: "#cbd5e1",
  }),
];
