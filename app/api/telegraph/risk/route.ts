import { NextRequest, NextResponse } from "next/server";
import { fetchPools, findPools } from "@/lib/defillama";
import { scoreMany } from "@/lib/scorer";
import { discoverProtocols, suggestAssets, normalizeAsset } from "@/lib/discover";
import { parseQuestion, type Intent } from "@/lib/nlq";
import { explainRisk } from "@/lib/ai";

export const dynamic = "force-dynamic";

// Telegraph Miner endpoint — DeFi Risk Score
//
// Question mode (what Telegraph's router actually sends) — free text, no params:
//   POST /api/telegraph/risk  { "query": "Is Aave on Base safe for USDC?" }
//   → chain/asset/protocol are extracted from the question, then answered as
//     below. Leads with `signal`, a number-first sentence, because that is what
//     a validator grades.
//
// Discovery mode (chain + asset, no protocol needed) — scores every protocol
// offering that asset on that chain and returns them ranked safest-first:
//   POST /api/telegraph/risk  { "chain": "Base", "asset": "USDC" }
//   → { mode: "ranked", safest: {...}, ranked: [...], protocols_scanned, pools_scanned }
//
// Direct mode (caller names the protocol or pool) — single result:
//   GET  /api/telegraph/risk?protocol=aave-v3&chain=Ethereum&asset=USDC
//   POST /api/telegraph/risk  { "pool_id": "<DefiLlama pool uuid>" }
//   → { mode: "single", risk_score, verdict, apy_bps, tvl_k, confidence,
//       components, flags, explanation, protocol, chain, symbol, pool_id }
//
// Six scoring components: apy_credibility (0-20), liquidity_depth (0-20),
// exploit_history (0-20), protocol_maturity (0-20), concentration (0-10),
// reward_token (0-10). Total 100 — lower = safer.
//
// Telegraph on-chain integers (risk_score, apy_bps, tvl_k, confidence) are
// present at the top level in every mode — in ranked mode they describe the
// safest protocol, so on-chain consumers always read a usable score.

interface QueryParams {
  protocol?: string;
  chain?: string;
  asset?: string;
  pool_id?: string;
  query?: string;
  limit?: number;
}

const MAX_PROTOCOLS = 8;

async function handle(params: QueryParams) {
  const allPools = await fetchPools();

  // A free-text question fills in whatever the caller did not name explicitly.
  let nlq: ReturnType<typeof parseQuestion> | null = null;
  if (params.query?.trim()) {
    nlq = parseQuestion(params.query, allPools);
    params = {
      ...params,
      chain: params.chain ?? nlq.chain,
      asset: params.asset ?? nlq.asset,
      protocol: params.protocol ?? nlq.protocol,
    };
  }
  const meta = nlq
    ? { intent: nlq.intent, resolved_via: "question" as const, extracted: nlq.matched }
    : { intent: "FINANCIAL_DATA" as Intent, resolved_via: "params" as const, extracted: [] };

  if (!params.protocol && !params.pool_id) {
    if (!params.chain || !params.asset) {
      return NextResponse.json(
        {
          error: nlq
            ? "Could not determine a chain and asset from the question"
            : "Provide chain + asset (discovery mode), or protocol / pool_id (direct mode)",
          ...meta,
          hint: "Name a chain and an asset, e.g. \"How risky is USDC on Base?\"",
          chains: listTopChains(allPools),
        },
        { status: 400 },
      );
    }
    return rankByChainAsset(allPools, params, meta);
  }

  const pools = findPools(allPools, params);
  if (pools.length === 0) {
    // An extracted protocol is a guess, so a miss shouldn't be a dead end when
    // the question also named a chain and asset — drop the guess and rank
    // instead. Explicit params are the caller's assertion, so those still 404.
    if (nlq?.protocol && params.chain && params.asset) {
      return rankByChainAsset(allPools, { ...params, protocol: undefined }, meta);
    }
    return NextResponse.json(
      {
        error: "No pools found for the given query",
        query: params,
        ...meta,
        tip: "Try chain='Base', asset='USDC' to auto-discover protocols",
      },
      { status: 404 },
    );
  }

  const result = await scoreMany(pools);
  const explanation = await explainRisk(result);

  return NextResponse.json({
    mode: "single",
    // `signal` leads: validators grade a number-first sentence, not a JSON blob.
    signal: singleSignal(result),
    ...meta,
    ...result,
    apy_bps: Math.round(result.apy * 100),
    tvl_k: Math.floor(result.tvl_usd / 1_000),
    explanation,
    query: params,
    pools_scored: pools.length,
    data_sources: result.sources,
  });
}

function listTopChains(allPools: Awaited<ReturnType<typeof fetchPools>>): string[] {
  const seen = new Map<string, number>();
  for (const p of allPools) {
    if (!p.chain) continue;
    seen.set(p.chain, (seen.get(p.chain) ?? 0) + (p.tvlUsd ?? 0));
  }
  return [...seen.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([c]) => c);
}

function singleSignal(r: Awaited<ReturnType<typeof scoreMany>>): string {
  return (
    `${r.protocol} on ${r.chain} scores ${r.risk_score}/100 (${r.verdict}, lower is safer) ` +
    `for ${r.symbol} — ${r.apy.toFixed(2)}% APY on $${Math.round(r.tvl_usd).toLocaleString()} TVL.`
  );
}

async function rankByChainAsset(
  allPools: Awaited<ReturnType<typeof fetchPools>>,
  params: QueryParams,
  meta: { intent: Intent; resolved_via: "question" | "params"; extracted: string[] },
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
        ...meta,
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
    // `signal` leads: validators grade a number-first sentence, not a JSON blob.
    signal: rankedSignal(chain, asset, safest, ranked.length),
    ...meta,
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

function rankedSignal(
  chain: string,
  asset: string,
  safest: { protocol: string; risk_score: number; verdict: string; apy: number; tvl_usd: number },
  scanned: number,
): string {
  return (
    `${safest.protocol} is the safest of ${scanned} protocol(s) offering ${asset} on ${chain}, ` +
    `scoring ${safest.risk_score}/100 (${safest.verdict}, lower is safer) at ` +
    `${safest.apy.toFixed(2)}% APY on $${Math.round(safest.tvl_usd).toLocaleString()} TVL.`
  );
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const limit = sp.get("limit");
  return handle({
    protocol: sp.get("protocol") ?? undefined,
    chain: sp.get("chain") ?? undefined,
    asset: sp.get("asset") ?? undefined,
    pool_id: sp.get("pool_id") ?? undefined,
    query: sp.get("query") ?? undefined,
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
    query: body.query,
    limit: body.limit,
  });
}
