// Multi-source data fetchers with shared caches.

const CACHE_MS = 5 * 60_000; // 5 min for slower endpoints

// ─── DefiLlama Hacks ──────────────────────────────────────────────────────────

export interface HackRecord {
  date: number;
  name: string;
  amount: number;
  classification: string;
  technique: string;
  chain: string[];
  defillamaId: string | null;
  returnedFunds: number | null;
}

let hacksCache: { at: number; hacks: HackRecord[] } | null = null;

export async function fetchHacks(): Promise<HackRecord[]> {
  if (hacksCache && Date.now() - hacksCache.at < CACHE_MS) return hacksCache.hacks;
  try {
    const res = await fetch("https://api.llama.fi/hacks", { cache: "no-store" });
    if (!res.ok) return [];
    const hacks = (await res.json()) as HackRecord[];
    hacksCache = { at: Date.now(), hacks };
    return hacks;
  } catch {
    return [];
  }
}

// Generic tokens that appear in hundreds of unrelated protocol names. Matching on
// them attributes other projects' exploits to ours — "centrifuge-protocol" once
// picked up all 47 hacks named "<something> Protocol", scoring 20/20 wrongly.
const GENERIC_SLUG_TOKENS = new Set([
  "protocol", "finance", "network", "exchange", "capital", "labs", "swap",
  "money", "token", "chain", "bridge", "vault", "vaults", "pool", "pools",
  "lend", "lending", "stake", "staking", "yield", "dex", "defi", "dao",
]);

// The brand tokens of a slug: drop version suffixes (v3, 2) and generic words.
function brandTokens(protocol: string): string[] {
  return protocol
    .toLowerCase()
    .split(/[-_\s]+/)
    .filter((p) => p.length > 3 && !/^v?\d+$/.test(p) && !GENERIC_SLUG_TOKENS.has(p));
}

// Match hacks to a protocol slug (brand-token name match + defillamaId).
// defillamaId is the authoritative link; the name match is a word-boundary
// fallback for hacks DefiLlama never linked to a protocol id.
export function matchHacks(hacks: HackRecord[], protocol: string, defillamaId?: string): HackRecord[] {
  const tokens = brandTokens(protocol);
  // Some protocols are named entirely from generic words ("yield-protocol").
  // For those, match the whole slug as a phrase rather than giving up.
  const phrase = tokens.length === 0
    ? protocol.toLowerCase().replace(/[-_]+/g, " ").trim()
    : null;
  return hacks.filter((h) => {
    if (defillamaId && h.defillamaId === defillamaId) return true;
    const name = (h.name ?? "").toLowerCase();
    if (phrase !== null) return phrase.length > 3 && name.includes(phrase);
    // Word-boundary so "aave" hits "Aave v3" but not "Aavegotchi".
    return tokens.some((p) => new RegExp(`\\b${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(name));
  });
}

// ─── DefiLlama Protocol Metadata ─────────────────────────────────────────────

export interface ProtocolMeta {
  id: string;
  name: string;
  slug: string;
  audits: string | number | null; // "2" or 2 or null
  audit_links: string[];
  listedAt: number | null; // unix timestamp
  forkedFrom: string[] | null;
  category: string;
  gecko_id: string | null;
  tvl: number;
}

let protosCache: { at: number; protos: ProtocolMeta[] } | null = null;

export async function fetchProtocols(): Promise<ProtocolMeta[]> {
  if (protosCache && Date.now() - protosCache.at < CACHE_MS) return protosCache.protos;
  try {
    const res = await fetch("https://api.llama.fi/protocols", { cache: "no-store" });
    if (!res.ok) return [];
    const protos = (await res.json()) as ProtocolMeta[];
    protosCache = { at: Date.now(), protos };
    return protos;
  } catch {
    return [];
  }
}

export function findProtocol(protos: ProtocolMeta[], slug: string): ProtocolMeta | null {
  const s = slug.toLowerCase();
  return (
    protos.find((p) => p.slug?.toLowerCase() === s) ??
    protos.find((p) => p.name?.toLowerCase() === s) ??
    protos.find((p) => p.slug?.toLowerCase().includes(s) || s.includes(p.slug?.toLowerCase() ?? "___")) ??
    null
  );
}

// ─── CoinGecko Token Data ─────────────────────────────────────────────────────

export interface TokenRisk {
  id: string;
  market_cap_rank: number | null;
  price_change_30d: number | null;
  market_cap_usd: number | null;
}

const tokenCache = new Map<string, { at: number; data: TokenRisk }>();

export async function fetchTokenRisk(geckoId: string): Promise<TokenRisk | null> {
  const cached = tokenCache.get(geckoId);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.data;
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/coins/${geckoId}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false`,
      { cache: "no-store" },
    );
    if (!res.ok) return null;
    const json = await res.json();
    const data: TokenRisk = {
      id: geckoId,
      market_cap_rank: json.market_cap_rank ?? null,
      price_change_30d: json.market_data?.price_change_percentage_30d ?? null,
      market_cap_usd: json.market_data?.market_cap?.usd ?? null,
    };
    tokenCache.set(geckoId, { at: Date.now(), data });
    return data;
  } catch {
    return null;
  }
}

// Map common reward token contract addresses to CoinGecko IDs.
// CoinGecko's /coins/{id}/contract/{address} endpoint works too but is slower.
const KNOWN_REWARD_TOKENS: Record<string, string> = {
  "0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9": "aave",
  "0xc00e94cb662c3520282e6f5717214004a7f26888": "compound-governance-token",
  "0xd533a949740bb3306d119cc777fa900ba034cd52": "curve-dao-token",
  "0x4e3fbd56cd56c3e72c1403e103b45db9da5b9d2b": "convex-finance",
  "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984": "uniswap",
  "0xba100000625a3754423978a60c9317c58a424e3d": "balancer",
  "0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2": "maker",
  "0x6b175474e89094c44da98b954eedeac495271d0f": "dai",
  "0x514910771af9ca656af840dff83e8264ecf986ca": "chainlink",
  "0xae7ab96520de3a18e5e111b5eaab095312d7fe84": "lido-dao",
};

export function geckoIdFromAddress(address: string): string | null {
  return KNOWN_REWARD_TOKENS[address.toLowerCase()] ?? null;
}
