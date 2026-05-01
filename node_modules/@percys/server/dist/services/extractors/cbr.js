"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cbrExtractor = void 0;
const promises_1 = __importDefault(require("node:fs/promises"));
const node_unrar_js_1 = require("node-unrar-js");
const natural_sort_1 = require("../../lib/natural-sort");
const archive_cache_1 = require("../archive-cache");
async function getRarMetadata(filePath) {
    const cacheKey = `metadata:cbr:${filePath}`;
    const cached = archive_cache_1.archiveCache.get(cacheKey);
    if (cached)
        return cached;
    // We read the file to get the list, but we don't store the buffer in the cache.
    const buf = await promises_1.default.readFile(filePath);
    const data = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const extractor = await (0, node_unrar_js_1.createExtractorFromData)({ data });
    const list = extractor.getFileList();
    const files = Array.from(list.fileHeaders)
        .filter((f) => !f.flags.directory && !f.flags.encrypted && (0, natural_sort_1.isImageName)(f.name))
        .sort((a, b) => (0, natural_sort_1.naturalCompare)(a.name, b.name))
        .map((f) => ({ name: f.name }));
    archive_cache_1.archiveCache.set(cacheKey, files);
    return files;
}
exports.cbrExtractor = {
    async count(filePath) {
        const files = await getRarMetadata(filePath);
        return files.length;
    },
    async list(filePath) {
        const files = await getRarMetadata(filePath);
        return files.map((f, i) => ({ index: i, name: f.name }));
    },
    async page(filePath, index) {
        const files = await getRarMetadata(filePath);
        const target = files[index];
        if (!target)
            throw new Error(`Page ${index} not found in CBR`);
        // For the actual extraction, we read the file again. This avoids keeping
        // all open comics in RAM simultaneously, which prevents OOM on large libraries.
        const buf = await promises_1.default.readFile(filePath);
        const data = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
        const extractor = await (0, node_unrar_js_1.createExtractorFromData)({ data });
        const extracted = extractor.extract({ files: [target.name] });
        const fileArr = [...extracted.files];
        const entry = fileArr[0];
        if (!entry || !entry.extraction)
            throw new Error("CBR extraction failed");
        return Buffer.from(entry.extraction);
    },
};
//# sourceMappingURL=cbr.js.map