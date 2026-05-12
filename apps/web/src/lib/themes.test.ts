import { test } from "node:test";
import assert from "node:assert/strict";
import { THEMES, THEME_GROUPS, THEME_COUNTS, getTheme } from "./themes";

test("theme catalog is non-empty and ids are unique", () => {
  assert.ok(THEMES.length >= 30, `expected 30+ themes, got ${THEMES.length}`);
  const seen = new Set<string>();
  for (const theme of THEMES) {
    assert.ok(!seen.has(theme.id), `duplicate id ${theme.id}`);
    seen.add(theme.id);
  }
});

test("every theme has the required colour tokens", () => {
  const required = [
    "bg",
    "fg",
    "surface1",
    "surface2",
    "surface3",
    "accent",
    "text1",
    "text2",
    "text3",
    "border",
    "readerBg",
  ] as const;
  for (const theme of THEMES) {
    for (const key of required) {
      const value = theme[key];
      assert.ok(typeof value === "string" && value.length > 0, `${theme.id}.${key} is missing`);
      assert.ok(/^#[0-9a-f]{3,8}$/i.test(value), `${theme.id}.${key} (${value}) is not a hex color`);
    }
  }
});

test("THEME_GROUPS covers every group used by the catalog", () => {
  const declared = new Set(THEME_GROUPS.map((g) => g.id));
  for (const theme of THEMES) {
    assert.ok(declared.has(theme.group), `theme ${theme.id} uses undeclared group ${theme.group}`);
  }
});

test("THEME_COUNTS reflects the actual counts per group", () => {
  for (const group of THEME_GROUPS) {
    const actual = THEMES.filter((t) => t.group === group.id).length;
    assert.equal(THEME_COUNTS[group.id], actual, `count drift for ${group.id}`);
  }
});

test("getTheme falls back to the dark default for unknown ids", () => {
  assert.equal(getTheme("does-not-exist").id, THEMES[0].id);
  assert.equal(getTheme(null).id, THEMES[0].id);
  assert.equal(getTheme(undefined).id, THEMES[0].id);
});

test("getTheme returns the requested theme when it exists", () => {
  for (const theme of THEMES.slice(0, 5)) {
    assert.equal(getTheme(theme.id).id, theme.id);
  }
});
