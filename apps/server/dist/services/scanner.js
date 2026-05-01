"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.scanLibrary = scanLibrary;
exports.cleanupUploadOrphans = cleanupUploadOrphans;
exports.registerComicPath = registerComicPath;
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const config_1 = require("../config");
const db_1 = require("../db");
const pipeline_1 = require("./pipeline");
const natural_sort_1 = require("../lib/natural-sort");
async function isFolderComic(dir) {
    try {
        const entries = await promises_1.default.readdir(dir, { withFileTypes: true });
        const imageCount = entries.filter((e) => e.isFile() && (0, natural_sort_1.isImageName)(e.name)).length;
        return imageCount >= 1;
    }
    catch {
        return false;
    }
}
async function folderSizeBytes(dir) {
    try {
        const entries = await promises_1.default.readdir(dir, { withFileTypes: true });
        let total = 0n;
        for (const e of entries) {
            if (!e.isFile() || !(0, natural_sort_1.isImageName)(e.name))
                continue;
            try {
                const stat = await promises_1.default.stat(node_path_1.default.join(dir, e.name));
                total += BigInt(stat.size);
            }
            catch {
                // ignore individual file errors
            }
        }
        return total;
    }
    catch {
        return 0n;
    }
}
async function computeSizeBytes(p, fmt) {
    if (fmt === "folder")
        return folderSizeBytes(p);
    try {
        const stat = await promises_1.default.stat(p);
        return BigInt(stat.size);
    }
    catch {
        return 0n;
    }
}
// Module-level lock so the startup background scan and a user-triggered
// POST /api/library/scan never race. Concurrent callers piggyback on the
// in-flight scan instead of starting a duplicate traversal that would
// hit unique-constraint violations on `Comic.path`.
const inFlightByOwner = new Map();
function scanLibrary(ownerId = "default") {
    const existing = inFlightByOwner.get(ownerId);
    if (existing)
        return existing;
    const next = runScan(ownerId).finally(() => {
        inFlightByOwner.delete(ownerId);
    });
    inFlightByOwner.set(ownerId, next);
    return next;
}
async function runScan(ownerId) {
    const root = config_1.config.libraryPath;
    await promises_1.default.mkdir(root, { recursive: true });
    // Files inside `_uploads/` are managed exclusively by the upload
    // endpoint and bulk-delete: scanning must not auto-add untracked
    // siblings (it would resurrect comics the user deleted) and must not
    // auto-remove tracked uploads either. We treat the directory as
    // opaque from the scanner's point of view.
    const uploadsDir = node_path_1.default.join(root, "_uploads");
    const uploadsPrefix = uploadsDir + node_path_1.default.sep;
    const isInsideUploads = (p) => p === uploadsDir || p.startsWith(uploadsPrefix);
    const seen = new Set();
    let added = 0;
    async function walk(dir) {
        if (isInsideUploads(dir))
            return;
        const entries = await promises_1.default.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = node_path_1.default.join(dir, entry.name);
            if (isInsideUploads(fullPath))
                continue;
            if (entry.isDirectory()) {
                const isFolder = await isFolderComic(fullPath);
                if (isFolder) {
                    if (await register(fullPath, "folder"))
                        seen.add(fullPath);
                }
                else {
                    // Only descend when the directory is not itself a folder comic, so we
                    // avoid registering nested image directories twice.
                    await walk(fullPath);
                }
            }
            else if (entry.isFile()) {
                const fmt = (0, pipeline_1.detectFormat)(entry.name, false);
                if (fmt) {
                    if (await register(fullPath, fmt))
                        seen.add(fullPath);
                }
            }
        }
    }
    async function register(p, fmt) {
        const result = await registerComicPath(ownerId, p, fmt);
        if (result === "added")
            added += 1;
        return result !== "skipped";
    }
    await walk(root);
    // Remove DB rows for comics that no longer exist on disk, but skip
    // anything inside `_uploads/` — those are managed by the upload
    // endpoint and bulk-delete, never by the scanner.
    const all = (await db_1.prisma.comic.findMany({
        where: { ownerId },
        select: { id: true, path: true },
    }));
    const missing = all.filter((c) => !isInsideUploads(c.path) && !seen.has(c.path));
    if (missing.length) {
        await db_1.prisma.comic.deleteMany({
            where: { id: { in: missing.map((m) => m.id) } },
        });
    }
    const total = await db_1.prisma.comic.count({ where: { ownerId } });
    return { added, removed: missing.length, total };
}
/**
 * Delete files inside `_uploads/` that have no corresponding DB row.
 * These are leftovers from prior versions where bulk-delete or upload
 * deduplication failed to clean up properly. Older files only — recent
 * files might be uploads still being processed.
 *
 * Returns the number of orphaned files removed.
 */
async function cleanupUploadOrphans(options = {}) {
    const minAgeMs = options.minAgeMs ?? 60_000; // 1 minute default
    const uploadsDir = node_path_1.default.join(config_1.config.libraryPath, "_uploads");
    let entries;
    try {
        entries = await promises_1.default.readdir(uploadsDir, { withFileTypes: true });
    }
    catch {
        return 0;
    }
    if (entries.length === 0)
        return 0;
    const fullPaths = entries
        .filter((e) => e.isFile() || e.isDirectory())
        .map((e) => node_path_1.default.join(uploadsDir, e.name));
    const known = await db_1.prisma.comic.findMany({
        where: { path: { in: fullPaths } },
        select: { path: true },
    });
    const knownSet = new Set(known.map((k) => k.path));
    const now = Date.now();
    let removed = 0;
    for (const p of fullPaths) {
        if (knownSet.has(p))
            continue;
        try {
            const stat = await promises_1.default.stat(p);
            if (now - stat.mtimeMs < minAgeMs)
                continue;
            if (stat.isDirectory()) {
                await promises_1.default.rm(p, { recursive: true, force: true });
            }
            else {
                await promises_1.default.unlink(p);
            }
            removed += 1;
        }
        catch {
            // ignore individual failures
        }
    }
    return removed;
}
/**
 * Register a single comic path (file or folder) for a given owner without
 * touching unrelated rows. Used by the upload endpoint so importing a new
 * file doesn't drag previously-deleted-but-still-on-disk siblings back
 * into the library via a full re-scan.
 *
 * Returns `"added"` if a new row was created, `"updated"` if an existing
 * row was refreshed, or `"skipped"` if the source is unreadable / empty.
 */
async function registerComicPath(ownerId, p, fmt) {
    let pageCount = 0;
    try {
        pageCount = await (0, pipeline_1.getExtractor)(fmt).count(p);
    }
    catch {
        pageCount = 0;
    }
    if (pageCount <= 0)
        return "skipped";
    const existing = await db_1.prisma.comic.findUnique({
        where: { ownerId_path: { ownerId, path: p } },
    });
    const sizeBytes = await computeSizeBytes(p, fmt);
    const title = node_path_1.default.basename(p).replace(/\.(cbz|cbr|pdf|zip|rar)$/i, "");
    if (!existing) {
        await db_1.prisma.comic.create({
            data: { ownerId, path: p, title, format: fmt, pageCount, sizeBytes },
        });
        return "added";
    }
    const clampedPage = Math.min(Math.max(0, existing.currentPage), Math.max(0, pageCount - 1));
    const normalizedCompleted = clampedPage >= pageCount - 1;
    await db_1.prisma.comic.update({
        where: { id: existing.id },
        data: {
            title,
            format: fmt,
            pageCount,
            sizeBytes,
            currentPage: clampedPage,
            completed: normalizedCompleted,
        },
    });
    return "updated";
}
//# sourceMappingURL=scanner.js.map