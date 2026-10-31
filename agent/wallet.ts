// The agent's payer wallet. Wraps a viem local account as the minimal
// `TypedDataSigner` the x402 client needs.
//
// SECURITY: this key pays real (test) USDC. It MUST be a dedicated
// `AGENT_PRIVATE_KEY` — a dedicated testnet key — and NEVER the
// miner-owner / deployer key. The two are kept deliberately separate: the miner
// earns to FEE_ADDRESS, the agent spends from AGENT_PRIVATE_KEY.

import { privateKeyToAccount } from "viem/accounts";
import type { Address, Hex } from "viem";
import type { Eip712TypedData, TypedDataSigner } from "./x402";

/**
 * Build a signer from a 0x-prefixed private key. The viem account's
 * `signTypedData` is structurally the EIP-712 signer we need; the cast bridges
 * viem's heavily-generic overloads to our concrete `Eip712TypedData` shape.
 */
export function signerFromPrivateKey(pk: Hex): TypedDataSigner {
  const account = privateKeyToAccount(pk);
  return {
    address: account.address as Address,
    signTypedData: (args: Eip712TypedData) =>
      account.signTypedData(args as never) as Promise<Hex>,
  };
}

/**
 * The configured agent signer, or null if `AGENT_PRIVATE_KEY` is unset. Callers
 * that need to actually pay should fail loudly on null rather than silently
 * skipping the payment leg.
 */
export function agentSigner(): TypedDataSigner | null {
  const pk = process.env.AGENT_PRIVATE_KEY?.trim();
  if (!pk) return null;
  const hex = (pk.startsWith("0x") ? pk : `0x${pk}`) as Hex;
  return signerFromPrivateKey(hex);
}
