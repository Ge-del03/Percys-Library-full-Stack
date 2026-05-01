import { prisma } from "../db";
import { cache } from "./cache";
import { getExtractor, type ComicFormat } from "./pipeline";
import { autoCropWhiteMargins, detectMime, makeThumbnail } from "../lib/image-utils";
import { config } from "../config";

export interface PageBlob {
  data: Buffer;
  mime: string;
}

export async function getPage(comicId: string, index: number, opts: { autoCrop?: boolean } = {}): Promise<PageBlob | null> {
  const memKey = `${comicId}:${index}:${opts.autoCrop ? "crop" : "raw"}`;
  const memHit = cache.mem.get(memKey);
  if (memHit) return { data: memHit, mime: detectMime(memHit) };

  const diskKey = cache.pageKey(comicId, index, opts.autoCrop ? "crop" : "raw");
  const diskHit = await cache.readDisk("pages", diskKey);
  if (diskHit) {
    cache.mem.set(memKey, diskHit);
    return { data: diskHit, mime: detectMime(diskHit) };
  }

  const comic = await prisma.comic.findUnique({ where: { id: comicId } });
  if (!comic) return null;
  const extractor = getExtractor(comic.format as ComicFormat);
  let buf: Buffer;
  try {
    buf = await extractor.page(comic.path, index);
  } catch {
    return null;
  }

  if (opts.autoCrop) {
    try {
      buf = await autoCropWhiteMargins(buf);
    } catch {
      // fall back to original
    }
  }

  cache.mem.set(memKey, buf);
  await cache.writeDisk("pages", diskKey, buf);
  await cache.pruneBucket("pages", 1024 * 1024 * 1024);
  return { data: buf, mime: detectMime(buf) };
}

export async function getThumb(comicId: string, index: number): Promise<Buffer | null> {
  const key = cache.thumbKey(comicId, index);
  const diskHit = await cache.readDisk("thumbs", key);
  if (diskHit) return diskHit;

  const page = await getPage(comicId, index);
  if (!page) return null;
  let thumb: Buffer;
  try {
    thumb = await makeThumbnail(page.data, config.thumbWidth);
  } catch {
    return null;
  }
  await cache.writeDisk("thumbs", key, thumb);
  await cache.pruneBucket("thumbs", 256 * 1024 * 1024);
  return thumb;
}
