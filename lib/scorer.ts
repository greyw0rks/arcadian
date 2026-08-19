import { type LlamaPool, fetchPoolHistory } from "./defillama";
import {
  fetchHacks, matchHacks,
  fetchProtocols, findProtocol,
  fetchTokenRisk, geckoIdFromAddress,
  type HackRecord, type ProtocolMeta,
} from "./sources";

export type Verdict = "LOW_RISK" | "MEDIUM_RISK" | "HIGH_RISK" | "VERY_HIGH_RISK";

export interface RiskComponents {
  apy_credibility: number;    // 0-20: APY believability + volatility + trend
  liquidity_depth: number;    // 0-20: TVL size + 30d TVL stability
  exploit_history: number;    // 0-20: past hacks weighted by recency + amount
  protocol_maturity: number;  // 0-20: age, audits, fork status
  concentration: number;      // 0-10: LP/IL/stablecoin exposure
  reward_token: number;       // 0-10: reward token market cap + 30d volatility
}

export interface RiskResult {
  risk_score: number;
  verdict: Verdict;
  components: RiskComponents;
  protocol: string;
  chain: string;
  symbol: string;
  apy: number;
  tvl_usd: number;
  pool_id: string;
  confidence: number;
  flags: string[];
  sources: string[];          // which data sources contributed
}

// ─── Component: APY Credibility (0-20) ───────────────────────────────────────
// Uses pool's own sigma (30d APY std-dev), outlier flag, and trend.

function scoreApyCredibility(pool: LlamaPool): { score: number; flags: string[] } {
  const flags: string[] = [];
  const apy = pool.apy ?? 0;
  const apyReward = pool.apyReward ?? 0;
  const sigma = pool.sigma ?? 0;           // DefiLlama 30d APY std-dev
  const outlier = pool.outlier ?? false;
  const apyTrend30d = pool.apyPct30D ?? 0; // % change in APY over 30d

  let score = 0;

  // Absolute APY suspicion
  if (apy > 200)       { score += 12; flags.push("APY >200% — extreme outlier, likely temporary or mispriced"); }
  else if (apy > 100)  { score += 9;  flags.push("APY >100% — very high, reward-driven yields not sustainable"); }
  else if (apy > 60)   { score += 6;  flags.push("APY >60% — elevated, validate reward token sustainability"); }
  else if (apy > 30)   { score += 3;  flags.push("APY >30% — above market average, monitor for decay"); }

  // DefiLlama's own outlier flag
  if (outlier) { score += 4; flags.push("DefiLlama flagged this pool as a statistical APY outlier"); }

  // High sigma = APY is noisy / unpredictable
  if (sigma > 20)      { score += 4; flags.push(`APY 30d std-dev is ${sigma.toFixed(1)} — highly volatile yield`); }
  else if (sigma > 8)  { score += 2; }

  // Reward-heavy is less stable than base rate
  if (apy > 0 && apyReward / apy > 0.7) {
    score += 3; flags.push("Over 70% of yield comes from reward tokens — subject to token price risk");
  }

  // Rapidly declining APY = fleeing capital
  if (apyTrend30d < -50) { score += 3; flags.push(`APY dropped ${Math.abs(apyTrend30d).toFixed(0)}% in 30 days — capital flight signal`); }

  return { score: Math.min(20, score), flags };
}

// ─── Component: Liquidity Depth (0-20) ───────────────────────────────────────

function scoreLiquidity(tvlUsd: number, history: { tvlUsd: number }[]): { score: number; flags: string[] } {
  const flags: string[] = [];
  let score = 0;

  if (tvlUsd < 100_000)        { score += 20; flags.push("TVL <$100K — extremely illiquid, high exit slippage risk"); }
  else if (tvlUsd < 1_000_000) { score += 14; flags.push("TVL <$1M — low liquidity, large withdrawals will move the market"); }
  else if (tvlUsd < 10_000_000){ score += 8; }
  else if (tvlUsd < 50_000_000){ score += 3; }
  // >$50M: score 0 — deep

  // 30d TVL drawdown
  if (history.length >= 7) {
    const peak = Math.max(...history.map((h) => h.tvlUsd));
    const recent = history[history.length - 1].tvlUsd;
    const drawdown = peak > 0 ? 1 - recent / peak : 0;
    if (drawdown > 0.6)      { score += 8; flags.push(`TVL fell ${(drawdown * 100).toFixed(0)}% from 30d peak — severe capital flight`); }
    else if (drawdown > 0.35){ score += 4; flags.push(`TVL fell ${(drawdown * 100).toFixed(0)}% from 30d peak — notable capital outflow`); }
  }

  return { score: Math.min(20, score), flags };
}

// ─── Component: Exploit History (0-20) ───────────────────────────────────────
// Recency-weighted: a hack last month matters more than one 4 years ago.

const NOW_S = Math.floor(Date.now() / 1000);
const YEAR_S = 365 * 24 * 3600;

function hackSeverity(hack: HackRecord): number {
  const amount = hack.amount ?? 0;
  const returned = hack.returnedFunds ?? 0;
  const netLoss = Math.max(0, amount - returned);

  // Age decay: hacks older than 3 years contribute half
  const ageSec = NOW_S - (hack.date ?? 0);
  const ageFactor = ageSec > 3 * YEAR_S ? 0.4 : ageSec > YEAR_S ? 0.7 : 1.0;

  // Severity by net loss
  let base = 0;
  if (netLoss > 100_000_000) base = 20;
  else if (netLoss > 10_000_000) base = 14;
  else if (netLoss > 1_000_000) base = 9;
  else if (netLoss > 100_000) base = 5;
  else base = 2;

  return base * ageFactor;
}

function scoreExploitHistory(hacks: HackRecord[], protocol: string, meta: ProtocolMeta | null): { score: number; flags: string[] } {
  const flags: string[] = [];
  const matched = matchHacks(hacks, protocol, meta?.id);

  if (matched.length === 0) return { score: 0, flags };

  const totalScore = matched.reduce((sum, h) => sum + hackSeverity(h), 0);
  const score = Math.min(20, Math.round(totalScore));

  const worst = matched.sort((a, b) => hackSeverity(b) - hackSeverity(a))[0];
  const netLoss = Math.max(0, (worst.amount ?? 0) - (worst.returnedFunds ?? 0));
  const lossStr = netLoss >= 1_000_000
    ? `$${(netLoss / 1_000_000).toFixed(1)}M`
    : `$${(netLoss / 1_000).toFixed(0)}K`;

  flags.push(
    `${matched.length} exploit(s) found — worst: ${worst.name} (${lossStr} net loss, ${worst.classification})`,
  );

  return { score, flags };
}

// ─── Component: Protocol Maturity (0-20) ─────────────────────────────────────

function scoreProtocolMaturity(meta: ProtocolMeta | null, protocol: string): { score: number; flags: string[] } {
  const flags: string[] = [];
  let score = 0;

  if (!meta) {
    flags.push(`Protocol "${protocol}" not found in DefiLlama registry — unverified`);
    return { score: 15, flags };
  }

  // Age: listedAt is when DL first tracked it (proxy for protocol launch)
  const ageDays = meta.listedAt ? (NOW_S - meta.listedAt) / 86400 : 0;
  if (ageDays < 30)       { score += 10; flags.push("Protocol listed <30 days ago — very early stage, unproven"); }
  else if (ageDays < 180) { score += 7;  flags.push("Protocol listed <6 months ago — limited track record"); }
  else if (ageDays < 365) { score += 4; }
  else if (ageDays < 730) { score += 2; }
  // >2 years: 0 — battle-tested

  // Audits
  const audits = Number(meta.audits ?? 0);
  if (audits === 0) { score += 8; flags.push("No audits recorded in DefiLlama — unaudited smart contracts"); }
  else if (audits === 1) { score += 3; }
  // >=2 audits: 0

  // Forked protocol: inherits parent's audit status but adds new risk surface
  if (meta.forkedFrom && meta.forkedFrom.length > 0) {
    score += 3;
    flags.push(`Forked from ${meta.forkedFrom.join(", ")} — inherits base risk plus fork-specific surface`);
  }

  return { score: Math.min(20, score), flags };
}

// ─── Component: Concentration / IL Risk (0-10) ────────────────────────────────

function scoreConcentration(pool: LlamaPool): { score: number; flags: string[] } {
  const flags: string[] = [];
  let score = 0;

  const tokens = (pool.underlyingTokens ?? []).filter(
    (t) => t && t !== "0x0000000000000000000000000000000000000000",
  );
  const isLp = tokens.length > 1;
  const sym = (pool.symbol ?? "").toUpperCase().replace(/₮/g, "T");
  const isStable = pool.stablecoin ||
    ["USDC", "USDT", "DAI", "FRAX", "LUSD", "CRVUSD", "USDE", "GHO"].some((s) => sym.includes(s));

  if (isLp)      { score += 4; flags.push("LP position — exposed to impermanent loss"); }
  if (!isStable) { score += 4; flags.push("Non-stablecoin asset — full underlying price volatility"); }
  if (pool.ilRisk === "yes") { score += 2; flags.push("DefiLlama flagged IL risk on this pool"); }

  return { score: Math.min(10, score), flags };
}

// ─── Component: Reward Token Risk (0-10) ─────────────────────────────────────

async function scoreRewardToken(pool: LlamaPool): Promise<{ score: number; flags: string[]; sources: string[] }> {
  const flags: string[] = [];
  const sources: string[] = [];
  const rewardTokens = pool.rewardTokens ?? [];

  if (rewardTokens.length === 0 || (pool.apyReward ?? 0) === 0) {
    return { score: 0, flags, sources };
  }

  let maxScore = 0;
  for (const addr of rewardTokens.slice(0, 2)) {
    const geckoId = geckoIdFromAddress(addr);
    if (!geckoId) {
      // Unknown reward token = higher risk
      if (maxScore < 8) {
        maxScore = 8;
        flags.push("Reward token not in known-safe list — unverified emission source");
      }
      continue;
    }

    const data = await fetchTokenRisk(geckoId);
    if (!data) continue;
    sources.push("CoinGecko");

    let tokenScore = 0;
    const rank = data.market_cap_rank;
    const change30d = Math.abs(data.price_change_30d ?? 0);

    // Market cap rank: smaller rank = bigger/more liquid token = safer
    if (!rank || rank > 500)     { tokenScore += 6; flags.push(`Reward token (${geckoId}) market cap rank >${rank ?? "unknown"} — small-cap inflation risk`); }
    else if (rank > 200)         { tokenScore += 4; }
    else if (rank > 50)          { tokenScore += 2; }

    // 30d price volatility of reward token
    if (change30d > 50)          { tokenScore += 4; flags.push(`Reward token (${geckoId}) moved ${change30d.toFixed(0)}% in 30 days — high volatility`); }
    else if (change30d > 25)     { tokenScore += 2; }

    maxScore = Math.max(maxScore, tokenScore);
  }

  return { score: Math.min(10, maxScore), flags, sources };
}

// ─── Aggregate scorer ─────────────────────────────────────────────────────────

function verdictFromScore(score: number): Verdict {
  if (score <= 20) return "LOW_RISK";
  if (score <= 45) return "MEDIUM_RISK";
  if (score <= 70) return "HIGH_RISK";
  return "VERY_HIGH_RISK";
}

function calcConfidence(pool: LlamaPool, history: unknown[], meta: ProtocolMeta | null, hacks: HackRecord[]): number {
  let score = 30;
  if (pool.apy != null) score += 10;
  if (pool.sigma != null) score += 10;
  if (pool.tvlUsd > 0) score += 5;
  if (pool.apyMean30d != null) score += 5;
  if (history.length >= 14) score += 10;
  if (meta) score += 15;
  if (hacks.length > 0) score += 5; // we have hack data (even if no match)
  return Math.min(100, score);
}

export async function scorePool(pool: LlamaPool): Promise<RiskResult> {
  const [history, hacks, protocols] = await Promise.all([
    fetchPoolHistory(pool.pool),
    fetchHacks(),
    fetchProtocols(),
  ]);

  const meta = findProtocol(protocols, pool.project);

  const apy_   = scoreApyCredibility(pool);
  const liq_   = scoreLiquidity(pool.tvlUsd ?? 0, history);
  const exp_   = scoreExploitHistory(hacks, pool.project, meta);
  const mat_   = scoreProtocolMaturity(meta, pool.project);
  const con_   = scoreConcentration(pool);
  const rew_   = await scoreRewardToken(pool);

  const components: RiskComponents = {
    apy_credibility: apy_.score,
    liquidity_depth: liq_.score,
    exploit_history: exp_.score,
    protocol_maturity: mat_.score,
    concentration: con_.score,
    reward_token: rew_.score,
  };

  const risk_score = Object.values(components).reduce((a, b) => a + b, 0);
  const flags = [...apy_.flags, ...liq_.flags, ...exp_.flags, ...mat_.flags, ...con_.flags, ...rew_.flags];
  const sources = ["DefiLlama Pools", "DefiLlama Hacks", "DefiLlama Protocols", ...rew_.sources];

  return {
    risk_score,
    verdict: verdictFromScore(risk_score),
    components,
    protocol: pool.project,
    chain: pool.chain,
    symbol: pool.symbol,
    apy: pool.apy ?? 0,
    tvl_usd: Math.round(pool.tvlUsd ?? 0),
    pool_id: pool.pool,
    confidence: calcConfidence(pool, history, meta, hacks),
    flags,
    sources: Array.from(new Set(sources)),
  };
}

// Score multiple pools and return TVL-weighted aggregate
export async function scoreMany(pools: LlamaPool[]): Promise<RiskResult> {
  if (pools.length === 0) throw new Error("No pools found matching the query");
  if (pools.length === 1) return scorePool(pools[0]);

  const results = await Promise.all(pools.map(scorePool));
  const totalTvl = results.reduce((s, r) => s + r.tvl_usd, 0);

  let weightedScore = 0;
  for (const r of results) {
    const w = totalTvl > 0 ? r.tvl_usd / totalTvl : 1 / results.length;
    weightedScore += r.risk_score * w;
  }

  const rounded = Math.round(weightedScore);
  const rep = results[0]; // highest TVL pool is representative
  const allFlags = Array.from(new Set(results.flatMap((r) => r.flags)));
  const allSources = Array.from(new Set(results.flatMap((r) => r.sources)));
  const avgConf = Math.round(results.reduce((s, r) => s + r.confidence, 0) / results.length);

  const avg = (key: keyof RiskComponents) =>
    Math.round(results.reduce((s, r) => s + r.components[key], 0) / results.length);

  return {
    ...rep,
    risk_score: rounded,
    verdict: verdictFromScore(rounded),
    flags: allFlags,
    sources: allSources,
    confidence: avgConf,
    components: {
      apy_credibility: avg("apy_credibility"),
      liquidity_depth: avg("liquidity_depth"),
      exploit_history: avg("exploit_history"),
      protocol_maturity: avg("protocol_maturity"),
      concentration: avg("concentration"),
      reward_token: avg("reward_token"),
    },
  };
}
