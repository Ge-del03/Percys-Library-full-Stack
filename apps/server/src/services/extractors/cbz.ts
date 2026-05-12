import AdmZip from "adm-zip";
import { naturalCompare } from "../../lib/natural-sort";
import { getOrCreateInstance } from "../extractor-instance-cache";
import type { Extractor, PageRef } from "./types";

type CbzInstance = {
  zip: AdmZip;
  entries: { entryName: string }[];
};

function listZipEntries(zip: AdmZip): { entryName: string }[] {
  const entries = zip.getEntries();
  let filtered = entries
    .filter((e) => !e.isDirectory && !e.entryName.startsWith("__MACOSX/"))
    .filter((e) => {
      const name = e.entryName.toLowerCase();
      return /\.(jpe?g|png|webp|gif|bmp|avif|heic|heif|tiff?|jp2|j2k|jpf|jpx)$/.test(name);
    })
    .sort((a, b) => naturalCompare(a.entryName, b.entryName))
    .map((e) => ({ entryName: e.entryName }));

  if (filtered.length === 0) {
    filtered = entries
      .filter((e) => !e.isDirectory && !e.entryName.startsWith("__MACOSX/"))
      .sort((a, b) => naturalCompare(a.entryName, b.entryName))
      .map((e) => ({ entryName: e.entryName }));
  }
  return filtered;
}

async function loadCbzInstance(filePath: string): Promise<CbzInstance> {
  const zip = new AdmZip(filePath);
  return { zip, entries: listZipEntries(zip) };
}

async function getInstance(filePath: string): Promise<CbzInstance> {
  return getOrCreateInstance("cbz", filePath, () => loadCbzInstance(filePath));
}

export const cbzExtractor: Extractor = {
  async count(filePath) {
    try {
      const instance = await getInstance(filePath);
      return instance.entries.length;
    } catch (err) {
      console.error(`[cbz] count failed for ${filePath}:`, err);
      return 0;
    }
  },
  async list(filePath): Promise<PageRef[]> {
    try {
      const instance = await getInstance(filePath);
      return instance.entries.map((e, i) => ({ index: i, name: e.entryName }));
    } catch (err) {
      console.error(`[cbz] list failed for ${filePath}:`, err);
      return [];
    }
  },
  async page(filePath, index) {
    try {
      const instance = await getInstance(filePath);
      const meta = instance.entries[index];
      if (!meta) throw new Error(`Page ${index} not found in CBZ`);
      const entry = instance.zip.getEntry(meta.entryName);
      if (!entry) throw new Error(`Entry ${meta.entryName} not found in CBZ`);
      return entry.getData();
    } catch (err) {
      console.error(`[cbz] page ${index} failed for ${filePath}:`, err);
      throw err;
    }
  },
};
