import { Router } from "express";
import path from "node:path";
import fs from "node:fs";
import fsp from "node:fs/promises";
import multer from "multer";
import { z } from "zod";
import { prisma } from "../db";
import { config } from "../config";
import { scanLibrary, registerComicPath } from "../services/scanner";
import { detectFormat, type ComicFormat } from "../services/pipeline";
import { asyncHandler } from "../lib/async-handler";
import { getOwnerId } from "../lib/owner";
import { isImageName } from "../lib/natural-sort";

export const libraryRouter = Router();

const FORMAT_VALUES = ["cbz", "cbr", "pdf", "folder"] as const;
const STATUS_VALUES = ["all", "in-progress", "completed", "unread", "favorites"] as const;
const SORT_VALUES = ["lastReadAt", "title", "addedAt", "updatedAt", "progress"] as const;

const listQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  format: z.enum(FORMAT_VALUES).optional(),
  status: z.enum(STATUS_VALUES).optional(),
  category: z.string().trim().max(80).optional(),
  sort: z.enum(SORT_VALUES).default("updatedAt"),
  order: z.enum(["asc", "desc"]).default("desc"),
  limit: z.coerce.number().int().min(1).max(500).default(200),
  offset: z.coerce.number().int().min(0).default(0),
});

const ALLOWED_EXT = new Set([".cbz", ".cbr", ".pdf", ".zip", ".rar"]);
const ALLOWED_IMAGE_EXT = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
  ".bmp",
  ".avif",
  ".heic",
  ".heif",
  ".tif",
  ".tiff",
]);
// 2 GB hard cap per file. Realistic comic archives sit well below this; we
// still bound it to avoid accidental DoS via a single huge upload.
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024;
const IMAGE_EXT_PATTERN = /\.(jpe?g|png|webp|gif|bmp|avif|heic|heif|tiff?)$/i;
const COMIC_EXT_PATTERN = /\.(cbz|cbr|pdf|zip|rar|jpe?g|png|webp|gif|bmp|avif|heic|heif|tiff?)$/i;

function normalizeTitle(input: string): string {
  return input
    .toLowerCase()
    .replace(COMIC_EXT_PATTERN, "")
    .replace(/-\w{4,}$/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      // Drop uploads into a dedicated subfolder so accidental cleanups
      // don't blow away the user's manually-curated tree.
      const dir = path.join(config.libraryPath, "_uploads");
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      const original = Buffer.from(file.originalname, "latin1").toString("utf8");
      file.originalname = original;
      const ext = path.extname(original).toLowerCase();
      const base = path
        .basename(original)
        .replace(/[\\/:*?"<>|]/g, "_")
        .slice(0, 200);
      const stem = path.basename(base, ext);
      const stamp = Date.now().toString(36);
      cb(null, `${stem}-${stamp}${ext}`);
    },
  }),
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXT.has(ext) && !ALLOWED_IMAGE_EXT.has(ext)) {
      return cb(new Error(`Formato no soportado: ${ext || "(sin extensión)"}`));
    }
    cb(null, true);
  },
});

interface RawComic {
  id: string;
  title: string;
  format: string;
  pageCount: number;
  currentPage: number;
  completed: boolean;
  isFavorite: boolean;
  category: string | null;
  categories: string[];
  addedAt: Date;
  updatedAt: Date;
  lastReadAt: Date | null;
  sizeBytes: bigint;
  lastZoom: number | null;
}

const PAGES_PER_MINUTE = 2;

function serializeComic(c: RawComic) {
  return {
    id: c.id,
    title: c.title,
    format: c.format,
    pageCount: c.pageCount,
    currentPage: c.currentPage,
    completed: c.completed,
    isFavorite: c.isFavorite,
    category: c.category,
    categories: c.categories ?? [],
    addedAt: c.addedAt,
    updatedAt: c.updatedAt,
    lastReadAt: c.lastReadAt,
    sizeBytes: Number(c.sizeBytes),
    lastZoom: c.lastZoom,
    readingTimeMinutes: Math.max(1, Math.ceil(c.pageCount / PAGES_PER_MINUTE)),
  };
}

function buildListWhere(
  ownerId: string,
  parsed: z.infer<typeof listQuerySchema>,
): import("@prisma/client").Prisma.ComicWhereInput {
  const where: import("@prisma/client").Prisma.ComicWhereInput = { ownerId };
  if (parsed.q && parsed.q.length > 0) {
    where.title = { contains: parsed.q, mode: "insensitive" };
  }
  if (parsed.format) where.format = parsed.format;
  if (parsed.category) {
    // Match either the legacy primary slot OR the multi-tag array.
    where.OR = [{ category: parsed.category }, { categories: { has: parsed.category } }];
  }
  if (parsed.status === "in-progress") {
    where.completed = false;
    where.currentPage = { gt: 0 };
  } else if (parsed.status === "completed") {
    where.completed = true;
  } else if (parsed.status === "unread") {
    where.completed = false;
    where.currentPage = 0;
  } else if (parsed.status === "favorites") {
    where.isFavorite = true;
  }
  return where;
}

function buildListOrderBy(
  parsed: z.infer<typeof listQuerySchema>,
): import("@prisma/client").Prisma.ComicOrderByWithRelationInput[] {
  const order = parsed.order;
  switch (parsed.sort) {
    case "title":
      return [{ title: order }];
    case "addedAt":
      return [{ addedAt: order }];
    case "updatedAt":
      return [{ updatedAt: order }];
    case "lastReadAt":
      // NULLs go last regardless of direction so unread comics don't
      // dominate the "recently read" view.
      return [{ lastReadAt: { sort: order, nulls: "last" } }];
    case "progress":
      // Best-effort: order by currentPage as a proxy for absolute progress.
      // (Prisma can't sort by computed expressions across columns yet.)
      return [{ currentPage: order }, { updatedAt: "desc" }];
  }
}

libraryRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const ownerId = getOwnerId(req);
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    const where = buildListWhere(ownerId, parsed.data);
    const orderBy = buildListOrderBy(parsed.data);
    const [total, comics] = await Promise.all([
      prisma.comic.count({ where }),
      prisma.comic.findMany({
        where,
        orderBy,
        skip: parsed.data.offset,
        take: parsed.data.limit,
      }) as Promise<RawComic[]>,
    ]);
    res.setHeader("X-Total-Count", String(total));
    res.json(comics.map(serializeComic));
  }),
);

/**
 * Lightweight summary used by stats / dashboards. Cheap aggregations only;
 * never returns the full comic list (use `GET /api/library` with paging
 * for that). Calls fan out to indexed COUNT queries plus a single
 * SUM(sizeBytes) so even a 100k-comic library responds in a few ms.
 */
libraryRouter.get(
  "/summary",
  asyncHandler(async (req, res) => {
    const ownerId = getOwnerId(req);
    const [total, completed, favorites, inProgress, sizeAggRaw] = await Promise.all([
      prisma.comic.count({ where: { ownerId } }),
      prisma.comic.count({ where: { ownerId, completed: true } }),
      prisma.comic.count({ where: { ownerId, isFavorite: true } }),
      prisma.comic.count({
        where: { ownerId, completed: false, currentPage: { gt: 0 } },
      }),
      prisma.comic.aggregate({
        where: { ownerId },
        _sum: { sizeBytes: true },
      }),
    ]);
    const totalBytesRaw = sizeAggRaw._sum.sizeBytes ?? 0n;
    res.json({
      total,
      completed,
      inProgress,
      unread: Math.max(0, total - completed - inProgress),
      favorites,
      totalBytes: Number(totalBytesRaw),
    });
  }),
);

/** Export the entire library as JSON (or NDJSON when ?format=ndjson). */
libraryRouter.get(
  "/export",
  asyncHandler(async (req, res) => {
    const ownerId = getOwnerId(req);
    const fmt = String(req.query.format ?? "json").toLowerCase();
    const comics = (await prisma.comic.findMany({
      where: { ownerId },
      orderBy: { addedAt: "asc" },
    })) as RawComic[];
    if (fmt === "ndjson") {
      res.setHeader("Content-Type", "application/x-ndjson");
      res.setHeader("Content-Disposition", "attachment; filename=\"library.ndjson\"");
      for (const c of comics) {
        res.write(JSON.stringify(serializeComic(c)) + "\n");
      }
      return res.end();
    }
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", "attachment; filename=\"library.json\"");
    res.json({
      exportedAt: new Date().toISOString(),
      ownerId,
      count: comics.length,
      comics: comics.map(serializeComic),
    });
  }),
);

libraryRouter.post(
  "/scan",
  asyncHandler(async (req, res) => {
    const ownerId = getOwnerId(req);
    const result = await scanLibrary(ownerId);
    res.json(result);
  }),
);

// Accepts one or more comic files (CBZ / CBR / PDF). Files land under
// `<libraryPath>/_uploads/` and trigger an immediate scan so the new
// comics show up without an explicit second request.
libraryRouter.post(
  "/upload",
  (req, res, next) => {
    upload.array("files", 50)(req, res, (err) => {
      if (!err) return next();
      const msg = err instanceof Error ? err.message : "Error subiendo archivo";
      res.status(400).json({ error: msg });
    });
  },
  asyncHandler(async (req, res) => {
    const ownerId = getOwnerId(req);
    const files = ((req.files as Express.Multer.File[] | undefined) ?? []).filter(Boolean);
    if (files.length === 0) {
      return res.status(400).json({ error: "No se enviaron archivos" });
    }

    // Fast path: check existing by title only (skip expensive fileSignature for large libraries)
    const existing = await prisma.comic.findMany({
      where: { ownerId },
      select: { title: true },
    });
    const existingTitles = new Set(existing.map((c) => normalizeTitle(c.title)));

    const seenBatch = new Set<string>();
    const accepted: Express.Multer.File[] = [];
    const skipped: { name: string; reason: "already-exists" | "duplicated-in-batch" }[] = [];

    // Fast filtering by title only
    for (const file of files) {
      const key = normalizeTitle(file.originalname);
      if (!key) {
        accepted.push(file);
        continue;
      }
      if (existingTitles.has(key)) {
        skipped.push({ name: file.originalname, reason: "already-exists" });
        void fs.promises.unlink(file.path).catch(() => undefined);
        continue;
      }
      if (seenBatch.has(key)) {
        skipped.push({ name: file.originalname, reason: "duplicated-in-batch" });
        void fs.promises.unlink(file.path).catch(() => undefined);
        continue;
      }
      seenBatch.add(key);
      accepted.push(file);
    }

    // Register only the freshly-uploaded paths instead of running a full
    // scan over `_uploads/`. Two reasons:
    //   1. A full walk would resurrect files that were deleted from the
    //      DB but linger on disk (e.g. unlink races, manual cleanup
    //      pending), which is exactly the bug users were hitting where
    //      "old comics come back when I import a new one".
    //   2. It's much faster: parsing N new files instead of every file
    //      that has ever been uploaded.
    const imageGroups = new Map<string, Express.Multer.File[]>();
    const archives: Express.Multer.File[] = [];
    for (const file of accepted) {
      if (isImageName(file.originalname)) {
        const group = path.dirname(file.originalname);
        imageGroups.set(group, [...(imageGroups.get(group) ?? []), file]);
      } else {
        archives.push(file);
      }
    }

    const sources: { sourcePath: string; fmt: ComicFormat; files: Express.Multer.File[] }[] = [];
    let unreadable = 0;
    for (const file of archives) {
      const fmt = detectFormat(file.path, false);
      if (!fmt) {
        unreadable += 1;
        void fs.promises.unlink(file.path).catch(() => undefined);
        continue;
      }
      sources.push({ sourcePath: file.path, fmt, files: [file] });
    }
    for (const [group, groupFiles] of imageGroups) {
      const seedName = group === "." ? groupFiles[0]?.originalname ?? "comic" : group;
      const title = path.basename(seedName).replace(IMAGE_EXT_PATTERN, "") || "comic";
      const dir = path.join(config.libraryPath, "_uploads", `${title.replace(/[\\/:*?"<>|]/g, "_").slice(0, 120)}-${Date.now().toString(36)}`);
      await fsp.mkdir(dir, { recursive: true });
      for (const file of groupFiles) {
        await fsp.rename(file.path, path.join(dir, path.basename(file.originalname).replace(/[\\/:*?"<>|]/g, "_")));
      }
      sources.push({ sourcePath: dir, fmt: "folder", files: groupFiles });
    }

    let added = 0;
    let registered = 0;
    const uploadedNames = new Set<string>();

    // Process registrations in parallel for speed
    const results = await Promise.allSettled(
      sources.map((source) => registerComicPath(ownerId, source.sourcePath, source.fmt))
    );

    for (let i = 0; i < results.length; i++) {
      const source = sources[i];
      const result = results[i];
      try {
        const status = result.status === "fulfilled" ? result.value : "skipped";
        if (status === "added") added += 1;
        if (status !== "skipped") {
          registered += 1;
          for (const file of source.files) uploadedNames.add(file.originalname);
        }
        if (status === "skipped") {
          unreadable += 1;
          void fs.promises.rm(source.sourcePath, { recursive: true, force: true }).catch(() => undefined);
        }
      } catch (err) {
        console.error("Failed to register uploaded comic", source.sourcePath, err);
        unreadable += 1;
        void fs.promises.rm(source.sourcePath, { recursive: true, force: true }).catch(() => undefined);
      }
    }
    const total = await prisma.comic.count({ where: { ownerId } });
    res.json({
      uploaded: accepted
        .filter((f) => uploadedNames.has(f.originalname))
        .map((f) => ({ name: f.originalname, size: f.size })),
      skipped,
      added,
      registered,
      unreadable,
      removed: 0,
      total,
    });
  }),
);
