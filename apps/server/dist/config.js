"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const node_path_1 = __importDefault(require("node:path"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const root = node_path_1.default.resolve(__dirname, "..");
if (!process.env.DATABASE_URL) {
    // Fail loudly at startup so the user sees a clear error instead of a
    // confusing Prisma error 30 seconds later when the first query runs.
    throw new Error("DATABASE_URL is not set. Copy apps/server/.env.example to .env and " +
        "point it at your Postgres / Supabase database.");
}
exports.config = {
    port: parseInt(process.env.PORT ?? "4000", 10),
    databaseUrl: process.env.DATABASE_URL,
    libraryPath: node_path_1.default.resolve(root, process.env.LIBRARY_PATH ?? "./data/library"),
    cacheDir: node_path_1.default.resolve(root, process.env.CACHE_DIR ?? "./cache"),
    pageMemoryCacheItems: 60,
    thumbWidth: 320,
    coverWidth: 600,
};
//# sourceMappingURL=config.js.map