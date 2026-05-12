import { Router } from "express";
import { pingDatabase } from "../db";
import { config } from "../config";
import { asyncHandler } from "../lib/async-handler";

export const healthRouter = Router();

const startedAt = Date.now();

/** Liveness — process is up. Cheap, never touches the DB. */
healthRouter.get("/", (_req, res) => {
  res.json({
    ok: true,
    env: config.env,
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
  });
});

/** Readiness — server can satisfy requests end-to-end (DB reachable). */
healthRouter.get(
  "/ready",
  asyncHandler(async (_req, res) => {
    const dbOk = await pingDatabase();
    if (!dbOk) {
      return res.status(503).json({ ok: false, db: "down" });
    }
    res.json({ ok: true, db: "up" });
  }),
);
