import path from "node:path";
import dotenv from "dotenv";

dotenv.config();

const root = path.resolve(__dirname, "..");

if (!process.env.DATABASE_URL) {
  // Fail loudly at startup so the user sees a clear error instead of a
  // confusing Prisma error 30 seconds later when the first query runs.
  throw new Error(
    "DATABASE_URL is not set. Copy apps/server/.env.example to .env and " +
      "point it at your Postgres / Supabase database.",
  );
}

export const config = {
  port: parseInt(process.env.PORT ?? "4000", 10),
  databaseUrl: process.env.DATABASE_URL,
  libraryPath: path.resolve(root, process.env.LIBRARY_PATH ?? "./data/library"),
  cacheDir: path.resolve(root, process.env.CACHE_DIR ?? "./cache"),
  pageMemoryCacheItems: 60,
  thumbWidth: 320,
  coverWidth: 600,
};
