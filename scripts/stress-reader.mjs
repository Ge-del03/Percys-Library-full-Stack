#!/usr/bin/env node
/**
 * End-to-end reader stress test.
 *
 * Walks every page of the largest comic registered in the library and
 * times the full request → server → extractor → cache pipeline. Used to
 * verify a 1000-page document can be paged through under sane limits in
 * each reading mode (each one differs only in pre-fetch order, which we
 * simulate by varying request concurrency and access pattern).
 *
 * Run with: `npm run stress:reader -- --base http://localhost:4000`
 */
import { performance } from "node:perf_hooks";
import process from "node:process";

const args = parseArgs(process.argv.slice(2));
const BASE = args.base ?? "http://localhost:4000";
const OWNER = args.owner ?? "default";

function parseArgs(list) {
  const out = {};
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (a.startsWith("--")) {
      const next = list[i + 1];
      if (next && !next.startsWith("--")) {
        out[a.slice(2)] = next;
        i++;
      } else {
        out[a.slice(2)] = "true";
      }
    }
  }
  return out;
}

async function fetchJson(path) {
  const r = await fetch(`${BASE}${path}`, {
    headers: { "x-owner-id": OWNER },
  });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} for ${path}`);
  return r.json();
}

async function fetchBytes(path) {
  const r = await fetch(`${BASE}${path}`, {
    headers: { "x-owner-id": OWNER },
  });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} for ${path}`);
  await r.arrayBuffer();
}

async function withConcurrency(items, concurrency, worker) {
  let i = 0;
  let done = 0;
  let lastLog = performance.now();
  const fail = [];
  const results = [];
  async function run() {
    while (i < items.length) {
      const idx = i++;
      try {
        const t0 = performance.now();
        await worker(items[idx], idx);
        results.push(performance.now() - t0);
      } catch (err) {
        fail.push({ idx, error: err.message ?? String(err) });
      }
      done++;
      if (performance.now() - lastLog > 1500) {
        process.stdout.write(`\r  progress: ${done}/${items.length}`);
        lastLog = performance.now();
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, run));
  process.stdout.write(`\r  progress: ${done}/${items.length}\n`);
  return { results, fail };
}

function summarise(samples, label) {
  if (samples.length === 0) {
    console.log(`  ${label}: no samples`);
    return;
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const p = (q) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
  const total = samples.reduce((a, b) => a + b, 0);
  console.log(
    `  ${label}: n=${samples.length}  avg=${(total / samples.length).toFixed(1)}ms  ` +
      `p50=${p(0.5).toFixed(1)}ms  p95=${p(0.95).toFixed(1)}ms  p99=${p(0.99).toFixed(1)}ms  ` +
      `max=${p(1).toFixed(1)}ms`,
  );
}

async function main() {
  console.log(`Reader stress against ${BASE}`);
  const lib = await fetchJson("/api/library");
  if (lib.length === 0) {
    console.error("Library is empty. Run `npm run gen:fixtures` first.");
    process.exit(1);
  }
  const big = lib.reduce((acc, c) => (c.pageCount > acc.pageCount ? c : acc), lib[0]);
  console.log(`Picked "${big.title}" — ${big.pageCount} pages, ${big.format}`);
  const id = big.id;
  const total = big.pageCount;

  // 1) Single-page sequential — simulates "scroll-v" mode walking page by
  //    page. The cache should kick in on the second sweep so the second
  //    pass is dramatically faster than the first.
  console.log("\n[1/4] Sequential walk (paged-h / scroll-v)");
  const seq = await withConcurrency(
    Array.from({ length: total }, (_, i) => i),
    1,
    (i) => fetchBytes(`/api/comics/${id}/pages/${i}`),
  );
  summarise(seq.results, "sequential first pass");
  if (seq.fail.length) console.log(`  ! ${seq.fail.length} failures`);

  // 2) Re-walk: this should be near-instant due to disk cache + LRU.
  console.log("\n[2/4] Sequential walk #2 (cached)");
  const seq2 = await withConcurrency(
    Array.from({ length: total }, (_, i) => i),
    1,
    (i) => fetchBytes(`/api/comics/${id}/pages/${i}`),
  );
  summarise(seq2.results, "sequential cached pass");

  // 3) Reverse walk — simulates RTL / "right-to-left" reading order.
  console.log("\n[3/4] Reverse walk (paged-h RTL)");
  const rev = await withConcurrency(
    Array.from({ length: total }, (_, i) => total - 1 - i),
    1,
    (i) => fetchBytes(`/api/comics/${id}/pages/${i}`),
  );
  summarise(rev.results, "reverse pass");

  // 4) Concurrent fan-out — simulates the webtoon / continuous-scroll
  //    preload window pulling many pages in parallel.
  console.log("\n[4/4] Concurrent webtoon fan-out (8x)");
  const fan = await withConcurrency(
    Array.from({ length: total }, (_, i) => i),
    8,
    (i) => fetchBytes(`/api/comics/${id}/pages/${i}`),
  );
  summarise(fan.results, "concurrent (8x)");
  if (fan.fail.length) console.log(`  ! ${fan.fail.length} failures`);

  // 5) Thumbnails — the strip lazy-loads but we want to confirm every
  //    page can produce a thumbnail without any lurking failure.
  console.log("\n[5/5] Every thumbnail");
  const thumbs = await withConcurrency(
    Array.from({ length: total }, (_, i) => i),
    16,
    (i) => fetchBytes(`/api/comics/${id}/thumbs/${i}`),
  );
  summarise(thumbs.results, "thumbnails");
  if (thumbs.fail.length) console.log(`  ! ${thumbs.fail.length} failures`);

  console.log("\nAll passes complete.");
}

main().catch((err) => {
  console.error("\nstress-reader: fatal:", err);
  process.exit(1);
});
