import { decodePaymentRequiredHeader } from "@x402/core/http";
import type { NetworkConfig } from "./config";
import { atomicToUsdc, validateRequirements, type PaymentRequirements } from "./x402";

export function inspectPaymentChallenge(status: number, header: string | null, net: NetworkConfig, maximum = 50_000n) {
  const expected = { network: net.caip2, asset: net.usdc, domain: net.usdcDomain };
  const offered: { scheme: string; network: string; asset: string; amount: string; recipient: string }[] = [];
  const fail = (error: string) => ({ available: false as const, expected, offered, error });
  if (status !== 402 || !header) return fail(`Engine did not return a v2 payment challenge (HTTP ${status})`);
  let challenge: unknown;
  try { challenge = decodePaymentRequiredHeader(header); }
  catch { return fail("Engine payment header is not valid x402 JSON"); }
  if (!challenge || typeof challenge !== "object" || !("x402Version" in challenge) || challenge.x402Version !== 2 ||
      !("accepts" in challenge) || !Array.isArray(challenge.accepts)) return fail("Engine challenge is not x402 v2");
  for (const r of challenge.accepts) {
    if (!r || typeof r !== "object") continue;
    if (["scheme", "network", "asset", "amount", "payTo"].every(k => typeof r[k] === "string")) {
      offered.push({ scheme: r.scheme, network: r.network, asset: r.asset, amount: r.amount, recipient: r.payTo });
    }
  }
  const requirement = challenge.accepts.find((r: PaymentRequirements | null) => r && r.scheme === "exact" &&
    r.network === net.caip2 && typeof r.asset === "string" && r.asset.toLowerCase() === net.usdc.toLowerCase());
  if (!requirement) return fail("Engine challenge has no exact payment on the configured network and token. Resolve the deployment before funding or signing.");
  try { validateRequirements(requirement, net, maximum); }
  catch (error) { return fail(error instanceof Error ? error.message : "Invalid payment requirement"); }
  return { available: true as const, expected, offered, challengeVersion: 2, quotedUsdc: atomicToUsdc(requirement.amount), recipient: requirement.payTo };
}
