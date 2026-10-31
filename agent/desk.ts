// Mission 14: ask Telegraph's Engine for each required kind of intelligence.
// The Engine owns routing; no provider endpoint is called by the application.
import { payAndFetch, paymentAuthorization, PaymentTransportError, SpendBudget, type TypedDataSigner } from "./x402";
import { assembleMemo, signMemo, type CheckResult, type SignedMemo } from "./memo";
import { activeNetwork, telegraphGateway, type NetworkConfig } from "./config";
import { TRADE_INTENTS, validateTradeSubject, parseObservation, type TradeSubject } from "./policy";
import { decodeReceipt, receiptBindingError } from "./receipt";
import { verifySettlement, type SettlementVerification } from "./settlement";
import { verifySignalRecord, readBoundSignal } from "./signal";
import { resolveProviderIdentity } from "./provider-identity";
import { discoverRoutes } from "../lib/telegraph";
import type { Authorization } from "./x402";
import type { Hex } from "viem";

export const LISTING_INTENTS = TRADE_INTENTS;
export interface DeskInput {
  subject: TradeSubject;
  maximumSpendAtomic?: bigint;
}
export interface DeskDeps {
  signer: TypedDataSigner;
  net?: NetworkConfig;
  gateway?: string | null;
  fetchImpl?: typeof fetch;
  now?: () => number;
  discover?: typeof discoverRoutes;
  verifyPayment?: (hash: Hex, authorization: Authorization, net: NetworkConfig) => Promise<SettlementVerification>;
  verifySignal?: typeof verifySignalRecord;
  onAuthorized?: (check: CheckResult) => Promise<void>;
  onCheck?: (check: CheckResult) => Promise<void>;
}
export function requestIntentFor(intent: string, net: NetworkConfig): string {
  if (!TRADE_INTENTS.includes(intent as typeof TRADE_INTENTS[number])) throw new Error("Unsupported trade check");
  return net.name === "telegraph-sepolia" ? intent + "_GENERAL" : intent;
}
export function queryFor(intent: string, subject: TradeSubject, requestedIntent = intent): string {
  if (requestedIntent !== intent && requestedIntent !== intent + "_GENERAL") throw new Error("Unsupported Engine Intent mapping");
  return baseQueryFor(intent, subject).replace("Perform " + intent + " ", "Perform " + requestedIntent + " ");
}
function baseQueryFor(intent: string, subject: TradeSubject): string {
  const target = "token contract " + subject.tokenAddress + " on " + subject.chain + " (chain ID " + subject.chainId + ")";
  const common = " Return subject.token_address, subject.chain_id, observed_at as an ISO timestamp, confidence from 0 to 1, risk_score from 0 to 100, status as pass/block/unknown, signal, and flags. Unknown evidence must remain unknown.";
  switch (intent) {
    case "SMART_CONTRACT_AUDIT": return "Perform SMART_CONTRACT_AUDIT for " + target + ": check honeypot, blocked sells, owner controls, proxy and drainer risk." + common;
    case "WASH_TRADING_DETECTION": return "Perform WASH_TRADING_DETECTION for " + target + ": determine whether trading volume is artificial." + common;
    case "ONCHAIN_METRIC_VERIFY": return "Perform ONCHAIN_METRIC_VERIFY for " + target + ": read totalSupply() with calldata 0x18160ddd, return the numeric block height, raw return and decoded unsigned value. Do not use the literal 'latest' as the block anchor." + common;
    case "LIQUIDITY_DEPTH_VERIFY": return "Perform LIQUIDITY_DEPTH_VERIFY for " + target + ", proposed trade USD " + subject.notionalUsd + ". Report executable depth in USD as metric executable_depth_usd and numeric value. TVL is not executable depth." + common;
    default: throw new Error("Unsupported trade check");
  }
}
export function emptyCheck(intent: string): CheckResult {
  return { intent, minerSlug: "unresolved", minerName: "Unresolved provider", minerId: null, rank: null,
    finding: "", riskScore: null, verdict: null, observation: null, paid: false, paymentSubmitted: false,
    amountAtomic: null, txHash: null, authorizationNonce: null, settlementBlock: null,
    receipt: null, receiptVerified: false, signalHash: null, signalVerified: false, signalLink: null };
}
async function buyCheck(intent: string, subject: TradeSubject, gateway: string, deps: DeskDeps, net: NetworkConfig, budget: SpendBudget): Promise<CheckResult> {
  const check = emptyCheck(intent);
  const requestedIntent = requestIntentFor(intent, net);
  const query = queryFor(intent, subject, requestedIntent);
  check.query = query;
  check.requestedIntent = requestedIntent;
  try {
    const result = await payAndFetch(gateway + "/v1/ask", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query, ...(requestedIntent !== intent ? { intent: requestedIntent } : {}), context: {
        token_address: subject.tokenAddress, chain_id: subject.chainId, chain: subject.chain,
        token: subject.tokenAddress, contract_address: subject.tokenAddress, address: subject.tokenAddress,
        notional_usd: subject.notionalUsd,
      } }),
    }, deps.signer, { fetchImpl: deps.fetchImpl, net, budget, beforeSubmit: async (payment, requirements) => {
      const authorization = paymentAuthorization(payment);
      const authorized = { ...check, paymentSubmitted: true, amountAtomic: requirements.amount,
        authorization, authorizationNonce: authorization.nonce };
      await deps.onAuthorized?.(authorized);
      Object.assign(check, authorized);
    } });
    check.paymentSubmitted = result.paymentSubmitted;
    check.amountAtomic = result.amountAtomic;
    check.txHash = result.txHash;
    if (result.payment) {
      check.authorization = paymentAuthorization(result.payment);
      check.authorizationNonce = check.authorization.nonce;
    }
    if (result.txHash && result.payment) {
      const verification = await (deps.verifyPayment ?? verifySettlement)(result.txHash, paymentAuthorization(result.payment), net);
      check.paid = verification.verified;
      check.settlementBlock = verification.blockNumber;
      if (!verification.verified) check.error = verification.reason;
    }
    if (!result.response.ok) {
      try {
        const body = await result.response.json();
        check.engineError = { code: typeof body?.error === "string" ? body.error.slice(0, 200) : null,
          message: typeof body?.message === "string" ? body.message.slice(0, 1000) : typeof body?.detail === "string" ? body.detail.slice(0, 1000) : null };
      } catch { /* Invalid error bodies cannot become usable provider evidence. */ }
      const error = "Engine returned " + result.response.status + (result.paymentSubmitted ? "; retain payment evidence before retrying" : "");
      return { ...check, error, responseError: error };
    }
    const envelope = await result.response.json();
    if (!envelope || typeof envelope !== "object" || typeof envelope.miner_id !== "string" || envelope.result === undefined) {
      const error = "Engine returned no usable provider result envelope";
      return { ...check, error, responseError: error };
    }
    check.receivedAt = new Date((deps.now ?? Date.now)()).toISOString();
    check.reportedIntent = typeof envelope.intent === "string" ? envelope.intent : null;
    check.minerId = envelope.miner_id;
    check.minerName = typeof envelope.miner_name === "string" ? envelope.miner_name : envelope.miner_id;
    check.minerSlug = check.minerName;
    check.rawResult = envelope.result;
    check.receipt = decodeReceipt(result.response.headers.get("X-TELEGRAPH-RECEIPT"));
    if (check.receipt && check.receipt.miner !== check.minerId) {
      const identity = await resolveProviderIdentity(gateway, { minerId: check.minerId!, registrationId: check.receipt.miner, intent: requestedIntent }, deps.fetchImpl);
      if (identity) { check.minerSlug = identity.slug; check.minerRegistrationId = identity.registrationId; }
    }
    if (net.name === "telegraph-sepolia" && typeof envelope.signal_hash === "string") {
      const bound = await readBoundSignal(gateway, envelope.signal_hash,
        { query, payer: deps.signer.address, minerId: check.minerId!, minerSlug: check.minerSlug, intent: requestedIntent }, deps.fetchImpl);
      if (bound) check.rawResult = bound.response;
    }
    check.durationMs = typeof envelope.duration_ms === "number" ? envelope.duration_ms : null;
    check.providerTimestamp = typeof envelope.timestamp === "string" ? envelope.timestamp : null;
    check.observation = parseObservation(check.rawResult, intent, subject, check.minerSlug);
    check.finding = check.observation.summary;
    check.riskScore = check.observation.riskScore;
    check.verdict = check.observation.status;
    if (result.txHash && result.amountAtomic) {
      const issue = receiptBindingError(check.receipt, { minerId: check.minerRegistrationId ?? check.minerId!, intent: requestedIntent, payer: deps.signer.address,
        amountAtomic: result.amountAtomic, txHash: result.txHash, net, now: (deps.now ?? Date.now)() });
      check.receiptVerified = !issue;
      if (issue) check.error = issue;
    }
    if (envelope.intent !== requestedIntent) {
      check.responseError = "Engine routed this check as " + String(envelope.intent ?? "an unspecified intent");
      check.error = check.responseError;
    }
    check.signalHash = typeof envelope.signal_hash === "string" && /^0x[0-9a-f]{64}$/i.test(envelope.signal_hash) ? envelope.signal_hash : null;
    if (check.signalHash) {
      check.signalLink = gateway + "/v1/signal/" + check.signalHash;
      check.signalVerified = await (deps.verifySignal ?? verifySignalRecord)(gateway, check.signalHash, check.rawResult,
        { query, payer: deps.signer.address, minerId: check.minerId!, minerSlug: check.minerSlug, intent: requestedIntent }, deps.fetchImpl);
    }
    if (!result.paymentSubmitted) check.error = "Engine returned an unpaid answer";
    else if (!check.paid) check.error ??= "Settlement is unconfirmed";
    else if (!check.receiptVerified) check.error ??= "Consumption receipt is unverified";
    else if (!check.signalVerified) check.error ??= "Recorded signal could not be verified";
    return check;
  } catch (error) {
    if (error instanceof PaymentTransportError) {
      check.paymentSubmitted = true;
      check.amountAtomic = error.requirements.amount;
      check.authorization = paymentAuthorization(error.payment);
      check.authorizationNonce = check.authorization.nonce;
    }
    const message = error instanceof Error ? error.message : "Trade check failed";
    return { ...check, error: message, responseError: message };
  }
}
export async function runDesk(input: DeskInput, deps: DeskDeps): Promise<SignedMemo> {
  const subject = validateTradeSubject(input.subject);
  const net = deps.net ?? activeNetwork();
  const gateway = deps.gateway !== undefined ? deps.gateway : telegraphGateway();
  if (!gateway) throw new Error("No Telegraph gateway configured for this payment network");
  const maximum = input.maximumSpendAtomic ?? 50_000n;
  if (maximum <= 0n || maximum > 250_000n) throw new Error("A paid review must be capped at 0.25 USDC or less");
  const budget = new SpendBudget(maximum);
  const finished = await Promise.allSettled(TRADE_INTENTS.map(async intent => {
    const check = await buyCheck(intent, subject, gateway, deps, net, budget);
    await deps.onCheck?.(check);
    return check;
  }));
  if (finished.some(c => c.status === "rejected")) throw new Error("The review journal could not be completed; recover the recorded authorizations before retrying");
  const checks = finished.map(c => (c as PromiseFulfilledResult<CheckResult>).value);
  // Rankings annotate the actual serving provider; discovery never substitutes
  // a guessed endpoint for Engine routing, and failure is not a paid retry.
  try {
    const routes = await (deps.discover ?? discoverRoutes)([...TRADE_INTENTS], {}, deps.fetchImpl);
    for (const check of checks) {
      const route = routes[check.intent];
      if (route?.slug === check.minerSlug) check.rank = route.rank;
    }
  } catch { /* Absence of a rank stays explicit. */ }
  const memo = assembleMemo(subject, checks, net, (deps.now ?? Date.now)());
  return signMemo(memo, deps.signer, net);
}
