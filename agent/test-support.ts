// Public, unfunded Hardhat fixture key. Fixtures never appear in product results.
import { signerFromPrivateKey } from "./wallet";
import { networkByName } from "./config";
import { emptyCheck } from "./desk";
import { TRADE_INTENTS, type TradeSubject } from "./policy";
import type { CheckResult } from "./memo";

export const signer = signerFromPrivateKey("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
export const net = networkByName("base-sepolia");
export const now = Date.parse("2026-11-02T10:00:00Z");
export const txHash = "0x" + "ab".repeat(32);
export const subject: TradeSubject = { tokenAddress: "0x4200000000000000000000000000000000000006", chain: "Base", chainId: 8453, notionalUsd: 1000 };

export function confirmedChecks(): CheckResult[] {
  return TRADE_INTENTS.map((intent, i) => ({
    ...emptyCheck(intent), minerId: String(i + 1), minerSlug: "provider-" + i, minerName: "Provider " + i,
    finding: "Current subject-specific evidence", riskScore: 10, verdict: "pass", paid: true,
    paymentSubmitted: true, amountAtomic: "10000", txHash, authorizationNonce: "0x" + (i + 1).toString(16).padStart(2, "0").repeat(32),
    settlementBlock: "123", receiptVerified: true, signalVerified: true,
    receipt: { receipt_hash: "0x" + (i + 5).toString(16).padStart(2, "0").repeat(32), rail: "x402", payer: signer.address,
      miner: String(i + 1), intent, amount_uusdc: "10000", epoch_id: 432, settlement: "onchain", chain: net.caip2, tx_hash: txHash, timestamp: now / 1000 },
    observation: { subjectBound: true, observedAt: new Date(now).toISOString(), status: "pass", riskScore: 10, confidence: 0.95,
      flags: [], liquidityUsd: intent === "LIQUIDITY_DEPTH_VERIFY" ? 1_000_000 : null, summary: "Current subject-specific evidence" },
  }));
}
