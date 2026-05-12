import { test } from "node:test";
import assert from "node:assert/strict";
import type { Request } from "express";
import { getOwnerId, validateOwnerId } from "./owner";

function fakeRequest(headers: Record<string, string>): Request {
  return {
    header(name: string) {
      return headers[name.toLowerCase()];
    },
  } as unknown as Request;
}

test("getOwnerId falls back to default when header is missing", () => {
  assert.equal(getOwnerId(fakeRequest({})), "default");
});

test("getOwnerId returns the supplied id when valid", () => {
  assert.equal(getOwnerId(fakeRequest({ "x-owner-id": "alice_42" })), "alice_42");
});

test("getOwnerId rejects ids with disallowed characters", () => {
  assert.equal(getOwnerId(fakeRequest({ "x-owner-id": "../etc/passwd" })), "default");
  assert.equal(getOwnerId(fakeRequest({ "x-owner-id": "alice & bob" })), "default");
});

test("getOwnerId rejects ids over 64 characters", () => {
  const tooLong = "a".repeat(65);
  assert.equal(getOwnerId(fakeRequest({ "x-owner-id": tooLong })), "default");
});

test("validateOwnerId accepts standard kebab/snake/alpha-numeric ids", () => {
  for (const id of ["default", "alice", "user-123", "User_42", "abc"]) {
    assert.ok(validateOwnerId(id), `expected ${id} to be valid`);
  }
});

test("validateOwnerId rejects empty / disallowed inputs", () => {
  for (const id of ["", "alice space", "with/slash", "$%&"]) {
    assert.equal(validateOwnerId(id), false, `expected ${id} to be invalid`);
  }
});
