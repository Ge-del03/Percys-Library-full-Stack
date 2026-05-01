import { create } from "zustand";

export interface Toast {
  id: string;
  message: string;
  tone: "info" | "success" | "warn" | "error";
}

interface ToastState {
  toasts: Toast[];
  push: (message: string, tone?: Toast["tone"]) => void;
  dismiss: (id: string) => void;
}

export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],
  push(message, tone = "info") {
    const now = Date.now();
    const recentDuplicate = get().toasts.some(
      (t) => t.message === message && t.tone === tone && now - parseInt(t.id.split("-")[0], 10) < 1200,
    );
    if (recentDuplicate) return;
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const next = [...get().toasts, { id, message, tone }];
    set({ toasts: next.slice(-4) });
    setTimeout(() => get().dismiss(id), 3000);
  },
  dismiss(id) {
    set({ toasts: get().toasts.filter((t) => t.id !== id) });
  },
}));
