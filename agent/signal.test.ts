import { test } from "node:test";
import assert from "node:assert/strict";
import { signalRecordMatches, readBoundSignal } from "./signal";

test("the live payload envelope binds the request, caller, provider, intent and raw answer", () => {
  const hash = "0x" + "ab".repeat(32);
  const result = { subject: { chain_id: 8453 }, risk_score: 0.5 };
  const expected = { query: "review this token", payer: "0x1234", minerId: "7378", minerSlug: "verifywire-wash-trading", intent: "WASH_TRADING_DETECTION" };
  const fields = { wallet_address: expected.payer, miner_slug: expected.minerSlug, subnet_id: expected.minerId, intent_id: expected.intent };
  const record = { signal_hash: hash, signal: { ...fields, signal_hash: hash }, payload: { ...fields, request: expected.query, response: result }, result: { execution: { result } } };
  assert.equal(signalRecordMatches(record, hash, result, expected), true);
  assert.equal(signalRecordMatches(record, hash, result, { ...expected, query: "a different token" }), false);
  assert.equal(signalRecordMatches(record, hash, result, { ...expected, payer: "0x5678" }), false);
  assert.equal(signalRecordMatches(record, hash, { ...result, risk_score: 0 }, expected), false);
});
test("shaped output is replaced only by a raw signal bound to the same request", async () => {
  const hash = "0x" + "cd".repeat(32);
  const expected = { query: "read this contract", payer: "0x1234", minerId: "71008", minerSlug: "fixture", intent: "ONCHAIN_METRIC_VERIFY_GENERAL" };
  const fields = { wallet_address: expected.payer, miner_slug: expected.minerSlug, subnet_id: expected.minerId, intent_id: expected.intent };
  const raw = "An unrelated upstream HTML answer";
  const record = { signal_hash: hash, signal: { ...fields, signal_hash: hash },
    payload: { ...fields, request: expected.query, response: raw } };
  const f = (async () => Response.json(record)) as typeof fetch;
  assert.equal(signalRecordMatches(record, hash, { balance_gwei: null }, expected), false);
  assert.deepEqual(await readBoundSignal("https://node.test/engine", hash, expected, f), { response: raw });
  assert.equal(await readBoundSignal("https://node.test/engine", hash, { ...expected, query: "another request" }, f), null);
  assert.equal(await readBoundSignal("https://node.test/engine", hash, { ...expected, minerId: "1" }, f), null);
});
