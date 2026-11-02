import { test } from "node:test";
import assert from "node:assert/strict";
import { encodePaymentRequiredHeader, encodePaymentResponseHeader } from "@x402/core/http";
import { buildPayment, encodePaymentHeader, payAndFetch, paymentAuthorization, SpendBudget, type PaymentRequirements, type PaymentRequired } from "./x402";
import { net, signer, txHash } from "./test-support";
const req = (): PaymentRequirements => ({ scheme: "exact", network: net.caip2, asset: net.usdc, amount: "10000",
  payTo: "0x5a2324aA18613FAD4e44bDF0d6c73Ec1f6D87ff8", maxTimeoutSeconds: 60, extra: { name: "USDC", version: "2" } });
function challenge(requirements: PaymentRequirements = req()) {
  return new Response("{}", { status: 402, headers: { "PAYMENT-REQUIRED": encodePaymentRequiredHeader({
    x402Version: 2, resource: { url: "https://gw.test/engine/v1/ask" }, accepts: [requirements] } as PaymentRequired) } });
}
test("the SDK signs the documented x402 v2 USDC authorization", async () => {
  const payment = await buildPayment(req(), signer, net);
  assert.equal(payment.x402Version, 2);
  assert.equal(payment.accepted.network, "eip155:84532");
  assert.equal(paymentAuthorization(payment).value, "10000");
  assert.match(String(payment.payload.signature), /^0x[0-9a-f]{130}$/);
});
test("Telegraph's published routing aliases preserve the SDK authorization and signature", async () => {
  const payment = await buildPayment(req(), signer, net);
  const wire = JSON.parse(Buffer.from(encodePaymentHeader(payment), "base64").toString("utf8"));
  assert.equal(wire.scheme, "exact");
  assert.equal(wire.network, "eip155:84532");
  assert.deepEqual(wire.accepted, payment.accepted);
  assert.deepEqual(wire.payload, payment.payload);
  assert.deepEqual(wire.extensions, {});
});
test("PAYMENT-SIGNATURE replay retains a reported transaction without claiming verification", async () => {
  let calls = 0;
  const f = (async (_url: string, init: RequestInit) => {
    calls++;
    if (!new Headers(init.headers).has("PAYMENT-SIGNATURE")) return challenge();
    return new Response('{"result":{}}', { headers: { "PAYMENT-RESPONSE": encodePaymentResponseHeader({ success: true, transaction: txHash, network: net.caip2, payer: signer.address }) } });
  }) as typeof fetch;
  const result = await payAndFetch("https://gw.test/engine/v1/ask", { method: "POST" }, signer, { net, fetchImpl: f });
  assert.equal(calls, 2);
  assert.equal(result.paymentSubmitted, true);
  assert.equal(result.paid, false);
  assert.equal(result.txHash, txHash);
});
test("wrong network, wrong token, and excessive prices never reach the signer", async () => {
  let signatures = 0;
  const spy = { address: signer.address, signTypedData: async () => { signatures++; throw new Error("must not sign"); } };
  const requirements: PaymentRequirements[] = [{ ...req(), network: "eip155:1" }, { ...req(), asset: "0x0000000000000000000000000000000000000001" }, { ...req(), amount: "1000000" }];
  for (const requirement of requirements) {
    await assert.rejects(payAndFetch("https://gw.test", {}, spy, { net, fetchImpl: (async () => challenge(requirement)) as typeof fetch }));
  }
  assert.equal(signatures, 0);
});
test("concurrent calls cannot exceed one shared budget", async () => {
  const budget = new SpendBudget(10_000n);
  const f = (async (_url: string, init: RequestInit) => new Headers(init.headers).has("PAYMENT-SIGNATURE") ? new Response("{}") : challenge()) as typeof fetch;
  const calls = await Promise.allSettled([1, 2].map(() => payAndFetch("https://gw.test", {}, signer, { net, fetchImpl: f, budget })));
  assert.equal(calls.filter(c => c.status === "fulfilled").length, 1);
});
test("a journal failure prevents the signed payment from being sent", async () => {
  let requests = 0;
  const f = (async () => { requests++; return challenge(); }) as typeof fetch;
  await assert.rejects(payAndFetch("https://gw.test", {}, signer, { net, fetchImpl: f,
    beforeSubmit: async () => { throw new Error("journal unavailable"); } }), /journal unavailable/);
  assert.equal(requests, 1);
});
test("v1 body-only challenges and failed settlement headers cannot masquerade as paid", async () => {
  await assert.rejects(payAndFetch("https://gw.test", {}, signer, { net, fetchImpl: (async () => new Response('{"x402Version":1,"accepts":[]}', { status: 402 })) as typeof fetch }), /v2/);
  const f = (async (_url: string, init: RequestInit) => new Headers(init.headers).has("PAYMENT-SIGNATURE") ?
    new Response("{}", { headers: { "PAYMENT-RESPONSE": encodePaymentResponseHeader({ success: false, transaction: txHash, network: net.caip2 }) } }) : challenge()) as typeof fetch;
  assert.equal((await payAndFetch("https://gw.test", {}, signer, { net, fetchImpl: f })).txHash, null);
});
