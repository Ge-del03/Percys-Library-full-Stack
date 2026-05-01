import { create } from "zustand";
import { api, type SettingsDto } from "../lib/api";

interface SettingsState {
  settings: SettingsDto | null;
  load: () => Promise<void>;
  update: (patch: Partial<SettingsDto>) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: null,
  async load() {
    const settings = await api.settings();
    set({ settings });
  },
  async update(patch) {
    const current = get().settings;
    set({ settings: current ? { ...current, ...patch } : current });
    const updated = await api.updateSettings(patch);
    set({ settings: updated });
  },
}));
