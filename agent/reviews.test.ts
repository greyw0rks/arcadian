import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@libsql/client";
import { ReviewStore } from "./store";
import { recoverReview, type RecoveryDeps } from "./reviews";
import { confirmedChecks, net, now, signer, subject, txHash } from "./test-support";
import { assembleMemo, signMemo } from "./memo";

async function recorded() {
  const store = new ReviewStore(createClient({ url: "file::memory:" }));
  const id = randomUUID();
  const claim = await store.begin({ id, requestHash: "fixture", subject, maximumSpendAtomic: 50_000n,
    dailyLimitAtomic: 1_000_000n, payer: signer.address, network: net.name, gateway: "https://gw.test/engine", now });
  const checks = confirmedChecks().map(check => ({ ...check, receivedAt: new Date(now).toISOString(), reportedIntent: check.intent,
    rawResult: { signal: "fixture" }, query: "fixture " + check.intent, signalHash: check.receipt!.receipt_hash }));
  return { store, id, claim, checks };
}
const deps: RecoveryDeps = { signer, now: () => now + 1000, verifySignal: async () => true,
  reconcile: async () => ({ verified: true, reason: "fixture", expired: false, blockNumber: "123", txHash: txHash as `0x${string}` }) };

test("recovering a payment never clears an original routing mismatch", async () => {
  const { store, id, claim, checks } = await recorded();
  try {
    checks[0].reportedIntent = "CODE_REVIEW";
    checks[0].responseError = "Engine routed this check as CODE_REVIEW";
    checks[0].error = checks[0].responseError;
    const review = await store.finish(id, await signMemo(assembleMemo(subject, checks, net, now), signer, net), claim.writerToken!);
    const recovered = await recoverReview(store, review, deps);
    assert.equal(recovered.signed!.memo.verdict, "REVIEW");
    assert.match(recovered.checks.find(c => c.intent === checks[0].intent)!.error!, /CODE_REVIEW/);
  } finally { store.client.close(); }
});

test("read-only recovery confirms a recorded authorization and releases its lock without buying again", async () => {
  const { store, id, claim, checks } = await recorded();
  try {
    checks[0].paid = false;
    checks[0].error = "Settlement is unconfirmed";
    checks[0].authorization = { from: signer.address, to: net.usdc, value: "10000", nonce: checks[0].authorizationNonce as `0x${string}`,
      validAfter: String(now / 1000 - 1), validBefore: String(now / 1000 + 60) };
    const review = await store.finish(id, await signMemo(assembleMemo(subject, checks, net, now), signer, net), claim.writerToken!);
    let reconciled = 0;
    const recovered = await recoverReview(store, review, { ...deps, reconcile: async (...args) => { reconciled++; return deps.reconcile!(...args); } });
    assert.equal(reconciled, 1);
    assert.equal(recovered.signed!.memo.cost.totalUsdc, "0.04");
    assert.equal(recovered.signed!.memo.cost.unsettledUsdc, "0");
    assert.equal(recovered.reconciliationRequired, false);
    assert.equal(recovered.signed!.memo.verdict, "PROCEED");
    assert.equal(recovered.checks.find(c => c.intent === checks[0].intent)!.error, undefined);
  } finally { store.client.close(); }
});

test("recovery checks receipt age at local receipt time and preserves stale receipts", async () => {
  const { store, id, claim, checks } = await recorded();
  try {
    checks[0].receipt!.timestamp = now / 1000 - 600;
    checks[0].providerTimestamp = new Date(now - 600_000).toISOString();
    const review = await store.finish(id, await signMemo(assembleMemo(subject, checks, net, now), signer, net), claim.writerToken!);
    const recovered = await recoverReview(store, review, deps);
    assert.equal(recovered.signed!.memo.verdict, "REVIEW");
    assert.equal(recovered.checks.find(c => c.intent === checks[0].intent)!.receiptVerified, false);
    assert.match(recovered.checks.find(c => c.intent === checks[0].intent)!.error!, /stale/);
  } finally { store.client.close(); }
});
