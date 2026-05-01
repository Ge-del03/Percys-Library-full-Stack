import fs from "node:fs/promises";
import { createExtractorFromData } from "node-unrar-js";
import { naturalCompare, isImageName } from "../../lib/natural-sort";
import { archiveCache } from "../archive-cache";
import type { Extractor, PageRef } from "./types";

async function getRarMetadata(filePath: string) {
  const cacheKey = `metadata:cbr:${filePath}`;
  const cached = archiveCache.get(cacheKey);
  if (cached) return cached;

  // We read the file to get the list, but we don't store the buffer in the cache.
  const buf = await fs.readFile(filePath);
  const data = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const extractor = await createExtractorFromData({ data });
  
  const list = extractor.getFileList();
  const files = Array.from(list.fileHeaders)
    .filter((f: any) => !f.flags.directory && !f.flags.encrypted && isImageName(f.name))
    .sort((a: any, b: any) => naturalCompare(a.name, b.name))
    .map((f: any) => ({ name: f.name }));

  archiveCache.set(cacheKey, files);
  return files;
}

export const cbrExtractor: Extractor = {
  async count(filePath) {
    const files = await getRarMetadata(filePath);
    return files.length;
  },
  async list(filePath): Promise<PageRef[]> {
    const files = await getRarMetadata(filePath);
    return files.map((f: any, i: number) => ({ index: i, name: f.name }));
  },
  async page(filePath, index) {
    const files = await getRarMetadata(filePath);
    const target = files[index];
    if (!target) throw new Error(`Page ${index} not found in CBR`);
    
    // For the actual extraction, we read the file again. This avoids keeping
    // all open comics in RAM simultaneously, which prevents OOM on large libraries.
    const buf = await fs.readFile(filePath);
    const data = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const extractor = await createExtractorFromData({ data });
    
    const extracted = extractor.extract({ files: [target.name] });
    const fileArr = [...extracted.files];
    const entry = fileArr[0];
    if (!entry || !entry.extraction) throw new Error("CBR extraction failed");
    return Buffer.from(entry.extraction);
  },
};
