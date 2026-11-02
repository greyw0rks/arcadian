import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inspectMinerManifest, requireAnjomanValidation } from "./miner-manifest";

const yaml = readFileSync("public/telegraph-risk.yaml", "utf8");
const checked = inspectMinerManifest(yaml);
const accepted = { source: "anjoman", yamlSha256: checked.yamlSha256,
  validation: { valid: true, slug: checked.manifest.slug, name: checked.manifest.name,
    results: [{ path: "/api/telegraph/measure", method: "POST", status: 200, success: true }] } };

test("the historical string limitations rejection is caught before registration", () => {
  const bad = yaml.replace(/limitations:[\s\S]*?\nauth:/, "limitations: old string\n\nauth:");
  assert(inspectMinerManifest(bad).errors.some(e => e.includes("limitations must be an array")));
});
test("an Anjoman report for different bytes or a 404/405 cannot authorize registration", () => {
  assert.equal(requireAnjomanValidation(accepted, yaml).valid, true);
  assert.throws(() => requireAnjomanValidation(accepted, yaml + "\n"), /exact current YAML/);
  for (const status of [404, 405]) assert.throws(() => requireAnjomanValidation({ ...accepted, validation: { ...accepted.validation,
    results: [{ path: "/api/telegraph/measure", method: "POST", status, success: true }] } }, yaml), /real endpoint/);
  assert.equal(requireAnjomanValidation({ ...accepted, validation: { ...accepted.validation,
    results: [{ path: "/api/telegraph/measure", method: "POST", status: 400, success: true }] } }, yaml).valid, true);
});
