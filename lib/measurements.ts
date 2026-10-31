import { findPools, type LlamaPool } from "./defillama";
import { findProtocol, type ProtocolMeta } from "./sources";

export const MINER_INTENTS = ["TVL_LOOKUP", "CRYPTO_YIELD_RATE"] as const;
export type MeasurementIntent = typeof MINER_INTENTS[number];
export interface MeasurementQuery { protocol?: string; chain?: string; asset?: string; pool_id?: string }

/** Protocol TVL uses DefiLlama's complete protocol/chain figure, not pool sampling. */
export function measureTvl(query: MeasurementQuery, pools: LlamaPool[], protocols: ProtocolMeta[]) {
  if (query.pool_id) {
    const pool = pools.find(p => p.pool === query.pool_id);
    if (!pool || !Number.isFinite(pool.tvlUsd)) throw new Error("No current TVL for that pool");
    return { value: pool.tvlUsd, unit: "USD", protocol: pool.project, chain: pool.chain, pool_id: pool.pool,
      scope: "pool", source_url: "https://yields.llama.fi/pools" };
  }
  if (!query.protocol || query.asset) throw new Error("TVL_LOOKUP needs a protocol or exact pool_id; asset-filtered pool TVL is a different measurement");
  const protocol = protocols.find(p => p.slug?.toLowerCase() === query.protocol!.toLowerCase() || p.name?.toLowerCase() === query.protocol!.toLowerCase())
    ?? findProtocol(protocols, query.protocol);
  if (!protocol) throw new Error("Protocol not found in the current DefiLlama registry");
  const chain = query.chain ? Object.entries(protocol.chainTvls ?? {}).find(([c]) => c.toLowerCase() === query.chain!.toLowerCase()) : null;
  if (query.chain && !chain) throw new Error("No current protocol TVL for that chain");
  const value = chain ? chain[1] : protocol.tvl;
  if (!Number.isFinite(value) || value < 0) throw new Error("Protocol TVL is unavailable");
  return { value, unit: "USD", protocol: protocol.slug, chain: chain?.[0] ?? "all chains",
    scope: chain ? "protocol_chain" : "protocol_total", source_url: "https://api.llama.fi/protocols" };
}

/** Aggregate only the disclosed sampled pools, using the same TVL weighting. */
export function measureYield(query: MeasurementQuery, pools: LlamaPool[]) {
  if (!query.protocol && !query.pool_id) throw new Error("CRYPTO_YIELD_RATE needs a protocol or exact pool_id");
  const matches = findPools(pools, query);
  const priced = matches.filter(p => p.apy !== null && Number.isFinite(p.apy) && Number.isFinite(p.tvlUsd) && p.tvlUsd >= 0);
  if (!priced.length || priced.length !== matches.length) throw new Error("Current yield is unavailable for one or more selected pools");
  const tvl = priced.reduce((sum, p) => sum + p.tvlUsd, 0);
  const apy = priced.reduce((sum, p) => sum + p.apy! * (tvl > 0 ? p.tvlUsd / tvl : 1 / priced.length), 0);
  return { value: apy, unit: "percent APY", protocol: priced[0].project, chain: query.chain ?? (priced.every(p => p.chain === priced[0].chain) ? priced[0].chain : "multiple chains"),
    scope: query.pool_id ? "pool" : "top_pools_tvl_weighted", pools_scored: priced.length, sampled_tvl_usd: tvl,
    pool_ids: priced.map(p => p.pool), source_url: "https://yields.llama.fi/pools" };
}
