import path from "node:path";
import fs from "node:fs";
import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const root = path.resolve(__dirname, "..");

/**
 * All env vars consumed by the server, validated with Zod. Coercions are
 * intentional: `PORT`, `LOG_LEVEL`, the rate-limit knobs and the cache
 * size all come from the environment as strings, but downstream code
 * expects numbers / enums. Centralising the parsing here means the rest
 * of the codebase can `import { config }` without re-validating.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z
    .string()
    .optional()
    .transform((value) => Number.parseInt(value ?? "4000", 10))
    .pipe(z.number().int().positive().max(65_535)),
  DATABASE_URL: z
    .string({
      required_error:
        "DATABASE_URL is not set. Copy apps/server/.env.example to apps/server/.env and fill in the Postgres connection string.",
    })
    .min(1)
    .refine((value) => /^postgres(ql)?:\/\//.test(value), {
      message: "DATABASE_URL must be a postgres:// or postgresql:// URL",
    }),
  LIBRARY_PATH: z.string().optional(),
  CACHE_DIR: z.string().optional(),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error", "silent"]).default("info"),
  /** Soft cap on how many entries we keep in the memory page cache. */
  PAGE_MEMORY_CACHE_ITEMS: z
    .string()
    .optional()
    .transform((value) => Number.parseInt(value ?? "60", 10))
    .pipe(z.number().int().min(8).max(2_000)),
  /** Comma-separated list of allowed origins; empty/`*` means allow all (default for dev). */
  CORS_ORIGINS: z.string().optional(),
  /** Window for the public rate limiter, in seconds. */
  RATE_LIMIT_WINDOW_SECONDS: z
    .string()
    .optional()
    .transform((value) => Number.parseInt(value ?? "60", 10))
    .pipe(z.number().int().positive().max(86_400)),
  /** Max requests per IP per window for read endpoints. */
  RATE_LIMIT_MAX: z
    .string()
    .optional()
    .transform((value) => Number.parseInt(value ?? "600", 10))
    .pipe(z.number().int().positive().max(100_000)),
  /** Max upload requests per IP per window. */
  RATE_LIMIT_UPLOAD_MAX: z
    .string()
    .optional()
    .transform((value) => Number.parseInt(value ?? "30", 10))
    .pipe(z.number().int().positive().max(10_000)),
  /** Soft cap on per-request payload size for JSON bodies. */
  JSON_BODY_LIMIT: z.string().default("10mb"),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
    .join("\n");
  throw new Error(`Invalid server environment:\n${issues}`);
}

const env = parsed.data;

export const config = {
  env: env.NODE_ENV,
  isProduction: env.NODE_ENV === "production",
  isTest: env.NODE_ENV === "test",
  port: env.PORT,
  databaseUrl: env.DATABASE_URL,
  libraryPath: resolveLibraryPath(env.LIBRARY_PATH),
  cacheDir: resolveCacheDir(env.CACHE_DIR),
  pageMemoryCacheItems: env.PAGE_MEMORY_CACHE_ITEMS,
  thumbWidth: 320,
  coverWidth: 600,
  logLevel: env.LOG_LEVEL,
  corsOrigins: parseCorsOrigins(env.CORS_ORIGINS),
  jsonBodyLimit: env.JSON_BODY_LIMIT,
  rateLimit: {
    windowMs: env.RATE_LIMIT_WINDOW_SECONDS * 1000,
    max: env.RATE_LIMIT_MAX,
    uploadMax: env.RATE_LIMIT_UPLOAD_MAX,
  },
} as const;

function resolveLibraryPath(envPath: string | undefined): string {
  // Default to scanning from data/ folder where user files are
  let target = path.resolve(root, "data");
  if (envPath) {
    target = path.isAbsolute(envPath) ? envPath : path.resolve(root, envPath);
  }
  fs.mkdirSync(target, { recursive: true });
  return target;
}

function resolveCacheDir(envPath: string | undefined): string {
  const target = envPath
    ? path.isAbsolute(envPath)
      ? envPath
      : path.resolve(root, envPath)
    : path.resolve(root, "cache");
  fs.mkdirSync(target, { recursive: true });
  return target;
}

function parseCorsOrigins(value: string | undefined): "*" | string[] {
  if (!value || value.trim() === "" || value.trim() === "*") return "*";
  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}
