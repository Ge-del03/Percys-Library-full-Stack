import { prisma } from "../db";
import { cache, getSourceVersion } from "./cache";
import { getExtractor, type ComicFormat } from "./pipeline";
import { autoCropWhiteMargins, detectMime, makeThumbnail, normalizeImage, recompressForQuality } from "../lib/image-utils";
import { config } from "../config";

export interface PageBlob {
  data: Buffer;
  mime: string;
}

export type ImageQuality = "high" | "balanced" | "fast";

interface ResolvedComic {
  id: string;
  path: string;
  format: ComicFormat;
  version: string;
}

async function resolveComic(comicId: string): Promise<ResolvedComic | null> {
  const comic = await prisma.comic.findUnique({ where: { id: comicId } });
  if (!comic) return null;
  const version = await getSourceVersion(comic.path);
  return { id: comic.id, path: comic.path, format: comic.format as ComicFormat, version };
}

async function getRawPageBuffer(comic: ResolvedComic, index: number): Promise<Buffer | null> {
  const extractor = getExtractor(comic.format);
  try {
    return await extractor.page(comic.path, index);
  } catch (err) {
    console.warn(`[pages] failed to load page ${index} for comic ${comic.id}:`, err instanceof Error ? err.message : "unknown error");
    return null;
  }
}

/**
 * Re-ask the extractor how many pages a comic actually has and update the
 * stored pageCount if it drifted (e.g. the original metadata was wrong, or
 * the source file was rewritten with fewer pages). Safe to call from a
 * fire-and-forget context — it never throws and never returns a value the
 * caller has to act on.
 */
export async function refreshComicPageCount(comicId: string): Promise<void> {
  const comic = await prisma.comic.findUnique({
    where: { id: comicId },
    select: { id: true, path: true, format: true, pageCount: true },
  });
  if (!comic) return;
  const extractor = getExtractor(comic.format as ComicFormat);
  let actual = 0;
  try {
    actual = await extractor.count(comic.path);
  } catch {
    try {
      actual = (await extractor.list(comic.path)).length;
    } catch {
      return;
    }
  }
  if (actual <= 0 || actual === comic.pageCount) return;
  const data: { pageCount: number; currentPage?: number; completed?: boolean } = { pageCount: actual };
  await prisma.comic.update({ where: { id: comic.id }, data });
}

export async function getPage(
  comicId: string,
  index: number,
  opts: { autoCrop?: boolean; quality?: ImageQuality } = {},
): Promise<PageBlob | null> {
  const comic = await resolveComic(comicId);
  if (!comic) return null;
  const quality: ImageQuality = opts.quality ?? "balanced";
  // Cache key includes the quality tier so different tiers don't shadow
  // each other on disk; sharing entries between tiers would force every
  // visitor to wait for whichever variant happened to be cached first.
  // The source-file version is folded in too, so re-writing a comic on
  // disk (same id, different bytes) immediately invalidates every
  // derived entry.
  const variant = `${opts.autoCrop ? "crop" : "raw"}-${quality}`;
  const memKey = `${comicId}:${index}:${variant}:${comic.version}`;
  const memHit = cache.mem.get(memKey);
  if (memHit) return { data: memHit, mime: detectMime(memHit) };

  const diskKey = cache.pageKey(comicId, index, variant, comic.version);
  const diskHit = await cache.readDisk("pages", diskKey);
  if (diskHit) {
    cache.mem.set(memKey, diskHit);
    return { data: diskHit, mime: detectMime(diskHit) };
  }

  let buf = await getRawPageBuffer(comic, index);
  if (!buf) return null;
  try {
    const normalized = await normalizeImage(buf);
    buf = normalized.data;
  } catch {
    // fall back to original
  }

  if (opts.autoCrop) {
    try {
      buf = await autoCropWhiteMargins(buf);
    } catch {
      // fall back to original
    }
  }

  if (quality !== "high") {
    buf = await recompressForQuality(buf, quality);
  }

  cache.mem.set(memKey, buf);
  await cache.writeDisk("pages", diskKey, buf);
  cache.schedulePrune("pages", 1024 * 1024 * 1024);
  return { data: buf, mime: detectMime(buf) };
}

export async function getThumb(comicId: string, index: number): Promise<Buffer | null> {
  const comic = await resolveComic(comicId);
  if (!comic) return null;
  const key = cache.thumbKey(comicId, index, comic.version);
  const diskHit = await cache.readDisk("thumbs", key);
  if (diskHit) return diskHit;

  // Derive thumbnails directly from the raw page bytes so we avoid the
  // page cache and skip an extra recompress/resize round-trip.
  const raw = await getRawPageBuffer(comic, index);
  if (!raw) return null;
  let source = raw;
  try {
    const normalized = await normalizeImage(raw);
    source = normalized.data;
  } catch {
    // Fall back to the extracted bytes.
  }
  let thumb: Buffer;
  try {
    thumb = await makeThumbnail(source, config.thumbWidth);
  } catch {
    return null;
  }
  await cache.writeDisk("thumbs", key, thumb);
  cache.schedulePrune("thumbs", 256 * 1024 * 1024);
  return thumb;
}
