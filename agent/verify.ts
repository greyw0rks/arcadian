// Read-only verification for another trader, agent or reviewer. A memo's own
// signer and its recorded verification booleans are never trust anchors.
import { isAddress, type Address, type Hex } from "viem";
import { assembleMemo, stableStringify, verifyMemo, type CheckResult, type SignedMemo } from "./memo";
import { GATE_POLICY, TRADE_INTENTS, parseObservation, validateTradeSubject, type GateDecision, type TradeSubject } from "./policy";
import { decodeReceipt, receiptBindingError } from "./receipt";
import { verifySettlement } from "./settlement";
import { verifySignalRecord } from "./signal";
import { queryFor, requestIntentFor } from "./desk";
import type { NetworkConfig } from "./config";
import { resolveProviderIdentity } from "./provider-identity";

export interface VerificationContext {
  /** Obtain this address from the operator independently of the memo. */
  trustedSigner: Address;
  expectedSubject: TradeSubject;
  net: NetworkConfig;
  gateway: string;
}
export interface VerificationDeps {
  now?: () => number;
  verifyPayment?: typeof verifySettlement;
  verifySignal?: typeof verifySignalRecord;
}
export interface MemoVerification {
  verifiedAt: string;
  signatureVerified: boolean;
  evidenceVerified: boolean;
  canProceed: boolean;
  recordedDecision: GateDecision | null;
  decision: GateDecision;
  reasons: string[];
  memoHash: string | null;
  signer: string | null;
  cost: { totalUsdc: string; verifiedReceiptCount: number; settledTxCount: number } | null;
  checks: { intent: string; paymentVerified: boolean; receiptVerified: boolean; signalVerified: boolean; issues: string[] }[];
}

function record(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function hash(value: unknown): value is Hex { return typeof value === "string" && /^0x[0-9a-f]{64}$/i.test(value); }
function sameSubject(a: TradeSubject, b: TradeSubject): boolean {
  return a.tokenAddress.toLowerCase() === b.tokenAddress.toLowerCase() && a.chainId === b.chainId && a.notionalUsd === b.notionalUsd;
}

export async function verifyTradeMemo(value: unknown, context: VerificationContext, deps: VerificationDeps = {}): Promise<MemoVerification> {
  const now = (deps.now ?? Date.now)();
  const report: MemoVerification = { verifiedAt: new Date(now).toISOString(), signatureVerified: false,
    evidenceVerified: false, canProceed: false, recordedDecision: null, decision: "NO_DATA", reasons: [], memoHash: null, signer: null, cost: null, checks: [] };
  const stop = (reason: string) => { report.reasons.push(reason); return report; };
  let expected: TradeSubject;
  let actual: TradeSubject;
  if (!record(value) || !record(value.memo) || !record(value.domain) || !Array.isArray(value.memo.checks) || !record(value.memo.cost)) return stop("Provide a complete signed Arcadian memo");
  if (!isAddress(context.trustedSigner, { strict: false }) || /^0x0{40}$/i.test(context.trustedSigner)) return stop("Supply the operator's trusted signer address independently of the memo");
  try { expected = validateTradeSubject(context.expectedSubject); actual = validateTradeSubject(value.memo.subject); }
  catch (error) { return stop(error instanceof Error ? error.message : "Invalid trade subject"); }
  if (!sameSubject(actual, expected)) return stop("The memo does not cover the proposed token, chain and exact USD notional");
  if (typeof value.signer !== "string" || value.signer.toLowerCase() !== context.trustedSigner.toLowerCase()) return stop("The memo was not signed by the trusted operator");
  if (value.domain.chainId !== context.net.chainId || value.memo.network !== context.net.name || value.memo.testnet !== context.net.testnet) return stop("The memo names a different payment network");
  if (stableStringify(value.memo.policy) !== stableStringify(GATE_POLICY)) return stop("The memo does not use the supported risk policy");
  if (!hash(value.memoHash) || typeof value.signature !== "string" || !/^0x[0-9a-f]{130}$/i.test(value.signature) || !await verifyMemo(value as SignedMemo)) return stop("The memo hash or EIP-712 signature is invalid");
  report.signatureVerified = true;
  report.memoHash = value.memoHash;
  report.signer = value.signer;
  if (!["PROCEED", "BLOCK", "REVIEW", "NO_DATA"].includes(value.memo.verdict)) return stop("The recorded decision is invalid");
  report.recordedDecision = value.memo.verdict;
  const issued = typeof value.memo.createdAt === "string" ? Date.parse(value.memo.createdAt) : NaN;
  if (!Number.isFinite(issued) || issued > now + 60_000) return stop("The memo has no valid issuance timestamp");
  const rows = value.memo.checks as CheckResult[];
  if (rows.length !== TRADE_INTENTS.length || TRADE_INTENTS.some(intent => rows.filter(c => record(c) && c.intent === intent).length !== 1)) return stop("Exactly one check per required Intent must be present");
  const receiptCounts = new Map<string, number>();
  const nonceCounts = new Map<string, number>();
  for (const c of rows) {
    if (record(c.receipt) && hash(c.receipt.receipt_hash)) {
      const key = c.receipt.receipt_hash.toLowerCase(); receiptCounts.set(key, (receiptCounts.get(key) ?? 0) + 1);
    }
    if (hash(c.authorizationNonce)) {
      const key = c.authorizationNonce.toLowerCase(); nonceCounts.set(key, (nonceCounts.get(key) ?? 0) + 1);
    }
  }
  const verified = await Promise.all(rows.map(async c => {
    const issues: string[] = [];
    const check: CheckResult = { ...c, paid: false, receiptVerified: false, signalVerified: false, observation: null };
    const receipt = decodeReceipt(Buffer.from(JSON.stringify(c.receipt ?? null)).toString("base64"));
    check.receipt = receipt;
    const a = c.authorization;
    if (!record(a) || !isAddress(a.from, { strict: false }) || !isAddress(a.to, { strict: false }) ||
        a.from.toLowerCase() !== context.trustedSigner.toLowerCase() || !hash(a.nonce) ||
        !hash(c.authorizationNonce) || a.nonce.toLowerCase() !== c.authorizationNonce.toLowerCase() ||
        typeof c.amountAtomic !== "string" || !/^[0-9]{1,6}$/.test(c.amountAtomic) || BigInt(c.amountAtomic) <= 0n || BigInt(c.amountAtomic) > 250_000n ||
        a.value !== c.amountAtomic || typeof a.validAfter !== "string" || typeof a.validBefore !== "string" ||
        !/^[0-9]{1,20}$/.test(a.validAfter) || !/^[0-9]{1,20}$/.test(a.validBefore) || BigInt(a.validAfter) >= BigInt(a.validBefore)) issues.push("Missing or mismatched payment authorization");
    if (c.paymentSubmitted !== true || c.authorizationExpired === true) issues.push("The memo does not record a submitted payment for this answer");
    if (!hash(c.txHash)) issues.push("Missing settlement transaction");
    if (hash(c.authorizationNonce) && (nonceCounts.get(c.authorizationNonce.toLowerCase()) ?? 0) > 1) issues.push("Payment authorization is reused across checks");
    // An upstream failure can still consume a valid authorization. Verify that
    // spend independently of whether the provider returned usable evidence.
    const paymentProof = !issues.length ? Promise.allSettled([
      (deps.verifyPayment ?? verifySettlement)(c.txHash as Hex, a!, context.net),
    ]) : null;
    if (!hash(c.txHash) || !hash(c.signalHash) || typeof c.minerId !== "string" || !c.minerId || typeof c.minerSlug !== "string" || !c.minerSlug) issues.push("Missing transaction, recorded signal or serving provider");
    const requestedIntent = requestIntentFor(c.intent, context.net);
    if ((c.requestedIntent ?? c.intent) !== requestedIntent || c.reportedIntent !== requestedIntent ||
      c.query !== queryFor(c.intent, actual, requestedIntent) || c.responseError) issues.push("The provider response does not resolve this exact request and Intent");
    if (c.rawResult === undefined) issues.push("The raw provider response is missing");
    if (receipt && (receiptCounts.get(receipt.receipt_hash.toLowerCase()) ?? 0) > 1) issues.push("Consumption receipt is reused across checks");
    const received = c.receivedAt ? Date.parse(c.receivedAt) : issued;
    if (!Number.isFinite(received) || received > issued + 60_000) issues.push("The provider response has no valid receipt time");
    if (!issues.length) {
      if (c.minerRegistrationId && c.minerRegistrationId !== c.minerId) {
        const identity = await resolveProviderIdentity(context.gateway, { minerId: c.minerId!, registrationId: c.minerRegistrationId, intent: requestedIntent });
        if (!identity || identity.slug !== c.minerSlug) issues.push("Provider registration cannot be matched to the serving Engine ID");
      }
      const receiptIssue = receiptBindingError(receipt, { minerId: c.minerRegistrationId ?? c.minerId!, intent: requestedIntent, payer: context.trustedSigner,
        amountAtomic: c.amountAtomic!, txHash: c.txHash!, net: context.net, now: received });
      check.receiptVerified = !receiptIssue;
      if (receiptIssue) issues.push(receiptIssue);
      check.observation = parseObservation(c.rawResult, c.intent, actual, c.minerSlug);
      if (stableStringify(check.observation) !== stableStringify(c.observation)) issues.push("The recorded observation does not match the raw provider response");
      const proofs = await Promise.allSettled([
        (deps.verifySignal ?? verifySignalRecord)(context.gateway, c.signalHash!, c.rawResult,
          { query: c.query!, payer: context.trustedSigner, minerId: c.minerId!, minerSlug: c.minerSlug, intent: requestedIntent }),
      ]);
      check.signalVerified = proofs[0].status === "fulfilled" && proofs[0].value === true;
      if (!check.signalVerified) issues.push("The live recorded signal does not match the request and raw answer");
    }
    if (paymentProof) {
      const [payment] = await paymentProof;
      if (payment.status === "fulfilled") {
        check.paid = payment.value.verified;
        check.settlementBlock = payment.value.blockNumber;
        if (!check.paid) issues.push(payment.value.reason);
      } else issues.push("The payment chain could not be read");
    }
    check.error = issues.length ? issues.join("; ") : undefined;
    report.checks.push({ intent: c.intent, paymentVerified: check.paid, receiptVerified: check.receiptVerified, signalVerified: check.signalVerified, issues });
    return check;
  }));
  report.checks.sort((a, b) => TRADE_INTENTS.indexOf(a.intent as typeof TRADE_INTENTS[number]) - TRADE_INTENTS.indexOf(b.intent as typeof TRADE_INTENTS[number]));
  const current = assembleMemo(actual, verified, context.net, now);
  report.cost = { totalUsdc: current.cost.totalUsdc, verifiedReceiptCount: current.cost.verifiedReceiptCount, settledTxCount: current.cost.settledTxCount };
  const costMatches = stableStringify(current.cost) === stableStringify(value.memo.cost);
  report.evidenceVerified = verified.every(c => !c.error && c.paid && c.receiptVerified && c.signalVerified) && costMatches;
  report.decision = current.verdict;
  report.reasons = [...current.reasons];
  if (!costMatches) report.reasons.push("The signed spend ledger does not match the independently verified payments");
  if (now - issued > GATE_POLICY.maximumAgeMs) report.reasons.push("The memo is older than five minutes; obtain a fresh decision before proceeding");
  if (report.recordedDecision !== current.verdict) report.reasons.push("The current decision differs from the recorded decision");
  report.canProceed = report.evidenceVerified && current.verdict === "PROCEED" && report.recordedDecision === "PROCEED" && now - issued <= GATE_POLICY.maximumAgeMs;
  if (!report.canProceed && report.decision === "PROCEED") report.decision = "REVIEW";
  return report;
}
