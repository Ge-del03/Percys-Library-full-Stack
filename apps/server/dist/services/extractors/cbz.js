"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cbzExtractor = void 0;
const adm_zip_1 = __importDefault(require("adm-zip"));
const natural_sort_1 = require("../../lib/natural-sort");
const archive_cache_1 = require("../archive-cache");
async function getZipMetadata(filePath) {
    const cacheKey = `metadata:cbz:${filePath}`;
    const cached = archive_cache_1.archiveCache.get(cacheKey);
    if (cached)
        return cached;
    const zip = new adm_zip_1.default(filePath);
    const entries = zip
        .getEntries()
        .filter((e) => !e.isDirectory && (0, natural_sort_1.isImageName)(e.entryName))
        .sort((a, b) => (0, natural_sort_1.naturalCompare)(a.entryName, b.entryName))
        .map(e => ({ entryName: e.entryName }));
    archive_cache_1.archiveCache.set(cacheKey, entries);
    return entries;
}
exports.cbzExtractor = {
    async count(filePath) {
        const entries = await getZipMetadata(filePath);
        return entries.length;
    },
    async list(filePath) {
        const entries = await getZipMetadata(filePath);
        return entries.map((e, i) => ({ index: i, name: e.entryName }));
    },
    async page(filePath, index) {
        const entries = await getZipMetadata(filePath);
        const meta = entries[index];
        if (!meta)
            throw new Error(`Page ${index} not found in CBZ`);
        // Re-open zip for extraction to avoid keeping large objects in memory.
        const zip = new adm_zip_1.default(filePath);
        const entry = zip.getEntry(meta.entryName);
        if (!entry)
            throw new Error(`Entry ${meta.entryName} not found in CBZ`);
        return entry.getData();
    },
};
//# sourceMappingURL=cbz.js.map