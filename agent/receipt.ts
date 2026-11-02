import type { Address } from "viem";
import type { NetworkConfig } from "./config";

export interface TelegraphReceipt {
  receipt_hash: string;
  rail: string;
  payer: string;
  miner: string;
  intent: string;
  amount_uusdc: string;
  epoch_id: number;
  settlement: string;
  chain: string;
  tx_hash: string;
  timestamp: number;
}

export function decodeReceipt(header: string | null): TelegraphReceipt | null {
  if (!header || header.length > 16_384) return null;
  try {
    const r = JSON.parse(Buffer.from(header, "base64").toString("utf8"));
    if (!r || !/^0x[0-9a-f]{64}$/i.test(r.receipt_hash) || !/^0x[0-9a-f]{64}$/i.test(r.tx_hash) ||
        typeof r.miner !== "string" || typeof r.intent !== "string" ||
        typeof r.payer !== "string" || !/^\d+$/.test(r.amount_uusdc) ||
        !Number.isSafeInteger(r.timestamp) || !Number.isSafeInteger(r.epoch_id)) return null;
    return r as TelegraphReceipt;
  } catch { return null; }
}

/** Binding a server receipt is distinct from independently verifying its payment. */
export function receiptBindingError(r: TelegraphReceipt | null, expected: {
  minerId: string;
  intent: string;
  payer: Address;
  amountAtomic: string;
  txHash: string;
  net: NetworkConfig;
  now: number;
}): string | null {
  if (!r) return "Missing or malformed Telegraph consumption receipt";
  if (r.rail !== "x402" || r.settlement !== "onchain" || r.chain !== expected.net.caip2) return "Consumption receipt names a different payment rail or network";
  if (r.payer.toLowerCase() !== expected.payer.toLowerCase() || r.miner !== expected.minerId || r.intent !== expected.intent) return "Consumption receipt does not match this payer, provider, and intent";
  if (r.amount_uusdc !== expected.amountAtomic || r.tx_hash.toLowerCase() !== expected.txHash.toLowerCase()) return "Consumption receipt does not match the payment amount and transaction";
  const age = expected.now - r.timestamp * 1000;
  if (age < -60_000 || age > 300_000 || r.epoch_id < 1) return "Consumption receipt is stale or has no Base settlement epoch";
  return null;
}
