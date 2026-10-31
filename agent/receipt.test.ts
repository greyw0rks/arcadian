import { test } from "node:test";
import assert from "node:assert/strict";
import { receiptBindingError } from "./receipt";
import { confirmedChecks, net, now, signer, txHash } from "./test-support";
test("a receipt binds consumption to provider, amount, payment chain, and caller", () => {
  const r = confirmedChecks()[0].receipt!;
  const expected = { minerId: "1", intent: r.intent, payer: signer.address, amountAtomic: "10000", txHash, net, now };
  assert.equal(receiptBindingError(r, expected), null);
  assert.match(receiptBindingError({ ...r, miner: "999" }, expected)!, /provider/);
  assert.match(receiptBindingError({ ...r, amount_uusdc: "20000" }, expected)!, /amount/);
  assert.match(receiptBindingError({ ...r, chain: "eip155:1" }, expected)!, /network/);
});
