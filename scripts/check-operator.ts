import { setDefaultResultOrder } from "node:dns";
import { createPublicClient, http, parseAbi } from "viem";
import { parseArgs } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { deskReadiness } from "../agent/readiness";
import { configuredReviewStore } from "../agent/store";
import { atomicToUsdc } from "../agent/x402";
import { inspectPaymentChallenge } from "../agent/payment-readiness";

setDefaultResultOrder("ipv4first");
async function main() {
  const { values } = parseArgs({ options: { out: { type: "string" } } });
  const readiness = deskReadiness();
  const report: Record<string, unknown> = { checkedAt: new Date().toISOString(), ...readiness.public,
    paymentSigned: false, paymentSent: false };
  if (!readiness.configured || !readiness.signer || !readiness.gateway) {
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = 1;
    return;
  }
  const { net, signer, gateway } = readiness;
  const client = createPublicClient({ transport: http(net.rpcUrl, { timeout: 15_000, retryCount: 0 }) });
  const checks = await Promise.allSettled([
    (async () => {
      const store = await configuredReviewStore();
      try {
        await store.initialize();
        const lock = await store.client.execute({ sql: "SELECT review_id FROM arcadian_wallet_locks WHERE wallet = ?",
          args: [net.name + ":" + signer.address.toLowerCase()] });
        const recoverRequestId = lock.rows[0]?.review_id ?? null;
        return { available: true, walletUnlocked: recoverRequestId === null, recoverRequestId };
      } finally { store.client.close(); }
    })(),
    (async () => {
      if (await client.getChainId() !== net.chainId) throw new Error("Payment RPC chain does not match configuration");
      const balance = await client.readContract({ address: net.usdc,
        abi: parseAbi(["function balanceOf(address) view returns (uint256)"]),
        functionName: "balanceOf", args: [signer.address] });
      return { usdc: atomicToUsdc(balance), coversDefaultCeiling: balance >= 50_000n };
    })(),
    (async () => {
      const response = await fetch(gateway + "/v1/ask", { method: "POST", redirect: "error",
        signal: AbortSignal.timeout(20_000), headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: "What is the TVL of Aave on Base?" }) });
      return inspectPaymentChallenge(response.status, response.headers.get("PAYMENT-REQUIRED"), net);
    })(),
  ]);
  checks.forEach((result, index) => { report[["storage", "balance", "engine"][index]] = result.status === "fulfilled"
    ? result.value : { error: result.reason instanceof Error ? result.reason.message : "Check failed" }; });
  const [storage, balance, engine] = checks;
  report.readyForDefaultReview = storage.status === "fulfilled" && storage.value.walletUnlocked &&
    balance.status === "fulfilled" && balance.value.coversDefaultCeiling &&
    engine.status === "fulfilled" && engine.value.available;
  report.ok = report.readyForDefaultReview;
  report.state = report.readyForDefaultReview ? "ready" : "blocked";
  report.reason = report.readyForDefaultReview ? "Storage, wallet, funding and the unsigned Engine challenge passed; no purchase has been made."
    : "Resolve the reported storage, wallet, funding or Engine mismatch before a new purchase.";
  if (values.out) {
    await mkdir(dirname(values.out), { recursive: true });
    await writeFile(values.out, JSON.stringify(report, null, 2) + "\n", { mode: 0o600 });
  }
  console.log(JSON.stringify(report, null, 2));
  if (!report.readyForDefaultReview) process.exitCode = 1;
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Operator check failed"); process.exitCode = 1; });
