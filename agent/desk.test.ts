import { test } from "node:test";
import assert from "node:assert/strict";
import { encodePaymentRequiredHeader, encodePaymentResponseHeader } from "@x402/core/http";
import { runDesk } from "./desk";
import { verifyMemo } from "./memo";
import { net, signer, subject, now, txHash } from "./test-support";
import { TRADE_INTENTS } from "./policy";
import { networkByName } from "./config";
function gateway(brokenIntent?: string, paymentNet = net) {
  const paid: string[] = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    assert.equal(url, "https://gw.test/engine/v1/ask");
    const body = JSON.parse(String(init?.body));
    const intent = TRADE_INTENTS.find(i => body.query.includes(i))!;
    const wireIntent = body.intent ?? intent;
    const headers = new Headers(init?.headers);
    if (!headers.has("PAYMENT-SIGNATURE")) return new Response("{}", {
      status: 402, headers: { "PAYMENT-REQUIRED": encodePaymentRequiredHeader({
        x402Version: 2, resource: { url }, accepts: [{ scheme: "exact", network: paymentNet.caip2,
          asset: paymentNet.usdc, amount: "10000", payTo: "0x5a2324aA18613FAD4e44bDF0d6c73Ec1f6D87ff8",
          maxTimeoutSeconds: 60, extra: paymentNet.usdcDomain }],
      }) },
    });
    paid.push(intent);
    if (intent === brokenIntent) return new Response("upstream failed", { status: 503 });
    const index = TRADE_INTENTS.indexOf(intent);
    const receiptHash = "0x" + (index + 1).toString(16).padStart(2, "0").repeat(32);
    const receipt = { receipt_hash: receiptHash, rail: "x402", payer: signer.address, miner: String(index + 1),
      intent: wireIntent, amount_uusdc: "10000", epoch_id: 432, settlement: "onchain", chain: paymentNet.caip2, tx_hash: txHash, timestamp: now / 1000 };
    const result = { subject: { token_address: subject.tokenAddress, chain_id: subject.chainId }, observed_at: new Date(now).toISOString(),
      confidence: 0.95, risk_score: 10, status: "pass", signal: "Current subject-specific evidence",
      ...(intent === "LIQUIDITY_DEPTH_VERIFY" ? { metric: "executable_depth_usd", value: 1_000_000 } : {}) };
    return new Response(JSON.stringify({ miner_id: String(index + 1), miner_name: "provider-" + index, result, intent: wireIntent, signal_hash: receiptHash }), {
      headers: { "PAYMENT-RESPONSE": encodePaymentResponseHeader({ success: true, transaction: txHash, network: paymentNet.caip2, payer: signer.address }),
        "X-TELEGRAPH-RECEIPT": Buffer.from(JSON.stringify(receipt)).toString("base64") },
    });
  }) as typeof fetch;
  return { fetchImpl, paid };
}
const proofDeps = { signer, net, gateway: "https://gw.test/engine", now: () => now,
  discover: (async () => ({})) as never,
  verifyPayment: async () => ({ verified: true, reason: "fixture", blockNumber: "123" }),
  verifySignal: async () => true };
test("the Engine v2 contract produces a signed gate with four receipts and one batch transaction", async () => {
  const g = gateway();
  const signed = await runDesk({ subject }, { ...proofDeps, fetchImpl: g.fetchImpl });
  assert.equal(g.paid.length, 4);
  assert.equal(signed.memo.verdict, "PROCEED");
  assert.equal(signed.memo.cost.totalUsdc, "0.04");
  assert.equal(signed.memo.cost.verifiedReceiptCount, 4);
  assert.equal(signed.memo.cost.settledTxCount, 1);
  assert.equal(await verifyMemo(signed), true);
});
test("a failed provider preserves the remaining purchases and holds the trade", async () => {
  const g = gateway("SMART_CONTRACT_AUDIT");
  const signed = await runDesk({ subject }, { ...proofDeps, fetchImpl: g.fetchImpl });
  assert.equal(signed.memo.verdict, "REVIEW");
  assert.equal(signed.memo.cost.totalUsdc, "0.03");
  assert.equal(signed.memo.cost.unsettledUsdc, "0.01");
});
test("an unverified chain payment cannot contribute to a proceed decision or confirmed cost", async () => {
  const g = gateway();
  const signed = await runDesk({ subject }, { ...proofDeps, fetchImpl: g.fetchImpl,
    verifyPayment: async () => ({ verified: false, reason: "wrong nonce", blockNumber: null }) });
  assert.equal(signed.memo.verdict, "REVIEW");
  assert.equal(signed.memo.cost.totalUsdc, "0");
});
test("missing gateway fails before any purchase", async () => {
  await assert.rejects(runDesk({ subject }, { signer, net, gateway: null }), /No Telegraph gateway/);
});
test("current child Intents bind requests, receipts and signals while retaining logical policy checks", async () => {
  const current = networkByName("telegraph-sepolia");
  const g = gateway(undefined, current);
  const signed = await runDesk({ subject }, { ...proofDeps, net: current, fetchImpl: g.fetchImpl,
    verifySignal: async (_gateway, _hash, _result, expected) => {
      assert(expected.intent.endsWith("_GENERAL"));
      assert(expected.query.includes(expected.intent));
      return true;
    } });
  assert.equal(signed.memo.verdict, "PROCEED");
  assert.equal(signed.memo.cost.verifiedReceiptCount, 4);
  for (const c of signed.memo.checks) {
    assert.equal(c.requestedIntent, c.intent + "_GENERAL");
    assert.equal(c.reportedIntent, c.requestedIntent);
    assert.equal(c.receipt?.intent, c.requestedIntent);
  }
});
