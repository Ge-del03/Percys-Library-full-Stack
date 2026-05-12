/// <reference types="node" />

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { pruneSelectionToVisible } from "./selection";

test("pruneSelectionToVisible keeps only visible ids", () => {
  const next = pruneSelectionToVisible(new Set(["a", "b", "c"]), ["b", "d"]);
  assert.deepEqual(Array.from(next), ["b"]);
});

test("pruneSelectionToVisible preserves an already valid selection", () => {
  const next = pruneSelectionToVisible(["x", "y"], new Set(["x", "y", "z"]));
  assert.deepEqual(Array.from(next), ["x", "y"]);
});