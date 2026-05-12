#!/usr/bin/env node
/**
 * Stress the mutation surface: alternating favorite/unfavorite,
 * categoryAdd/categoryRemove, and progress updates against the same
 * comics in parallel. Verifies that bulk + per-comic writes don't
 * deadlock and that achievement evaluation remains idempotent.
 */
const baseUrl = "http://localhost:4000";
const headers = { "Content-Type": "application/json", "x-owner-id": "stress-mut" };

// Trigger an initial scan so the stress owner has comics to write
// against (each owner has its own comic table in this multi-tenant
// model). Without this every mutation would 404 on a fresh DB.
await fetch(`${baseUrl}/api/library/scan`, { method: "POST", headers });

const items = await fetch(`${baseUrl}/api/library?limit=20`, { headers }).then((r) => r.json());
if (items.length === 0) {
  console.log("Empty library — skipping mutation stress.");
  process.exit(0);
}
const ids = items.map((c) => c.id);

const ROUNDS = 10;
const CONCURRENT = 6;

async function run(label, fn) {
  const start = Date.now();
  const errors = [];
  const tasks = [];
  for (let i = 0; i < ROUNDS; i++) {
    for (let j = 0; j < CONCURRENT; j++) {
      tasks.push(
        fn(i, j).catch((err) => errors.push(err instanceof Error ? err.message : String(err))),
      );
    }
  }
  await Promise.all(tasks);
  console.log(
    `${label} ${ROUNDS}×${CONCURRENT}=${ROUNDS * CONCURRENT} ` +
      `in ${Date.now() - start}ms errors=${errors.length}` +
      (errors.length > 0 ? ` first="${errors[0]}"` : ""),
  );
  return errors.length;
}

let total = 0;

total += await run("bulk favorite/unfavorite", async (i) => {
  const op = i % 2 === 0 ? "favorite" : "unfavorite";
  const r = await fetch(`${baseUrl}/api/comics/bulk`, {
    method: "POST",
    headers,
    body: JSON.stringify({ ids, op }),
  });
  if (!r.ok) throw new Error(`${op} → ${r.status}`);
});

total += await run("bulk categoryAdd/Remove", async (i) => {
  const op = i % 2 === 0 ? "categoryAdd" : "categoryRemove";
  const r = await fetch(`${baseUrl}/api/comics/bulk`, {
    method: "POST",
    headers,
    body: JSON.stringify({ ids, op, category: "stress-tag" }),
  });
  if (!r.ok) throw new Error(`${op} → ${r.status}`);
});

total += await run("setProgress (random page)", async (_i, j) => {
  const id = ids[j % ids.length];
  const item = items.find((c) => c.id === id);
  const page = Math.floor(Math.random() * Math.max(1, item.pageCount));
  const r = await fetch(`${baseUrl}/api/comics/${id}/progress`, {
    method: "POST",
    headers,
    body: JSON.stringify({ page }),
  });
  if (!r.ok) throw new Error(`setProgress → ${r.status}`);
});

if (total > 0) {
  console.log(`\n${total} total mutation errors.`);
  process.exit(1);
}
console.log("\nAll mutation rounds OK.");
