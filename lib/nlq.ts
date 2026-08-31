import { type LlamaPool } from "./defillama";
import { assetTokens, normalizeAsset } from "./discover";

// Telegraph routes natural-language questions to miners, not query strings —
// live traffic looks like "Is Aave on Base safe to farm USDC in?". A miner that
// only accepts params answers 400 to everything the router sends it, which is
// why arcadian sat at score 0 while prose-answering miners scored ~1.0.
//
// So: extract chain / asset / protocol out of a free-text question against the
// live DefiLlama universe (no hardcoded lists to go stale), and classify which
// intent the question is really asking about.

export type Intent = "FINANCIAL_DATA" | "TVL_LOOKUP" | "FRAUD_DETECTION";

export interface ParsedQuestion {
  chain?: string;
  asset?: string;
  protocol?: string;
  intent: Intent;
  /** What the extractor actually recognised, so callers can show their work. */
  matched: string[];
}

// Words that are real tickers but overwhelmingly appear as English in questions.
// Without this "IS-USDC-SAFE" style extraction picks ON, IS, ALL as the asset.
const TICKER_STOPWORDS = new Set([
  "IS", "IT", "IN", "ON", "OF", "TO", "AT", "BY", "OR", "AND", "THE", "FOR",
  "ALL", "ANY", "ARE", "CAN", "DO", "HOW", "WHAT", "WHY", "WHO", "SAFE", "RISK",
  "BEST", "GOOD", "BAD", "NEW", "OLD", "TOP", "APY", "TVL", "USD", "ME", "MY",
  "GET", "PUT", "NOW", "YES", "NO", "NOT", "BUT", "SO", "IF", "WE", "US", "YOU",
  "FARM", "POOL", "YIELD", "EARN", "LEND", "STAKE", "HACK", "SCAM", "RUG",
]);

const INTENT_PATTERNS: Array<[Intent, RegExp]> = [
  // Order matters — a question can say "TVL" and "hacked"; exploit wins because
  // it is the more specific ask.
  ["FRAUD_DETECTION", /\b(hack(ed|s)?|exploit(ed|s)?|scam|rug(ged|pull)?|fraud|stolen|breach|safe|safety|trust(worthy)?|legit)\b/i],
  ["TVL_LOOKUP", /\b(tvl|total value locked|liquidity|how much (is )?(locked|deposited)|deposits?|depth)\b/i],
  ["FINANCIAL_DATA", /\b(apy|apr|yield|return|interest|rate|risk|score|invest|farm)\b/i],
];

export function classifyIntent(question: string): Intent {
  for (const [intent, re] of INTENT_PATTERNS) {
    if (re.test(question)) return intent;
  }
  return "FINANCIAL_DATA";
}

function words(question: string): string[] {
  return question.toUpperCase().split(/[^A-Z0-9.]+/).filter(Boolean);
}

// Protocol brands that are ordinary English words. DefiLlama has projects named
// "the-vault-liquid-staking" and "yield-yak-aggregator", so brand matching on
// "the" or "yield" answers "What is the weather in Paris?" with a Solana staking
// pool. A brand this generic only counts when the full slug is written out.
const GENERIC_BRANDS = new Set([
  "the", "and", "for", "all", "any", "new", "one", "two", "top", "best", "good",
  "yield", "vault", "vaults", "pool", "pools", "farm", "stake", "staking",
  "lend", "lending", "swap", "token", "tokens", "coin", "money", "cash",
  "finance", "protocol", "network", "chain", "bridge", "market", "markets",
  "index", "safe", "risk", "score", "data", "live", "real", "fast", "smart",
  "open", "free", "next", "core", "base", "beta", "alpha", "prime", "plus",
]);

// Chains are multi-word ("Arbitrum One"), so match them as phrases against the
// whole question, longest name first.
function matchPhrase(question: string, candidates: string[]): string | undefined {
  const haystack = ` ${question.toLowerCase().replace(/[^a-z0-9]+/g, " ")} `;
  let best: string | undefined;
  for (const c of candidates) {
    const needle = ` ${c.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
    if (needle.trim().length < 3) continue;
    if (!haystack.includes(needle)) continue;
    if (!best || c.length > best.length) best = c;
  }
  return best;
}

// Protocol slugs carry a version or product suffix that nobody types — a user
// asks about "Aave" or "Curve", never "aave-v3" or "curve-dex". So match on the
// brand token (the slug's first distinctive word) and prefer the deepest
// protocol carrying that brand, which is what "Aave" colloquially means.
function matchProtocol(
  question: string,
  pools: LlamaPool[],
): string | undefined {
  const haystack = ` ${question.toLowerCase().replace(/[^a-z0-9]+/g, " ")} `;
  const tvlByProject = new Map<string, number>();
  const brandOf = new Map<string, string>();
  for (const p of pools) {
    if (!p.project) continue;
    tvlByProject.set(p.project, (tvlByProject.get(p.project) ?? 0) + (p.tvlUsd ?? 0));
    if (!brandOf.has(p.project)) {
      const brand = p.project
        .toLowerCase()
        .split(/[-_]/)
        .find((t) => t.length >= 3 && !GENERIC_BRANDS.has(t));
      if (brand) brandOf.set(p.project, brand);
    }
  }

  let best: string | undefined;
  let bestScore = -1;
  for (const [project, brand] of brandOf) {
    // Full slug written out ("aave v3") is a stronger signal than the brand alone.
    const full = project.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const hitFull = full.length >= 3 && haystack.includes(` ${full} `);
    const hitBrand = haystack.includes(` ${brand} `);
    if (!hitFull && !hitBrand) continue;
    // Rank: exact slug beats brand; within the same kind, deepest TVL wins.
    const score = (hitFull ? 1e18 : 0) + (tvlByProject.get(project) ?? 0);
    if (score > bestScore) { bestScore = score; best = project; }
  }
  return best;
}

// The brand words of every known protocol — "AAVE" is a real ticker, but in
// "Is Aave safe for USDC?" it names the protocol, not the asset.
function protocolBrands(pools: LlamaPool[]): Set<string> {
  const brands = new Set<string>();
  for (const p of pools) {
    if (!p.project) continue;
    for (const t of p.project.toLowerCase().split(/[-_]/)) {
      if (t.length >= 3 && !GENERIC_BRANDS.has(t)) brands.add(t.toUpperCase());
    }
  }
  return brands;
}

export function parseQuestion(question: string, pools: LlamaPool[]): ParsedQuestion {
  const matched: string[] = [];
  const intent = classifyIntent(question);

  const chains = Array.from(new Set(pools.map((p) => p.chain).filter(Boolean)));
  const chain = matchPhrase(question, chains);
  if (chain) matched.push(`chain=${chain}`);

  const protocol = matchProtocol(question, pools);
  if (protocol) matched.push(`protocol=${protocol}`);

  // Assets are single tokens, so match on words rather than phrases. Restricting
  // to tickers that exist on the resolved chain keeps "BASE" from being read as
  // an asset when it is the chain, and drops English words that happen to be
  // listed somewhere in the long tail.
  const scope = chain
    ? pools.filter((p) => p.chain === chain)
    : pools;
  const tickers = new Set<string>();
  for (const p of scope) {
    if ((p.tvlUsd ?? 0) < 100_000) continue;
    for (const t of assetTokens(p.symbol)) if (t.length >= 3) tickers.add(t);
  }
  const brands = protocolBrands(pools);

  let asset: string | undefined;
  for (const w of words(question)) {
    if (w.length < 3 || TICKER_STOPWORDS.has(w)) continue;
    if (chain && w === chain.toUpperCase()) continue;
    // A word that names a protocol is not the asset being asked about.
    if (brands.has(w)) continue;
    if (!tickers.has(w)) continue;
    // Prefer the longest ticker in the sentence: "WSTETH" over "ETH".
    if (!asset || w.length > asset.length) asset = w;
  }
  if (asset) matched.push(`asset=${asset}`);

  return {
    chain,
    asset: asset ? normalizeAsset(asset) : undefined,
    protocol,
    intent,
    matched,
  };
}
