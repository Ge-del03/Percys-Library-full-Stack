import { PrismaClient, Prisma } from "@prisma/client";
import { config } from "./config";
import { logger } from "./lib/logger";

const log = logger.child("db");

/**
 * Underlying Prisma client. Use `prisma` (the extended export below)
 * for normal app code so every query inherits transient-error retry
 * behaviour. The raw client is kept for the rare callers that need to
 * opt out of retries (e.g. interactive transactions where the retry
 * itself would corrupt semantics).
 */
const rawPrisma = new PrismaClient({
  log: config.logLevel === "debug"
    ? ["query", "info", "warn", "error"]
    : config.logLevel === "info"
      ? ["warn", "error"]
      : config.logLevel === "warn"
        ? ["warn", "error"]
        : config.logLevel === "error"
          ? ["error"]
          : [],
  // Allow the user to override the connection-string at runtime so a
  // dev box can point at Supabase without rebuilding the bundle.
  datasources: { db: { url: config.databaseUrl } },
});

/**
 * Prisma client extended with a thin retry shim on every query. When a
 * Supabase pooler hiccups (P1001 / P1017 / P2024 / network reset) the
 * extension retries the query 2 more times with exponential backoff
 * before letting the error propagate. This keeps the user's session
 * stable across the kinds of momentary outages that are routine for
 * any externally-hosted Postgres — the price is a slightly slower
 * worst-case error path, which is exactly the trade we want.
 */
export const prisma = rawPrisma.$extends({
  name: "transient-retry",
  query: {
    $allOperations: async ({ args, query }) => {
      return withDbRetry(() => query(args), { attempts: 3 });
    },
  },
}) as unknown as PrismaClient;

// Per-process memo of owners we've already proven exist, so repeat
// requests don't pay for a DB round-trip just to confirm a row that's
// already there. The set is cleared by `disconnectDatabase` so tests
// that disconnect/reconnect see a clean slate.
const ensuredOwners = new Set<string>();

/**
 * Idempotently make sure a Settings row exists for the given owner.
 *
 * Uses `createMany({ skipDuplicates: true })` so concurrent first-touch
 * requests for the same owner can't deadlock on the `(ownerId)`
 * unique-constraint race that `findUnique` + `create` had under load
 * (the stress harness reproduced 60+ failures/second this way). After
 * the first successful call we short-circuit on subsequent ones to
 * keep the read path single-query.
 */
export async function ensureSettings(ownerId = "default") {
  if (ensuredOwners.has(ownerId)) return;
  // Use the raw client here so we don't double-retry: the extended
  // `prisma` already wraps every query in `withDbRetry` via
  // $allOperations, so wrapping a second time would compound the budget
  // (4 outer × 3 inner = up to 12 attempts) and stall server boot when
  // Supabase is briefly unreachable.
  await rawPrisma.settings.createMany({
    data: [{ ownerId }],
    skipDuplicates: true,
  });
  ensuredOwners.add(ownerId);
}

export async function disconnectDatabase() {
  ensuredOwners.clear();
  await rawPrisma.$disconnect();
}

/** Light health probe used by `/api/health/ready`. Returns true if the
 *  database accepts a trivial round-trip query within the timeout. */
export async function pingDatabase(timeoutMs = 1500): Promise<boolean> {
  return Promise.race([
    rawPrisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), timeoutMs)),
  ]);
}

/**
 * Prisma error codes that indicate a transient connectivity blip rather
 * than a real bug in the query. We retry these with exponential backoff
 * before surfacing to the caller, so a momentary Supabase pooler hiccup
 * (timeouts, "connection unavailable", "server has closed the
 * connection") doesn't cascade into a 500 the user sees.
 */
const TRANSIENT_PRISMA_CODES = new Set([
  "P1001", // Can't reach database server
  "P1002", // Database server timed out
  "P1008", // Operations timed out
  "P1017", // Server has closed the connection
  "P2024", // Timed out fetching a connection from the pool
  "P2034", // Transaction failed due to a write conflict / serialization
]);

const TRANSIENT_NETWORK_HINTS = [
  "ECONNRESET",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "Connection terminated",
  "Connection refused",
  "Closed connection",
  "ConnectionUnavailable",
];

function isTransientDbError(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    return TRANSIENT_PRISMA_CODES.has(err.code);
  }
  if (err instanceof Prisma.PrismaClientInitializationError) return true;
  // Rust panics are *not* transient — the engine is in an indeterminate
  // state and the Prisma docs say the process must be restarted. Retrying
  // would just burn through the backoff budget while masking a critical
  // failure that should escalate (logged + bubbled up) immediately.
  if (err instanceof Prisma.PrismaClientRustPanicError) return false;
  const message =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : "";
  return TRANSIENT_NETWORK_HINTS.some((hint) => message.includes(hint));
}

/** Sleep helper that avoids leaking unref timers in test runs. */
function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    if (typeof t === "object" && t && "unref" in t) (t as { unref: () => void }).unref();
  });
}

/**
 * Run a Prisma query with retry on transient errors. Backs off
 * exponentially (50ms, 150ms, 450ms by default) and rethrows the last
 * error if all attempts fail. Non-transient errors propagate
 * immediately so application-level bugs don't get masked.
 *
 * Use this anywhere a single-shot Supabase outage shouldn't break the
 * UI — list pulls, settings reads, scanning, etc. Mutations that aren't
 * idempotent should opt out (or wrap their own outer transaction).
 */
export async function withDbRetry<T>(
  fn: () => Promise<T>,
  options: { attempts?: number; baseDelayMs?: number; label?: string } = {},
): Promise<T> {
  const attempts = Math.max(1, options.attempts ?? 4);
  const baseDelay = Math.max(10, options.baseDelayMs ?? 50);
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isTransientDbError(err) || i === attempts - 1) throw err;
      const delay = baseDelay * Math.pow(3, i);
      log.warn("transient db error, retrying", {
        label: options.label,
        attempt: i + 1,
        delay,
        message: err instanceof Error ? err.message : String(err),
      });
      await sleep(delay);
    }
  }
  throw lastErr;
}

let lastDbState: "up" | "down" | "unknown" = "unknown";

/**
 * Background watchdog: pings the database on an interval and emits a
 * single log line whenever connectivity flips up↔down. Used so a
 * Supabase outage produces ONE alert at the top of the logs instead
 * of hundreds of per-request errors.
 *
 * The interval is unref'd so it never holds the process open during
 * graceful shutdown / tests. Call the returned `stop()` to tear it
 * down explicitly.
 */
export function startDatabaseWatchdog(intervalMs = 30_000): () => void {
  let stopped = false;
  async function tick() {
    if (stopped) return;
    const ok = await pingDatabase(2_000);
    const next = ok ? "up" : "down";
    if (next !== lastDbState) {
      if (next === "down") {
        log.warn("database appears unreachable", { intervalMs });
      } else if (lastDbState === "down") {
        log.info("database connection restored");
      }
      lastDbState = next;
    }
  }
  void tick();
  const handle = setInterval(() => void tick(), intervalMs);
  if (typeof handle === "object" && handle && "unref" in handle) {
    (handle as { unref: () => void }).unref();
  }
  return () => {
    stopped = true;
    clearInterval(handle);
  };
}
