/**
 * Validate, compare hosted bytes, and simulate the official update path.
 * Default is a dry run. --broadcast is required to send the transaction.
 * REGISTER_ID updates an existing registration, including a rejected one.
 */
import { createWalletClient, http, publicActions, parseAbi, isAddress, parseEventLogs, type Hex } from "viem";
import { setDefaultResultOrder } from "node:dns";
import { baseSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { MINER_INTENTS } from "../lib/measurements";

const REGISTRY = "0x5a2324aA18613FAD4e44bDF0d6c73Ec1f6D87ff8" as const;
const ABI = parseAbi([
  "function registerMiner(string yamlUrl, bytes32 yamlHash, address feeAddress, uint256 minPriceUsdc, string[] supportedIntents) external returns (uint256)",
  "function updateMiner(uint256 registrationId, string yamlUrl, bytes32 yamlHash, address feeAddress, uint256 minPriceUsdc, string[] supportedIntents) external returns (uint256)",
  "function isCanonicalIntent(string intent) view returns (bool)",
  "event MinerRegistered(uint256 indexed registrationId, address indexed miner, string yamlUrl, bytes32 yamlHash, address feeAddress, uint256 minPriceUsdc, string[] supportedIntents)",
]);
setDefaultResultOrder("ipv4first");
async function main() {
  const key = process.env.REGISTER_PRIVATE_KEY;
  const fee = process.env.FEE_ADDRESS;
  if (!key || !/^0x[0-9a-f]{64}$/i.test(key) || !fee || !isAddress(fee, { strict: false })) throw new Error("Configure REGISTER_PRIVATE_KEY and FEE_ADDRESS in the operator environment");
  const yaml = readFileSync("public/telegraph-risk.yaml", "utf8");
  const manifest = parse(yaml);
  const intents: string[] = manifest.semantics.supported_intents;
  if (JSON.stringify([...intents].sort()) !== JSON.stringify([...MINER_INTENTS].sort())) throw new Error("Manifest Intents do not match the implemented measurement service");
  const yamlHash = ("0x" + createHash("sha256").update(yaml).digest("hex")) as Hex;
  const yamlUrl = process.env.REGISTER_YAML_URL ?? manifest.base_url + "/telegraph-risk.yaml";
  const hosted = await fetch(yamlUrl, { signal: AbortSignal.timeout(20_000), redirect: "error" });
  if (!hosted.ok || await hosted.text() !== yaml) throw new Error("Deploy first: the hosted YAML does not byte-match the local file");
  const account = privateKeyToAccount(key as Hex);
  const validationUrl = process.env.TELEGRAPH_VALIDATION_URL ?? "https://backend.telegraphprotocol.com/registrations/validate";
  const validation = await fetch(validationUrl, {
    method: "POST", headers: { "content-type": "application/json", ...(process.env.TELEGRAPH_CONSOLE_TOKEN ? { Authorization: "Bearer " + process.env.TELEGRAPH_CONSOLE_TOKEN } : {}) }, signal: AbortSignal.timeout(60_000),
    body: JSON.stringify({ yaml, miner_address: account.address }),
  });
  if (!validation.ok) throw new Error("Official validation endpoint unavailable (HTTP " + validation.status + "); no transaction was sent");
  const report = await validation.json();
  if (report.valid !== true) throw new Error("Official validation rejected the manifest: " + JSON.stringify(report.errors ?? report));
  // The sandbox treats 400/404 as reachable. Verify a representative real
  // request separately, so registration readiness cannot hinge on that flag.
  const smoke = await fetch(manifest.base_url + "/api/telegraph/measure", {
    method: "POST", headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(30_000),
    body: JSON.stringify({ intent: "TVL_LOOKUP", protocol: "aave-v3", chain: "Base" }),
  });
  if (!smoke.ok || typeof (await smoke.json()).value !== "number") throw new Error("Representative hosted measurement request failed; no transaction was sent");
  const client = createWalletClient({ account, chain: baseSepolia, transport: http(process.env.BASE_SEPOLIA_RPC_URL) }).extend(publicActions);
  for (const intent of intents) if (!await client.readContract({ address: REGISTRY, abi: ABI, functionName: "isCanonicalIntent", args: [intent] })) throw new Error("Noncanonical Intent: " + intent);
  const id = process.env.REGISTER_ID;
  if (id !== undefined && !/^\d+$/.test(id)) throw new Error("REGISTER_ID must be a registration number");
  const common = [yamlUrl, yamlHash, fee as Hex, 10_000n, intents] as const;
  const call = id !== undefined
    ? { address: REGISTRY, abi: ABI, functionName: "updateMiner" as const, args: [BigInt(id), ...common] as const, account }
    : { address: REGISTRY, abi: ABI, functionName: "registerMiner" as const, args: common, account };
  const simulation = call.functionName === "updateMiner"
    ? await client.simulateContract(call)
    : await client.simulateContract(call);
  console.log("Validated hosted manifest and simulated " + call.functionName + ". New registration ID: " + String(simulation.result));
  if (!process.argv.includes("--broadcast")) { console.log("Dry run complete. No transaction sent. --broadcast sends the reviewed update."); return; }
  const hash = simulation.request.functionName === "updateMiner"
    ? await client.writeContract(simulation.request)
    : await client.writeContract(simulation.request);
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("Registration transaction reverted: " + hash);
  console.log("Registration transaction confirmed: " + hash);
  const event = parseEventLogs({ abi: ABI, eventName: "MinerRegistered", logs: receipt.logs })
    .find(e => e.address.toLowerCase() === REGISTRY.toLowerCase() && e.args.miner.toLowerCase() === account.address.toLowerCase()
      && e.args.yamlHash.toLowerCase() === yamlHash.toLowerCase());
  if (!event) throw new Error("Transaction confirmed but the matching MinerRegistered event was not found: " + hash);
  console.log("Confirmed registration ID: " + String(event.args.registrationId));
  console.log("Check GET /api/miners/" + String(event.args.registrationId) + " for active status and rejection_reason. Activation is event-driven.");
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Registration failed"); process.exitCode = 1; });
