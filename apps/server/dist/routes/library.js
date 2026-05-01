"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.libraryRouter = void 0;
const express_1 = require("express");
const node_path_1 = __importDefault(require("node:path"));
const node_fs_1 = __importDefault(require("node:fs"));
const multer_1 = __importDefault(require("multer"));
const db_1 = require("../db");
const config_1 = require("../config");
const scanner_1 = require("../services/scanner");
const pipeline_1 = require("../services/pipeline");
const async_handler_1 = require("../lib/async-handler");
const owner_1 = require("../lib/owner");
exports.libraryRouter = (0, express_1.Router)();
// Allow CBZ/CBR/PDF uploads only; everything else is rejected at the
// middleware level so we never write rogue files into the library.
const ALLOWED_EXT = new Set([".cbz", ".cbr", ".pdf", ".zip", ".rar"]);
// 2 GB hard cap per file. Realistic comic archives sit well below this; we
// still bound it to avoid accidental DoS via a single huge upload.
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024;
function normalizeTitle(input) {
    return input
        .toLowerCase()
        .replace(/\.(cbz|cbr|pdf|zip|rar)$/i, "")
        .replace(/-\w{4,}$/g, "")
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}
const upload = (0, multer_1.default)({
    storage: multer_1.default.diskStorage({
        destination: (_req, _file, cb) => {
            // Drop uploads into a dedicated subfolder so accidental cleanups
            // don't blow away the user's manually-curated tree.
            const dir = node_path_1.default.join(config_1.config.libraryPath, "_uploads");
            node_fs_1.default.mkdirSync(dir, { recursive: true });
            cb(null, dir);
        },
        filename: (_req, file, cb) => {
            // Preserve the original name but make it filesystem-safe and
            // unique within the upload dir to avoid collisions.
            const base = node_path_1.default
                .basename(file.originalname)
                .replace(/[\\/:*?"<>|]/g, "_")
                .slice(0, 200);
            const ext = node_path_1.default.extname(base).toLowerCase();
            const stem = node_path_1.default.basename(base, ext);
            const stamp = Date.now().toString(36);
            cb(null, `${stem}-${stamp}${ext}`);
        },
    }),
    limits: { fileSize: MAX_UPLOAD_BYTES },
    fileFilter: (_req, file, cb) => {
        const ext = node_path_1.default.extname(file.originalname).toLowerCase();
        if (!ALLOWED_EXT.has(ext)) {
            return cb(new Error(`Formato no soportado: ${ext || "(sin extensión)"}`));
        }
        cb(null, true);
    },
});
exports.libraryRouter.get("/", (0, async_handler_1.asyncHandler)(async (req, res) => {
    const ownerId = (0, owner_1.getOwnerId)(req);
    const comics = await db_1.prisma.comic.findMany({ where: { ownerId }, orderBy: [{ updatedAt: "desc" }] });
    res.json(comics.map((c) => ({
        id: c.id,
        title: c.title,
        format: c.format,
        pageCount: c.pageCount,
        currentPage: c.currentPage,
        completed: c.completed,
        isFavorite: c.isFavorite,
        category: c.category,
        addedAt: c.addedAt,
        updatedAt: c.updatedAt,
        lastReadAt: c.lastReadAt,
        sizeBytes: Number(c.sizeBytes),
        lastZoom: c.lastZoom,
    })));
}));
exports.libraryRouter.post("/scan", (0, async_handler_1.asyncHandler)(async (req, res) => {
    const ownerId = (0, owner_1.getOwnerId)(req);
    const result = await (0, scanner_1.scanLibrary)(ownerId);
    res.json(result);
}));
// Accepts one or more comic files (CBZ / CBR / PDF). Files land under
// `<libraryPath>/_uploads/` and trigger an immediate scan so the new
// comics show up without an explicit second request.
exports.libraryRouter.post("/upload", (req, res, next) => {
    // multer pushes its own MulterError + filter errors through `next`. We
    // want a 400 with the human message instead of the generic 500 so the
    // upload UI can surface the cause to the user.
    upload.array("files", 50)(req, res, (err) => {
        if (!err)
            return next();
        const msg = err instanceof Error ? err.message : "Error subiendo archivo";
        res.status(400).json({ error: msg });
    });
}, (0, async_handler_1.asyncHandler)(async (req, res) => {
    const ownerId = (0, owner_1.getOwnerId)(req);
    const files = (req.files ?? []).filter(Boolean);
    if (files.length === 0) {
        return res.status(400).json({ error: "No se enviaron archivos" });
    }
    const existing = await db_1.prisma.comic.findMany({
        where: { ownerId },
        select: { title: true },
    });
    const existingTitles = new Set(existing.map((c) => normalizeTitle(c.title)));
    const seenBatch = new Set();
    const accepted = [];
    const skipped = [];
    for (const file of files) {
        const key = normalizeTitle(file.originalname);
        if (!key) {
            accepted.push(file);
            continue;
        }
        if (existingTitles.has(key)) {
            skipped.push({ name: file.originalname, reason: "already-exists" });
            void node_fs_1.default.promises.unlink(file.path).catch(() => undefined);
            continue;
        }
        if (seenBatch.has(key)) {
            skipped.push({ name: file.originalname, reason: "duplicated-in-batch" });
            void node_fs_1.default.promises.unlink(file.path).catch(() => undefined);
            continue;
        }
        seenBatch.add(key);
        accepted.push(file);
    }
    // Register only the freshly-uploaded paths instead of running a full
    // scan over `_uploads/`. Two reasons:
    //   1. A full walk would resurrect files that were deleted from the
    //      DB but linger on disk (e.g. unlink races, manual cleanup
    //      pending), which is exactly the bug users were hitting where
    //      "old comics come back when I import a new one".
    //   2. It's much faster: parsing N new files instead of every file
    //      that has ever been uploaded.
    let added = 0;
    for (const file of accepted) {
        const fmt = (0, pipeline_1.detectFormat)(file.path, false);
        if (!fmt)
            continue;
        try {
            const result = await (0, scanner_1.registerComicPath)(ownerId, file.path, fmt);
            if (result === "added")
                added += 1;
        }
        catch (err) {
            // Best-effort: skip the file but keep going so one bad upload
            // doesn't sink the whole batch.
            console.error("Failed to register uploaded comic", file.path, err);
        }
    }
    const total = await db_1.prisma.comic.count({ where: { ownerId } });
    res.json({
        uploaded: accepted.map((f) => ({ name: f.originalname, size: f.size })),
        skipped,
        added,
        removed: 0,
        total,
    });
}));
//# sourceMappingURL=library.js.map