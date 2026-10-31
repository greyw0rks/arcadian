import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const hash = value => createHash("sha256").update(value).digest("hex");
const cases = JSON.parse(await readFile(new URL("cases.json", import.meta.url), "utf8"));
const body = await readFile(new URL("pairs.jsonl", import.meta.url));
const datasetHash = hash(body);
const rows = body.toString("utf8").trim().split("\n").map(line => JSON.parse(line));
assert.equal(rows.length, cases.length, "Regenerate pairs.jsonl first");
cases.forEach((item, index) => {
  for (const field of ["prompt", "chosen", "rejected"]) assert.equal(rows[index][field], item[field], "Regenerate pairs.jsonl first");
});
assert.equal(new Set(cases.map(item => item.id)).size, cases.length, "Case IDs must be unique");
// Balance answer positions without consulting content or a reviewer result.
const ordered = [...cases].sort((a, b) => hash(datasetHash + a.id).localeCompare(hash(datasetHash + b.id)));
const chosenA = new Set(ordered.slice(0, Math.floor(cases.length / 2)).map(item => item.id));
const deck = { dataset_sha256: datasetHash, purpose: "Independent review of a public development dataset; not a hidden benchmark",
  instructions: "Read only this packet first. Choose A, B, tie, or invalid; explain the calculation or evidence. Do not consult cases.json until your first review is recorded.",
  cases: cases.map(item => ({ id: item.id, prompt: item.prompt,
    A: chosenA.has(item.id) ? item.chosen : item.rejected,
    B: chosenA.has(item.id) ? item.rejected : item.chosen })) };
deck.packet_sha256 = hash(JSON.stringify(deck.cases));
const template = { dataset_sha256: datasetHash, packet_sha256: deck.packet_sha256, reviewer: null, reviewed_at: null,
  relationship_to_project: null, reviewed_without_source_labels: null,
  answers: cases.map(item => ({ id: item.id, preferred: null, rationale: "" })) };
const args = process.argv.slice(2);
if (args.length === 1 && args[0] === "--write") {
  await writeFile(new URL("blind-review.json", import.meta.url), JSON.stringify(deck, null, 2) + "\n");
  await writeFile(new URL("review-template.json", import.meta.url), JSON.stringify(template, null, 2) + "\n");
  console.log(`Prepared ${cases.length} unlabeled pairs and an empty review template. No human review recorded.`);
} else if (args.length === 2 && args[0] === "--review") {
  const review = JSON.parse(await readFile(args[1], "utf8"));
  assert.equal(review.dataset_sha256, datasetHash, "Review is for a different dataset version");
  assert.equal(review.packet_sha256, deck.packet_sha256, "Review is for a different question/position mapping");
  for (const key of ["reviewer", "reviewed_at", "relationship_to_project"]) {
    assert(typeof review[key] === "string" && review[key].trim(), `Missing ${key}`);
  }
  assert(Number.isFinite(Date.parse(review.reviewed_at)), "Invalid reviewed_at date");
  assert(typeof review.reviewed_without_source_labels === "boolean", "Declare whether source labels were consulted");
  assert(Array.isArray(review.answers), "Expected answers array");
  const known = new Set(cases.map(item => item.id));
  const seen = new Set();
  let agreed = 0;
  let decisive = 0;
  const findings = [];
  for (const answer of review.answers) {
    assert(known.has(answer.id) && !seen.has(answer.id), "Unknown or duplicate reviewed case");
    seen.add(answer.id);
    assert(["A", "B", "tie", "invalid"].includes(answer.preferred), `${answer.id}: choose A, B, tie or invalid`);
    assert(typeof answer.rationale === "string" && answer.rationale.trim(), `${answer.id}: explain your judgment`);
    const expected = chosenA.has(answer.id) ? "A" : "B";
    if (answer.preferred === "A" || answer.preferred === "B") {
      decisive++;
      if (answer.preferred === expected) agreed++;
      else findings.push({ id: answer.id, kind: "label_disagreement", rationale: answer.rationale });
    } else findings.push({ id: answer.id, kind: answer.preferred, rationale: answer.rationale });
  }
  console.log(JSON.stringify({ dataset_sha256: datasetHash, packet_sha256: deck.packet_sha256, reviewer: review.reviewer,
    reviewed_at: review.reviewed_at, relationship_to_project: review.relationship_to_project,
    reviewed_without_source_labels: review.reviewed_without_source_labels,
    identity_and_independence: "self-reported; not verified by this tool",
    complete: seen.size === cases.length, reviewed: seen.size, total: cases.length,
    decisive, agrees_with_authored_label: agreed,
    agreement_fraction: decisive ? agreed / decisive : null,
    missing: cases.filter(item => !seen.has(item.id)).map(item => item.id), findings,
    interpretation: "Agreement measures consistency with the authored labels, not objective accuracy or a judge score. Resolve flagged cases before submission." }, null, 2));
} else {
  throw new Error("Usage: node evaluation/liquidity-depth/review.mjs --write | --review completed-review.json");
}
