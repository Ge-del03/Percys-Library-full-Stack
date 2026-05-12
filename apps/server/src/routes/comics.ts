import { Router } from "express";
import path from "node:path";
import fs from "node:fs/promises";
import { z } from "zod";
import { prisma } from "../db";
import { getCover } from "../services/covers";
import { getPage, getThumb, refreshComicPageCount } from "../services/pages";
import { evaluateAchievements, recordReadingDay } from "../services/achievements";
import { asyncHandler } from "../lib/async-handler";
import { naturalCompare } from "../lib/natural-sort";
import { getOwnerId } from "../lib/owner";
import { detectMime } from "../lib/image-utils";
import { config } from "../config";
import { getExtractor, type ComicFormat } from "../services/pipeline";

function isPathSafe(filePath: string): boolean {
  const resolved = path.resolve(filePath);
  const libResolved = path.resolve(config.libraryPath);
  const relative = path.relative(libResolved, resolved);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

export const comicsRouter = Router();

async function resolveStoredPageCount(comic: { id: string; path: string; format: string; pageCount: number }): Promise<number> {
  if (comic.pageCount > 0) return comic.pageCount;
  const extractor = getExtractor(comic.format as ComicFormat);
  try {
    const count = await extractor.count(comic.path);
    if (count > 0) return count;
  } catch {
    // fall back to list() below
  }
  try {
    return (await extractor.list(comic.path)).length;
  } catch {
    return 0;
  }
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function buildCoverPlaceholder(title: string): Buffer {
  const cleanTitle = title.trim() || "Percy's Library";
  const initials = Array.from(cleanTitle)
    .join("")
    .split(/\s+/)
    .flatMap((word) => Array.from(word.slice(0, 1)))
    .slice(0, 2)
    .join("")
    .toUpperCase() || "PL";
  const safeTitle = escapeXml(cleanTitle.length > 44 ? `${cleanTitle.slice(0, 41)}...` : cleanTitle);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="600" height="900" viewBox="0 0 600 900">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#111827"/>
          <stop offset="55%" stop-color="#0f172a"/>
          <stop offset="100%" stop-color="#020617"/>
        </linearGradient>
        <radialGradient id="r" cx="35%" cy="20%" r="80%">
          <stop offset="0%" stop-color="rgba(59,130,246,0.32)"/>
          <stop offset="100%" stop-color="rgba(59,130,246,0)"/>
        </radialGradient>
      </defs>
      <rect width="600" height="900" fill="url(#g)"/>
      <rect width="600" height="900" fill="url(#r)"/>
      <circle cx="510" cy="140" r="120" fill="rgba(59,130,246,0.08)"/>
      <circle cx="110" cy="760" r="180" fill="rgba(14,165,233,0.06)"/>
      <rect x="64" y="690" width="472" height="120" rx="28" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.08)"/>
      <text x="64" y="112" fill="#93c5fd" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="700" letter-spacing="5">PERCY'S LIBRARY</text>
      <text x="64" y="220" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="76" font-weight="900">${escapeXml(initials)}</text>
      <text x="64" y="318" fill="#e2e8f0" font-family="Arial, Helvetica, sans-serif" font-size="44" font-weight="800">${safeTitle}</text>
      <text x="64" y="372" fill="#94a3b8" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="600">Portada generada automáticamente</text>
    </svg>
  `.trim();
  return Buffer.from(svg);
}

// Bulk operations on a list of comics. The op string is intentionally a
// closed enum so the wire format is easy to validate and audit.
const bulkSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(500),
  op: z.enum([
    "favorite",
    "unfavorite",
    "markCompleted",
    "markUnread",
    "category",
    "categoryAdd",
    "categoryRemove",
    "delete",
  ]),
  // Used for op="category" (null clears the primary category) and as
  // the value to add/remove for op="categoryAdd"/"categoryRemove".
  category: z.string().nullable().optional(),
});

comicsRouter.post(
  "/bulk",
  asyncHandler(async (req, res) => {
    const ownerId = getOwnerId(req);
    const parsed = bulkSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    const { ids, op, category } = parsed.data;
    let affected = 0;
    switch (op) {
      case "favorite":
      case "unfavorite": {
        const r = await prisma.comic.updateMany({
          where: { ownerId, id: { in: ids } },
          data: { isFavorite: op === "favorite" },
        });
        affected = r.count;
        // Mirror the individual /favorite endpoint so favorite-based
        // achievements (fav-1, fav-5, library-curator, …) unlock right
        // away after a bulk operation.
        await evaluateAchievements(ownerId);
        break;
      }
      case "markCompleted": {
        // Move currentPage to the last index and flip completed=true.
        // Done in two queries because Prisma doesn't yet support "set
        // column to another column's value" in updateMany.
        const comics = await prisma.comic.findMany({
          where: { ownerId, id: { in: ids } },
          select: { id: true, pageCount: true },
        });
        await Promise.all(
          (comics as Array<{ id: string; pageCount: number }>).map((c: { id: string; pageCount: number }) =>
            prisma.comic.update({
              where: { id: c.id },
              data: {
                completed: true,
                currentPage: Math.max(0, c.pageCount - 1),
                lastReadAt: new Date(),
              },
            }),
          ),
        );
        affected = comics.length;
        await evaluateAchievements(ownerId);
        break;
      }
      case "markUnread": {
        const r = await prisma.comic.updateMany({
          where: { ownerId, id: { in: ids } },
          data: { completed: false, currentPage: 0 },
        });
        affected = r.count;
        break;
      }
      case "category": {
        // Replace the primary single category. We don't touch the
        // additive `categories` array here — the user can clear or
        // overwrite the legacy primary slot without losing tag
        // assignments. To merge into the array instead, callers should
        // use op="categoryAdd".
        const r = await prisma.comic.updateMany({
          where: { ownerId, id: { in: ids } },
          data: { category: category ?? null },
        });
        affected = r.count;
        break;
      }
      case "categoryAdd": {
        // Additive merge: read each comic's current categories array,
        // append the new value if not already present, and persist.
        // This is the fix for the wipe-out bug where assigning a new
        // category was overwriting the previous one.
        const value = (category ?? "").trim();
        if (!value) {
          affected = 0;
          break;
        }
        const targets = await prisma.comic.findMany({
          where: { ownerId, id: { in: ids } },
          select: { id: true, categories: true, category: true },
        });
        const updates = await Promise.all(
          targets
            .filter((c) => !c.categories.includes(value))
            .map((c) =>
              prisma.comic.update({
                where: { id: c.id },
                data: {
                  categories: { set: [...c.categories, value] },
                  // Seed the legacy primary slot with the first tag
                  // so older filters keep working for users who only
                  // ever apply one category.
                  ...(c.category ? {} : { category: value }),
                },
              }),
            ),
        );
        affected = updates.length;
        break;
      }
      case "categoryRemove": {
        const value = (category ?? "").trim();
        if (!value) {
          affected = 0;
          break;
        }
        const targets = await prisma.comic.findMany({
          where: { ownerId, id: { in: ids } },
          select: { id: true, categories: true, category: true },
        });
        const updates = await Promise.all(
          targets
            .filter((c) => c.categories.includes(value))
            .map((c) => {
              const nextArr = c.categories.filter((x) => x !== value);
              return prisma.comic.update({
                where: { id: c.id },
                data: {
                  categories: { set: nextArr },
                  // If the legacy primary was this value, fall back to
                  // the next remaining tag (or null if none) so the
                  // single-field UI stays consistent.
                  ...(c.category === value
                    ? { category: nextArr[0] ?? null }
                    : {}),
                },
              });
            }),
        );
        affected = updates.length;
        break;
      }
      case "delete": {
        const targets = await prisma.comic.findMany({
          where: { ownerId, id: { in: ids } },
          select: { id: true, path: true, format: true },
        });
        await Promise.all(
          targets.map(async (c) => {
            if (!isPathSafe(c.path)) {
              console.warn(`[percys] skipping unsafe path for comic ${c.id}: ${c.path}`);
              return;
            }
            try {
              if (c.format === "folder") {
                await fs.rm(c.path, { recursive: true, force: true });
              } else {
                await fs.unlink(c.path);
              }
            } catch (err) {
              // Log but still remove the DB row so the comic disappears
              // from the user's library; the orphan-cleanup pass picks
              // up the leftover file later.
              // eslint-disable-next-line no-console
              console.warn(
                `[percys] could not delete file for comic ${c.id} at ${c.path}:`,
                err,
              );
            }
          }),
        );
        const r = await prisma.comic.deleteMany({ where: { ownerId, id: { in: ids } } });
        affected = r.count;
        break;
      }
    }
    res.json({ ok: true, affected });
  }),
);

// "Surprise me" / shuffle endpoint — picks a comic uniformly at random
// from the requested scope. Use scope=in-progress to bias the selection
// toward a comic the user is already reading; defaults to `all`.
const randomScope = z.enum(["all", "unread", "in-progress", "favorites"]).default("all");

comicsRouter.get(
  "/random",
  asyncHandler(async (req, res) => {
    const ownerId = getOwnerId(req);
    const scope = randomScope.parse(req.query.scope ?? "all");
    const where: import("@prisma/client").Prisma.ComicWhereInput = { ownerId };
    if (scope === "favorites") where.isFavorite = true;
    else if (scope === "in-progress") {
      where.completed = false;
      where.currentPage = { gt: 0 };
    } else if (scope === "unread") {
      where.completed = false;
      where.currentPage = 0;
    }
    const total = await prisma.comic.count({ where });
    if (total === 0) return res.status(404).json({ error: "No comics in scope" });
    const skip = Math.floor(Math.random() * total);
    const [pick] = await prisma.comic.findMany({ where, skip, take: 1 });
    if (!pick) return res.status(404).json({ error: "No comic found" });
    res.json({
      id: pick.id,
      title: pick.title,
      format: pick.format,
      pageCount: pick.pageCount,
      currentPage: pick.currentPage,
      completed: pick.completed,
    });
  }),
);

comicsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const ownerId = getOwnerId(req);
    const comic = await prisma.comic.findFirst({ where: { id: req.params.id, ownerId } });
    if (!comic) return res.status(404).json({ error: "Not found" });
    const resolvedPageCount = await resolveStoredPageCount(comic);
    if (resolvedPageCount > 0 && resolvedPageCount !== comic.pageCount) {
      await prisma.comic.update({
        where: { id: comic.id },
        data: { pageCount: resolvedPageCount },
      });
    }
    res.json({
      id: comic.id,
      title: comic.title,
      format: comic.format,
      pageCount: resolvedPageCount > 0 ? resolvedPageCount : comic.pageCount,
      currentPage: comic.currentPage,
      completed: comic.completed,
      isFavorite: comic.isFavorite,
      category: comic.category,
      categories: comic.categories ?? [],
      sizeBytes: Number(comic.sizeBytes),
      lastZoom: comic.lastZoom,
    });
  }),
);

// Resolve the next comic in the same series for "continue reading" UX.
// Heuristic: comics living in the same parent directory, ordered by
// natural sort of their on-disk path. If the current comic is the last
// one in its folder we return null so the client can hide the prompt.
comicsRouter.get(
  "/:id/next",
  asyncHandler(async (req, res) => {
    const ownerId = getOwnerId(req);
    const current = await prisma.comic.findFirst({ where: { id: req.params.id, ownerId } });
    if (!current) return res.status(404).json({ error: "Not found" });
    const parent = path.dirname(current.path);
    const siblings = await prisma.comic.findMany({
      where: { ownerId, path: { startsWith: parent + path.sep } },
      orderBy: { path: "asc" },
    });
    type Sibling = {
      id: string;
      path: string;
      title: string;
      format: string;
      pageCount: number;
      currentPage: number;
      completed: boolean;
    };
    // findMany already sorts lexicographically; for natural ordering (so
    // "Vol 10" sorts after "Vol 2") we re-sort in JS by basename.
    const sorted = (siblings as Sibling[])
      .filter((c: Sibling) => path.dirname(c.path) === parent)
      .sort((a: Sibling, b: Sibling) => naturalCompare(path.basename(a.path), path.basename(b.path)));
    const idx = sorted.findIndex((c: Sibling) => c.id === current.id);
    const next = idx >= 0 ? sorted[idx + 1] : null;
    if (!next) return res.json({ next: null });
    res.json({
      next: {
        id: next.id,
        title: next.title,
        format: next.format,
        pageCount: next.pageCount,
        currentPage: next.currentPage,
        completed: next.completed,
      },
    });
  }),
);

comicsRouter.get(
  "/:id/cover",
  asyncHandler(async (req, res) => {
    const buf = await getCover(req.params.id);
    if (!buf) {
      const comic = await prisma.comic.findFirst({
        where: { id: req.params.id, ownerId: getOwnerId(req) },
        select: { title: true },
      });
      if (!comic) return res.status(404).end();
      const placeholder = buildCoverPlaceholder(comic.title);
      res.setHeader("Content-Type", "image/svg+xml");
      res.setHeader("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
      res.end(placeholder);
      return;
    }
    res.setHeader("Content-Type", detectMime(buf));
    res.setHeader("Cache-Control", "public, max-age=604800, stale-while-revalidate=86400");
    res.end(buf);
  }),
);

comicsRouter.get(
  "/:id/pages/:n",
  asyncHandler(async (req, res) => {
    const n = parseInt(req.params.n, 10);
    if (Number.isNaN(n) || n < 0) return res.status(400).end();
    let autoCrop: boolean;
    let quality: "high" | "balanced" | "fast" | undefined;
    if (req.query.crop === "1") autoCrop = true;
    else if (req.query.crop === "0") autoCrop = false;
    else {
      const ownerId = getOwnerId(req);
      const settings = await prisma.settings.findUnique({ where: { ownerId } });
      autoCrop = settings?.autoCropMargins ?? false;
    }
    // Quality may come from the URL (so the client can override per-tab)
    // or fall back to the user's setting. Unknown values silently default
    // to balanced — this stays compatible with old reader URLs.
    const q = String(req.query.q ?? "");
    if (q === "high" || q === "balanced" || q === "fast") {
      quality = q;
    } else {
      const ownerId = getOwnerId(req);
      const settings = await prisma.settings.findUnique({ where: { ownerId } });
      const s = settings?.imageQuality;
      quality = s === "high" || s === "balanced" || s === "fast" ? s : "balanced";
    }
    const page = await getPage(req.params.id, n, { autoCrop, quality });
    if (!page) {
      // The page didn't extract. Most often this is a stale pageCount
      // in the DB (the extractor over-counted at scan time, or the file
      // was rewritten with fewer pages). Re-ask the extractor in the
      // background so the next /comics/:id fetch returns the corrected
      // count and the client can clamp to a valid page.
      void refreshComicPageCount(req.params.id).catch(() => {});
      return res.status(404).end();
    }
    res.setHeader("Content-Type", page.mime);
    // The crop variant + quality are encoded in the URL query, so the
    // browser cache will naturally key separately for each combination.
    res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=3600");
    res.end(page.data);
  }),
);

comicsRouter.get(
  "/:id/thumbs/:n",
  asyncHandler(async (req, res) => {
    const n = parseInt(req.params.n, 10);
    if (Number.isNaN(n) || n < 0) return res.status(400).end();
    const buf = await getThumb(req.params.id, n);
    if (!buf) return res.status(404).end();
    res.setHeader("Content-Type", "image/webp");
    res.setHeader("Cache-Control", "public, max-age=604800, stale-while-revalidate=86400");
    res.end(buf);
  }),
);

const progressSchema = z.object({ page: z.number().int().min(0), completed: z.boolean().optional() });

comicsRouter.post(
  "/:id/progress",
  asyncHandler(async (req, res) => {
    const parsed = progressSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { page, completed } = parsed.data;
    const ownerId = getOwnerId(req);
    const comic = await prisma.comic.findFirst({ where: { id: req.params.id, ownerId } });
    if (!comic) return res.status(404).json({ error: "Not found" });
    // Clamp `page` to [0, pageCount-1] so a stale or malformed client can't
    // poison the row with a value that would render >100% progress in the
    // library grid.
    const hasPages = comic.pageCount > 0;
    const clampedPage = hasPages ? Math.min(Math.max(0, page), comic.pageCount - 1) : 0;
    const isCompleted = hasPages ? (completed ?? clampedPage >= comic.pageCount - 1) : false;
    await prisma.comic.update({
      where: { id: req.params.id },
      data: {
        currentPage: clampedPage,
        completed: isCompleted,
        lastReadAt: new Date(),
      },
    });
    await recordReadingDay(ownerId);
    await evaluateAchievements(ownerId);
    res.json({ ok: true, completed: isCompleted });
  }),
);

// Zoom is intentionally a separate endpoint. Folding it into /progress
// caused two real bugs in the previous iteration: (1) every zoom save
// went through recordReadingDay/evaluateAchievements, inflating pagesRead
// and racing the achievement engine; (2) the server's auto-detect of
// `completed` from `clampedPage >= pageCount - 1` mis-fires in
// double-spread mode (where the client uses pageCount-2 as the last
// start-of-spread), so a zoom save could overwrite completed=true back
// to false. Keeping zoom in its own route means it never touches
// lastReadAt, currentPage, or completed.
const zoomSchema = z.object({ zoom: z.number().min(0.5).max(4) });

comicsRouter.patch(
  "/:id/zoom",
  asyncHandler(async (req, res) => {
    const parsed = zoomSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const ownerId = getOwnerId(req);
    const exists = await prisma.comic.findFirst({ where: { id: req.params.id, ownerId }, select: { id: true } });
    if (!exists) return res.status(404).json({ error: "Not found" });
    await prisma.comic.update({
      where: { id: req.params.id },
      data: { lastZoom: parsed.data.zoom },
    });
    res.json({ ok: true });
  }),
);

const favoriteSchema = z.object({ favorite: z.boolean() });

comicsRouter.post(
  "/:id/favorite",
  asyncHandler(async (req, res) => {
    const parsed = favoriteSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const ownerId = getOwnerId(req);
    const exists = await prisma.comic.findFirst({ where: { id: req.params.id, ownerId }, select: { id: true } });
    if (!exists) return res.status(404).json({ error: "Not found" });
    await prisma.comic.update({ where: { id: req.params.id }, data: { isFavorite: parsed.data.favorite } });
    await evaluateAchievements(ownerId);
    res.json({ ok: true });
  }),
);

const categorySchema = z.object({ category: z.string().nullable() });

comicsRouter.post(
  "/:id/category",
  asyncHandler(async (req, res) => {
    const parsed = categorySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const ownerId = getOwnerId(req);
    const exists = await prisma.comic.findFirst({ where: { id: req.params.id, ownerId }, select: { id: true, categories: true } });
    if (!exists) return res.status(404).json({ error: "Not found" });
    const next = parsed.data.category;
    // Update the primary slot AND seed/keep the array consistent:
    // setting a non-null primary adds it to the array if missing;
    // clearing the primary leaves the array intact (use the bulk
    // categoryRemove op to drop a tag).
    const nextArray = next && !exists.categories.includes(next)
      ? [...exists.categories, next]
      : exists.categories;
    await prisma.comic.update({
      where: { id: req.params.id },
      data: {
        category: next,
        categories: { set: nextArray },
      },
    });
    res.json({ ok: true });
  }),
);

const categoryArraySchema = z.object({ categories: z.array(z.string().min(1).max(80)).max(50) });

comicsRouter.post(
  "/:id/categories",
  asyncHandler(async (req, res) => {
    const parsed = categoryArraySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const ownerId = getOwnerId(req);
    const exists = await prisma.comic.findFirst({ where: { id: req.params.id, ownerId }, select: { id: true } });
    if (!exists) return res.status(404).json({ error: "Not found" });
    // Dedupe + trim. The API replaces the full array — callers that
    // want to preserve previous tags should send the merged list.
    const seen = new Set<string>();
    const next: string[] = [];
    for (const raw of parsed.data.categories) {
      const v = raw.trim();
      if (!v || seen.has(v)) continue;
      seen.add(v);
      next.push(v);
    }
    await prisma.comic.update({
      where: { id: req.params.id },
      data: {
        categories: { set: next },
        // Keep the legacy primary in sync: prefer the existing primary
        // if it's still in the new list, otherwise fall back to the
        // first item (or null when the array is cleared).
        category: next[0] ?? null,
      },
    });
    res.json({ ok: true, categories: next });
  }),
);
