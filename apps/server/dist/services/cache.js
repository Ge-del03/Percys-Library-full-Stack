"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cache = void 0;
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const node_crypto_1 = __importDefault(require("node:crypto"));
const lru_cache_1 = require("lru-cache");
const config_1 = require("../config");
const memCache = new lru_cache_1.LRUCache({
    max: config_1.config.pageMemoryCacheItems,
    maxSize: 256 * 1024 * 1024,
    sizeCalculation: (buf) => buf.length,
});
function hashKey(parts) {
    return node_crypto_1.default.createHash("sha1").update(parts.join("|")).digest("hex");
}
async function ensureDir(dir) {
    await promises_1.default.mkdir(dir, { recursive: true });
}
exports.cache = {
    mem: memCache,
    async readDisk(bucket, key) {
        const file = node_path_1.default.join(config_1.config.cacheDir, bucket, key);
        try {
            return await promises_1.default.readFile(file);
        }
        catch {
            return null;
        }
    },
    async writeDisk(bucket, key, data) {
        const dir = node_path_1.default.join(config_1.config.cacheDir, bucket);
        await ensureDir(dir);
        await promises_1.default.writeFile(node_path_1.default.join(dir, key), data);
    },
    pageKey(comicId, index, suffix = "raw") {
        return `${hashKey([comicId, String(index), suffix])}.bin`;
    },
    thumbKey(comicId, index) {
        return `${hashKey([comicId, String(index)])}.webp`;
    },
    coverKey(comicId) {
        return `${hashKey([comicId, "cover"])}.webp`;
    },
    async pruneBucket(bucket, maxBytes) {
        const dir = node_path_1.default.join(config_1.config.cacheDir, bucket);
        let entries = [];
        try {
            const names = await promises_1.default.readdir(dir);
            for (const name of names) {
                const stat = await promises_1.default.stat(node_path_1.default.join(dir, name));
                entries.push({ name, size: stat.size, atime: stat.atimeMs });
            }
        }
        catch {
            return;
        }
        let total = entries.reduce((acc, e) => acc + e.size, 0);
        if (total <= maxBytes)
            return;
        entries = entries.sort((a, b) => a.atime - b.atime);
        for (const e of entries) {
            if (total <= maxBytes)
                break;
            try {
                await promises_1.default.unlink(node_path_1.default.join(dir, e.name));
                total -= e.size;
            }
            catch {
                // ignore
            }
        }
    },
};
//# sourceMappingURL=cache.js.map