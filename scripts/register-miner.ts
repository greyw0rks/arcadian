/**
 * Validate, compare hosted bytes, and simulate the official update path.
 * Default is a dry run. --broadcast is required to send the transaction.
 * REGISTER_ID updates an existing registration, including a rejected one.
 */
import { createWalletClient, createPublicClient, http, publicActions, parseAbi, isAddress, parseEventLogs, type Hex } from "viem";
import { setDefaultResultOrder } from "node:dns";
import { sepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { MINER_INTENTS } from "../lib/measurements";
import { inspectMinerManifest, requireAnjomanValidation, MINER_REGISTRY, MINER_MACHINA } from "../lib/miner-manifest";

const REGISTRY = MINER_REGISTRY;
const ABI = parseAbi([
  "error ERC20InsufficientAllowance(address spender, uint256 allowance, uint256 needed)",
  "error ERC20InsufficientBalance(address sender, uint256 balance, uint256 needed)",
  "function registerMiner(string yamlUrl, bytes32 yamlHash, address feeAddress, uint256 minPriceUsdc, string[] supportedIntents) external returns (uint256)",
  "function updateMiner(uint256 registrationId, string yamlUrl, bytes32 yamlHash, address feeAddress, uint256 minPriceUsdc, string[] supportedIntents) external returns (uint256)",
  "function isCanonicalIntent(string intent) view returns (bool)",
  "event MinerRegistered(uint256 indexed registrationId, address indexed miner, string yamlUrl, bytes32 yamlHash, address feeAddress, uint256 minPriceUsdc, string[] supportedIntents)",
]);
setDefaultResultOrder("ipv4first");
async function main() {
  const { values } = parseArgs({ options: { broadcast: { type: "boolean" }, "validation-report": { type: "string" } } });
  const key = process.env.REGISTER_PRIVATE_KEY;
  if (key && !/^0x[0-9a-f]{64}$/i.test(key)) throw new Error("REGISTER_PRIVATE_KEY must be a valid private key");
  const account = key ? privateKeyToAccount(key as Hex) : process.env.REGISTER_OWNER_ADDRESS as Hex | undefined;
  const owner = typeof account === "string" ? account : account?.address;
  const fee = process.env.FEE_ADDRESS?.trim() || owner;
  if (!owner || !isAddress(owner, { strict: false }) || !fee || !isAddress(fee, { strict: false }) || /^0x0{40}$/i.test(fee)) throw new Error("Configure REGISTER_OWNER_ADDRESS (or REGISTER_PRIVATE_KEY) and a nonzero FEE_ADDRESS");
  if (values.broadcast && !key) throw new Error("Broadcast requires the registration owner's key; an address-only dry run sends no transaction");
  const yaml = readFileSync("public/telegraph-risk.yaml", "utf8");
  const { manifest, errors } = inspectMinerManifest(yaml);
  if (errors.length) throw new Error("Local manifest checks failed: " + errors.join("; "));
  const intents: string[] = manifest.semantics.supported_intents;
  if (JSON.stringify([...intents].sort()) !== JSON.stringify([...MINER_INTENTS].sort())) throw new Error("Manifest Intents do not match the implemented measurement service");
  const yamlHash = ("0x" + createHash("sha256").update(yaml).digest("hex")) as Hex;
  const yamlUrl = process.env.REGISTER_YAML_URL ?? manifest.base_url + "/telegraph-risk.yaml";
  const hosted = await fetch(yamlUrl, { signal: AbortSignal.timeout(20_000), redirect: "error" });
  if (!hosted.ok || await hosted.text() !== yaml) throw new Error("Deploy first: the hosted YAML does not byte-match the local file");
  const reportFile = values["validation-report"] ?? process.env.TELEGRAPH_VALIDATION_REPORT;
  if (!reportFile) throw new Error("Review this YAML in Anjoman first and supply --validation-report with its hash-bound public response; no transaction was sent");
  requireAnjomanValidation(JSON.parse(readFileSync(reportFile, "utf8")), yaml);
  // Anjoman's empty sandbox request may return 400. Exercise both real
  // measurement contracts before simulation or broadcast.
  const smoke = await fetch(manifest.base_url + "/api/telegraph/measure", {
    method: "POST", headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(30_000),
    body: JSON.stringify({ intent: "TVL_LOOKUP_GENERAL", protocol: "aave-v3", chain: "Base" }),
  });
  if (!smoke.ok || typeof (await smoke.json()).value !== "number") throw new Error("Representative hosted measurement request failed; no transaction was sent");
  const yieldSmoke = await fetch(manifest.base_url + "/api/telegraph/measure", {
    method: "POST", headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(30_000),
    body: JSON.stringify({ intent: "CRYPTO_YIELD_RATE_GENERAL", protocol: "aave-v3", chain: "Base", asset: "USDC" }),
  });
  if (!yieldSmoke.ok || typeof (await yieldSmoke.json()).supply_apy !== "number") throw new Error("Representative hosted supply-APY request failed; no transaction was sent");
  const rpc = process.env.REGISTER_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
  const client = createPublicClient({ chain: sepolia, transport: http(rpc) });
  if (await client.getChainId() !== sepolia.id) throw new Error("Registration RPC must be Ethereum Sepolia 11155111");
  if (await client.getCode({ address: REGISTRY }) === undefined) throw new Error("The current Telegraph Diamond has no code on the configured RPC");
  for (const intent of intents) if (!await client.readContract({ address: REGISTRY, abi: ABI, functionName: "isCanonicalIntent", args: [intent] })) throw new Error("Noncanonical Intent: " + intent);
  const id = process.env.REGISTER_ID;
  if (id !== undefined && !/^\d+$/.test(id)) throw new Error("REGISTER_ID must be a registration number");
  const common = [yamlUrl, yamlHash, fee as Hex, 10_000n, intents] as const;
  const call = id !== undefined
    ? { address: REGISTRY, abi: ABI, functionName: "updateMiner" as const, args: [BigInt(id), ...common] as const, account: owner }
    : { address: REGISTRY, abi: ABI, functionName: "registerMiner" as const, args: common, account: owner };
  const simulation = call.functionName === "updateMiner"
    ? await client.simulateContract(call)
    : await client.simulateContract(call);
  console.log("Validated hosted manifest and simulated " + call.functionName + ". New registration ID: " + String(simulation.result));
  if (!values.broadcast) { console.log("Dry run complete on Ethereum Sepolia. No transaction sent. MACHINA bond balance/allowance and owner permissions are checked by simulation. Token: " + MINER_MACHINA); return; }
  const wallet = createWalletClient({ account: account as ReturnType<typeof privateKeyToAccount>, chain: sepolia, transport: http(rpc) }).extend(publicActions);
  const hash = simulation.request.functionName === "updateMiner"
    ? await wallet.writeContract({ ...simulation.request, account: account as ReturnType<typeof privateKeyToAccount> })
    : await wallet.writeContract({ ...simulation.request, account: account as ReturnType<typeof privateKeyToAccount> });
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("Registration transaction reverted: " + hash);
  console.log("Registration transaction confirmed: " + hash);
  const event = parseEventLogs({ abi: ABI, eventName: "MinerRegistered", logs: receipt.logs })
    .find(e => e.address.toLowerCase() === REGISTRY.toLowerCase() && e.args.miner.toLowerCase() === owner.toLowerCase()
      && e.args.yamlHash.toLowerCase() === yamlHash.toLowerCase());
  if (!event) throw new Error("Transaction confirmed but the matching MinerRegistered event was not found: " + hash);
  console.log("Confirmed registration ID: " + String(event.args.registrationId));
  console.log("Check GET /api/miners/" + String(event.args.registrationId) + " for active status and rejection_reason. Activation is event-driven.");
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Registration failed"); process.exitCode = 1; });
