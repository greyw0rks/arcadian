import { test } from "node:test";
import assert from "node:assert/strict";
import { spendingAuthorized } from "./access";
test("an unset access token never opens the spending endpoint", () => {
  assert.equal(spendingAuthorized(null, undefined), false);
  assert.equal(spendingAuthorized("anything", undefined), false);
  assert.equal(spendingAuthorized("wrong", "operator"), false);
  assert.equal(spendingAuthorized("operator", "operator"), true);
});
