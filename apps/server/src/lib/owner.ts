import type { Request } from "express";

const VALID_OWNER_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

export function getOwnerId(req: Request): string {
  const raw = req.header("x-owner-id")?.trim();
  if (!raw) return "default";
  if (!VALID_OWNER_ID_PATTERN.test(raw)) {
    return "default";
  }
  return raw;
}

export function validateOwnerId(id: string): boolean {
  return VALID_OWNER_ID_PATTERN.test(id);
}

