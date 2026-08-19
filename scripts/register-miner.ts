/**
 * Register Arcadian as a Telegraph Miner on Base Sepolia.
 *
 * Usage:
 *   REGISTER_PRIVATE_KEY=0x... FEE_ADDRESS=0x... npm run register
 *
 * Requires: YAML hosted at https://arcadian-gamma.vercel.app/telegraph-risk.yaml
 * Contract: MinerRegistryFacet on Base Sepolia — 0x122396E8602BEed349434AA6E83123E7dD97F5A0
 */

import { createWalletClient, http, publicActions, parseAbi } from "viem";
import { baseSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { createHash } from "crypto";
import { readFileSync } from "fs";
import { join } from "path";

const REGISTRY = "0x122396E8602BEed349434AA6E83123E7dD97F5A0" as const;
const YAML_URL = "https://arcadian-gamma.vercel.app/telegraph-risk.yaml";
const MIN_PRICE_USDC = 10_000n; // $0.01 in 6-decimal USDC units

const ABI = parseAbi([
  "function registerMiner(string yamlUrl, bytes32 yamlHash, address feeAddress, uint256 minPriceUsdc, string[] supportedIntents) external returns (uint256 registrationId)",
]);

// Arcadian serves three intents from the Telegraph H1 catalog:
// - FINANCIAL_DATA: DeFi protocol risk scores, APY, TVL (Tier A, deterministic)
// - TVL_LOOKUP: On-chain TVL analytics across protocols (Tier A)
// - FRAUD_DETECTION: Exploit history risk scoring (Tier B, GT: TBD)
const SUPPORTED_INTENTS = ["FINANCIAL_DATA", "TVL_LOOKUP", "FRAUD_DETECTION"];

async function main() {
  const privateKey = process.env.REGISTER_PRIVATE_KEY;
  const feeAddress = process.env.FEE_ADDRESS;

  if (!privateKey || !feeAddress) {
    console.error("Set REGISTER_PRIVATE_KEY and FEE_ADDRESS env vars");
    process.exit(1);
  }

  // Hash the local YAML so we can commit it on-chain before deploying
  const yamlPath = join(process.cwd(), "public", "telegraph-risk.yaml");
  const yamlContent = readFileSync(yamlPath, "utf-8");
  const yamlHash = ("0x" + createHash("sha256").update(yamlContent).digest("hex")) as `0x${string}`;

  console.log("YAML URL:  ", YAML_URL);
  console.log("YAML SHA256:", yamlHash);
  console.log("Fee address:", feeAddress);
  console.log("Min price:  $0.01 USDC");

  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const client = createWalletClient({
    account,
    chain: baseSepolia,
    transport: http(),
  }).extend(publicActions);

  const hash = await client.writeContract({
    address: REGISTRY,
    abi: ABI,
    functionName: "registerMiner",
    args: [
      YAML_URL,
      yamlHash,
      feeAddress as `0x${string}`,
      MIN_PRICE_USDC,
      SUPPORTED_INTENTS,
    ],
  });

  console.log("\nTx submitted:", hash);
  console.log("Waiting for confirmation...");

  const receipt = await client.waitForTransactionReceipt({ hash });
  console.log("Confirmed in block:", receipt.blockNumber);
  console.log("Status:", receipt.status === "success" ? "SUCCESS" : "FAILED");
  console.log("\nMiner registered. Nodes will detect the event and stage your YAML automatically.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
