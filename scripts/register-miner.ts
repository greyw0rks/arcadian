/**
 * Register (or re-register) Arcadian as a Telegraph Miner on Base Sepolia.
 *
 * Usage:
 *   REGISTER_PRIVATE_KEY=0x... FEE_ADDRESS=0x... npm run register
 *
 * Re-registering with the same `slug` replaces the existing config, so this is
 * also the update path. The registration must come from the wallet that owns
 * slug `arcadian-defi-risk` (0x634E8E643fb9a9919671824B48402D7AD93F321f).
 *
 * The registered hash is the SHA-256 of the LOCAL public/telegraph-risk.yaml, so
 * deploy first — this script refuses to run if the hosted file does not match
 * byte for byte, because a mismatch means Telegraph nodes stage a config that
 * differs from what was committed on-chain.
 *
 * Contract: MinerRegistryFacet on Base Sepolia — 0x5a2324aA18613FAD4e44bDF0d6c73Ec1f6D87ff8
 */

import { createWalletClient, http, publicActions, parseAbi } from "viem";
import { baseSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { createHash } from "crypto";
import { readFileSync } from "fs";
import { join } from "path";

// The live registry. 0x122396E8… is an older deployment that still accepts
// registrations (55 miners, last used Aug 30) but is NOT the one the explorer
// reads — arcadian's own successful registration went to 0x5a2324aA…, which is
// at 400 miners and takes traffic continuously.
const REGISTRY = "0x5a2324aA18613FAD4e44bDF0d6c73Ec1f6D87ff8" as const;
const YAML_URL = "https://arcadian-gamma.vercel.app/telegraph-risk.yaml";
const MIN_PRICE_USDC = 10_000n; // $0.01 in 6-decimal USDC units

const ABI = parseAbi([
  "function registerMiner(string yamlUrl, bytes32 yamlHash, address feeAddress, uint256 minPriceUsdc, string[] supportedIntents) external returns (uint256 registrationId)",
]);

// The registry validates these against an on-chain intent list — an unknown
// value reverts, and lowercase reverts too. Must stay identical to
// `semantics.supported_intents` in public/telegraph-risk.yaml.
const SUPPORTED_INTENTS = ["FINANCIAL_DATA", "TVL_LOOKUP", "FRAUD_DETECTION"];

async function main() {
  const privateKey = process.env.REGISTER_PRIVATE_KEY;
  const feeAddress = process.env.FEE_ADDRESS;

  if (!privateKey || !feeAddress) {
    console.error("Set REGISTER_PRIVATE_KEY and FEE_ADDRESS env vars");
    process.exit(1);
  }

  const yamlPath = join(process.cwd(), "public", "telegraph-risk.yaml");
  const yamlContent = readFileSync(yamlPath, "utf-8");
  const yamlHash = ("0x" + createHash("sha256").update(yamlContent).digest("hex")) as `0x${string}`;

  // The hosted file is what nodes fetch; the hash is what they check it against.
  const res = await fetch(YAML_URL, { cache: "no-store" });
  if (!res.ok) {
    console.error(`Hosted YAML returned ${res.status} — deploy before registering.`);
    process.exit(1);
  }
  const hosted = await res.text();
  if (hosted !== yamlContent) {
    console.error("Hosted YAML does not match public/telegraph-risk.yaml byte for byte.");
    console.error(`  local  sha256: ${yamlHash}`);
    console.error(`  hosted sha256: 0x${createHash("sha256").update(hosted).digest("hex")}`);
    console.error("Run `vercel --prod` first, then re-run this script.");
    process.exit(1);
  }

  console.log("Registry:   ", REGISTRY);
  console.log("YAML URL:   ", YAML_URL, "(verified identical to local)");
  console.log("YAML SHA256:", yamlHash);
  console.log("Fee address:", feeAddress);
  console.log("Intents:    ", SUPPORTED_INTENTS.join(", "));
  console.log("Min price:   $0.01 USDC");

  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const client = createWalletClient({
    account,
    chain: baseSepolia,
    transport: http(),
  }).extend(publicActions);

  console.log("From:       ", account.address);

  // Simulate first: the registry reverts on unknown intents and on a slug owned
  // by another wallet, and a revert here costs nothing.
  const { result } = await client.simulateContract({
    address: REGISTRY,
    abi: ABI,
    functionName: "registerMiner",
    account,
    args: [YAML_URL, yamlHash, feeAddress as `0x${string}`, MIN_PRICE_USDC, SUPPORTED_INTENTS],
  });
  console.log("Simulated OK — registrationId would be:", result.toString());

  const hash = await client.writeContract({
    address: REGISTRY,
    abi: ABI,
    functionName: "registerMiner",
    args: [YAML_URL, yamlHash, feeAddress as `0x${string}`, MIN_PRICE_USDC, SUPPORTED_INTENTS],
  });

  console.log("\nTx submitted:", hash);
  console.log("Waiting for confirmation...");

  const receipt = await client.waitForTransactionReceipt({ hash });
  console.log("Confirmed in block:", receipt.blockNumber);
  console.log("Status:", receipt.status === "success" ? "SUCCESS" : "FAILED");
  console.log("\nRegistered. Activation happens at the next epoch boundary (~9h epochs).");
  console.log("Verify: https://explorer.telegraphprotocol.com/api/integrations | grep arcadian-defi-risk");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
