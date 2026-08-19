const POOLS_URL = "https://yields.llama.fi/pools";
const CHART_URL = "https://yields.llama.fi/chart";

export interface LlamaPool {
  chain: string;
  project: string;
  symbol: string;
  tvlUsd: number;
  apy: number | null;
  apyBase: number | null;
  apyReward: number | null;
  apyMean30d?: number | null;
  apyPct30D?: number | null;
  pool: string;
  stablecoin?: boolean;
  ilRisk?: string;
  underlyingTokens?: string[];
  rewardTokens?: string[] | null;
  exposure?: string;
  sigma?: number | null;
  outlier?: boolean;
}

export interface HistoryPoint {
  timestamp: string;
  apy: number;
  tvlUsd: number;
}

let poolCache: { at: number; pools: LlamaPool[] } | null = null;
const CACHE_MS = 60_000;
const historyCache = new Map<string, { at: number; points: HistoryPoint[] }>();

export async function fetchPools(): Promise<LlamaPool[]> {
  if (poolCache && Date.now() - poolCache.at < CACHE_MS) return poolCache.pools;
  const res = await fetch(POOLS_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`DefiLlama pools ${res.status}`);
  const json = (await res.json()) as { data: LlamaPool[] };
  poolCache = { at: Date.now(), pools: json.data ?? [] };
  return poolCache.pools;
}

export async function fetchPoolHistory(poolId: string): Promise<HistoryPoint[]> {
  const cached = historyCache.get(poolId);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.points;
  const res = await fetch(`${CHART_URL}/${poolId}`, { cache: "no-store" });
  if (!res.ok) return [];
  const json = (await res.json()) as {
    data: Array<{ timestamp: string; apy: number | null; tvlUsd: number | null }>;
  };
  const points = (json.data ?? [])
    .filter((d) => d.apy != null)
    .map((d) => ({
      timestamp: d.timestamp,
      apy: Number((d.apy ?? 0).toFixed(2)),
      tvlUsd: Math.round(d.tvlUsd ?? 0),
    }));
  historyCache.set(poolId, { at: Date.now(), points });
  return points;
}

export function findPools(
  pools: LlamaPool[],
  query: { protocol?: string; chain?: string; asset?: string; pool_id?: string },
): LlamaPool[] {
  let results = pools;

  if (query.pool_id) {
    results = results.filter((p) => p.pool === query.pool_id);
    return results.slice(0, 1);
  }

  if (query.protocol) {
    const proto = query.protocol.toLowerCase();
    results = results.filter((p) => p.project.toLowerCase().includes(proto));
  }
  if (query.chain) {
    const chain = query.chain.toLowerCase();
    results = results.filter((p) => p.chain.toLowerCase() === chain);
  }
  if (query.asset) {
    const asset = query.asset.toUpperCase();
    results = results.filter((p) =>
      p.symbol.toUpperCase().replace(/₮/g, "T").includes(asset),
    );
  }

  // Sort by TVL descending — most significant pool first
  return results.sort((a, b) => (b.tvlUsd ?? 0) - (a.tvlUsd ?? 0)).slice(0, 5);
}
