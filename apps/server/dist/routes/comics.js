"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.comicsRouter = void 0;
const express_1 = require("express");
const node_path_1 = __importDefault(require("node:path"));
const promises_1 = __importDefault(require("node:fs/promises"));
const zod_1 = require("zod");
const db_1 = require("../db");
const covers_1 = require("../services/covers");
const pages_1 = require("../services/pages");
const achievements_1 = require("../services/achievements");
const async_handler_1 = require("../lib/async-handler");
const natural_sort_1 = require("../lib/natural-sort");
const owner_1 = require("../lib/owner");
exports.comicsRouter = (0, express_1.Router)();
// Bulk operations on a list of comics. The op string is intentionally a
// closed enum so the wire format is easy to validate and audit.
const bulkSchema = zod_1.z.object({
    ids: zod_1.z.array(zod_1.z.string().min(1)).min(1).max(500),
    op: zod_1.z.enum([
        "favorite",
        "unfavorite",
        "markCompleted",
        "markUnread",
        "category",
        "delete",
    ]),
    // Only used for op="category"; null clears the category.
    category: zod_1.z.string().nullable().optional(),
});
exports.comicsRouter.post("/bulk", (0, async_handler_1.asyncHandler)(async (req, res) => {
    const ownerId = (0, owner_1.getOwnerId)(req);
    const parsed = bulkSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
    }
    const { ids, op, category } = parsed.data;
    let affected = 0;
    switch (op) {
        case "favorite":
        case "unfavorite": {
            const r = await db_1.prisma.comic.updateMany({
                where: { ownerId, id: { in: ids } },
                data: { isFavorite: op === "favorite" },
            });
            affected = r.count;
            // Mirror the individual /favorite endpoint so favorite-based
            // achievements (fav-1, fav-5, library-curator, …) unlock right
            // away after a bulk operation.
            await (0, achievements_1.evaluateAchievements)(ownerId);
            break;
        }
        case "markCompleted": {
            // Move currentPage to the last index and flip completed=true.
            // Done in two queries because Prisma doesn't yet support "set
            // column to another column's value" in updateMany.
            const comics = await db_1.prisma.comic.findMany({
                where: { ownerId, id: { in: ids } },
                select: { id: true, pageCount: true },
            });
            await Promise.all(comics.map((c) => db_1.prisma.comic.update({
                where: { id: c.id },
                data: {
                    completed: true,
                    currentPage: Math.max(0, c.pageCount - 1),
                    lastReadAt: new Date(),
                },
            })));
            affected = comics.length;
            await (0, achievements_1.evaluateAchievements)(ownerId);
            break;
        }
        case "markUnread": {
            const r = await db_1.prisma.comic.updateMany({
                where: { ownerId, id: { in: ids } },
                data: { completed: false, currentPage: 0 },
            });
            affected = r.count;
            break;
        }
        case "category": {
            const r = await db_1.prisma.comic.updateMany({
                where: { ownerId, id: { in: ids } },
                data: { category: category ?? null },
            });
            affected = r.count;
            break;
        }
        case "delete": {
            const targets = await db_1.prisma.comic.findMany({
                where: { ownerId, id: { in: ids } },
                select: { id: true, path: true, format: true },
            });
            await Promise.all(targets.map(async (c) => {
                try {
                    if (c.format === "folder") {
                        await promises_1.default.rm(c.path, { recursive: true, force: true });
                    }
                    else {
                        await promises_1.default.unlink(c.path);
                    }
                }
                catch {
                    // If file deletion fails we still remove the DB row.
                }
            }));
            const r = await db_1.prisma.comic.deleteMany({ where: { ownerId, id: { in: ids } } });
            affected = r.count;
            break;
        }
    }
    res.json({ ok: true, affected });
}));
exports.comicsRouter.get("/:id", (0, async_handler_1.asyncHandler)(async (req, res) => {
    const ownerId = (0, owner_1.getOwnerId)(req);
    const comic = await db_1.prisma.comic.findFirst({ where: { id: req.params.id, ownerId } });
    if (!comic)
        return res.status(404).json({ error: "Not found" });
    res.json({
        id: comic.id,
        title: comic.title,
        format: comic.format,
        pageCount: comic.pageCount,
        currentPage: comic.currentPage,
        completed: comic.completed,
        isFavorite: comic.isFavorite,
        category: comic.category,
        sizeBytes: Number(comic.sizeBytes),
        lastZoom: comic.lastZoom,
    });
}));
// Resolve the next comic in the same series for "continue reading" UX.
// Heuristic: comics living in the same parent directory, ordered by
// natural sort of their on-disk path. If the current comic is the last
// one in its folder we return null so the client can hide the prompt.
exports.comicsRouter.get("/:id/next", (0, async_handler_1.asyncHandler)(async (req, res) => {
    const ownerId = (0, owner_1.getOwnerId)(req);
    const current = await db_1.prisma.comic.findFirst({ where: { id: req.params.id, ownerId } });
    if (!current)
        return res.status(404).json({ error: "Not found" });
    const parent = node_path_1.default.dirname(current.path);
    const siblings = await db_1.prisma.comic.findMany({
        where: { ownerId, path: { startsWith: parent + node_path_1.default.sep } },
        orderBy: { path: "asc" },
    });
    // findMany already sorts lexicographically; for natural ordering (so
    // "Vol 10" sorts after "Vol 2") we re-sort in JS by basename.
    const sorted = siblings
        .filter((c) => node_path_1.default.dirname(c.path) === parent)
        .sort((a, b) => (0, natural_sort_1.naturalCompare)(node_path_1.default.basename(a.path), node_path_1.default.basename(b.path)));
    const idx = sorted.findIndex((c) => c.id === current.id);
    const next = idx >= 0 ? sorted[idx + 1] : null;
    if (!next)
        return res.json({ next: null });
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
}));
exports.comicsRouter.get("/:id/cover", (0, async_handler_1.asyncHandler)(async (req, res) => {
    const buf = await (0, covers_1.getCover)(req.params.id);
    if (!buf)
        return res.status(404).end();
    res.setHeader("Content-Type", "image/webp");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.end(buf);
}));
exports.comicsRouter.get("/:id/pages/:n", (0, async_handler_1.asyncHandler)(async (req, res) => {
    const n = parseInt(req.params.n, 10);
    if (Number.isNaN(n) || n < 0)
        return res.status(400).end();
    let autoCrop;
    if (req.query.crop === "1")
        autoCrop = true;
    else if (req.query.crop === "0")
        autoCrop = false;
    else {
        const ownerId = (0, owner_1.getOwnerId)(req);
        const settings = await db_1.prisma.settings.findUnique({ where: { ownerId } });
        autoCrop = settings?.autoCropMargins ?? false;
    }
    const page = await (0, pages_1.getPage)(req.params.id, n, { autoCrop });
    if (!page)
        return res.status(404).end();
    res.setHeader("Content-Type", page.mime);
    // The crop variant is encoded in the URL query, so the browser cache
    // will naturally key separately for cropped vs raw pages.
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.end(page.data);
}));
exports.comicsRouter.get("/:id/thumbs/:n", (0, async_handler_1.asyncHandler)(async (req, res) => {
    const n = parseInt(req.params.n, 10);
    if (Number.isNaN(n) || n < 0)
        return res.status(400).end();
    const buf = await (0, pages_1.getThumb)(req.params.id, n);
    if (!buf)
        return res.status(404).end();
    res.setHeader("Content-Type", "image/webp");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.end(buf);
}));
const progressSchema = zod_1.z.object({ page: zod_1.z.number().int().min(0), completed: zod_1.z.boolean().optional() });
exports.comicsRouter.post("/:id/progress", (0, async_handler_1.asyncHandler)(async (req, res) => {
    const parsed = progressSchema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: parsed.error.flatten() });
    const { page, completed } = parsed.data;
    const ownerId = (0, owner_1.getOwnerId)(req);
    const comic = await db_1.prisma.comic.findFirst({ where: { id: req.params.id, ownerId } });
    if (!comic)
        return res.status(404).json({ error: "Not found" });
    // Clamp `page` to [0, pageCount-1] so a stale or malformed client can't
    // poison the row with a value that would render >100% progress in the
    // library grid.
    const hasPages = comic.pageCount > 0;
    const clampedPage = hasPages ? Math.min(Math.max(0, page), comic.pageCount - 1) : 0;
    const isCompleted = hasPages ? (completed ?? clampedPage >= comic.pageCount - 1) : false;
    await db_1.prisma.comic.update({
        where: { id: req.params.id },
        data: {
            currentPage: clampedPage,
            completed: isCompleted,
            lastReadAt: new Date(),
        },
    });
    await (0, achievements_1.recordReadingDay)(ownerId);
    await (0, achievements_1.evaluateAchievements)(ownerId);
    res.json({ ok: true, completed: isCompleted });
}));
// Zoom is intentionally a separate endpoint. Folding it into /progress
// caused two real bugs in the previous iteration: (1) every zoom save
// went through recordReadingDay/evaluateAchievements, inflating pagesRead
// and racing the achievement engine; (2) the server's auto-detect of
// `completed` from `clampedPage >= pageCount - 1` mis-fires in
// double-spread mode (where the client uses pageCount-2 as the last
// start-of-spread), so a zoom save could overwrite completed=true back
// to false. Keeping zoom in its own route means it never touches
// lastReadAt, currentPage, or completed.
const zoomSchema = zod_1.z.object({ zoom: zod_1.z.number().min(0.5).max(4) });
exports.comicsRouter.patch("/:id/zoom", (0, async_handler_1.asyncHandler)(async (req, res) => {
    const parsed = zoomSchema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: parsed.error.flatten() });
    const ownerId = (0, owner_1.getOwnerId)(req);
    const exists = await db_1.prisma.comic.findFirst({ where: { id: req.params.id, ownerId }, select: { id: true } });
    if (!exists)
        return res.status(404).json({ error: "Not found" });
    await db_1.prisma.comic.update({
        where: { id: req.params.id },
        data: { lastZoom: parsed.data.zoom },
    });
    res.json({ ok: true });
}));
const favoriteSchema = zod_1.z.object({ favorite: zod_1.z.boolean() });
exports.comicsRouter.post("/:id/favorite", (0, async_handler_1.asyncHandler)(async (req, res) => {
    const parsed = favoriteSchema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: parsed.error.flatten() });
    const ownerId = (0, owner_1.getOwnerId)(req);
    const exists = await db_1.prisma.comic.findFirst({ where: { id: req.params.id, ownerId }, select: { id: true } });
    if (!exists)
        return res.status(404).json({ error: "Not found" });
    await db_1.prisma.comic.update({ where: { id: req.params.id }, data: { isFavorite: parsed.data.favorite } });
    await (0, achievements_1.evaluateAchievements)(ownerId);
    res.json({ ok: true });
}));
const categorySchema = zod_1.z.object({ category: zod_1.z.string().nullable() });
exports.comicsRouter.post("/:id/category", (0, async_handler_1.asyncHandler)(async (req, res) => {
    const parsed = categorySchema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: parsed.error.flatten() });
    const ownerId = (0, owner_1.getOwnerId)(req);
    const exists = await db_1.prisma.comic.findFirst({ where: { id: req.params.id, ownerId }, select: { id: true } });
    if (!exists)
        return res.status(404).json({ error: "Not found" });
    await db_1.prisma.comic.update({ where: { id: req.params.id }, data: { category: parsed.data.category } });
    res.json({ ok: true });
}));
//# sourceMappingURL=comics.js.map