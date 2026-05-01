"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bookmarksRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const db_1 = require("../db");
const async_handler_1 = require("../lib/async-handler");
const owner_1 = require("../lib/owner");
exports.bookmarksRouter = (0, express_1.Router)();
const createSchema = zod_1.z.object({
    page: zod_1.z.number().int().nonnegative(),
    note: zod_1.z.string().max(280).optional(),
});
/** List bookmarks for a comic, oldest-first so the UI shows them in
 *  reading order. */
exports.bookmarksRouter.get("/comics/:id/bookmarks", (0, async_handler_1.asyncHandler)(async (req, res) => {
    const ownerId = (0, owner_1.getOwnerId)(req);
    const items = await db_1.prisma.bookmark.findMany({
        where: { ownerId, comicId: req.params.id },
        orderBy: [{ page: "asc" }, { createdAt: "asc" }],
    });
    res.json({ items });
}));
exports.bookmarksRouter.post("/comics/:id/bookmarks", (0, async_handler_1.asyncHandler)(async (req, res) => {
    const ownerId = (0, owner_1.getOwnerId)(req);
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: parsed.error.flatten() });
    const comic = await db_1.prisma.comic.findFirst({ where: { id: req.params.id, ownerId } });
    if (!comic)
        return res.status(404).json({ error: "Not found" });
    // Clamp page to the comic's range so a stale UI can't write garbage.
    const page = Math.max(0, Math.min(parsed.data.page, Math.max(0, comic.pageCount - 1)));
    const created = await db_1.prisma.bookmark.create({
        data: { ownerId, comicId: comic.id, page, note: parsed.data.note ?? null },
    });
    res.json({ bookmark: created });
}));
exports.bookmarksRouter.delete("/bookmarks/:bid", (0, async_handler_1.asyncHandler)(async (req, res) => {
    const ownerId = (0, owner_1.getOwnerId)(req);
    // Pre-check so a missing bookmark surfaces as 404 rather than the
    // P2025 thrown by prisma.delete bubbling up as a 500.
    const existing = await db_1.prisma.bookmark.findFirst({ where: { id: req.params.bid, ownerId } });
    if (!existing)
        return res.status(404).json({ error: "Bookmark not found" });
    await db_1.prisma.bookmark.delete({ where: { id: req.params.bid } });
    res.json({ ok: true });
}));
//# sourceMappingURL=bookmarks.js.map