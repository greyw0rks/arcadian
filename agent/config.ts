// Payment configuration is separate from the chain of the proposed trade.
//
// Chain-specific settings live here. Mainnet requires a confirmed production
// Engine URL, funded wallet, durable storage and verified live purchases.
//
// TELEGRAPH_NETWORK = telegraph-sepolia (current node) | base-sepolia (legacy) | base
//
// The agent pays x402 invoices from its OWN wallet (AGENT_PRIVATE_KEY) — a
// dedicated testnet key, deliberately NOT the miner-owner key. The gateway it
// buys through is also config (TELEGRAPH_GATEWAY).

export type NetworkName = "telegraph-sepolia" | "base-sepolia" | "base";

export interface NetworkConfig {
  name: NetworkName;
  chainId: number;
  caip2: `eip155:${number}`;
  /** Explicitly allowlisted payment token. Telegraph Sepolia uses its own test token. */
  usdc: `0x${string}`;
  /** EIP-712 domain for USDC's transferWithAuthorization (EIP-3009). */
  usdcDomain: { name: string; version: string };
  rpcUrl: string;
  /** Base of a block-explorer tx link, so a tx hash renders as a click-through. */
  txExplorer: string;
  /** True for anything that is not real-money mainnet. Drives the UI boundary line. */
  testnet: boolean;
}

const NETWORKS: Record<NetworkName, NetworkConfig> = {
  // Verified against the node's unsigned challenge, finalized receiver usdcToken()
  // and token DOMAIN_SEPARATOR on 2026-10-30. See docs/evidence/deployment-oct30.json.
  // This address is NOT Circle's Ethereum Sepolia faucet token.
  "telegraph-sepolia": {
    name: "telegraph-sepolia",
    chainId: 11155111,
    caip2: "eip155:11155111",
    usdc: "0xcc194e1a843B658526D0D5C431f670028582Ae17",
    usdcDomain: { name: "USD Coin", version: "2" },
    rpcUrl: process.env.TELEGRAPH_SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com",
    txExplorer: "https://sepolia.etherscan.io/tx/",
    testnet: true,
  },
  "base-sepolia": {
    name: "base-sepolia",
    chainId: 84532,
    caip2: "eip155:84532",
    usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    usdcDomain: { name: "USDC", version: "2" },
    rpcUrl: process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org",
    txExplorer: "https://sepolia.basescan.org/tx/",
    testnet: true,
  },
  base: {
    name: "base",
    chainId: 8453,
    caip2: "eip155:8453",
    usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    usdcDomain: { name: "USD Coin", version: "2" },
    rpcUrl: process.env.BASE_RPC_URL ?? "https://mainnet.base.org",
    txExplorer: "https://basescan.org/tx/",
    testnet: false,
  },
};

export function activeNetwork(): NetworkConfig {
  const n = (process.env.TELEGRAPH_NETWORK ?? "telegraph-sepolia") as NetworkName;
  const cfg = NETWORKS[n];
  if (!cfg) {
    throw new Error(
      `TELEGRAPH_NETWORK="${n}" is not one of: ${Object.keys(NETWORKS).join(", ")}`,
    );
  }
  return cfg;
}

export function networkByName(n: NetworkName): NetworkConfig {
  return NETWORKS[n];
}

/**
 * The documented testnet Engine is the default. Mainnet requires an explicit
 * Engine URL. Paid requests always go through the Engine.
 */
export function telegraphGateway(): string | null {
  const configured = process.env.TELEGRAPH_GATEWAY?.trim();
  if (!configured && activeNetwork().testnet) return "https://devnode.telegraphprotocol.com/engine";
  if (!configured) return null;
  const url = new URL(configured);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new Error("TELEGRAPH_GATEWAY must be an HTTPS Engine base URL without credentials, query, or fragment");
  }
  return configured.replace(/\/$/, "");
}

/** How a built tx hash is rendered for a human / judge to click. */
export function txLink(net: NetworkConfig, hash: string): string {
  return `${net.txExplorer}${hash}`;
}
