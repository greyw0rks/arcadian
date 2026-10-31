import { test } from "node:test";
import assert from "node:assert/strict";
import type { Hex } from "viem";
import { assembleMemo, signMemo, type CheckResult, type TradeMemo } from "./memo";
import { confirmedChecks, signer, net, subject, now } from "./test-support";
import { parseObservation } from "./policy";
import { queryFor } from "./desk";
import { verifyTradeMemo, type VerificationDeps } from "./verify";

function checks(): CheckResult[] {
  return confirmedChecks().map(c => {
    const raw = { subject: { token_address: subject.tokenAddress, chain_id: subject.chainId },
      observed_at: new Date(now).toISOString(), confidence: 0.95, risk_score: 10, status: "pass", flags: [], signal: c.finding,
      ...(c.intent === "LIQUIDITY_DEPTH_VERIFY" ? { metric: "executable_depth_usd", value: 1_000_000 } : {}) };
    return { ...c, authorization: { from: signer.address, to: "0x5a2324aA18613FAD4e44bDF0d6c73Ec1f6D87ff8",
      value: c.amountAtomic!, nonce: c.authorizationNonce! as Hex, validAfter: String(now / 1000 - 60), validBefore: String(now / 1000 + 300) },
      rawResult: raw, observation: parseObservation(raw, c.intent, subject, c.minerSlug),
      signalHash: c.receipt!.receipt_hash,
      query: queryFor(c.intent, subject), reportedIntent: c.intent, receivedAt: new Date(now).toISOString() };
  });
}
const context = { trustedSigner: signer.address, expectedSubject: subject, net, gateway: "https://gateway.example/engine" };
const deps: VerificationDeps = { now: () => now,
  verifyPayment: async () => ({ verified: true, reason: "Verified test receipt", blockNumber: "123" }),
  verifySignal: async () => true };
async function signed(change?: (memo: TradeMemo) => void) {
  const memo = JSON.parse(JSON.stringify(assembleMemo(subject, checks(), net, now))) as TradeMemo;
  change?.(memo);
  return signMemo(memo, signer, net);
}

test("another agent rechecks four purchases, one batched transaction and the exact proposed trade", async () => {
  let payments = 0; let signals = 0;
  const report = await verifyTradeMemo(JSON.parse(JSON.stringify(await signed())), context, { ...deps,
    verifyPayment: async (hash, authorization, network) => {
      payments++; assert.equal(hash, checks()[0].txHash); assert.equal(network.chainId, 84532); assert.equal(authorization.from, signer.address);
      return { verified: true, reason: "Verified test receipt", blockNumber: "123" };
    }, verifySignal: async () => { signals++; return true; } });
  assert.equal(report.canProceed, true);
  assert.equal(report.signatureVerified, true);
  assert.equal(report.evidenceVerified, true);
  assert.deepEqual(report.cost, { totalUsdc: "0.04", verifiedReceiptCount: 4, settledTxCount: 1 });
  assert.equal(payments, 4); assert.equal(signals, 4);
});
test("a valid self-signed memo is rejected when its signer is not the trusted operator", async () => {
  const report = await verifyTradeMemo(await signed(), { ...context, trustedSigner: "0x1111111111111111111111111111111111111111" }, deps);
  assert.equal(report.signatureVerified, false); assert.equal(report.canProceed, false);
  assert.match(report.reasons.join(" "), /trusted operator/);
});
test("a memo cannot be reused for a different notional, contract, chain or payment network", async () => {
  const memo = await signed();
  for (const expectedSubject of [{ ...subject, notionalUsd: 1001 }, { ...subject, tokenAddress: "0x1111111111111111111111111111111111111111" },
    { ...subject, chain: "Ethereum", chainId: 1 }]) {
    assert.equal((await verifyTradeMemo(memo, { ...context, expectedSubject }, deps)).canProceed, false);
  }
  memo.domain.chainId = 8453;
  assert.equal((await verifyTradeMemo(memo, context, deps)).signatureVerified, false);
});
test("altering a signed observation fails EIP-712 integrity before network verification", async () => {
  const memo = await signed(); memo.memo.checks[0].observation!.riskScore = 0;
  const report = await verifyTradeMemo(memo, context, deps);
  assert.equal(report.signatureVerified, false); assert.equal(report.checks.length, 0);
});
test("archived proof remains inspectable but stale findings cannot permit a current trade", async () => {
  const report = await verifyTradeMemo(await signed(), context, { ...deps, now: () => now + 300_001 });
  assert.equal(report.signatureVerified, true); assert.equal(report.evidenceVerified, true);
  assert.equal(report.canProceed, false); assert.equal(report.decision, "REVIEW");
  assert.match(report.reasons.join(" "), /stale|five minutes/);
});
test("recorded payment booleans cannot override an unsuccessful independent chain check", async () => {
  const report = await verifyTradeMemo(await signed(), context, { ...deps,
    verifyPayment: async () => ({ verified: false, reason: "Wrong authorization nonce", blockNumber: null }) });
  assert.equal(report.signatureVerified, true); assert.equal(report.evidenceVerified, false); assert.equal(report.canProceed, false);
  assert.equal(report.cost!.totalUsdc, "0");
});
test("a recorded signal must independently match the exact request and raw answer", async () => {
  const report = await verifyTradeMemo(await signed(), context, { ...deps, verifySignal: async () => false });
  assert.equal(report.evidenceVerified, false); assert.equal(report.canProceed, false);
  assert.equal(report.cost!.totalUsdc, "0.04");
});
test("settled spend is verified even when an upstream failure supplies no answer or receipt", async () => {
  const rows = checks();
  rows[0] = { ...rows[0], receipt: null, receiptVerified: false, signalHash: null, signalVerified: false,
    rawResult: undefined, observation: null, responseError: "Engine 500: upstream 502", error: "Engine 500: upstream 502" };
  const memo = await signMemo(assembleMemo(subject, rows, net, now), signer, net);
  let payments = 0; let signals = 0;
  const report = await verifyTradeMemo(memo, context, { ...deps,
    verifyPayment: async () => { payments++; return { verified: true, reason: "Settled", blockNumber: "123" }; },
    verifySignal: async () => { signals++; return true; } });
  assert.equal(payments, 4); assert.equal(signals, 3);
  assert.equal(report.checks[0].paymentVerified, true);
  assert.equal(report.checks[0].receiptVerified, false);
  assert.deepEqual(report.cost, { totalUsdc: "0.04", verifiedReceiptCount: 3, settledTxCount: 1 });
  assert.equal(report.signatureVerified, true);
  assert.equal(report.evidenceVerified, false); assert.equal(report.canProceed, false);
  assert.equal(report.decision, "REVIEW");
  assert.ok(!report.reasons.some(reason => reason.includes("spend ledger")));
});
test("a trusted signature cannot turn a forged derived observation into provider evidence", async () => {
  const memo = await signed(m => { (m.checks[0].rawResult as Record<string, unknown>).risk_score = 90; });
  const report = await verifyTradeMemo(memo, context, deps);
  assert.equal(report.signatureVerified, true); assert.equal(report.canProceed, false);
  assert.match(report.checks[0].issues.join(" "), /raw provider response/);
});
test("duplicate receipts and authorizations are refused including differently cased hex", async () => {
  const memo = await signed(m => {
    m.checks[0].receipt!.receipt_hash = "0x" + "ab".repeat(32);
    m.checks[1].receipt!.receipt_hash = "0x" + m.checks[0].receipt!.receipt_hash.slice(2).toUpperCase();
    m.checks[1].authorizationNonce = m.checks[0].authorizationNonce;
    m.checks[1].authorization!.nonce = m.checks[0].authorizationNonce! as Hex;
  });
  const report = await verifyTradeMemo(memo, context, deps);
  assert.equal(report.canProceed, false);
  assert.match(report.checks[0].issues.join(" "), /reused across checks/);
});
test("a signed but incorrect spend ledger cannot authorize a trade", async () => {
  const report = await verifyTradeMemo(await signed(m => { m.cost.totalUsdc = "0"; }), context, deps);
  assert.equal(report.signatureVerified, true); assert.equal(report.evidenceVerified, false); assert.equal(report.canProceed, false);
  assert.equal(report.decision, "REVIEW"); assert.match(report.reasons.join(" "), /spend ledger/);
});
test("a weakened policy and malformed authorization are refused without trusting signed flags", async () => {
  const changedPolicy = await signed(m => { (m.policy as unknown as { maximumRiskScore: number }).maximumRiskScore = 100; });
  assert.equal((await verifyTradeMemo(changedPolicy, context, deps)).signatureVerified, false);
  const malformed = await signed(m => { (m.checks[0] as unknown as { authorizationNonce: number }).authorizationNonce = 12; });
  const report = await verifyTradeMemo(malformed, context, deps);
  assert.equal(report.canProceed, false); assert.match(report.checks[0].issues.join(" "), /authorization/);
});
