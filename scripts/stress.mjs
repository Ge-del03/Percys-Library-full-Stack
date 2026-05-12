#!/usr/bin/env node
/**
 * Stress test harness for the Percys API. Drives autocannon against
 * the read-heavy endpoints with realistic concurrency, then summarises
 * latency / throughput per scenario. Run with:
 *
 *     npm run stress              # against http://localhost:4000
 *     npm run stress -- --url=http://localhost:4000 --duration=10
 *
 * Each scenario runs sequentially so the server isn't fighting four
 * load profiles at once. The exit code is non-zero only if a scenario
 * produced any non-2xx responses, so this is safe to wire into CI.
 */
import autocannon from "autocannon";

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const eq = arg.indexOf("=");
    if (!arg.startsWith("--") || eq === -1) return [arg.replace(/^--/, ""), "true"];
    return [arg.slice(2, eq), arg.slice(eq + 1)];
  }),
);

const baseUrl = args.url ?? "http://localhost:4000";
const duration = Number.parseInt(args.duration ?? "8", 10);
const connections = Number.parseInt(args.connections ?? "32", 10);
const pipelining = Number.parseInt(args.pipelining ?? "2", 10);

const SCENARIOS = [
  {
    name: "GET /api/health",
    path: "/api/health",
    connections: 64,
    pipelining: 4,
  },
  {
    name: "GET /api/health/ready",
    path: "/api/health/ready",
    connections: 32,
    pipelining: 1,
  },
  {
    name: "GET /api/library",
    path: "/api/library",
    connections,
    pipelining,
  },
  {
    name: "GET /api/library?limit=50&offset=0&sort=updatedAt",
    path: "/api/library?limit=50&offset=0&sort=updatedAt",
    connections,
    pipelining,
  },
  {
    name: "GET /api/library/summary",
    path: "/api/library/summary",
    connections,
    pipelining,
  },
  {
    name: "GET /api/settings",
    path: "/api/settings",
    connections,
    pipelining,
  },
  {
    name: "GET /api/stats",
    path: "/api/stats",
    connections,
    pipelining,
  },
];

function formatNumber(n) {
  if (n === undefined || n === null || Number.isNaN(n)) return "—";
  if (n >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  return n.toFixed(2);
}

async function runScenario(scenario) {
  return new Promise((resolve, reject) => {
    autocannon(
      {
        url: baseUrl + scenario.path,
        duration,
        connections: scenario.connections,
        pipelining: scenario.pipelining,
        headers: { "x-owner-id": "stress" },
      },
      (err, result) => {
        if (err) return reject(err);
        resolve(result);
      },
    );
  });
}

async function main() {
  console.log(`Stress run target=${baseUrl} duration=${duration}s`);
  const summaries = [];
  let anyErrors = false;
  for (const scenario of SCENARIOS) {
    process.stdout.write(`\n• ${scenario.name} (c=${scenario.connections}, p=${scenario.pipelining}) ... `);
    try {
      const result = await runScenario(scenario);
      const totalRequests = result.requests.total;
      const non2xx = result.non2xx + result.errors;
      summaries.push({
        scenario: scenario.name,
        rps: result.requests.average,
        p50: result.latency.p50,
        p99: result.latency.p99,
        total: totalRequests,
        non2xx,
        timeouts: result.timeouts,
      });
      if (non2xx > 0) anyErrors = true;
      console.log(`done (${totalRequests} reqs, ${non2xx} errors)`);
    } catch (err) {
      anyErrors = true;
      console.log(`failed: ${err instanceof Error ? err.message : err}`);
      summaries.push({ scenario: scenario.name, error: err instanceof Error ? err.message : String(err) });
    }
  }

  console.log("\nResults\n=======");
  console.log(
    "scenario".padEnd(56) +
      "rps".padStart(10) +
      "p50ms".padStart(10) +
      "p99ms".padStart(10) +
      "total".padStart(10) +
      "errors".padStart(10),
  );
  for (const s of summaries) {
    if (s.error) {
      console.log(`${s.scenario.padEnd(56)} ${"ERROR".padStart(50)}`);
      continue;
    }
    console.log(
      s.scenario.padEnd(56) +
        formatNumber(s.rps).padStart(10) +
        formatNumber(s.p50).padStart(10) +
        formatNumber(s.p99).padStart(10) +
        formatNumber(s.total).padStart(10) +
        formatNumber(s.non2xx).padStart(10),
    );
  }

  if (anyErrors) {
    console.log("\nOne or more scenarios reported errors.");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
