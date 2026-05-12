import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { LRUCache } from "lru-cache";
import { config } from "../config";

const memCache = new LRUCache<string, Buffer>({
  max: config.pageMemoryCacheItems,
  maxSize: 256 * 1024 * 1024,
  sizeCalculation: (buf) => buf.length,
});

function hashKey(parts: string[]): string {
  return crypto.createHash("sha1").update(parts.join("|")).digest("hex");
}

// Fingerprint of the source file/folder used to invalidate derived caches
// (pages, thumbnails, covers) when the underlying bytes change. We use
// mtime+size of the path itself; for folders this catches additions and
// removals (the dir's mtime updates) and for archives it catches any
// re-write of the file. Returns "0-0" if stat fails so callers still
// produce a stable key even if the file disappeared in the meantime.
export async function getSourceVersion(filePath: string): Promise<string> {
  try {
    const s = await fs.stat(filePath);
    return `${Math.trunc(s.mtimeMs)}-${s.size}`;
  } catch {
    return "0-0";
  }
}

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

async function doPruneBucket(bucket: string, maxBytes: number) {
  const dir = path.join(config.cacheDir, bucket);
  let entries: { name: string; size: number; atime: number }[] = [];
  try {
    const names = await fs.readdir(dir);
    for (const name of names) {
      const stat = await fs.stat(path.join(dir, name));
      entries.push({ name, size: stat.size, atime: stat.atimeMs });
    }
  } catch {
    return;
  }
  let total = entries.reduce((acc, e) => acc + e.size, 0);
  if (total <= maxBytes) return;
  entries = entries.sort((a, b) => a.atime - b.atime);
  for (const e of entries) {
    if (total <= maxBytes) break;
    try {
      await fs.unlink(path.join(dir, e.name));
      total -= e.size;
    } catch {
      // ignore
    }
  }
}

const pendingPrunes = new Map<string, NodeJS.Timeout>();

function schedulePrune(bucket: string, maxBytes: number, delayMs = 5000) {
  const key = `${bucket}:${maxBytes}`;
  const existing = pendingPrunes.get(key);
  if (existing) {
    clearTimeout(existing);
  }
  const timeout = setTimeout(() => {
    pendingPrunes.delete(key);
    doPruneBucket(bucket, maxBytes).catch((err: unknown) => {
      console.warn(`[cache] prune failed for ${bucket}:`, err);
    });
  }, delayMs);
  pendingPrunes.set(key, timeout);
}

export const cache = {
  mem: memCache,

  async readDisk(bucket: string, key: string): Promise<Buffer | null> {
    const file = path.join(config.cacheDir, bucket, key);
    try {
      return await fs.readFile(file);
    } catch {
      return null;
    }
  },

  async writeDisk(bucket: string, key: string, data: Buffer): Promise<void> {
    const dir = path.join(config.cacheDir, bucket);
    try {
      await ensureDir(dir);
      await fs.writeFile(path.join(dir, key), data);
    } catch (err) {
      console.warn(`[cache] write failed for ${bucket}/${key}:`, err);
    }
  },

  pageKey(comicId: string, index: number, suffix = "raw", version = ""): string {
    return `${hashKey([comicId, String(index), suffix, version])}.bin`;
  },

  thumbKey(comicId: string, index: number, version = ""): string {
    return `${hashKey([comicId, String(index), version])}.webp`;
  },

  coverKey(comicId: string, version = ""): string {
    return `${hashKey([comicId, "cover", version])}.webp`;
  },

  coverRawKey(comicId: string, version = ""): string {
    return `${hashKey([comicId, "cover", "raw", version])}.bin`;
  },

  async pruneBucket(bucket: string, maxBytes: number) {
    return doPruneBucket(bucket, maxBytes);
  },

  schedulePrune(bucket: string, maxBytes: number) {
    schedulePrune(bucket, maxBytes);
  },
};
