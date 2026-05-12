import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import AdmZip from "adm-zip";
import { cbrExtractor } from "./cbr";

async function makeTempComic(): Promise<{ filePath: string; cleanup: () => Promise<void> }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "percys-cbr-"));
  const archive = new AdmZip();
  archive.addFile("page-1.png", Buffer.from("first-page"));
  archive.addFile("page-2.png", Buffer.from("second-page"));
  const filePath = path.join(dir, "damaged.cbr");
  await fs.writeFile(filePath, archive.toBuffer());
  return {
    filePath,
    cleanup: async () => {
      await fs.rm(dir, { recursive: true, force: true });
    },
  };
}

test("cbrExtractor falls back to zip archives renamed as cbr", async () => {
  const temp = await makeTempComic();
  try {
    assert.equal(await cbrExtractor.count(temp.filePath), 2);
    assert.deepEqual(await cbrExtractor.list(temp.filePath), [
      { index: 0, name: "page-1.png" },
      { index: 1, name: "page-2.png" },
    ]);
    assert.equal((await cbrExtractor.page(temp.filePath, 1)).toString("utf8"), "second-page");
  } finally {
    await temp.cleanup();
  }
});