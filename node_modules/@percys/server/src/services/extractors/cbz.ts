import AdmZip from "adm-zip";
import { naturalCompare, isImageName } from "../../lib/natural-sort";
import { archiveCache } from "../archive-cache";
import type { Extractor, PageRef } from "./types";

async function getZipMetadata(filePath: string) {
  const cacheKey = `metadata:cbz:${filePath}`;
  const cached = archiveCache.get(cacheKey);
  if (cached) return cached;

  const zip = new AdmZip(filePath);
  const entries = zip
    .getEntries()
    .filter((e) => !e.isDirectory && isImageName(e.entryName))
    .sort((a, b) => naturalCompare(a.entryName, b.entryName))
    .map(e => ({ entryName: e.entryName }));
  
  archiveCache.set(cacheKey, entries);
  return entries;
}

export const cbzExtractor: Extractor = {
  async count(filePath) {
    const entries = await getZipMetadata(filePath);
    return entries.length;
  },
  async list(filePath): Promise<PageRef[]> {
    const entries = await getZipMetadata(filePath);
    return entries.map((e: any, i: number) => ({ index: i, name: e.entryName }));
  },
  async page(filePath, index) {
    const entries = await getZipMetadata(filePath);
    const meta = entries[index];
    if (!meta) throw new Error(`Page ${index} not found in CBZ`);
    
    // Re-open zip for extraction to avoid keeping large objects in memory.
    const zip = new AdmZip(filePath);
    const entry = zip.getEntry(meta.entryName);
    if (!entry) throw new Error(`Entry ${meta.entryName} not found in CBZ`);
    return entry.getData();
  },
};
