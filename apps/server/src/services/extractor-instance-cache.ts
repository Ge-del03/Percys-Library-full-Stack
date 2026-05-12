import fs from "node:fs/promises";
import { LRUCache } from "lru-cache";

/**
 * Caches heavy extractor instances (AdmZip, RAR Extractor, PDFDocumentProxy)
 * keyed by file path + mtime so that re-reading a comic from disk and
 * re-parsing its central directory is only done once per file. This is the
 * single biggest win for cold-page latency on CBR/PDF.
 *
 * Eviction does NOT call dispose() on the value: an in-flight render may
 * have already pulled the instance via get() and be holding a reference
 * across awaits inside withFileLock. Calling doc.destroy() at that moment
 * would crash the active request. Once both the LRU and the rendering
 * caller drop their references, the instance becomes unreachable and GC
 * reclaims it. updateAgeOnGet refreshes the TTL on every get so a hot
 * archive can't be evicted out from under an active request.
 */

type SizedValue = { value: object; size: number };

const MAX_BYTES = 512 * 1024 * 1024; // ~512MB total budget for parsed archives

const instanceCache = new LRUCache<string, SizedValue>({
  max: 24,
  maxSize: MAX_BYTES,
  sizeCalculation: (entry) => entry.size,
  ttl: 1000 * 60 * 30, // 30 minutes idle
  ttlAutopurge: true,
  updateAgeOnGet: true,
});

async function statSafe(filePath: string): Promise<{ mtimeMs: number; size: number }> {
  try {
    const s = await fs.stat(filePath);
    return { mtimeMs: s.mtimeMs, size: s.size };
  } catch {
    return { mtimeMs: 0, size: 0 };
  }
}

function buildKey(prefix: string, filePath: string, stat: { mtimeMs: number; size: number }): string {
  return `${prefix}:${filePath}:${stat.mtimeMs}:${stat.size}`;
}

/**
 * Get-or-create an extractor instance. Pending creations are de-duplicated
 * via a promise map so concurrent page requests share a single load.
 */
const pending = new Map<string, Promise<unknown>>();

export async function getOrCreateInstance<T extends object>(
  prefix: string,
  filePath: string,
  factory: () => Promise<T>,
): Promise<T> {
  const stat = await statSafe(filePath);
  const key = buildKey(prefix, filePath, stat);
  const cached = instanceCache.get(key);
  if (cached) return cached.value as T;

  const inflight = pending.get(key) as Promise<T> | undefined;
  if (inflight) return inflight;

  const promise = (async () => {
    try {
      const value = await factory();
      // Estimate memory based on the file size on disk; not perfect but a
      // reasonable proxy that lets us cap total memory usage.
      const size = Math.max(stat.size, 1);
      instanceCache.set(key, { value, size });
      return value;
    } finally {
      pending.delete(key);
    }
  })();
  pending.set(key, promise);
  return promise;
}

/**
 * Per-file mutex for libraries that aren't safe under concurrent access
 * (notably pdfjs render + node-unrar-js extract on the same buffer).
 */
const locks = new Map<string, Promise<unknown>>();

export async function withFileLock<T>(filePath: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(filePath) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(fn);
  locks.set(filePath, next);
  try {
    return await next;
  } finally {
    if (locks.get(filePath) === next) {
      locks.delete(filePath);
    }
  }
}
