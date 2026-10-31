import { createPublicClient, http, keccak256, toHex, type Hex } from "viem";
import { runDesk, emptyCheck, type DeskDeps } from "./desk";
import { assembleMemo, renderMemo, signMemo, stableStringify } from "./memo";
import { TRADE_INTENTS, parseObservation, type TradeSubject } from "./policy";
import { reconcileAuthorization } from "./settlement";
import { receiptBindingError } from "./receipt";
import { verifySignalRecord, readBoundSignal } from "./signal";
import { resolveProviderIdentity } from "./provider-identity";
import { networkByName, type NetworkName } from "./config";
import { ReviewStoreError, type ReviewStore, type StoredReview } from "./store";

export function reviewResponse(review: StoredReview) {
  const net = networkByName(review.network as NetworkName);
  const signed = review.signed;
  const complete = signed?.memo.cost.verifiedReceiptCount === TRADE_INTENTS.length && signed.memo.checks.every(c => c.paid && c.receiptVerified && c.signalVerified);
  return { ok: true, state: signed ? complete ? "verified" : "incomplete" : review.state,
    review: { id: review.id, state: review.state, createdAt: review.createdAt, updatedAt: review.updatedAt,
      reconciliationRequired: review.reconciliationRequired, checks: review.checks },
    network: { name: net.name, chainId: net.chainId, testnet: net.testnet, explorer: net.txExplorer },
    ...(signed ? { memo: signed, rendered: renderMemo(signed) } : {}),
    reason: signed ? complete ? "All required purchases were verified. The decision follows the recorded risk policy."
      : "The evidence is incomplete. Inspect the checks and payment ledger before making another request."
      : review.error ?? "This review is recorded. Recovery checks its existing payments without buying more intelligence." };
}

export async function startReview(store: ReviewStore, input: { id: string; subject: TradeSubject; maximumSpendAtomic: bigint; dailyLimitAtomic: bigint }, deps: DeskDeps & { net: NonNullable<DeskDeps["net"]>; gateway: string }) {
  const requestHash = keccak256(toHex(stableStringify({ subject: input.subject, maximum: input.maximumSpendAtomic.toString(),
    payer: deps.signer.address.toLowerCase(), network: deps.net.name, gateway: deps.gateway })));
  const claimed = await store.begin({ ...input, requestHash, payer: deps.signer.address, network: deps.net.name, gateway: deps.gateway });
  if (!claimed.started) return claimed.review;
  try {
    const client = createPublicClient({ transport: http(deps.net.rpcUrl, { timeout: 10_000, retryCount: 0 }) });
    if (await client.getChainId() !== deps.net.chainId) throw new Error("Payment RPC is connected to a different chain");
    await store.anchor(input.id, await client.getBlockNumber(), claimed.writerToken!);
    const signed = await runDesk({ subject: input.subject, maximumSpendAtomic: input.maximumSpendAtomic }, {
      ...deps, onAuthorized: check => store.saveCheck(input.id, check, claimed.writerToken!), onCheck: check => store.saveCheck(input.id, check, claimed.writerToken!),
    });
    return await store.finish(input.id, signed, claimed.writerToken!);
  } catch {
    try {
      return await store.interrupt(input.id, "Review interrupted. Its authorizations are retained; recover this review before making another paid request.", claimed.writerToken!);
    } catch (error) {
      if (error instanceof ReviewStoreError && error.status === 409) return (await store.get(input.id))!;
      throw error;
    }
  }
}

export interface RecoveryDeps extends Pick<DeskDeps, "signer" | "verifySignal"> {
  reconcile?: typeof reconcileAuthorization;
  now?: () => number;
}

export async function recoverReview(store: ReviewStore, review: StoredReview, deps: RecoveryDeps,
  transactions: Record<string, Hex> = {}): Promise<StoredReview> {
  if (review.payer.toLowerCase() !== deps.signer.address.toLowerCase()) throw new ReviewStoreError("Recover this review with its original payer wallet configured", 409);
  // A database claim fences late writes from an interrupted HTTP request.
  const claimed = await store.claimRecovery(review.id, (deps.now ?? Date.now)());
  if (!claimed.writerToken) return claimed.review;
  review = claimed.review;
  const net = networkByName(review.network as NetworkName);
  try {
  const finished = await Promise.allSettled(TRADE_INTENTS.map(async intent => {
    const check = { ...(review.checks.find(c => c.intent === intent) ?? emptyCheck(intent)) };
    const requestedIntent = check.requestedIntent ?? intent;
    const responseError = check.responseError ?? (check.reportedIntent !== undefined && check.reportedIntent !== requestedIntent
      ? "Engine routed this check as " + (check.reportedIntent ?? "an unspecified intent")
      : check.error?.startsWith("Engine routed this check as ") ? check.error : undefined);
    check.error = responseError;
    if (check.paymentSubmitted && check.authorization && !check.paid && !check.authorizationExpired) {
      const result = await (deps.reconcile ?? reconcileAuthorization)(check.authorization, net, review.anchorBlock, transactions[intent] ?? check.txHash as Hex | undefined);
      check.paid = result.verified;
      check.authorizationExpired = result.expired;
      check.txHash = result.txHash;
      check.settlementBlock = result.blockNumber;
      if (!result.verified) check.error ??= result.reason;
    }
    if (check.paid && check.txHash && check.amountAtomic && check.minerId) {
      if (check.receipt && check.receipt.miner !== check.minerId) {
        const identity = await resolveProviderIdentity(review.gateway, { minerId: check.minerId, registrationId: check.receipt.miner, intent: requestedIntent });
        if (identity) { check.minerRegistrationId = identity.registrationId; check.minerSlug = identity.slug; }
        else { delete check.minerRegistrationId; }
      }
      if (net.name === "telegraph-sepolia" && check.signalHash && check.query) {
        const bound = await readBoundSignal(review.gateway, check.signalHash,
          { query: check.query, payer: review.payer, minerId: check.minerId, minerSlug: check.minerSlug, intent: requestedIntent });
        if (bound) {
          check.rawResult = bound.response;
          check.observation = parseObservation(bound.response, intent, review.subject, check.minerSlug);
          check.finding = check.observation.summary; check.riskScore = check.observation.riskScore; check.verdict = check.observation.status;
        }
      }
      const issue = receiptBindingError(check.receipt, { minerId: check.minerRegistrationId ?? check.minerId, intent: requestedIntent, payer: review.payer as Hex,
        amountAtomic: check.amountAtomic, txHash: check.txHash, net, now: Date.parse(check.receivedAt ?? review.createdAt) });
      check.receiptVerified = !issue;
      check.signalVerified = false;
      if (check.signalHash && check.rawResult !== undefined && check.query) check.signalVerified = await (deps.verifySignal ?? verifySignalRecord)(review.gateway,
        check.signalHash, check.rawResult, { query: check.query, payer: review.payer, minerId: check.minerId, minerSlug: check.minerSlug, intent: requestedIntent });
      if (!check.receiptVerified || !check.signalVerified) check.error ??= issue ?? "Recorded signal could not be matched to this request";
    }
    if (!check.paid) check.error ??= check.authorizationExpired ? "Authorization expired unused; no paid answer was verified" : "Settlement is unconfirmed";
    else if (!check.receiptVerified || !check.signalVerified) check.error ??= "Payment is confirmed but the purchased answer could not be verified";
    await store.saveCheck(review.id, check, claimed.writerToken!);
    return check;
  }));
  const failure = finished.find(c => c.status === "rejected");
  if (failure?.status === "rejected") throw failure.reason;
  const checks = finished.map(c => (c as PromiseFulfilledResult<ReturnType<typeof emptyCheck>>).value);
  return await store.finish(review.id, await signMemo(assembleMemo(review.subject, checks, net, (deps.now ?? Date.now)()), deps.signer, net), claimed.writerToken);
  } catch (error) {
    if (error instanceof ReviewStoreError && error.status === 409) return (await store.get(review.id))!;
    try { await store.interrupt(review.id, "Recovery interrupted. Existing payment authorizations remain recorded; retry recovery.", claimed.writerToken); }
    catch { /* A newer recovery owns the journal, or the database is unavailable. */ }
    throw error;
  }
}
