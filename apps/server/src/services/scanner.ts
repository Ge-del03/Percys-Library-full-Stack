import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config";
import { prisma } from "../db";
import { detectFormat, getExtractor } from "./pipeline";
import { isImageName } from "../lib/natural-sort";

async function isFolderComic(dir: string): Promise<boolean> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const imageCount = entries.filter((e) => e.isFile() && isImageName(e.name)).length;
    return imageCount >= 1;
  } catch {
    return false;
  }
}

async function folderSizeBytes(dir: string): Promise<bigint> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    let total = 0n;
    for (const e of entries) {
      if (!e.isFile() || !isImageName(e.name)) continue;
      try {
        const stat = await fs.stat(path.join(dir, e.name));
        total += BigInt(stat.size);
      } catch {
        // ignore individual file errors
      }
    }
    return total;
  } catch {
    return 0n;
  }
}

interface ScanResult {
  added: number;
  removed: number;
  total: number;
}

// Module-level lock so the startup background scan and a user-triggered
// POST /api/library/scan never race. Concurrent callers piggyback on the
// in-flight scan instead of starting a duplicate traversal that would
// hit unique-constraint violations on `Comic.path`.
const inFlightByOwner = new Map<string, Promise<ScanResult>>();

export function scanLibrary(ownerId = "default"): Promise<ScanResult> {
  const existing = inFlightByOwner.get(ownerId);
  if (existing) return existing;
  const next = runScan(ownerId).finally(() => {
    inFlightByOwner.delete(ownerId);
  });
  inFlightByOwner.set(ownerId, next);
  return next;
}

async function runScan(ownerId: string): Promise<ScanResult> {
  const root = config.libraryPath;
  await fs.mkdir(root, { recursive: true });

  const seen = new Set<string>();
  let added = 0;

  async function walk(dir: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const isFolder = await isFolderComic(fullPath);
        if (isFolder) {
          await register(fullPath, "folder");
        } else {
          // Only descend when the directory is not itself a folder comic, so we
          // avoid registering nested image directories twice.
          await walk(fullPath);
        }
      } else if (entry.isFile()) {
        const fmt = detectFormat(entry.name, false);
        if (fmt) await register(fullPath, fmt);
      }
    }
  }

  async function register(p: string, fmt: "cbz" | "cbr" | "pdf" | "folder") {
    const existing = await prisma.comic.findUnique({ where: { ownerId_path: { ownerId, path: p } } });
    let pageCount = 0;
    try {
      pageCount = await getExtractor(fmt).count(p);
    } catch {
      pageCount = 0;
    }
    // Ignore broken/empty sources so the library only shows readable comics.
    // If a previously indexed item becomes unreadable (corrupt file, empty
    // folder), we intentionally leave it out of `seen` so the cleanup phase
    // below removes the stale DB row.
    if (pageCount <= 0) {
      return;
    }
    let sizeBytes = 0n;
    if (fmt === "folder") {
      sizeBytes = await folderSizeBytes(p);
    } else {
      try {
        const stat = await fs.stat(p);
        sizeBytes = BigInt(stat.size);
      } catch {
        sizeBytes = 0n;
      }
    }
    seen.add(p);
    const title = path.basename(p).replace(/\.(cbz|cbr|pdf|zip|rar)$/i, "");
    if (!existing) {
      await prisma.comic.create({
        data: {
          ownerId,
          path: p,
          title,
          format: fmt,
          pageCount,
          sizeBytes,
        },
      });
      added += 1;
      return;
    }
    const clampedPage = Math.min(Math.max(0, existing.currentPage), Math.max(0, pageCount - 1));
    const normalizedCompleted = clampedPage >= pageCount - 1;
    await prisma.comic.update({
      where: { id: existing.id },
      data: {
        title,
        format: fmt,
        pageCount,
        sizeBytes,
        currentPage: clampedPage,
        completed: normalizedCompleted,
      },
    });
  }

  await walk(root);

  // Remove comics that no longer exist on disk
  const all = (await prisma.comic.findMany({
    where: { ownerId },
    select: { id: true, path: true },
  })) as Array<{ id: string; path: string }>;
  const missing = all.filter((c: { id: string; path: string }) => !seen.has(c.path));
  if (missing.length) {
    await prisma.comic.deleteMany({
      where: { id: { in: missing.map((m: { id: string; path: string }) => m.id) } },
    });
  }

  const total = await prisma.comic.count({ where: { ownerId } });
  return { added, removed: missing.length, total };
}
