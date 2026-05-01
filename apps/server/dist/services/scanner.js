"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.scanLibrary = scanLibrary;
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
    const seen = new Set();
    let added = 0;
    async function walk(dir) {
        const entries = await promises_1.default.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = node_path_1.default.join(dir, entry.name);
            if (entry.isDirectory()) {
                const isFolder = await isFolderComic(fullPath);
                if (isFolder) {
                    await register(fullPath, "folder");
                }
                else {
                    // Only descend when the directory is not itself a folder comic, so we
                    // avoid registering nested image directories twice.
                    await walk(fullPath);
                }
            }
            else if (entry.isFile()) {
                const fmt = (0, pipeline_1.detectFormat)(entry.name, false);
                if (fmt)
                    await register(fullPath, fmt);
            }
        }
    }
    async function register(p, fmt) {
        const existing = await db_1.prisma.comic.findUnique({ where: { ownerId_path: { ownerId, path: p } } });
        let pageCount = 0;
        try {
            pageCount = await (0, pipeline_1.getExtractor)(fmt).count(p);
        }
        catch {
            pageCount = 0;
        }
        // Ignore broken/empty sources so the library only shows readable comics.
        // If a previously indexed item becomes unreadable (corrupt file, empty
        // folder), we intentionally leave it out of `seen` so the cleanup phase
        // below removes the stale DB row.
        if (pageCount <= 0) {
            return;
        }
        let sizeBytes = 0n;
        if (fmt === "folder") {
            sizeBytes = await folderSizeBytes(p);
        }
        else {
            try {
                const stat = await promises_1.default.stat(p);
                sizeBytes = BigInt(stat.size);
            }
            catch {
                sizeBytes = 0n;
            }
        }
        seen.add(p);
        const title = node_path_1.default.basename(p).replace(/\.(cbz|cbr|pdf|zip|rar)$/i, "");
        if (!existing) {
            await db_1.prisma.comic.create({
                data: {
                    ownerId,
                    path: p,
                    title,
                    format: fmt,
                    pageCount,
                    sizeBytes,
                },
            });
            added += 1;
            return;
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
    }
    await walk(root);
    // Remove comics that no longer exist on disk
    const all = (await db_1.prisma.comic.findMany({
        where: { ownerId },
        select: { id: true, path: true },
    }));
    const missing = all.filter((c) => !seen.has(c.path));
    if (missing.length) {
        await db_1.prisma.comic.deleteMany({
            where: { id: { in: missing.map((m) => m.id) } },
        });
    }
    const total = await db_1.prisma.comic.count({ where: { ownerId } });
    return { added, removed: missing.length, total };
}
//# sourceMappingURL=scanner.js.map