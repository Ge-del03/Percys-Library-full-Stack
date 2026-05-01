"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const node_fs_1 = __importDefault(require("node:fs"));
const config_1 = require("./config");
const db_1 = require("./db");
const library_1 = require("./routes/library");
const comics_1 = require("./routes/comics");
const settings_1 = require("./routes/settings");
const stats_1 = require("./routes/stats");
const bookmarks_1 = require("./routes/bookmarks");
const scanner_1 = require("./services/scanner");
async function main() {
    node_fs_1.default.mkdirSync(config_1.config.libraryPath, { recursive: true });
    node_fs_1.default.mkdirSync(config_1.config.cacheDir, { recursive: true });
    await (0, db_1.ensureSettings)();
    const app = (0, express_1.default)();
    app.use((0, cors_1.default)());
    // Body limit must accommodate avatar data URLs (~256KB) plus JSON overhead.
    // Increased to 10mb to handle bulk operations on very large libraries.
    app.use(express_1.default.json({ limit: "10mb" }));
    app.get("/api/health", (_req, res) => res.json({ ok: true }));
    app.use("/api/library", library_1.libraryRouter);
    app.use("/api/comics", comics_1.comicsRouter);
    app.use("/api/settings", settings_1.settingsRouter);
    app.use("/api", stats_1.statsRouter);
    app.use("/api", bookmarks_1.bookmarksRouter);
    const errorHandler = (err, _req, res, _next) => {
        // eslint-disable-next-line no-console
        console.error("[percys] route error:", err);
        if (res.headersSent)
            return;
        res.status(500).json({ error: "Internal server error" });
    };
    app.use(errorHandler);
    // Initial scan in the background; do not block startup.
    (0, scanner_1.scanLibrary)().catch((err) => console.error("Initial scan failed:", err));
    app.listen(config_1.config.port, () => {
        // eslint-disable-next-line no-console
        console.log(`[percys] server listening on http://localhost:${config_1.config.port}`);
        // eslint-disable-next-line no-console
        console.log(`[percys] library: ${config_1.config.libraryPath}`);
    });
}
main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
});
//# sourceMappingURL=index.js.map