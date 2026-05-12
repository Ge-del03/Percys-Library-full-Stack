#!/usr/bin/env node
/**
 * Reader-pipeline stress harness. Hits /covers, /pages and /thumbs for
 * every comic in the library concurrently to exercise the LRU + disk
 * cache and the image extraction pipeline. Defaults to the first 5
 * comics × 4 pages each at 32 connections.
 */
import autocannon from "autocannon";

const baseUrl = "http://localhost:4000";

const ids = await fetch(`${baseUrl}/api/library?limit=20`)
  .then((r) => r.json())
  .then((items) => items.map((c) => ({ id: c.id, pageCount: c.pageCount })));

if (ids.length === 0) {
  console.log("Empty library — nothing to stress.");
  process.exit(0);
}

const requests = [];
for (const { id, pageCount } of ids.slice(0, 5)) {
  requests.push({ method: "GET", path: `/api/comics/${id}/cover` });
  for (let p = 0; p < Math.min(pageCount, 4); p++) {
    requests.push({ method: "GET", path: `/api/comics/${id}/pages/${p}` });
    requests.push({ method: "GET", path: `/api/comics/${id}/thumbs/${p}` });
  }
}

console.log(
  `Stress reader pipeline: ${requests.length} unique URLs across ${ids.length} comic(s)`,
);
const result = await new Promise((resolve, reject) =>
  autocannon(
    {
      url: baseUrl,
      duration: Number.parseInt(process.argv[2] ?? "8", 10),
      connections: 32,
      pipelining: 1,
      requests,
      headers: { "x-owner-id": "stress" },
    },
    (err, r) => (err ? reject(err) : resolve(r)),
  ),
);

const errors = (result.non2xx ?? 0) + (result.errors ?? 0);
console.log(
  `total=${result.requests.total} errors=${errors} non2xx=${result.non2xx} timeouts=${result.timeouts} ` +
    `rps=${Math.round(result.requests.average)} p50=${result.latency.p50}ms p99=${result.latency.p99}ms`,
);
if (errors > 0) process.exit(1);
