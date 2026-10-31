// A reproducible local operator entry point. A paid retry needs the same UUID.
import { parseArgs } from "node:util";
import { setDefaultResultOrder } from "node:dns";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { createPublicClient, http, parseAbi } from "viem";
import { deskReadiness } from "../agent/readiness";
import { validateTradeSubject, TRADE_INTENTS } from "../agent/policy";
import { usdcToAtomic, atomicToUsdc } from "../agent/x402";
import { configuredReviewStore, validReviewId } from "../agent/store";
import { reviewResponse, startReview } from "../agent/reviews";

setDefaultResultOrder("ipv4first");
async function main() {
  const { values } = parseArgs({ options: { token: { type: "string" }, chain: { type: "string" }, usd: { type: "string" },
    "max-spend": { type: "string", default: "0.05" }, "request-id": { type: "string" }, out: { type: "string" }, purchase: { type: "boolean" }, help: { type: "boolean" } } });
  if (values.help) {
    console.log("npm run review:trade -- --token <contract> --chain Base --usd 1000 [--max-spend 0.05] [--purchase --request-id <uuid-v4> --out .evidence/review.json]\nDefault: request plan without purchasing. --purchase uses the configured dedicated testnet payer and durable journal. Reuse its UUID after a disconnect; use /desk recovery for unresolved authorizations.");
    return;
  }
  const subject = validateTradeSubject({ tokenAddress: values.token, chain: values.chain, notionalUsd: Number(values.usd) });
  const maximum = usdcToAtomic(values["max-spend"]!);
  if (maximum > 250_000n) throw new Error("A review must be capped at 0.25 USDC or less");
  const readiness = deskReadiness();
  if (!values.purchase) {
    console.log(JSON.stringify({ ...readiness.public, state: "preview", plan: { subject, intents: TRADE_INTENTS, maximumSpendUsdc: atomicToUsdc(maximum) }, paymentSigned: false, paymentSent: false }, null, 2));
    return;
  }
  if (!readiness.net.testnet) throw new Error("This operator walkthrough is for the supported testnet");
  if (!readiness.configured || !readiness.signer || !readiness.gateway) throw new Error(readiness.public.reason);
  if (!validReviewId(values["request-id"])) throw new Error("A purchase requires --request-id with a UUID v4; reuse it for retries");
  const store = await configuredReviewStore();
  const startedAt = Date.now();
  try {
    const existing = await store.get(values["request-id"]);
    if (!existing) {
      const client = createPublicClient({ transport: http(readiness.net.rpcUrl, { timeout: 15_000, retryCount: 0 }) });
      if (await client.getChainId() !== readiness.net.chainId) throw new Error("Payment RPC chain does not match configuration");
      const balance = await client.readContract({ address: readiness.net.usdc, abi: parseAbi(["function balanceOf(address) view returns (uint256)"]),
        functionName: "balanceOf", args: [readiness.signer.address] });
      if (balance < maximum) throw new Error("Fund the test payer with at least the authorized ceiling before starting");
    }
    const review = await startReview(store, { id: values["request-id"], subject, maximumSpendAtomic: maximum,
      dailyLimitAtomic: usdcToAtomic(process.env.DESK_DAILY_LIMIT_USDC ?? "1") },
      { signer: readiness.signer, net: readiness.net, gateway: readiness.gateway });
    const evidence = { ...reviewResponse(review), clientElapsedMs: Date.now() - startedAt,
      reusedReview: Boolean(existing), evidenceClass: "internal_testnet", recordedInH2Window: Date.parse(review.createdAt) >= Date.parse("2026-11-01T00:00:00Z") && Date.parse(review.createdAt) < Date.parse("2026-12-02T00:00:00Z") };
    if (values.out) {
      await mkdir(dirname(values.out), { recursive: true });
      await writeFile(values.out, JSON.stringify(evidence, null, 2) + "\n", { mode: 0o600 });
      console.log(JSON.stringify({ file: values.out, requestId: review.id, state: review.state, reconciliationRequired: review.reconciliationRequired,
        recordedInH2Window: evidence.recordedInH2Window, clientElapsedMs: evidence.clientElapsedMs, reusedReview: evidence.reusedReview,
        decision: review.signed?.memo.verdict ?? null, cost: review.signed?.memo.cost ?? null,
        checks: review.checks.map(c => ({ intent: c.intent, provider: c.minerSlug, paid: c.paid,
          receiptVerified: c.receiptVerified, signalVerified: c.signalVerified, error: c.error ?? null })) }, null, 2));
    } else console.log(JSON.stringify(evidence, null, 2));
    if (!review.signed || review.reconciliationRequired || evidence.state !== "verified") process.exitCode = 2;
  } finally { store.client.close(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Trade review failed"); process.exitCode = 1; });
