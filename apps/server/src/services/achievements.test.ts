import { test } from "node:test";
import assert from "node:assert/strict";
import { ACHIEVEMENTS } from "./achievements";

test("achievement catalog has stable, unique ids", () => {
  const seen = new Set<string>();
  for (const def of ACHIEVEMENTS) {
    assert.ok(def.id.length > 0, "achievement id is non-empty");
    assert.ok(!seen.has(def.id), `duplicate achievement id: ${def.id}`);
    seen.add(def.id);
  }
  // Catalog is intentionally large — guard against accidental shrinkage.
  assert.ok(ACHIEVEMENTS.length >= 100, `expected 100+ achievements, got ${ACHIEVEMENTS.length}`);
});

test("every achievement has a non-empty title and description", () => {
  for (const def of ACHIEVEMENTS) {
    assert.ok(def.title.trim().length > 0, `${def.id} missing title`);
    assert.ok(def.description.trim().length > 0, `${def.id} missing description`);
  }
});

test("every achievement is in a known group", () => {
  const allowed = new Set([
    "milestones",
    "pages",
    "streaks",
    "favorites",
    "library",
    "modes",
    "formats",
    "categories",
    "series",
    "exploration",
    "secret",
  ]);
  for (const def of ACHIEVEMENTS) {
    assert.ok(allowed.has(def.group), `${def.id} has unknown group ${def.group}`);
  }
});

test("a fresh-context user (no reads) unlocks zero achievements", () => {
  const ctx = {
    totalRead: 0,
    totalPages: 0,
    currentStreak: 0,
    longestStreak: 0,
    favorites: 0,
    libraryComics: 0,
    categoriesCompleted: 0,
    formatsCompleted: 0,
    completedFormats: new Set<string>(),
    totalReadingDays: 0,
    daysActive7: 0,
    daysActive30: 0,
    longestComicCompleted: 0,
    bestDayPages: 0,
    todayPages: 0,
  };
  for (const def of ACHIEVEMENTS) {
    assert.equal(def.check(ctx), false, `${def.id} unexpectedly unlocks for an empty profile`);
  }
});

test("first-comic milestone unlocks once one comic is completed", () => {
  const ctx = {
    totalRead: 1,
    totalPages: 22,
    currentStreak: 1,
    longestStreak: 1,
    favorites: 0,
    libraryComics: 1,
    categoriesCompleted: 0,
    formatsCompleted: 1,
    completedFormats: new Set(["cbz"]),
    totalReadingDays: 1,
    daysActive7: 1,
    daysActive30: 1,
    longestComicCompleted: 22,
    bestDayPages: 22,
    todayPages: 22,
  };
  const firstComic = ACHIEVEMENTS.find((a) => a.id === "comics-1");
  assert.ok(firstComic, "comics-1 achievement is registered");
  assert.equal(firstComic!.check(ctx), true);
});
