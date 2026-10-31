import { test } from "node:test";
import assert from "node:assert/strict";
import { assembleMemo, signMemo, verifyMemo, renderMemo } from "./memo";
import { confirmedChecks, signer, net, subject, now } from "./test-support";

test("batched settlements count four consumption receipts and one unique transaction", () => {
  const memo = assembleMemo(subject, confirmedChecks(), net, now);
  assert.equal(memo.cost.totalUsdc, "0.04");
  assert.equal(memo.cost.verifiedReceiptCount, 4);
  assert.equal(memo.cost.settledTxCount, 1);
  assert.equal(memo.verdict, "PROCEED");
});
test("unconfirmed payment authorizations remain visible and cannot count as spend", () => {
  const checks = confirmedChecks(); checks[0].paid = false;
  const memo = assembleMemo(subject, checks, net, now);
  assert.equal(memo.cost.totalUsdc, "0.03");
  assert.equal(memo.cost.authorizedUsdc, "0.04");
  assert.equal(memo.cost.unsettledUsdc, "0.01");
  assert.equal(memo.verdict, "REVIEW");
});
test("duplicate consumption receipt prevents a proceed decision and double counting", () => {
  const checks = confirmedChecks(); checks[1].receipt = checks[0].receipt;
  checks[1].authorizationNonce = checks[0].authorizationNonce;
  const memo = assembleMemo(subject, checks, net, now);
  assert.equal(memo.cost.totalUsdc, "0.03");
  assert.equal(memo.cost.verifiedReceiptCount, 2);
  assert.equal(memo.verdict, "REVIEW");
});
test("the same receipt or authorization with differently cased hex is counted once", () => {
  const checks = confirmedChecks();
  checks[0].receipt!.receipt_hash = "0x" + "ab".repeat(32);
  checks[1].receipt!.receipt_hash = "0x" + "AB".repeat(32);
  checks[0].authorizationNonce = "0x" + "cd".repeat(32);
  checks[1].authorizationNonce = "0x" + "CD".repeat(32);
  const memo = assembleMemo(subject, checks, net, now);
  assert.equal(memo.cost.totalUsdc, "0.03");
  assert.equal(memo.cost.verifiedReceiptCount, 2);
  assert.equal(memo.verdict, "REVIEW");
});
test("EIP-712 signature survives HTTP JSON serialization and rejects a tampered memo", async () => {
  const memo = assembleMemo(subject, confirmedChecks(), net, now);
  memo.checks[0].error = undefined;
  const signed = await signMemo(memo, signer, net);
  assert.equal(await verifyMemo(JSON.parse(JSON.stringify(signed))), true);
  signed.memo.subject.notionalUsd = 2_000_000;
  assert.equal(await verifyMemo(signed), false);
});
test("rendered memo distinguishes signatures, chain payments, and consumption receipts", async () => {
  const signed = await signMemo(assembleMemo(subject, confirmedChecks(), net, now), signer, net);
  assert.match(renderMemo(signed), /4 consumption receipts \/ 1 unique settlement transactions/);
  assert.match(renderMemo(signed), /not a Telegraph validator proof/);
});
