import { test } from "node:test";
import assert from "node:assert/strict";
import { inspectPaymentChallenge } from "./payment-readiness";
import { net } from "./test-support";

const header = (accepts: unknown, x402Version = 2) => Buffer.from(JSON.stringify({ x402Version, accepts })).toString("base64");
const valid = { scheme: "exact", network: net.caip2, asset: net.usdc, amount: "10000", maxTimeoutSeconds: 60,
  payTo: "0x5a2324aA18613FAD4e44bDF0d6c73Ec1f6D87ff8", extra: net.usdcDomain };

test("readiness explains the observed deployment mismatch without accepting it", () => {
  const report = inspectPaymentChallenge(402, header([{ ...valid, network: "eip155:11155111",
    asset: "0xcc194e1a843B658526D0D5C431f670028582Ae17" }]), net);
  assert.equal(report.available, false);
  assert.equal(report.expected.network, "eip155:84532");
  assert.equal(report.offered[0].network, "eip155:11155111");
  assert.ok(!report.available);
  assert.match(report.error, /Resolve the deployment/);
});
test("readiness requires exact transfer scheme and the configured signing domain", () => {
  for (const requirement of [{ ...valid, scheme: "escrow" }, { ...valid, extra: { name: "USD Coin", version: "2" } },
    { ...valid, amount: "50001" }, { ...valid, maxTimeoutSeconds: 301 }]) {
    assert.equal(inspectPaymentChallenge(402, header([requirement]), net).available, false);
  }
  assert.equal(inspectPaymentChallenge(402, header([valid]), net).available, true);
});
test("malformed and mixed challenge options produce a diagnostic, not a crash", () => {
  for (const [status, value] of [[200, null], [402, "bad"], [402, header(null)], [402, header([valid], 1)],
    [402, header([null, 7, {}, { network: net.caip2, asset: 1 }])]] as const) {
    assert.equal(inspectPaymentChallenge(status, value, net).available, false);
  }
  assert.equal(inspectPaymentChallenge(402, header([null, {}, valid]), net).available, true);
});
