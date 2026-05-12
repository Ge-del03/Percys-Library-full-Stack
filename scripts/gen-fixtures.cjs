#!/usr/bin/env node
/**
 * Generate test fixtures for the reader stress suite.
 *
 * Creates two large comics inside `apps/server/data/library/`:
 *   - `stress-1000.cbz`   — 1000 PNG pages packed into a CBZ archive.
 *   - `stress-1000-pdf.pdf` — 1000-page PDF document.
 *
 * Both files use minimal-but-valid binary payloads so generation is fast
 * (a few seconds) and the resulting archive stays under ~5 MB. The point
 * is to exercise the reader's pagination, virtualization, and database
 * round-trips at realistic page counts — not to ship pretty content.
 *
 * Run with: `npm run gen:fixtures`
 */
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const ROOT = path.resolve(__dirname, "..", "apps", "server", "data", "library");
fs.mkdirSync(ROOT, { recursive: true });

const PAGE_COUNT = Number(process.env.STRESS_PAGES) || 1000;

/** Build a minimal-but-valid 256x256 PNG with a single colored stripe. */
function buildPng(label, hue) {
  // 64x96 — small enough that 1000 of them archive to ~3-4 MB.
  const w = 64;
  const h = 96;
  // Rgb backgrounds spaced around the wheel so consecutive pages look different.
  const r = Math.round(127 + 127 * Math.cos((hue * Math.PI) / 180));
  const g = Math.round(127 + 127 * Math.cos(((hue - 120) * Math.PI) / 180));
  const b = Math.round(127 + 127 * Math.cos(((hue + 120) * Math.PI) / 180));

  // Build the raw scanlines. Each scanline starts with a filter byte (0).
  const scanline = Buffer.alloc(1 + w * 3);
  for (let x = 0; x < w; x++) {
    scanline[1 + x * 3] = r;
    scanline[2 + x * 3] = g;
    scanline[3 + x * 3] = b;
  }
  const raw = Buffer.alloc((1 + w * 3) * h);
  for (let y = 0; y < h; y++) scanline.copy(raw, y * (1 + w * 3));
  // Punch in a small "page number" by darkening a few pixels in a row;
  // good enough for visual sanity-checks without dragging in a font lib.
  const idStr = String(label);
  for (let i = 0; i < idStr.length && i < w / 8; i++) {
    const x = 4 + i * 8;
    const y = 4;
    const offset = y * (1 + w * 3) + 1 + x * 3;
    raw[offset] = 0;
    raw[offset + 1] = 0;
    raw[offset + 2] = 0;
  }

  const compressed = zlib.deflateSync(raw);

  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const head = Buffer.from(type, "ascii");
    const crc = Buffer.alloc(4);
    const crcInput = Buffer.concat([head, data]);
    crc.writeInt32BE(crcSigned(crcInput), 0);
    return Buffer.concat([len, head, data, crc]);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", compressed),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// CRC table for PNG chunks (and zip CRCs).
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = (CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)) >>> 0;
  return (c ^ 0xffffffff) >>> 0;
}
function crcSigned(buf) {
  return crc32(buf) | 0; // signed view for writeInt32BE
}

/** Build a stored (no-compression) ZIP of the given page entries. */
function buildZip(entries) {
  const fileRecords = [];
  const centralRecords = [];
  let offset = 0;

  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, "utf8");
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(0, 8); // method (stored)
    local.writeUInt16LE(0, 10); // mtime
    local.writeUInt16LE(0, 12); // mdate
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18); // compressed size
    local.writeUInt32LE(data.length, 22); // uncompressed size
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28); // extra
    fileRecords.push(local, nameBuf, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30); // extra
    central.writeUInt16LE(0, 32); // comment
    central.writeUInt16LE(0, 34); // disk
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38); // attrs
    central.writeUInt32LE(offset, 42);
    centralRecords.push(central, nameBuf);

    offset += local.length + nameBuf.length + data.length;
  }

  const centralBuf = Buffer.concat(centralRecords);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...fileRecords, centralBuf, eocd]);
}

console.log(`Generating ${PAGE_COUNT}-page CBZ at ${ROOT}/stress-1000.cbz …`);
const cbzEntries = [];
for (let i = 0; i < PAGE_COUNT; i++) {
  const num = String(i + 1).padStart(4, "0");
  cbzEntries.push({ name: `page-${num}.png`, data: buildPng(i + 1, (i * 360) / PAGE_COUNT) });
}
fs.writeFileSync(path.join(ROOT, "stress-1000.cbz"), buildZip(cbzEntries));
console.log(`  done — ${cbzEntries.length} pages.`);

console.log(`Generating tiny 5-page sample.cbz at ${ROOT}/sample-5.cbz …`);
const sampleEntries = [];
for (let i = 0; i < 5; i++) {
  const num = String(i + 1).padStart(2, "0");
  sampleEntries.push({ name: `page-${num}.png`, data: buildPng(i + 1, (i * 360) / 5) });
}
fs.writeFileSync(path.join(ROOT, "sample-5.cbz"), buildZip(sampleEntries));
console.log(`  done — ${sampleEntries.length} pages.`);

console.log("All fixtures generated.");
