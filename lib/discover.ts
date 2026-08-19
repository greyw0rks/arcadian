import { type LlamaPool } from "./defillama";

// Turns the raw DefiLlama pool universe into the two things a user can actually
// name — a chain and an asset — and resolves those back into the protocols that
// offer that asset, so nobody has to know a protocol slug.

const MIN_TVL = 100_000;

// How many pools per protocol get scored. TVL and APY are reported over exactly
// this set — averaging across a protocol's full long tail lets dust pools with
// four-digit APYs dominate the number the user reads.
export const POOLS_PER_PROTOCOL = 5;

export interface ChainOption {
  chain: string;
  pools: number;
  tvlUsd: number;
}

export interface AssetOption {
  asset: string;
  pools: number;
  tvlUsd: number;
}

export interface ProtocolMatch {
  project: string;
  poolCount: number;   // every pool the protocol offers for this asset
  scoredPools: number; // the subset actually scored, and what tvlUsd/apy describe
  tvlUsd: number;
  apy: number;
  topPool: LlamaPool;
  pools: LlamaPool[];
}

// "DAI-USDC-USDT" → ["DAI","USDC","USDT"]; "USD₮" → ["USDT"]
export function assetTokens(symbol: string): string[] {
  return (symbol ?? "")
    .toUpperCase()
    .replace(/₮/g, "T")
    .split(/[-/+\s]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && t.length <= 12 && !/^\d+$/.test(t));
}

// Symbols like "WETH-11-11" or "O-USDC" leave 1-2 char fragments that aren't
// really tickers. Keep them matchable, but out of the suggestion lists.
function isSuggestable(token: string): boolean {
  return token.length >= 3;
}

export function listChains(pools: LlamaPool[], limit = 24): ChainOption[] {
  const acc = new Map<string, ChainOption>();
  for (const p of pools) {
    if (!p.chain || (p.tvlUsd ?? 0) < MIN_TVL) continue;
    const e = acc.get(p.chain) ?? { chain: p.chain, pools: 0, tvlUsd: 0 };
    e.pools++;
    e.tvlUsd += p.tvlUsd;
    acc.set(p.chain, e);
  }
  return [...acc.values()].sort((a, b) => b.tvlUsd - a.tvlUsd).slice(0, limit);
}

export function listAssets(pools: LlamaPool[], chain: string, limit = 40): AssetOption[] {
  const target = chain.toLowerCase();
  const acc = new Map<string, AssetOption>();
  for (const p of pools) {
    if (p.chain?.toLowerCase() !== target || (p.tvlUsd ?? 0) < MIN_TVL) continue;
    for (const token of new Set(assetTokens(p.symbol))) {
      if (!isSuggestable(token)) continue;
      const e = acc.get(token) ?? { asset: token, pools: 0, tvlUsd: 0 };
      e.pools++;
      e.tvlUsd += p.tvlUsd;
      acc.set(token, e);
    }
  }
  return [...acc.values()].sort((a, b) => b.tvlUsd - a.tvlUsd).slice(0, limit);
}

// Users type assets freely, so an exact token match ("USDC" in "USDC-WETH") is
// tried first and a substring match ("USD" → "USDC", "SUSDE") only as a fallback.
// Exact-first keeps "ETH" from dragging in every WETH/STETH pool when real ETH
// pools exist.
function poolMatchesAsset(pool: LlamaPool, asset: string, exact: boolean): boolean {
  const tokens = assetTokens(pool.symbol);
  return exact
    ? tokens.includes(asset)
    : tokens.some((t) => t.includes(asset));
}

export function normalizeAsset(raw: string): string {
  return (raw ?? "").trim().toUpperCase().replace(/₮/g, "T");
}

// Suggests real assets on a chain for a query that found nothing — powers the
// "no results, did you mean" path instead of a dead end.
export function suggestAssets(
  pools: LlamaPool[],
  chain: string,
  asset: string,
  limit = 6,
): string[] {
  const q = normalizeAsset(asset);
  const all = listAssets(pools, chain, 400);

  // Short tickers are excluded from the reverse test — a 1-letter symbol like
  // "O" is a substring of almost any typo and would crowd out real matches.
  const related = all
    .filter((a) => (q.length >= 2 && a.asset.includes(q)) ||
                   (a.asset.length >= 3 && q.includes(a.asset)))
    .sort((a, b) => b.tvlUsd - a.tvlUsd);

  // Nothing resembles the query — fall back to the chain's deepest assets.
  return (related.length > 0 ? related : all).slice(0, limit).map((a) => a.asset);
}

// The core of the "no slug required" flow: chain + asset → the protocols that
// actually offer it, ranked by TVL so the biggest venues get scored.
export function discoverProtocols(
  pools: LlamaPool[],
  chain: string,
  asset: string,
  limit = 6,
): ProtocolMatch[] {
  const exactMatches = collect(pools, chain, asset, limit, true);
  if (exactMatches.length > 0) return exactMatches;
  // A 1-char query would substring-match nearly every symbol, so don't widen it.
  if (normalizeAsset(asset).length < 2) return [];
  return collect(pools, chain, asset, limit, false);
}

function collect(
  pools: LlamaPool[],
  chain: string,
  asset: string,
  limit: number,
  exact: boolean,
): ProtocolMatch[] {
  const targetChain = chain.toLowerCase();
  const targetAsset = normalizeAsset(asset);
  if (!targetAsset) return [];

  const acc = new Map<string, ProtocolMatch>();
  for (const p of pools) {
    if (p.chain?.toLowerCase() !== targetChain) continue;
    if (!poolMatchesAsset(p, targetAsset, exact)) continue;
    if ((p.tvlUsd ?? 0) <= 0) continue;

    const e = acc.get(p.project) ?? {
      project: p.project,
      poolCount: 0,
      scoredPools: 0,
      tvlUsd: 0,
      apy: 0,
      topPool: p,
      pools: [],
    };
    e.poolCount++;
    e.pools.push(p);
    if (p.tvlUsd > e.topPool.tvlUsd) e.topPool = p;
    acc.set(p.project, e);
  }

  // Keep only the deepest pools per protocol, then report TVL and APY over
  // exactly those — so the headline numbers match what was scored.
  for (const e of acc.values()) {
    e.pools.sort((a, b) => (b.tvlUsd ?? 0) - (a.tvlUsd ?? 0));
    e.pools = e.pools.slice(0, POOLS_PER_PROTOCOL);
    e.scoredPools = e.pools.length;
    e.tvlUsd = e.pools.reduce((s, p) => s + p.tvlUsd, 0);
    const weighted = e.pools.reduce((s, p) => s + (p.apy ?? 0) * p.tvlUsd, 0);
    e.apy = e.tvlUsd > 0 ? weighted / e.tvlUsd : 0;
  }

  return [...acc.values()].sort((a, b) => b.tvlUsd - a.tvlUsd).slice(0, limit);
}
