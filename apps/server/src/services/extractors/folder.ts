import fs from "node:fs/promises";
import path from "node:path";
import { naturalCompare, isImageName } from "../../lib/natural-sort";
import { archiveCache } from "../archive-cache";
import type { Extractor, PageRef } from "./types";

async function getFolder(dir: string) {
  const cached = archiveCache.get(dir);
  if (cached) return cached;

  const entries = await fs.readdir(dir, { withFileTypes: true });
  const names = entries
    .filter((e) => e.isFile() && isImageName(e.name))
    .map((e) => e.name)
    .sort(naturalCompare);
  
  archiveCache.set(dir, names);
  return names;
}

export const folderExtractor: Extractor = {
  async count(dir) {
    const names = await getFolder(dir);
    return names.length;
  },
  async list(dir): Promise<PageRef[]> {
    const names = await getFolder(dir);
    return names.map((name: string, i: number) => ({ index: i, name }));
  },
  async page(dir, index) {
    const names = await getFolder(dir);
    const name = names[index];
    if (!name) throw new Error(`Page ${index} not found in folder`);
    return fs.readFile(path.join(dir, name));
  },
};
