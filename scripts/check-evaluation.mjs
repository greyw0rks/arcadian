import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const root = new URL("../evaluation/liquidity-depth/", import.meta.url);
const hash = value => createHash("sha256").update(value).digest("hex");
const source = JSON.parse(await readFile(new URL("cases.json", root), "utf8"));
const body = await readFile(new URL("pairs.jsonl", root));
const datasetSha256 = hash(body);
const structural = JSON.parse(execFileSync(process.execPath, ["evaluation/liquidity-depth/prepare.mjs"], { encoding: "utf8" }));
const arithmetic = JSON.parse(execFileSync("python3", ["evaluation/liquidity-depth/reference-calculations.py"], { encoding: "utf8" }));
const read = async name => JSON.parse(await readFile(new URL(name, root), "utf8"));
const [quality, packet, template, impact] = await Promise.all([read("quality-report.json"), read("blind-review.json"), read("review-template.json"), read("mission-impact.json")]);
for (const item of [arithmetic, quality, packet, template]) assert.equal(item.dataset_sha256, datasetSha256, "Artifact belongs to another dataset");
assert.equal(impact.datasetSha256, datasetSha256);
assert.equal(packet.packet_sha256, hash(JSON.stringify(packet.cases)));
assert.equal(template.packet_sha256, packet.packet_sha256);
assert.equal(packet.cases.length, source.length);
assert.equal(template.answers.length, source.length);
assert.equal(quality.gate.n, source.length);
let aPreferred = 0;
const packetIds = new Set();
for (const row of packet.cases) {
  assert(!packetIds.has(row.id), "Duplicate review packet case");
  packetIds.add(row.id);
  const original = source.find(c => c.id === row.id);
  assert(original && row.prompt === original.prompt);
  assert((row.A === original.chosen && row.B === original.rejected) || (row.B === original.chosen && row.A === original.rejected));
  aPreferred += Number(row.A === original.chosen);
}
assert(Math.abs(aPreferred - (source.length - aPreferred)) <= 1, "Unbalanced review positions");
assert(source.every(c => typeof c.family === "string" && c.family));
assert.equal(impact.passed, impact.total);
assert(impact.outcomes.every(row => row.expected === row.observed));
const families = {};
for (const item of source) families[item.family] = (families[item.family] ?? 0) + 1;
console.log(JSON.stringify({ datasetSha256, rows: source.length, bytes: structural.bytes, calculatedCases: arithmetic.calculated_cases,
  reviewPositions: { A: aPreferred, B: source.length - aPreferred }, families,
  recordedOfficialGatePassed: quality.gate.ok, recordedSurfaceProbe: quality.gate.metrics.surface_probe_acc,
  syntheticMissionChecks: `${impact.passed}/${impact.total}`,
  scope: "Structural, arithmetic and artifact-consistency checks. The official gate result is the saved hash-bound audit; rerun check-official.py for a fresh upstream check. No independent human review or network admission is implied." }, null, 2));
if (!quality.gate.ok) process.exitCode = 1;
