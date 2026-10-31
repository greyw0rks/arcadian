// A signed pre-trade memo binds policy, observations, and the spend ledger.
// The signature proves authorship and integrity; network proof is checked separately.
import { keccak256, toHex, verifyTypedData, type Address, type Hex } from "viem";
import { txLink, type NetworkConfig } from "./config";
import { atomicToUsdc, type TypedDataSigner } from "./x402";
import { evaluateTrade, GATE_POLICY, type RiskObservation, type TradeSubject, type GateDecision } from "./policy";
import type { TelegraphReceipt } from "./receipt";

export type MemoSubject = TradeSubject;
export interface CheckResult {
  intent: string;
  minerSlug: string;
  minerName: string;
  minerId: string | null;
  minerRegistrationId?: string;
  rank: number | null;
  finding: string;
  riskScore: number | null;
  verdict: string | null;
  observation: RiskObservation | null;
  rawResult?: unknown;
  query?: string;
  durationMs?: number | null;
  providerTimestamp?: string | null;
  receivedAt?: string;
  reportedIntent?: string | null;
  /** Exact Engine child Intent; logical policy checks retain their family name. */
  requestedIntent?: string;
  /** Response or routing failures remain failures after payment reconciliation. */
  responseError?: string;
  /** Terminal Engine errors are retained separately from provider findings. */
  engineError?: { code: string | null; message: string | null };
  authorization?: import("./x402").Authorization | null;
  authorizationExpired?: boolean;
  paid: boolean;
  paymentSubmitted: boolean;
  amountAtomic: string | null;
  txHash: string | null;
  authorizationNonce: string | null;
  settlementBlock: string | null;
  receipt: TelegraphReceipt | null;
  receiptVerified: boolean;
  signalHash: string | null;
  signalVerified: boolean;
  signalLink: string | null;
  error?: string;
}
export interface CostLineItem {
  intent: string;
  miner: string;
  amountUsdc: string;
  txHash: string | null;
  txLink: string | null;
  receiptHash: string | null;
  paymentStatus: "confirmed" | "authorized" | "expired" | "not_sent";
}
export interface TradeMemo {
  subject: TradeSubject;
  createdAt: string;
  network: string;
  testnet: boolean;
  verdict: GateDecision;
  overallRisk: number | null;
  reasons: string[];
  policy: typeof GATE_POLICY;
  checks: CheckResult[];
  cost: {
    totalUsdc: string;
    authorizedUsdc: string;
    unsettledUsdc: string;
    expiredUsdc: string;
    settledTxCount: number;
    verifiedReceiptCount: number;
    lineItems: CostLineItem[];
  };
}
export type ListingMemo = TradeMemo;
export interface SignedMemo {
  memo: TradeMemo;
  memoHash: Hex;
  signer: Address;
  signature: Hex;
  domain: { name: string; version: string; chainId: number };
}
const MEMO_DOMAIN = { name: "Arcadian Trade Gate", version: "2" } as const;
const MEMO_TYPES = {
  TradeMemo: [
    { name: "subject", type: "string" },
    { name: "verdict", type: "string" },
    { name: "network", type: "string" },
    { name: "createdAt", type: "string" },
    { name: "memoHash", type: "bytes32" },
  ],
} as const;

/** Canonical JSON remains identical after HTTP serialization. */
export function stableStringify(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(stableStringify).join(",") + "]";
  const obj = value as Record<string, unknown>;
  return "{" + Object.keys(obj).filter(k => obj[k] !== undefined).sort()
    .map(k => JSON.stringify(k) + ":" + stableStringify(obj[k])).join(",") + "}";
}
export function canonicalMemoHash(memo: TradeMemo): Hex {
  return keccak256(toHex(stableStringify(memo)));
}
function subjectLabel(s: TradeSubject): string {
  return s.tokenAddress + " on " + s.chain + " / USD " + s.notionalUsd;
}
export function assembleMemo(subject: TradeSubject, checks: CheckResult[], net: NetworkConfig, now = Date.now()): TradeMemo {
  // A duplicated consumption receipt cannot become an extra successful check.
  const receiptCounts = new Map<string, number>();
  for (const c of checks) if (c.receipt?.receipt_hash) {
    const key = c.receipt.receipt_hash.toLowerCase(); receiptCounts.set(key, (receiptCounts.get(key) ?? 0) + 1);
  }
  const normalized = checks.map(c => c.receipt && (receiptCounts.get(c.receipt.receipt_hash.toLowerCase()) ?? 0) > 1
    ? { ...c, receiptVerified: false, error: "Consumption receipt is duplicated across checks" } : c);
  const gate = evaluateTrade(subject, normalized, now);
  const confirmed = new Set<string>();
  const receipts = new Set<string>();
  const authorizations = new Set<string>();
  let spent = 0n;
  let authorized = 0n;
  let expired = 0n;
  const lineItems: CostLineItem[] = [];
  for (const c of normalized) {
    const amount = c.amountAtomic && /^\d+$/.test(c.amountAtomic) ? BigInt(c.amountAtomic) : 0n;
    const authorizationValue = c.authorizationNonce ?? c.receipt?.receipt_hash;
    const authorizationId = typeof authorizationValue === "string" ? authorizationValue.toLowerCase() : undefined;
    if (c.paymentSubmitted && authorizationId && !authorizations.has(authorizationId)) {
      authorizations.add(authorizationId);
      authorized += amount;
      if (c.paid) spent += amount;
      else if (c.authorizationExpired) expired += amount;
    }
    if (c.paid && c.txHash) confirmed.add(c.txHash.toLowerCase());
    if (c.paid && c.receiptVerified && c.receipt) receipts.add(c.receipt.receipt_hash.toLowerCase());
    lineItems.push({ intent: c.intent, miner: c.minerSlug, amountUsdc: atomicToUsdc(amount),
      txHash: c.txHash, txLink: c.txHash ? txLink(net, c.txHash) : null,
      receiptHash: c.receipt?.receipt_hash ?? null,
      paymentStatus: c.paid ? "confirmed" : c.authorizationExpired ? "expired" : c.paymentSubmitted ? "authorized" : "not_sent" });
  }
  return { subject, createdAt: new Date(now).toISOString(), network: net.name, testnet: net.testnet,
    verdict: gate.decision, overallRisk: gate.overallRisk, reasons: gate.reasons, policy: GATE_POLICY,
    checks: normalized, cost: { totalUsdc: atomicToUsdc(spent), authorizedUsdc: atomicToUsdc(authorized),
      unsettledUsdc: atomicToUsdc(authorized - spent - expired), expiredUsdc: atomicToUsdc(expired), settledTxCount: confirmed.size,
      verifiedReceiptCount: receipts.size, lineItems } };
}
function signingMessage(memo: TradeMemo, memoHash: Hex) {
  return { subject: subjectLabel(memo.subject), verdict: memo.verdict, network: memo.network, createdAt: memo.createdAt, memoHash };
}
export async function signMemo(memo: TradeMemo, signer: TypedDataSigner, net: NetworkConfig): Promise<SignedMemo> {
  const memoHash = canonicalMemoHash(memo);
  const domain = { ...MEMO_DOMAIN, chainId: net.chainId };
  const signature = await signer.signTypedData({ domain, types: MEMO_TYPES, primaryType: "TradeMemo", message: signingMessage(memo, memoHash) });
  return { memo, memoHash, signer: signer.address, signature, domain };
}
export async function verifyMemo(signed: SignedMemo): Promise<boolean> {
  try {
    if (signed.domain.name !== MEMO_DOMAIN.name || signed.domain.version !== MEMO_DOMAIN.version || canonicalMemoHash(signed.memo) !== signed.memoHash) return false;
    return await verifyTypedData({ address: signed.signer, domain: signed.domain, types: MEMO_TYPES, primaryType: "TradeMemo",
      message: signingMessage(signed.memo, signed.memoHash), signature: signed.signature });
  } catch { return false; }
}
export function renderMemo(signed: SignedMemo): string {
  const { memo } = signed;
  return [
    "PRE-TRADE DECISION — " + subjectLabel(memo.subject),
    "Decision: " + memo.verdict,
    "Payment network: " + memo.network + (memo.testnet ? " [TESTNET USDC]" : " [MAINNET]"),
    "Issued: " + memo.createdAt,
    ...memo.reasons,
    "",
    ...memo.checks.map(c => c.intent + " via " + c.minerName + ": " + (c.error ?? c.finding)),
    "",
    "Confirmed cost — " + memo.cost.totalUsdc + " USDC / " + memo.cost.verifiedReceiptCount + " consumption receipts / " + memo.cost.settledTxCount + " unique settlement transactions",
    "Authorized but unconfirmed — " + memo.cost.unsettledUsdc + " USDC",
    ...memo.cost.lineItems.map(c => c.intent + ": " + c.amountUsdc + " USDC [" + c.paymentStatus + "] " + (c.txLink ?? "")),
    "",
    "Agent signer " + signed.signer,
    "Memo hash " + signed.memoHash,
    "Agent signature establishes authorship; it is not a Telegraph validator proof or a guarantee of safety.",
  ].join("\n");
}
