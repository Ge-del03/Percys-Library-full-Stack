import fs from "node:fs/promises";
import { createExtractorFromData } from "node-unrar-js";
import AdmZip from "adm-zip";
import { naturalCompare } from "../../lib/natural-sort";
import { getOrCreateInstance, withFileLock } from "../extractor-instance-cache";
import type { Extractor, PageRef } from "./types";

const IMAGE_NAME_RE = /\.(jpe?g|png|webp|gif|bmp|avif|heic|heif|tiff?|jp2|j2k|jpf|jpx)$/i;

function isLikelyComicImage(name: string): boolean {
  const lower = name.toLowerCase();
  const base = lower.replace(/\.[^.]+$/, "");
  return IMAGE_NAME_RE.test(lower) || /^(cover|folder|poster|page|image|img|pic|photo)/.test(base);
}

function listZipEntries(buf: Buffer): { name: string }[] {
  const zip = new AdmZip(buf);
  const entries = zip.getEntries();
  let files = entries
    .filter((entry) => !entry.isDirectory && !entry.entryName.startsWith("__MACOSX/"))
    .filter((entry) => isLikelyComicImage(entry.entryName))
    .sort((a, b) => naturalCompare(a.entryName, b.entryName))
    .map((entry) => ({ name: entry.entryName }));

  if (files.length === 0) {
    files = entries
      .filter((entry) => !entry.isDirectory && !entry.entryName.startsWith("__MACOSX/"))
      .sort((a, b) => naturalCompare(a.entryName, b.entryName))
      .map((entry) => ({ name: entry.entryName }));
  }

  return files;
}

function toArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

type CbrInstance = {
  rar: Awaited<ReturnType<typeof createExtractorFromData>> | null;
  zip: AdmZip | null;
  files: { name: string }[];
  dispose?: () => void;
};

async function loadCbrInstance(filePath: string): Promise<CbrInstance> {
  const buf = await fs.readFile(filePath);
  const data = toArrayBuffer(buf);

  try {
    const rar = await createExtractorFromData({ data });
    const list = rar.getFileList();
    let files = Array.from(list.fileHeaders)
      .filter((f) => !f.flags.directory && !String(f.name).startsWith("__MACOSX/"))
      .filter((f) => isLikelyComicImage(f.name))
      .sort((a, b) => naturalCompare(a.name, b.name))
      .map((f) => ({ name: f.name }));

    if (files.length === 0) {
      files = Array.from(list.fileHeaders)
        .filter((f) => !f.flags.directory && !String(f.name).startsWith("__MACOSX/"))
        .sort((a, b) => naturalCompare(a.name, b.name))
        .map((f) => ({ name: f.name }));
    }

    return { rar, zip: null, files };
  } catch (err) {
    try {
      const zip = new AdmZip(buf);
      const files = listZipEntries(buf);
      return { rar: null, zip, files };
    } catch {
      throw err;
    }
  }
}

async function getInstance(filePath: string): Promise<CbrInstance> {
  return getOrCreateInstance("cbr", filePath, () => loadCbrInstance(filePath));
}

export const cbrExtractor: Extractor = {
  async count(filePath) {
    try {
      const instance = await getInstance(filePath);
      return instance.files.length;
    } catch (err) {
      console.error(`[cbr] count failed for ${filePath}:`, err);
      return 0;
    }
  },
  async list(filePath): Promise<PageRef[]> {
    try {
      const instance = await getInstance(filePath);
      return instance.files.map((f, i) => ({ index: i, name: f.name }));
    } catch (err) {
      console.error(`[cbr] list failed for ${filePath}:`, err);
      return [];
    }
  },
  async page(filePath, index) {
    try {
      const instance = await getInstance(filePath);
      const target = instance.files[index];
      if (!target) throw new Error(`Page ${index} not found in CBR`);

      if (instance.rar) {
        return await withFileLock(filePath, async () => {
          const extracted = instance.rar!.extract({ files: [target.name] });
          const fileArr = [...extracted.files];
          const entry = fileArr[0];
          if (!entry || !entry.extraction) throw new Error("CBR extraction failed");
          return Buffer.from(entry.extraction);
        });
      }

      if (instance.zip) {
        const entry = instance.zip.getEntry(target.name);
        if (!entry) throw new Error(`Entry ${target.name} not found in ZIP`);
        return entry.getData();
      }

      throw new Error("No extractor available for CBR");
    } catch (err) {
      console.error(`[cbr] page ${index} failed for ${filePath}:`, err);
      throw err;
    }
  },
};
