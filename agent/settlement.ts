import { createPublicClient, decodeEventLog, http, parseAbi, type Hex, type Log } from "viem";
import type { Authorization } from "./x402";
import type { NetworkConfig } from "./config";
import { getAddress } from "viem";

const USDC_EVENTS = parseAbi([
  "event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
]);

export interface SettlementVerification {
  verified: boolean;
  reason: string;
  blockNumber: string | null;
}

interface Receipt {
  status: string;
  transactionHash: Hex;
  blockNumber: bigint;
  logs: Pick<Log, "address" | "data" | "topics">[];
}

/** Match the nonce and its following transfer, including within a batch. */
export function verifyAuthorizationReceipt(receipt: Receipt, hash: Hex, authorization: Authorization, net: NetworkConfig): SettlementVerification {
  const fail = (reason: string): SettlementVerification => ({ verified: false, reason, blockNumber: null });
  if (receipt.status !== "success" || receipt.transactionHash.toLowerCase() !== hash.toLowerCase()) return fail("Settlement transaction failed or did not match the reported hash");
  let matchedNonce = false;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== net.usdc.toLowerCase()) continue;
    try {
      const event = decodeEventLog({ abi: USDC_EVENTS, data: log.data, topics: log.topics });
      if (event.eventName === "AuthorizationUsed") {
        matchedNonce = event.args.authorizer.toLowerCase() === authorization.from.toLowerCase() && event.args.nonce.toLowerCase() === authorization.nonce.toLowerCase();
      } else if (event.eventName === "Transfer" && matchedNonce) {
        if (event.args.from.toLowerCase() !== authorization.from.toLowerCase() || event.args.to.toLowerCase() !== authorization.to.toLowerCase() || event.args.value !== BigInt(authorization.value)) return fail("USDC transfer did not match the signed authorization");
        return { verified: true, reason: "USDC authorization nonce and transfer confirmed onchain", blockNumber: receipt.blockNumber.toString() };
      }
    } catch { /* Unrelated USDC events cannot establish a payment. */ }
  }
  return fail("Settlement lacks this authorization nonce and its matching USDC transfer");
}

export async function verifySettlement(hash: Hex, authorization: Authorization, net: NetworkConfig): Promise<SettlementVerification> {
  try {
    const client = createPublicClient({ transport: http(net.rpcUrl, { timeout: 10_000, retryCount: 0 }) });
    if (await client.getChainId() !== net.chainId) return { verified: false, reason: "Payment RPC is connected to a different chain", blockNumber: null };
    const receipt = await client.waitForTransactionReceipt({ hash, timeout: 20_000, pollingInterval: 1_000 });
    return verifyAuthorizationReceipt(receipt, hash, authorization, net);
  } catch {
    return { verified: false, reason: "Settlement could not be confirmed before the deadline; reconcile the reported transaction", blockNumber: null };
  }
}

export interface ReconciledAuthorization extends SettlementVerification {
  txHash: Hex | null;
  expired: boolean;
}

/** Read-only reconciliation. Never signs or sends another payment. */
export async function reconcileAuthorization(authorization: Authorization, net: NetworkConfig, anchorBlock: string | null, reportedHash?: Hex): Promise<ReconciledAuthorization> {
  const pending = (reason: string): ReconciledAuthorization => ({ verified: false, reason, blockNumber: null, txHash: reportedHash ?? null, expired: false });
  try {
    const client = createPublicClient({ transport: http(net.rpcUrl, { timeout: 10_000, retryCount: 0 }) });
    if (await client.getChainId() !== net.chainId) return pending("Payment RPC is connected to a different chain");
    if (reportedHash) {
      try {
        const receipt = await client.getTransactionReceipt({ hash: reportedHash });
        const verified = verifyAuthorizationReceipt(receipt, reportedHash, authorization, net);
        if (verified.verified) return { ...verified, txHash: reportedHash, expired: false };
      } catch { /* Reconcile by the unique authorization, not a header alone. */ }
    }
    const head = await client.getBlock();
    const used = await client.readContract({ address: net.usdc,
      abi: parseAbi(["function authorizationState(address authorizer, bytes32 nonce) view returns (bool)"]),
      functionName: "authorizationState", args: [getAddress(authorization.from), authorization.nonce] });
    if (!used && head.timestamp > BigInt(authorization.validBefore) + 60n) return {
      verified: false, expired: true, reason: "Authorization expired unused on the payment chain", blockNumber: head.number.toString(), txHash: null,
    };
    if (!used) return pending("Authorization can still settle; preserve the wallet lock and check again after its deadline");
    if (!anchorBlock || !/^[0-9]+$/.test(anchorBlock) || head.number - BigInt(anchorBlock) > 20_000n) return pending("Authorization was used; provide its settlement hash to verify this older payment");
    const logs = await client.getLogs({ address: net.usdc, event: USDC_EVENTS[0],
      args: { authorizer: getAddress(authorization.from), nonce: authorization.nonce },
      fromBlock: BigInt(anchorBlock), toBlock: head.number });
    const hash = logs[0]?.transactionHash;
    if (!hash) return pending("Authorization was used but its Transfer transaction could not be located");
    const verified = verifyAuthorizationReceipt(await client.getTransactionReceipt({ hash }), hash, authorization, net);
    return { ...verified, txHash: hash, expired: false };
  } catch { return pending("The payment chain could not be read; preserve the recorded authorization and try recovery again"); }
}
