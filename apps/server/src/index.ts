import express, { type ErrorRequestHandler, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";
import crypto from "node:crypto";
import http from "node:http";
import { config } from "./config";
import { disconnectDatabase, ensureSettings, prisma, startDatabaseWatchdog } from "./db";
import { Prisma } from "@prisma/client";
import { libraryRouter } from "./routes/library";
import { comicsRouter } from "./routes/comics";
import { settingsRouter } from "./routes/settings";
import { statsRouter } from "./routes/stats";
import { bookmarksRouter } from "./routes/bookmarks";
import { healthRouter } from "./routes/health";
import { scanLibrary, cleanupUploadOrphans } from "./services/scanner";
import { logger } from "./lib/logger";

const REQUEST_TIMEOUT_MS = 60_000;

const log = logger.child("server");

async function main() {
  await ensureSettings();

  const app = express();
  // We sit behind the Vite dev proxy in development and behind a reverse
  // proxy in production. Trusting the immediate hop lets the rate-limiter
  // see real client IPs from `X-Forwarded-For`.
  app.set("trust proxy", 1);

  app.use(
    helmet({
      // The reader pipes data: / blob: image URLs and the runtime theme
      // CSS works only with `'unsafe-inline'`. Keep helmet's defaults
      // for everything else (X-Frame-Options, X-Content-Type-Options,
      // Referrer-Policy, etc.).
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          "default-src": ["'self'"],
          "img-src": ["'self'", "data:", "blob:"],
          "style-src": ["'self'", "'unsafe-inline'"],
          "script-src": ["'self'"],
          "connect-src": ["'self'", "http://localhost:*", "ws://localhost:*"],
          "object-src": ["'none'"],
          "frame-ancestors": ["'none'"],
        },
      },
      // Cross-origin image embedding (covers/pages) needs to stay
      // permissive when the frontend ships separately.
      crossOriginResourcePolicy: { policy: "cross-origin" },
      crossOriginEmbedderPolicy: false,
    }),
  );

  // CORS — allow-list driven by env. Defaults to "*" so the dev server
  // and the bundled frontend both work without extra setup.
  if (config.corsOrigins === "*") {
    app.use(cors());
  } else {
    const allowed = new Set(config.corsOrigins);
    app.use(
      cors({
        origin(origin, cb) {
          if (!origin || allowed.has(origin)) return cb(null, true);
          cb(new Error(`Origin not allowed: ${origin}`));
        },
        credentials: true,
      }),
    );
  }

  app.use(compression());
  app.use(express.json({ limit: config.jsonBodyLimit }));

  // Lightweight request logger — single line per request with timing.
  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = process.hrtime.bigint();
    res.on("finish", () => {
      const elapsedMs = Number((process.hrtime.bigint() - start) / 1_000_000n);
      const meta = {
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        elapsedMs,
      };
      if (res.statusCode >= 500) log.error("request", meta);
      else if (res.statusCode >= 400) log.warn("request", meta);
      else log.debug("request", meta);
    });
    next();
  });

  app.use((req, res, next) => {
    res.setTimeout(REQUEST_TIMEOUT_MS, () => {
      res.status(503).json({ error: "Request timeout" });
    });
    next();
  });

  // Rate limiters scoped to mutating endpoints. Reads (covers, pages,
  // thumbs) are intentionally exempt: they're cacheable, called in
  // bursts by the reader, and protected by their own LRU + disk cache.
  const writeLimiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    limit: config.rateLimit.max,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skip: (req) => req.method === "GET" || req.method === "HEAD",
  });
  const uploadLimiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    limit: config.rateLimit.uploadMax,
    standardHeaders: "draft-7",
    legacyHeaders: false,
  });

  app.use("/api/health", healthRouter);
  app.use("/api/library/upload", uploadLimiter);
  app.use("/api", writeLimiter);

  app.use("/api/library", libraryRouter);
  app.use("/api/comics", comicsRouter);
  app.use("/api/settings", settingsRouter);
  app.use("/api", statsRouter);
  app.use("/api", bookmarksRouter);

  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  const TRANSIENT_DB_CODES = new Set([
    "P1001", // Can't reach database server
    "P1002", // Database server timed out
    "P1008", // Operations timed out
    "P1017", // Server has closed the connection
    "P2024", // Timed out fetching a connection
  ]);

  const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
    const errorId = crypto.randomUUID().slice(0, 8);
    // A transient DB blip during a single request shouldn't read like a
    // bug to the client — surface 503 + a friendly message so the
    // frontend can retry without showing a scary stack-trace error.
    const isTransientDb =
      (err instanceof Prisma.PrismaClientKnownRequestError &&
        TRANSIENT_DB_CODES.has(err.code)) ||
      err instanceof Prisma.PrismaClientInitializationError;
    if (isTransientDb) {
      log.warn("transient db error during request", {
        errorId,
        method: req.method,
        path: req.originalUrl,
        message: err instanceof Error ? err.message : String(err),
      });
      if (!res.headersSent) {
        res
          .status(503)
          .setHeader("Retry-After", "2")
          .json({
            error: "La base de datos no respondió a tiempo. Reintenta en unos segundos.",
            transient: true,
            errorId,
          });
      }
      return;
    }
    log.error("route error", {
      errorId,
      method: req.method,
      path: req.originalUrl,
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    if (res.headersSent) return;
    res.status(500).json({ error: "Internal server error", errorId });
  };
  app.use(errorHandler);

  process.on("uncaughtException", (err) => {
    log.error("uncaught exception", { message: err.message, stack: err.stack });
    // Hard exit only in production; tests / dev keep running so a single
    // bad request doesn't wipe out tsx watch mode.
    if (config.isProduction) process.exit(1);
  });

  process.on("unhandledRejection", (reason) => {
    log.error("unhandled rejection", {
      message: reason instanceof Error ? reason.message : String(reason),
    });
  });

  // Warm cache for recently read comics in background
  async function warmCache() {
    try {
      const recent = await prisma.comic.findMany({
        where: { lastReadAt: { not: null } },
        orderBy: { lastReadAt: "desc" },
        take: 10,
        select: { id: true, pageCount: true },
      });
      const { getPage } = await import("./services/pages");
      let warmed = 0;
      for (const comic of recent) {
        if (comic.pageCount > 0) {
          try {
            await getPage(comic.id, 0, { quality: "balanced" });
            warmed++;
          } catch { /* ignore per-comic errors */ }
        }
      }
      if (warmed > 0) {
        log.info(`warmed cache for ${warmed} recent comic(s)`);
      }
    } catch (err) {
      log.warn("cache warming failed", {
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  scanLibrary()
    .then(async (result) => {
      log.info("initial scan complete", result);
      try {
        const removed = await cleanupUploadOrphans();
        if (removed > 0) {
          log.info(`cleaned up ${removed} orphaned upload(s)`);
        }
      } catch (err) {
        log.warn("upload orphan cleanup failed", {
          message: err instanceof Error ? err.message : String(err),
        });
      }
      // Warm cache after main work is done
      warmCache();
    })
    .catch((err) =>
      log.error("initial scan failed", {
        message: err instanceof Error ? err.message : String(err),
      }),
    );

  const server = http.createServer(app);
  server.listen(config.port, () => {
    log.info(`server listening on http://localhost:${config.port}`);
    log.info(`library: ${config.libraryPath}`);
    log.info(`cache: ${config.cacheDir}`);
  });

  // Start a lightweight watchdog so a Supabase blip is logged once
  // (instead of per request) and connection-up/down transitions are
  // visible without spamming the console.
  const stopWatchdog = startDatabaseWatchdog();

  // Graceful shutdown — drain in-flight requests, close DB, then exit.
  let shuttingDown = false;
  async function shutdown(signal: string) {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info(`received ${signal}, shutting down`);
    stopWatchdog();
    server.close((err) => {
      if (err) log.error("error closing http server", { message: err.message });
    });
    try {
      await disconnectDatabase();
    } catch (err) {
      log.warn("error disconnecting prisma", {
        message: err instanceof Error ? err.message : String(err),
      });
    }
    // Give in-flight handlers a small grace window before forcing exit.
    setTimeout(() => process.exit(0), 1500).unref();
  }
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  log.error("fatal startup error", {
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  process.exit(1);
});
