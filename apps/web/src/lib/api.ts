export interface ComicSummary {
  id: string;
  title: string;
  format: "cbz" | "cbr" | "pdf" | "folder";
  pageCount: number;
  currentPage: number;
  completed: boolean;
  isFavorite: boolean;
  /** Legacy single primary category. New code should prefer `categories`
   *  for additive multi-tag organisation; `category` is kept as a single
   *  opinionated label and is auto-seeded from the first tag when set. */
  category: string | null;
  /** Additive multi-tag list. Bulk `categoryAdd` / `categoryRemove`
   *  operations merge into this array instead of overwriting, so a
   *  comic can carry multiple labels ("Marvel" + "X-Men") without one
   *  wiping out the other. */
  categories: string[];
  addedAt: string;
  updatedAt: string;
  lastReadAt: string | null;
  sizeBytes: number;
  /** Last zoom factor the user applied to this comic, if any. */
  lastZoom: number | null;
  /** Estimated reading time in minutes based on average reading speed. */
  readingTimeMinutes?: number;
}

export type ReadingMode = "scroll-v" | "paged-h" | "paged-v" | "webtoon" | "paged-h-2";
/** Theme is now a free-form string id matching one of the presets in
 *  `lib/themes.ts`. The legacy values dark/light/manga still exist so old
 *  saved settings continue to load. */
export type Theme = string;

export interface SettingsDto {
  ownerId: string;
  userName: string;
  userLastName: string | null;
  theme: Theme;
  accentColor: string; // "#rrggbb"
  avatar: string | null; // "preset:<id>" or "data:image/...;base64,..."
  coverSize: "sm" | "md" | "lg";
  readingMode: ReadingMode;
  fitMode: "fit-width" | "fit-height" | "original";
  direction: "ltr" | "rtl";
  showThumbStrip: boolean;
  autoCropMargins: boolean;
  uiHideDelayMs: number;
  autoAdvanceToNext: boolean;
  autoScrollSpeed: number; // px per second
  showTopProgress: boolean;
  libraryView: "grid" | "list";
  librarySort: "title" | "lastReadAt" | "progress" | "addedAt";
  reduceMotion: boolean;
  imageFilter: "none" | "sepia" | "night" | "high-contrast";
  libraryPath: string | null;
  /** Daily reading goal in pages. 0 = disabled. */
  dailyGoalPages: number;
  customThemes: string;
  keyboardShortcuts: string;
  hasOnboarded: boolean;
  autoApplySettings: boolean;
  animationsEnabled: boolean;
  animPageTransitions: boolean;
  animHoverParallax: boolean;
  animHudFades: boolean;
  animMicroInteractions: boolean;
  animBrandShimmer: boolean;
  animIntensity: number;
  readerPageGap: number;
  readerMaxWidth: number;
  readerSidePadding: number;
  readerPagePreload: number;
  imageQuality: "high" | "balanced" | "fast";
  customCss: string;
  backgroundImage: string | null;
  backgroundDim: number;
  fontScale: number;
  statsRange: "7d" | "30d" | "90d" | "1y" | "all";
  readerBrightness: number;
  readerContrast: number;
}

export interface BookmarkDto {
  id: string;
  comicId: string;
  page: number;
  note: string | null;
  createdAt: string;
}

export interface NextComic {
  id: string;
  title: string;
  format: ComicSummary["format"];
  pageCount: number;
  currentPage: number;
  completed: boolean;
}

export interface TopComic {
  id: string;
  title: string;
  format: ComicSummary["format"];
  pageCount: number;
  currentPage: number;
  completed: boolean;
  pagesEstimated: number; // for sorting
}

export interface BreakdownEntry {
  key: string;
  count: number;
}

export interface StatsDto {
  totalComics: number;
  completedComics: number;
  inProgressComics: number;
  pagesRead: number;
  favorites: number;
  currentStreak: number;
  longestStreak: number;
  todayPages: number;
  bestDayPages: number;
  /** Calendar-day reading volume rows. */
  days: { date: string; pagesRead: number }[];
  /** Total active reading days (any pagesRead > 0). */
  totalReadingDays: number;
  /** Days active in last 7 / 30 days. */
  daysActive7: number;
  daysActive30: number;
  /** Distribution by format and category (ordered by count desc). */
  formats: BreakdownEntry[];
  categories: BreakdownEntry[];
  /** Top 5 most-read comics by progress. */
  topRead: TopComic[];
  /** "Almost there" — in-progress comics ≥ 70% complete, top 3. */
  almostDone: TopComic[];
  /** Last completed comic, if any. */
  lastCompleted: TopComic | null;
  /** Total bytes managed (BigInt → number; rough). */
  totalBytes: number;
  /** Average pages per active day. */
  averagePagesPerActiveDay: number;
  /** Estimated total reading time in minutes. */
  totalReadingTimeMinutes: number;
  /** Average reading time per session in minutes. */
  averageSessionMinutes: number;
}

export type BulkOp =
  | "favorite"
  | "unfavorite"
  | "markCompleted"
  | "markUnread"
  | "category"
  /** Additive: append a category to each selected comic without
   *  overwriting its existing tags. Send the value in `category`. */
  | "categoryAdd"
  /** Additive: remove a category value from each selected comic.
   *  Send the value in `category`. */
  | "categoryRemove"
  | "delete";

export interface UploadComicsResult {
  uploaded: { name: string; size: number }[];
  skipped: { name: string; reason: "already-exists" | "duplicated-in-batch" }[];
  added: number;
  registered?: number;
  unreadable?: number;
  removed: number;
  total: number;
}

export interface AchievementDto {
  id: string;
  title: string;
  description: string;
  group:
    | "milestones"
    | "pages"
    | "streaks"
    | "favorites"
    | "library"
    | "modes"
    | "formats"
    | "categories"
    | "series"
    | "exploration"
    | "secret";
  tier: 1 | 2 | 3 | 4 | 5;
  secret: boolean;
  unlocked: boolean;
}

/** Maximum retries for transient (503 / network blip) errors before
 *  surfacing the failure to the caller. Bounded so a true outage still
 *  fails fast instead of stalling the UI for minutes. */
const TRANSIENT_RETRY_ATTEMPTS = 3;

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < TRANSIENT_RETRY_ATTEMPTS; attempt++) {
    try {
      const r = await fetch(url, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          "x-owner-id": getOwnerId(),
          ...(init?.headers ?? {}),
        },
      });
      // 503 is reserved for transient DB blips (see server error
      // handler). The server already retried Prisma internally, so a
      // 503 reaching here means the outage outlasted the inner retry
      // budget. We back off and try once more from the client side
      // before propagating the error to the user.
      if (r.status === 503 && attempt < TRANSIENT_RETRY_ATTEMPTS - 1) {
        const retryAfter = Number(r.headers.get("Retry-After")) || 1;
        await new Promise((resolve) =>
          setTimeout(resolve, Math.min(2_000, retryAfter * 1_000)),
        );
        continue;
      }
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as {
          error?: string;
          transient?: boolean;
        };
        const err = new Error(body.error ?? `${r.status} ${r.statusText}`);
        if (body.transient) (err as Error & { transient?: boolean }).transient = true;
        throw err;
      }
      return r.json() as Promise<T>;
    } catch (err) {
      lastErr = err;
      // A real network failure (server down, no connectivity, etc.) is
      // surfaced immediately instead of retried — repeated retries
      // against a hard outage just stalls the UI.
      if (err instanceof TypeError && err.message === "Failed to fetch") {
        throw new Error("No se pudo conectar con el servidor. ¿Está encendido?");
      }
      // Server-flagged transient errors (503 wrapped above) loop back
      // up; everything else exits the loop after one attempt.
      const transient = (err as Error & { transient?: boolean })?.transient;
      if (!transient) throw err;
      if (attempt < TRANSIENT_RETRY_ATTEMPTS - 1) {
        await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
  // Defensive — the loop above always returns or throws.
  throw lastErr;
}

import { getOwnerId } from "./owner";

export interface LibraryQuery {
  q?: string;
  format?: ComicSummary["format"];
  status?: "all" | "in-progress" | "completed" | "unread" | "favorites";
  category?: string;
  sort?: "lastReadAt" | "title" | "addedAt" | "updatedAt" | "progress";
  order?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

export interface LibrarySummary {
  total: number;
  completed: number;
  inProgress: number;
  unread: number;
  favorites: number;
  totalBytes: number;
}

export const api = {
  /** Fetch the library list. With no args returns a sensible default
   *  (newest-first, paginated to 200) so most callers don't need to
   *  think about params. Pass a `LibraryQuery` for search / filter. */
  library: (query: LibraryQuery = {}) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === "") continue;
      search.set(key, String(value));
    }
    const qs = search.toString();
    return jsonFetch<ComicSummary[]>(`/api/library${qs ? `?${qs}` : ""}`);
  },
  librarySummary: () => jsonFetch<LibrarySummary>("/api/library/summary"),
  /** Returns the export URL — callers usually let the browser download it.
   *  Format defaults to JSON; `ndjson` streams one comic per line. */
  libraryExportUrl: (format: "json" | "ndjson" = "json") =>
    `/api/library/export?format=${format}`,
  scan: () => jsonFetch<{ added: number; removed: number; total: number }>("/api/library/scan", { method: "POST" }),
  randomComic: (scope: "all" | "unread" | "in-progress" | "favorites" = "all") =>
    jsonFetch<NextComic>(`/api/comics/random?scope=${scope}`),
  // Upload uses multipart/form-data (not JSON) so we hit fetch directly
  // instead of going through jsonFetch which forces a JSON content-type.
  uploadComics: async (files: File[]) => {
    try {
      const fd = new FormData();
      for (const f of files) {
        const name = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
        fd.append("files", f, name);
      }
      const r = await fetch("/api/library/upload", { method: "POST", body: fd, headers: { "x-owner-id": getOwnerId() } });
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `${r.status} ${r.statusText}`);
      }
      return r.json() as Promise<UploadComicsResult>;
    } catch (err) {
      if (err instanceof TypeError && err.message === "Failed to fetch") {
        throw new Error("No se pudo conectar con el servidor. ¿Está encendido?");
      }
      throw err;
    }
  },
  // XMLHttpRequest-based upload that surfaces real byte-level progress.
  // Falls back to the same JSON shape as `uploadComics` so callers can
  // swap one for the other without behaviour changes. The optional
  // callbacks let UI components render an "uploading… X / Y bytes"
  // bar plus an indeterminate "processing" phase once the bytes have
  // finished going up but the server hasn't responded yet.
  uploadComicsWithProgress: (
    files: File[],
    handlers?: {
      onProgress?: (loaded: number, total: number) => void;
      onUploadComplete?: () => void;
    },
  ) => {
    return new Promise<UploadComicsResult>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      let uploadFinished = false;
      xhr.upload.addEventListener("progress", (ev) => {
        if (handlers?.onProgress && ev.lengthComputable) {
          handlers.onProgress(ev.loaded, ev.total);
        }
      });
      xhr.upload.addEventListener("load", () => {
        if (uploadFinished) return;
        uploadFinished = true;
        handlers?.onUploadComplete?.();
      });
      xhr.addEventListener("load", () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const parsed = JSON.parse(xhr.responseText) as UploadComicsResult;
            resolve(parsed);
          } catch {
            reject(new Error("Respuesta inválida del servidor"));
          }
          return;
        }
        let message = `${xhr.status} ${xhr.statusText}`.trim();
        try {
          const body = JSON.parse(xhr.responseText) as { error?: string };
          if (body && typeof body.error === "string" && body.error) message = body.error;
        } catch {
          /* ignore */
        }
        reject(new Error(message || "No se pudo subir el archivo"));
      });
      xhr.addEventListener("error", () =>
        reject(new Error("No se pudo conectar con el servidor. ¿Está encendido?")),
      );
      xhr.addEventListener("abort", () => reject(new Error("Carga cancelada")));
      xhr.open("POST", "/api/library/upload");
      xhr.setRequestHeader("x-owner-id", getOwnerId());
      const fd = new FormData();
      for (const f of files) {
        const name = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
        fd.append("files", f, name);
      }
      xhr.send(fd);
    });
  },
  comic: (id: string) => jsonFetch<ComicSummary>(`/api/comics/${id}`),
  nextComic: (id: string) => jsonFetch<{ next: NextComic | null }>(`/api/comics/${id}/next`),
  setProgress: (id: string, page: number, completed?: boolean) =>
    jsonFetch<{ ok: boolean; completed: boolean }>(`/api/comics/${id}/progress`, {
      method: "POST",
      body: JSON.stringify({ page, completed }),
    }),
  // Dedicated zoom endpoint: does not touch lastReadAt, currentPage,
  // completed, or the reading-day counter. Safe to call repeatedly while
  // the user is pinching/wheel-zooming.
  setZoom: (id: string, zoom: number) =>
    jsonFetch<{ ok: boolean }>(`/api/comics/${id}/zoom`, {
      method: "PATCH",
      body: JSON.stringify({ zoom }),
    }),
  setFavorite: (id: string, favorite: boolean) =>
    jsonFetch<{ ok: boolean }>(`/api/comics/${id}/favorite`, {
      method: "POST",
      body: JSON.stringify({ favorite }),
    }),
  setCategory: (id: string, category: string | null) =>
    jsonFetch<{ ok: boolean }>(`/api/comics/${id}/category`, {
      method: "POST",
      body: JSON.stringify({ category }),
    }),
  /** Replace the full categories array for a comic. Pass the merged
   *  list (existing + new). The server dedupes / trims and keeps the
   *  legacy primary `category` field consistent with the array. */
  setCategories: (id: string, categories: string[]) =>
    jsonFetch<{ ok: boolean; categories: string[] }>(`/api/comics/${id}/categories`, {
      method: "POST",
      body: JSON.stringify({ categories }),
    }),
  bulk: (ids: string[], op: BulkOp, category?: string | null) => {
    // Forward `category` for any op that needs a value: the legacy
    // `category` (replace primary slot, including `null` to clear) and
    // the new additive `categoryAdd` / `categoryRemove` ops which carry
    // the tag string to merge or remove. Dropping the field for the
    // additive ops (the previous bug) made the server see an empty
    // value and short-circuit with `affected = 0`.
    const needsCategory =
      op === "category" || op === "categoryAdd" || op === "categoryRemove";
    return jsonFetch<{ ok: boolean; affected: number }>(`/api/comics/bulk`, {
      method: "POST",
      body: JSON.stringify({ ids, op, ...(needsCategory ? { category } : {}) }),
    });
  },
  settings: () => jsonFetch<SettingsDto>("/api/settings"),
  updateSettings: (patch: Partial<SettingsDto>) =>
    jsonFetch<SettingsDto>("/api/settings", { method: "PUT", body: JSON.stringify(patch) }),
  resetProfile: () => jsonFetch<{ ok: boolean }>("/api/settings/reset-profile", { method: "POST" }),
  resetDefaults: () => jsonFetch<SettingsDto>("/api/settings/reset-defaults", { method: "POST" }),
  stats: () => jsonFetch<StatsDto>("/api/stats"),
  achievements: () => jsonFetch<AchievementDto[]>("/api/achievements"),

  bookmarks: (id: string) => jsonFetch<{ items: BookmarkDto[] }>(`/api/comics/${id}/bookmarks`),
  addBookmark: (id: string, page: number, note?: string) =>
    jsonFetch<{ bookmark: BookmarkDto }>(`/api/comics/${id}/bookmarks`, {
      method: "POST",
      body: JSON.stringify({ page, note }),
    }),
  deleteBookmark: (bid: string) =>
    jsonFetch<{ ok: boolean }>(`/api/bookmarks/${bid}`, { method: "DELETE" }),

  coverUrl: (id: string) => `/api/comics/${id}/cover`,
  pageUrl: (
    id: string,
    n: number,
    autoCrop = false,
    quality?: "high" | "balanced" | "fast",
  ) => {
    const base = `/api/comics/${id}/pages/${n}?crop=${autoCrop ? 1 : 0}`;
    return quality ? `${base}&q=${quality}` : base;
  },
  thumbUrl: (id: string, n: number) => `/api/comics/${id}/thumbs/${n}`,
};
