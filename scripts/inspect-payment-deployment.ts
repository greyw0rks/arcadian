// Read-only inspection of an explicitly selected deployment. Never configures a signer.
import { parseArgs, promisify } from "node:util";
import { execFile } from "node:child_process";
import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { setDefaultResultOrder } from "node:dns";
import { createPublicClient, custom, http, parseAbi, isAddress, hashDomain, type Address } from "viem";

setDefaultResultOrder("ipv4first");

async function main() {
  const { values } = parseArgs({ options: { rpc: { type: "string" }, "chain-id": { type: "string" },
    token: { type: "string" }, receiver: { type: "string" }, payer: { type: "string" }, out: { type: "string" }, curl: { type: "boolean" } } });
  for (const name of ["token", "receiver", "payer"] as const) if (!values[name] || !isAddress(values[name]!, { strict: false })) throw new Error(`Provide --${name} address`);
  const chainId = Number(values["chain-id"]);
  if (!Number.isSafeInteger(chainId) || chainId <= 0 || !values.rpc) throw new Error("Provide --chain-id and --rpc");
  const rpc = new URL(values.rpc);
  if (rpc.protocol !== "https:" || rpc.username || rpc.password) throw new Error("Use an HTTPS RPC without embedded credentials");
  const curl = promisify(execFile);
  const transport = values.curl ? custom({ request: async ({ method, params }) => {
    if (!["eth_chainId", "eth_getBlockByNumber", "eth_call", "eth_getCode"].includes(method)) throw new Error("This diagnostic permits read-only RPC methods only");
    const { stdout } = await curl("rtk", ["proxy", "curl", "--fail", "--silent", "--show-error", "--max-time", "20",
      "--header", "Content-Type: application/json", "--data-binary", JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), rpc.href],
      { maxBuffer: 4 * 1024 * 1024 });
    const result = JSON.parse(stdout);
    if (result.error) throw new Error("Read-only RPC returned an error");
    return result.result;
  } }, { retryCount: 0 }) : http(rpc.href, { timeout: 15_000, retryCount: 0 });
  const client = createPublicClient({ transport });
  if (await client.getChainId() !== chainId) throw new Error("RPC chain mismatch");
  const head = await client.getBlock({ blockTag: "finalized" });
  const token = values.token as Address, receiver = values.receiver as Address, payer = values.payer as Address;
  const abi = parseAbi(["function name() view returns (string)", "function symbol() view returns (string)",
    "function decimals() view returns (uint8)", "function balanceOf(address) view returns (uint256)",
    "function DOMAIN_SEPARATOR() view returns (bytes32)", "function usdcToken() view returns (address)"]);
  const entries = await Promise.allSettled([
    client.readContract({ address: token, abi, functionName: "name", blockNumber: head.number }),
    client.readContract({ address: token, abi, functionName: "symbol", blockNumber: head.number }),
    client.readContract({ address: token, abi, functionName: "decimals", blockNumber: head.number }),
    client.readContract({ address: token, abi, functionName: "balanceOf", args: [payer], blockNumber: head.number }),
    client.readContract({ address: token, abi, functionName: "DOMAIN_SEPARATOR", blockNumber: head.number }),
    client.readContract({ address: receiver, abi, functionName: "usdcToken", blockNumber: head.number }),
    client.getCode({ address: token, blockNumber: head.number }),
    client.getCode({ address: receiver, blockNumber: head.number }),
  ]);
  const names = ["tokenName", "tokenSymbol", "tokenDecimals", "payerBalanceAtomic", "domainSeparator", "receiverUsdcToken", "tokenCode", "receiverCode"];
  const report: Record<string, unknown> = { checkedAt: new Date().toISOString(), chainId, token, receiver, payer,
    finalizedBlock: head.number.toString(), finalizedBlockHash: head.hash, paymentSigned: false, paymentSent: false };
  entries.forEach((entry, i) => { report[names[i]] = entry.status === "fulfilled"
    ? i >= 6 ? Boolean(entry.value && entry.value !== "0x") : typeof entry.value === "bigint" ? entry.value.toString() : entry.value
    : { error: "Contract read failed at the finalized block" }; });
  report.advertisedDomainMatches = report.domainSeparator === hashDomain({ domain: { name: "USD Coin", version: "2", chainId: BigInt(chainId), verifyingContract: token },
    types: { EIP712Domain: [{ name: "name", type: "string" }, { name: "version", type: "string" },
      { name: "chainId", type: "uint256" }, { name: "verifyingContract", type: "address" }] } });
  report.receiverTokenMatches = typeof report.receiverUsdcToken === "string" && report.receiverUsdcToken.toLowerCase() === token.toLowerCase();
  report.scope = "Onchain deployment consistency only; token issuer, funding source and successful Telegraph purchases are not established by these reads.";
  const body = JSON.stringify(report, null, 2) + "\n";
  if (values.out) { await mkdir(dirname(values.out), { recursive: true }); await writeFile(values.out, body); }
  console.log(body);
}
main().catch(error => { console.error(JSON.stringify({ error: "Deployment inspection failed", kind: error?.name,
  detail: error?.shortMessage ?? (error?.name === "TypeError" ? error.message : "Check the RPC and explicit chain/address arguments"),
  paymentSigned: false, paymentSent: false })); process.exitCode = 1; });
