import { test } from "node:test";
import assert from "node:assert/strict";
import { networkByName } from "./config";
import { validateRequirements, buildPayment } from "./x402";
import { signer } from "./test-support";

test("current Telegraph Sepolia pins the observed token and signs on its own chain", async () => {
  const net = networkByName("telegraph-sepolia");
  const req = { scheme: "exact", network: net.caip2, asset: net.usdc, amount: "10000",
    payTo: "0x3624EB012B5E998BB57B6bE6C9Cfc9c4bc5eb99b", maxTimeoutSeconds: 60, extra: net.usdcDomain };
  const payment = await buildPayment(req, signer, net);
  assert.equal(payment.accepted.network, "eip155:11155111");
  assert.equal(payment.accepted.asset.toLowerCase(), "0xcc194e1a843b658526d0d5c431f670028582ae17");
  assert.equal(net.testnet, true);
  assert.throws(() => validateRequirements({ ...req, asset: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" }, net, 50000n), /different token/);
  assert.throws(() => validateRequirements(req, networkByName("base-sepolia"), 50000n), /network/);
});
test("legacy recovery retains the Base Sepolia token and domain", () => {
  const old = networkByName("base-sepolia");
  assert.equal(old.chainId, 84532);
  assert.equal(old.usdc, "0x036CbD53842c5426634e7929541eC2318f3dCF7e");
  assert.equal(old.usdcDomain.name, "USDC");
});
