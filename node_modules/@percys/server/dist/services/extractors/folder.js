"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.folderExtractor = void 0;
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const natural_sort_1 = require("../../lib/natural-sort");
const archive_cache_1 = require("../archive-cache");
async function getFolder(dir) {
    const cached = archive_cache_1.archiveCache.get(dir);
    if (cached)
        return cached;
    const entries = await promises_1.default.readdir(dir, { withFileTypes: true });
    const names = entries
        .filter((e) => e.isFile() && (0, natural_sort_1.isImageName)(e.name))
        .map((e) => e.name)
        .sort(natural_sort_1.naturalCompare);
    archive_cache_1.archiveCache.set(dir, names);
    return names;
}
exports.folderExtractor = {
    async count(dir) {
        const names = await getFolder(dir);
        return names.length;
    },
    async list(dir) {
        const names = await getFolder(dir);
        return names.map((name, i) => ({ index: i, name }));
    },
    async page(dir, index) {
        const names = await getFolder(dir);
        const name = names[index];
        if (!name)
            throw new Error(`Page ${index} not found in folder`);
        return promises_1.default.readFile(node_path_1.default.join(dir, name));
    },
};
//# sourceMappingURL=folder.js.map