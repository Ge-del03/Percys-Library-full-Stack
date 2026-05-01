"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPage = getPage;
exports.getThumb = getThumb;
const db_1 = require("../db");
const cache_1 = require("./cache");
const pipeline_1 = require("./pipeline");
const image_utils_1 = require("../lib/image-utils");
const config_1 = require("../config");
async function getPage(comicId, index, opts = {}) {
    const memKey = `${comicId}:${index}:${opts.autoCrop ? "crop" : "raw"}`;
    const memHit = cache_1.cache.mem.get(memKey);
    if (memHit)
        return { data: memHit, mime: (0, image_utils_1.detectMime)(memHit) };
    const diskKey = cache_1.cache.pageKey(comicId, index, opts.autoCrop ? "crop" : "raw");
    const diskHit = await cache_1.cache.readDisk("pages", diskKey);
    if (diskHit) {
        cache_1.cache.mem.set(memKey, diskHit);
        return { data: diskHit, mime: (0, image_utils_1.detectMime)(diskHit) };
    }
    const comic = await db_1.prisma.comic.findUnique({ where: { id: comicId } });
    if (!comic)
        return null;
    const extractor = (0, pipeline_1.getExtractor)(comic.format);
    let buf;
    try {
        buf = await extractor.page(comic.path, index);
    }
    catch {
        return null;
    }
    if (opts.autoCrop) {
        try {
            buf = await (0, image_utils_1.autoCropWhiteMargins)(buf);
        }
        catch {
            // fall back to original
        }
    }
    cache_1.cache.mem.set(memKey, buf);
    await cache_1.cache.writeDisk("pages", diskKey, buf);
    await cache_1.cache.pruneBucket("pages", 1024 * 1024 * 1024);
    return { data: buf, mime: (0, image_utils_1.detectMime)(buf) };
}
async function getThumb(comicId, index) {
    const key = cache_1.cache.thumbKey(comicId, index);
    const diskHit = await cache_1.cache.readDisk("thumbs", key);
    if (diskHit)
        return diskHit;
    const page = await getPage(comicId, index);
    if (!page)
        return null;
    let thumb;
    try {
        thumb = await (0, image_utils_1.makeThumbnail)(page.data, config_1.config.thumbWidth);
    }
    catch {
        return null;
    }
    await cache_1.cache.writeDisk("thumbs", key, thumb);
    await cache_1.cache.pruneBucket("thumbs", 256 * 1024 * 1024);
    return thumb;
}
//# sourceMappingURL=pages.js.map