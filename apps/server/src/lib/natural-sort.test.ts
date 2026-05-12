import { test } from "node:test";
import assert from "node:assert/strict";
import { naturalCompare, isImageName } from "./natural-sort";

test("naturalCompare orders mixed alpha-numeric strings naturally", () => {
  const sorted = ["page10.jpg", "page1.jpg", "page2.jpg", "page9.jpg"].sort(naturalCompare);
  assert.deepEqual(sorted, ["page1.jpg", "page2.jpg", "page9.jpg", "page10.jpg"]);
});

test("naturalCompare is case-insensitive at the same lexical position", () => {
  // Unicode "base" sensitivity treats A === a, so the input order is
  // preserved when the only difference is case.
  assert.equal(naturalCompare("Vol 02", "vol 02"), 0);
});

test("isImageName matches the formats handled by the readers", () => {
  for (const name of ["a.jpg", "B.JPEG", "c.png", "d.webp", "e.GIF", "f.avif", "g.tiff", "h.tif"]) {
    assert.ok(isImageName(name), `expected ${name} to be an image`);
  }
});

test("isImageName rejects non-image extensions and bare names", () => {
  for (const name of ["a.txt", "b.cbz", "thumbs.db", "noext"]) {
    assert.equal(isImageName(name), false, `expected ${name} to be rejected`);
  }
});
