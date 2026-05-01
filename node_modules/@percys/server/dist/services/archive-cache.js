"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.archiveCache = void 0;
const lru_cache_1 = require("lru-cache");
/**
 * Caches the list of pages (names/entries) for each comic file/folder.
 * This prevents reading the entire central directory of a ZIP/RAR or
 * doing a readdir() on every single page request.
 */
exports.archiveCache = new lru_cache_1.LRUCache({
    max: 100, // Cache up to 100 recently opened comics
    ttl: 1000 * 60 * 60, // 1 hour
    dispose: (value) => {
        // If it's a PDF document, destroy it to free memory
        if (value && typeof value.destroy === "function") {
            value.destroy().catch(() => { });
        }
    }
});
//# sourceMappingURL=archive-cache.js.map