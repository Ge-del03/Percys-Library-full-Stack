import { create } from "zustand";
import { api, type BulkOp, type ComicSummary, type UploadComicsResult } from "../lib/api";
import { useToasts } from "./toasts";

export interface UploadProgress {
  /** "uploading" while bytes are streaming, "processing" once they
   *  are all on the server but the response hasn't arrived yet. */
  phase: "uploading" | "processing";
  loaded: number;
  total: number;
  fileCount: number;
}

interface LibraryState {
  comics: ComicSummary[];
  loading: boolean;
  uploading: boolean;
  uploadProgress: UploadProgress | null;
  query: string;
  filter: "all" | "favorites" | "in-progress" | "completed";
  load: () => Promise<void>;
  scan: () => Promise<{ added: number; removed: number; total: number }>;
  upload: (files: File[]) => Promise<UploadComicsResult>;
  setQuery: (q: string) => void;
  setFilter: (f: LibraryState["filter"]) => void;
  toggleFavorite: (id: string) => Promise<void>;
  bulk: (
    ids: string[],
    op: BulkOp,
    category?: string | null,
  ) => Promise<{ affected: number }>;
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  comics: [],
  loading: false,
  uploading: false,
  uploadProgress: null,
  query: "",
  filter: "all",
  async load() {
    set({ loading: true });
    try {
      const comics = await api.library();
      set({ comics });
    } catch (err) {
      // Surface the failure as a toast so a silent network error
      // doesn't leave the library mysteriously empty. We keep the
      // previous comics list in memory (no `set({ comics: [] })`)
      // so a transient hiccup doesn't wipe what the user can already
      // see on screen.
      const msg = err instanceof Error ? err.message : "No se pudo cargar la biblioteca";
      useToasts.getState().push(msg, "error");
    } finally {
      set({ loading: false });
    }
  },
  async scan() {
    try {
      const result = await api.scan();
      await get().load();
      return result;
    } catch (err) {
      // Try to refresh anyway so the user sees whatever state
      // exists, then re-throw so the caller can surface a toast.
      await get().load();
      const msg = err instanceof Error ? err.message : "No se pudo escanear la biblioteca";
      throw new Error(msg);
    }
  },
  async upload(files) {
    set({
      uploading: true,
      uploadProgress: { phase: "uploading", loaded: 0, total: 0, fileCount: files.length },
    });
    try {
      const result = await api.uploadComicsWithProgress(files, {
        onProgress: (loaded, total) => {
          set({ uploadProgress: { phase: "uploading", loaded, total, fileCount: files.length } });
        },
        onUploadComplete: () => {
          // Bytes are all uploaded; the server is now extracting and
          // registering. Switch to the indeterminate "processing" phase.
          const cur = get().uploadProgress;
          set({
            uploadProgress: {
              phase: "processing",
              loaded: cur?.loaded ?? 0,
              total: cur?.total ?? 0,
              fileCount: files.length,
            },
          });
        },
      });
      await get().load();
      return result;
    } finally {
      set({ uploading: false, uploadProgress: null });
    }
  },
  setQuery(query) {
    set({ query });
  },
  setFilter(filter) {
    set({ filter });
  },
  async toggleFavorite(id) {
    // Optimistic: flip the bit in local state immediately so the
    // star animates without waiting for the server. Roll back on
    // failure so the UI doesn't lie about what's persisted.
    const prev = get().comics;
    const comic = prev.find((c) => c.id === id);
    if (!comic) return;
    const next = !comic.isFavorite;
    set({
      comics: prev.map((c) => (c.id === id ? { ...c, isFavorite: next } : c)),
    });
    try {
      await api.setFavorite(id, next);
    } catch (err) {
      set({ comics: prev });
      const msg = err instanceof Error ? err.message : "No se pudo actualizar favorito";
      useToasts.getState().push(msg, "error");
    }
  },
  async bulk(ids, op, category) {
    // Optimistic: apply the operation to a local mirror of `comics`
    // right away so the UI reacts instantly (deletes vanish, marks
    // toggle, categories re-tag). Snapshot the previous state so we
    // can roll back if the server rejects.
    const prev = get().comics;
    const optimistic = applyBulkLocally(prev, ids, op, category ?? undefined);
    set({ comics: optimistic });
    try {
      const r = await api.bulk(ids, op, category);
      // Settle the truth in the background. For ops where the
      // server-side computation can drift from our local mirror
      // (e.g. markCompleted needs the canonical pageCount-1, or the
      // affected count differs from ids.length when some rows were
      // already in the target state) we re-fetch silently. Failure
      // here is harmless — the optimistic state is already a faithful
      // approximation of the server outcome.
      void get().load().catch(() => undefined);
      return { affected: r.affected };
    } catch (err) {
      set({ comics: prev });
      const msg = err instanceof Error ? err.message : "Operación masiva fallida";
      throw new Error(msg);
    }
  },
}));

/** Apply a bulk operation to a snapshot of comics. Mirrors the
 *  server's logic so the optimistic UI reflects what the user will
 *  see once the request lands. We deliberately filter the input list
 *  to the affected ids before applying so callers don't have to
 *  partition the array themselves.
 */
function applyBulkLocally(
  comics: ComicSummary[],
  ids: string[],
  op: BulkOp,
  category?: string,
): ComicSummary[] {
  const idSet = new Set(ids);
  if (op === "delete") {
    return comics.filter((c) => !idSet.has(c.id));
  }
  return comics.map((c) => {
    if (!idSet.has(c.id)) return c;
    switch (op) {
      case "favorite":
        return { ...c, isFavorite: true };
      case "unfavorite":
        return { ...c, isFavorite: false };
      case "markCompleted":
        return {
          ...c,
          completed: true,
          currentPage: Math.max(0, c.pageCount - 1),
          lastReadAt: new Date().toISOString(),
        };
      case "markUnread":
        return { ...c, completed: false, currentPage: 0 };
      case "category":
        // Replace the legacy primary slot. The additive array
        // (`categories`) is left alone here — use `categoryAdd` to
        // merge into it.
        return { ...c, category: category ?? null };
      case "categoryAdd": {
        const v = (category ?? "").trim();
        if (!v) return c;
        if (c.categories.includes(v)) return c;
        return {
          ...c,
          categories: [...c.categories, v],
          category: c.category ?? v,
        };
      }
      case "categoryRemove": {
        const v = (category ?? "").trim();
        if (!v || !c.categories.includes(v)) return c;
        const nextArr = c.categories.filter((x) => x !== v);
        return {
          ...c,
          categories: nextArr,
          category: c.category === v ? nextArr[0] ?? null : c.category,
        };
      }
      default:
        return c;
    }
  });
}
