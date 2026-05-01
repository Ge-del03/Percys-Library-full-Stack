"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports._internal = void 0;
exports.getCover = getCover;
const node_path_1 = __importDefault(require("node:path"));
const promises_1 = __importDefault(require("node:fs/promises"));
const db_1 = require("../db");
const config_1 = require("../config");
const cache_1 = require("./cache");
const pipeline_1 = require("./pipeline");
const folder_1 = require("./extractors/folder");
const image_utils_1 = require("../lib/image-utils");
const natural_sort_1 = require("../lib/natural-sort");
async function findFolderCover(dir) {
    try {
        const entries = await promises_1.default.readdir(dir);
        const candidates = entries
            .filter((n) => /^(cover|folder|poster)\.(jpe?g|png|webp)$/i.test(n))
            .sort(natural_sort_1.naturalCompare);
        if (candidates[0])
            return promises_1.default.readFile(node_path_1.default.join(dir, candidates[0]));
        const firstImage = entries.filter(natural_sort_1.isImageName).sort(natural_sort_1.naturalCompare)[0];
        if (firstImage)
            return promises_1.default.readFile(node_path_1.default.join(dir, firstImage));
    }
    catch {
        /* ignore */
    }
    return null;
}
function looksValidCover(buf) {
    // Heuristic: very small images (< 6 KB) are usually credits/blanks.
    return buf.length > 6 * 1024;
}
async function getCover(comicId) {
    const cached = await cache_1.cache.readDisk("covers", cache_1.cache.coverKey(comicId));
    if (cached)
        return cached;
    const comic = await db_1.prisma.comic.findUnique({ where: { id: comicId } });
    if (!comic)
        return null;
    let raw = null;
    if (comic.format === "folder") {
        raw = await findFolderCover(comic.path);
    }
    else {
        const extractor = (0, pipeline_1.getExtractor)(comic.format);
        const max = Math.min(comic.pageCount, 4);
        for (let i = 0; i < max; i++) {
            try {
                const candidate = await extractor.page(comic.path, i);
                if (looksValidCover(candidate)) {
                    raw = candidate;
                    break;
                }
            }
            catch {
                continue;
            }
        }
        if (!raw && comic.pageCount > 0) {
            try {
                raw = await extractor.page(comic.path, 0);
            }
            catch {
                raw = null;
            }
        }
    }
    if (!raw)
        return null;
    let thumb;
    try {
        thumb = await (0, image_utils_1.makeThumbnail)(raw, config_1.config.coverWidth);
    }
    catch {
        return null;
    }
    await cache_1.cache.writeDisk("covers", cache_1.cache.coverKey(comicId), thumb);
    await cache_1.cache.pruneBucket("covers", 500 * 1024 * 1024);
    return thumb;
}
// Re-export for tests / future use
exports._internal = { findFolderCover, folderExtractor: folder_1.folderExtractor };
//# sourceMappingURL=covers.js.map