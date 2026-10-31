import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateTrade, parseObservation, validateTradeSubject } from "./policy";
import { confirmedChecks, subject, now } from "./test-support";

test("proceed requires every required verified check and adequate depth for the actual notional", () => {
  assert.equal(evaluateTrade(subject, confirmedChecks(), now).decision, "PROCEED");
  assert.equal(evaluateTrade({ ...subject, notionalUsd: 20_000 }, confirmedChecks(), now).decision, "REVIEW");
});
test("a low score cannot override a missing check, failed payment, or stale observation", () => {
  const missing = confirmedChecks().slice(1);
  assert.equal(evaluateTrade(subject, missing, now).decision, "REVIEW");
  const failed = confirmedChecks(); failed[0].paid = false;
  assert.equal(evaluateTrade(subject, failed, now).decision, "REVIEW");
  const stale = confirmedChecks(); stale[0].observation!.observedAt = "2026-11-01T10:00:00Z";
  assert.equal(evaluateTrade(subject, stale, now).decision, "REVIEW");
});
test("a malicious finding blocks despite a low score in another check", () => {
  const checks = confirmedChecks(); checks[0].observation!.status = "block";
  assert.equal(evaluateTrade(subject, checks, now).decision, "BLOCK");
});
test("an unpaid, misrouted or stale threat cannot claim a verified block", () => {
  for (const change of [
    (checks: ReturnType<typeof confirmedChecks>) => { checks[0].paid = false; },
    (checks: ReturnType<typeof confirmedChecks>) => { checks[0].error = "Engine routed a different intent"; },
    (checks: ReturnType<typeof confirmedChecks>) => { checks[0].observation!.observedAt = new Date(now - 600_000).toISOString(); },
  ]) {
    const checks = confirmedChecks();
    checks[0].observation!.status = "block";
    change(checks);
    assert.equal(evaluateTrade(subject, checks, now).decision, "REVIEW");
  }
});
test("unrelated provider subjects cannot approve or block this trade", () => {
  const checks = confirmedChecks(); checks.forEach(c => { c.observation!.subjectBound = false; c.observation!.status = "block"; });
  assert.equal(evaluateTrade(subject, checks, now).decision, "NO_DATA");
});
test("generic scores and TVL are not decoded as contract risk or executable depth", () => {
  const observation = parseObservation({ score: 1, tvl_usd: 1e9, signal: "safe" }, "LIQUIDITY_DEPTH_VERIFY", subject);
  assert.equal(observation.riskScore, null);
  assert.equal(observation.liquidityUsd, null);
  assert.equal(observation.status, "unknown");
});
test("unsupported chains, a missing contract, and a chain-ID mismatch reject before a purchase", () => {
  assert.throws(() => validateTradeSubject({ protocol: "aave-v3", chain: "Base", notionalUsd: 10 }), /address/);
  assert.throws(() => validateTradeSubject({ ...subject, chainId: 1 }), /matching/);
  assert.throws(() => validateTradeSubject({ ...subject, notionalUsd: -1 }), /notional/);
});
test("VerifyWire risk uses its published 0–1 scale and refuses truncated scan coverage", () => {
  const raw = { contract_address: subject.tokenAddress, chain_id: subject.chainId, as_of: new Date(now).toISOString(),
    risk_score: 0.6099, risk_label: "HIGH", verified: false, window_blocks: 8, transfers: 173, summary: "Heuristic, not proof of intent", confidence: 0.9 };
  const observed = parseObservation(raw, "WASH_TRADING_DETECTION", subject, "verifywire-wash-trading");
  assert.equal(observed.subjectBound, true);
  assert.equal(observed.riskScore, 60.99);
  assert.equal(observed.status, "unknown");
  const low = parseObservation({ ...raw, risk_score: 0.1, risk_label: "LOW", verified: true, window_blocks: 120 }, "WASH_TRADING_DETECTION", subject, "verifywire-wash-trading");
  assert.equal(low.status, "pass");
  assert.equal(low.riskScore, 10);
});
test("a state read needs the token's totalSupply calldata, consistent value and numeric block", () => {
  const raw = { contract_address: subject.tokenAddress, chain_id: subject.chainId, as_of: new Date(now).toISOString(),
    metric: "view_call", calldata: "0x18160ddd", block: "123", value: "0x" + "0".repeat(63) + "a", value_uint: "10", confidence: 0.97 };
  assert.equal(parseObservation(raw, "ONCHAIN_METRIC_VERIFY", subject, "verifywire-onchain-metric").stateVerified, true);
  assert.equal(parseObservation({ ...raw, block: "latest" }, "ONCHAIN_METRIC_VERIFY", subject, "verifywire-onchain-metric").stateVerified, false);
  assert.equal(parseObservation({ ...raw, value_uint: "11" }, "ONCHAIN_METRIC_VERIFY", subject, "verifywire-onchain-metric").stateVerified, false);
});
