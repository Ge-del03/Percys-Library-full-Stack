import express, { type ErrorRequestHandler } from "express";
import cors from "cors";
import fs from "node:fs";
import { config } from "./config";
import { ensureSettings } from "./db";
import { libraryRouter } from "./routes/library";
import { comicsRouter } from "./routes/comics";
import { settingsRouter } from "./routes/settings";
import { statsRouter } from "./routes/stats";
import { bookmarksRouter } from "./routes/bookmarks";
import { scanLibrary } from "./services/scanner";

async function main() {
  fs.mkdirSync(config.libraryPath, { recursive: true });
  fs.mkdirSync(config.cacheDir, { recursive: true });
  await ensureSettings();

  const app = express();
  app.use(cors());
  // Body limit must accommodate avatar data URLs (~256KB) plus JSON overhead.
  // Increased to 10mb to handle bulk operations on very large libraries.
  app.use(express.json({ limit: "10mb" }));

  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  app.use("/api/library", libraryRouter);
  app.use("/api/comics", comicsRouter);
  app.use("/api/settings", settingsRouter);
  app.use("/api", statsRouter);
  app.use("/api", bookmarksRouter);

  const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    // eslint-disable-next-line no-console
    console.error("[percys] route error:", err);
    if (res.headersSent) return;
    res.status(500).json({ error: "Internal server error" });
  };
  app.use(errorHandler);

  // Initial scan in the background; do not block startup.
  scanLibrary().catch((err) => console.error("Initial scan failed:", err));

  app.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(`[percys] server listening on http://localhost:${config.port}`);
    // eslint-disable-next-line no-console
    console.log(`[percys] library: ${config.libraryPath}`);
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
