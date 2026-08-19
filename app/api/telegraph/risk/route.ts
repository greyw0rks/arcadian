import { NextRequest, NextResponse } from "next/server";
import { fetchPools, findPools } from "@/lib/defillama";
import { scoreMany } from "@/lib/scorer";
import { discoverProtocols, suggestAssets, normalizeAsset } from "@/lib/discover";
import { explainRisk } from "@/lib/ai";

export const dynamic = "force-dynamic";

// Telegraph Miner endpoint — DeFi Risk Score
//
// Discovery mode (chain + asset, no protocol needed) — scores every protocol
// offering that asset on that chain and returns them ranked safest-first:
//   POST /api/telegraph/risk  { "chain": "Base", "asset": "USDC" }
//   → { mode: "ranked", safest: {...}, ranked: [...], protocols_scanned, pools_scanned }
//
// Direct mode (caller names the protocol or pool) — unchanged, single result:
//   GET  /api/telegraph/risk?protocol=aave-v3&chain=Ethereum&asset=USDC
//   POST /api/telegraph/risk  { "pool_id": "<DefiLlama pool uuid>" }
//   → { mode: "single", risk_score, verdict, apy_bps, tvl_k, confidence,
//       components, flags, explanation, protocol, chain, symbol, pool_id }
//
// Telegraph on-chain integers (risk_score, apy_bps, tvl_k, confidence) are
// present at the top level in both modes — in ranked mode they describe the
// safest protocol, so on-chain consumers always read a usable score.

interface QueryParams {
  protocol?: string;
  chain?: string;
  asset?: string;
  pool_id?: string;
  limit?: number;
}

const MAX_PROTOCOLS = 8;

async function handle(params: QueryParams) {
  const allPools = await fetchPools();

  if (!params.protocol && !params.pool_id) {
    if (!params.chain || !params.asset) {
      return NextResponse.json(
        { error: "Provide chain + asset (discovery mode), or protocol / pool_id (direct mode)" },
        { status: 400 },
      );
    }
    return rankByChainAsset(allPools, params);
  }

  const pools = findPools(allPools, params);
  if (pools.length === 0) {
    return NextResponse.json(
      {
        error: "No pools found for the given query",
        query: params,
        tip: "Try chain='Base', asset='USDC' to auto-discover protocols",
      },
      { status: 404 },
    );
  }

  const result = await scoreMany(pools);
  const explanation = await explainRisk(result);

  return NextResponse.json({
    mode: "single",
    ...result,
    apy_bps: Math.round(result.apy * 100),
    tvl_k: Math.floor(result.tvl_usd / 1_000),
    explanation,
    query: params,
    pools_scored: pools.length,
    data_sources: result.sources,
  });
}

async function rankByChainAsset(
  allPools: Awaited<ReturnType<typeof fetchPools>>,
  params: QueryParams,
) {
  const chain = params.chain!;
  const asset = normalizeAsset(params.asset!);
  const limit = Math.min(params.limit ?? 6, MAX_PROTOCOLS);
  const matches = discoverProtocols(allPools, chain, asset, limit);

  if (matches.length === 0) {
    return NextResponse.json(
      {
        error: `No protocols offer "${asset}" on ${chain}`,
        query: params,
        suggestions: suggestAssets(allPools, chain, asset),
        tip: "Try one of the suggested assets, or another chain",
      },
      { status: 404 },
    );
  }

  const scored = await Promise.all(
    matches.map(async (m) => {
      const result = await scoreMany(m.pools);
      return {
        result,
        protocol: m.project,
        risk_score: result.risk_score,
        verdict: result.verdict,
        apy: Number(m.apy.toFixed(2)),
        apy_bps: Math.round(m.apy * 100),
        tvl_usd: m.tvlUsd,
        tvl_k: Math.floor(m.tvlUsd / 1_000),
        confidence: result.confidence,
        components: result.components,
        flags: result.flags,
        symbol: result.symbol,
        pool_id: result.pool_id,
        pools_scored: m.scoredPools,
        pools_available: m.poolCount,
        sources: result.sources,
      };
    }),
  );

  // Safest first; TVL breaks ties so the deeper venue wins on equal risk.
  const ranked = scored.sort(
    (a, b) => a.risk_score - b.risk_score || b.tvl_usd - a.tvl_usd,
  );
  const safest = ranked[0];

  const explanation = await explainRisk({
    ...safest.result,
    protocol: safest.protocol,
    chain,
    apy: safest.apy,
    tvl_usd: safest.tvl_usd,
    risk_score: safest.risk_score,
  });

  return NextResponse.json({
    mode: "ranked",
    chain,
    asset,
    safest: safest.protocol,
    ranked: ranked.map(({ result, ...row }) => row),
    explanation,
    protocols_scanned: ranked.length,
    pools_scanned: matches.reduce((s, m) => s + m.poolCount, 0),
    // Top-level on-chain integers mirror the safest protocol.
    risk_score: safest.risk_score,
    verdict: safest.verdict,
    apy_bps: safest.apy_bps,
    tvl_k: safest.tvl_k,
    confidence: safest.confidence,
    components: safest.components,
    flags: safest.flags,
    protocol: safest.protocol,
    symbol: safest.symbol,
    pool_id: safest.pool_id,
    data_sources: Array.from(new Set(ranked.flatMap((r) => r.sources))),
    query: params,
  });
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const limit = sp.get("limit");
  return handle({
    protocol: sp.get("protocol") ?? undefined,
    chain: sp.get("chain") ?? undefined,
    asset: sp.get("asset") ?? undefined,
    pool_id: sp.get("pool_id") ?? undefined,
    limit: limit ? Number(limit) : undefined,
  });
}

export async function POST(req: NextRequest) {
  let body: QueryParams = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  return handle({
    protocol: body.protocol,
    chain: body.chain,
    asset: body.asset,
    pool_id: body.pool_id,
    limit: body.limit,
  });
}
