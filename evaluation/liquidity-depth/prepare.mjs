import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const intent = "LIQUIDITY_DEPTH_VERIFY_GENERAL";
const normalize = value => value.normalize("NFC").replace(/\s+/gu, " ").trim();
const length = value => [...normalize(value)].length;
const cases = JSON.parse(await readFile(new URL("cases.json", import.meta.url), "utf8"));
assert(Array.isArray(cases) && cases.length > 0, "Expected nonempty cases array");
const ids = new Set();
const prompts = new Set();
const worse = new Set();
let longer = 0;
let shorter = 0;
let wordLonger = 0;
let wordShorter = 0;
const rows = cases.map(item => {
  assert(typeof item.id === "string" && item.id.length > 0 && !ids.has(item.id), "Missing or duplicate case ID");
  ids.add(item.id);
  assert(typeof item.rationale === "string" && item.rationale.trim(), `${item.id}: missing rationale`);
  for (const [field, min, max] of [["prompt", 16, 16000], ["chosen", 8, 32000], ["rejected", 8, 32000]]) {
    const value = item[field];
    assert(typeof value === "string", `${item.id}: ${field} must be text`);
    assert(!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.test(value), `${item.id}: control characters`);
    assert(!/[\uD800-\uDFFF]/u.test(value), `${item.id}: unpaired surrogate`);
    assert(length(value) >= min && length(value) <= max, `${item.id}: ${field} length outside limits`);
  }
  assert(!prompts.has(normalize(item.prompt)), `${item.id}: duplicate prompt`);
  prompts.add(normalize(item.prompt));
  assert(normalize(item.chosen) !== normalize(item.rejected), `${item.id}: identical answers`);
  worse.add(normalize(item.rejected));
  longer += Number(length(item.chosen) > length(item.rejected));
  shorter += Number(length(item.chosen) < length(item.rejected));
  const chosenWords = normalize(item.chosen).split(" ").length;
  const rejectedWords = normalize(item.rejected).split(" ").length;
  wordLonger += Number(chosenWords > rejectedWords);
  wordShorter += Number(chosenWords < rejectedWords);
  const row = { intent_id: intent, prompt: item.prompt, chosen: item.chosen, rejected: item.rejected,
    label_kind: "preference_pair", provenance: { source_kind: "synthetic" } };
  assert(Buffer.byteLength(JSON.stringify(row), "utf8") <= 64 * 1024, `${item.id}: row exceeds 64 KiB`);
  return row;
});
const body = rows.map(row => JSON.stringify(row)).join("\n") + "\n";
assert(Buffer.byteLength(body, "utf8") <= 32 * 1024 * 1024, "Upload exceeds 32 MiB");
const destination = new URL("pairs.jsonl", import.meta.url);
const args = process.argv.slice(2);
assert(args.length <= 1 && (!args[0] || args[0] === "--write"), "Usage: node evaluation/liquidity-depth/prepare.mjs [--write]");
if (args[0] === "--write") await writeFile(destination, body);
else assert.equal(await readFile(destination, "utf8"), body, "Export differs from source; run with --write");
const baseline = (more, less) => {
  const ties = cases.length - more - less;
  return { chosen_longer: more, chosen_shorter: less, ties,
    best_length_only_accuracy_with_half_credit_ties: (Math.max(more, less) + ties / 2) / cases.length };
};
console.log(JSON.stringify({ intent, rows: rows.length, bytes: Buffer.byteLength(body),
  sha256: createHash("sha256").update(body).digest("hex"),
  unique_rejected_fraction: worse.size / cases.length,
  character_length: baseline(longer, shorter), word_length: baseline(wordLonger, wordShorter),
  status: "local structural checks only; synthetic draft, not submitted or network-eligible",
  limitations: ["No network-pool near-duplicate check or semantic grader.",
    "Official training readiness is reported separately by check-official.py; structural success does not imply its gate passes."] }, null, 2));
