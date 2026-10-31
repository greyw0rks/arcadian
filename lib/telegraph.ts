// Public catalogue and ranking annotations. Paid application requests use the
// Engine auto-router; these functions never dispatch to a provider endpoint.
//
// The leaderboard (GET /api/leaderboard/miners) ranks miners per intent but
// carries only { miner_slug, score, rank, activation_status } — no endpoint or
// price. The integrations list (GET /api/integrations) carries base_url,
// endpoints, min_price_usdc and schemas. Routing a paid request therefore means
// joining the two: leaderboard decides *who*, integrations says *how to call*.
//
// Selection is a pure function (injectable data) so it unit-tests without network.

const EXPLORER =
  process.env.TELEGRAPH_EXPLORER?.replace(/\/$/, "") ??
  "https://explorer.telegraphprotocol.com";

type FetchImpl = typeof fetch;

export interface LeaderboardEntry {
  miner_slug: string;
  score: number;
  rank: number;
  activation_status: string;
}

export interface Leaderboard {
  epoch: number;
  intents: Record<string, LeaderboardEntry[]>;
}

export interface IntegrationEndpoint {
  path: string;
  external_path?: string;
  method: string;
  description?: string;
  intents?: string[];
}

export interface Integration {
  id: string;
  slug: string;
  kind: string;
  name?: string;
  base_url?: string;
  endpoints?: IntegrationEndpoint[];
  input_schema?: unknown;
  output_schema?: unknown;
  supported_intents?: string[];
  min_price_usdc?: number | string;
  activation_status?: string;
  fee_address?: string;
}

/** A resolved, callable top-ranked miner for one intent. */
export interface MinerRoute {
  intent: string;
  slug: string;
  name: string;
  rank: number;
  score: number;
  baseUrl: string;
  /** Telegraph-facing path the gateway routes on (e.g. "/ask"). */
  gatewayPath: string;
  method: string;
  minPriceUsdc: number | string | null;
  inputSchema: unknown;
  outputSchema: unknown;
}

export async function fetchLeaderboard(f: FetchImpl = fetch): Promise<Leaderboard> {
  const res = await f(`${EXPLORER}/api/leaderboard/miners`, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`leaderboard ${res.status}`);
  return (await res.json()) as Leaderboard;
}

export async function fetchIntegrations(f: FetchImpl = fetch): Promise<Integration[]> {
  const res = await f(`${EXPLORER}/api/integrations`, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`integrations ${res.status}`);
  return (await res.json()) as Integration[];
}

/** Prefer a POST endpoint serving `intent`, else any POST, else the first. */
export function pickEndpoint(
  integ: Integration,
  intent: string,
): IntegrationEndpoint | null {
  const eps = integ.endpoints ?? [];
  if (eps.length === 0) return null;
  const serves = (e: IntegrationEndpoint) => (e.intents ?? []).includes(intent);
  const isPost = (e: IntegrationEndpoint) => e.method?.toUpperCase() === "POST";
  return (
    eps.find((e) => isPost(e) && serves(e)) ??
    eps.find(isPost) ??
    eps.find(serves) ??
    eps[0]
  );
}

export interface SelectOpts {
  /** Skip these miner slugs (e.g. to buy from someone other than yourself). */
  excludeSlugs?: string[];
  /** Only consider miners whose activation_status is "active" (default true). */
  requireActive?: boolean;
}

/**
 * Pure selection: best-ranked miner on `intent` that has a resolvable
 * integration (base_url + an endpoint). Returns null if the board is missing,
 * empty, or no ranked miner resolves. Lower `rank` wins (rank 1 = best).
 */
export function selectTopMiner(
  leaderboard: Leaderboard,
  integrations: Integration[],
  intent: string,
  opts: SelectOpts = {},
): MinerRoute | null {
  const { excludeSlugs = [], requireActive = true } = opts;
  const board = leaderboard.intents?.[intent];
  if (!board || board.length === 0) return null;

  const bySlug = new Map(integrations.map((i) => [i.slug, i]));
  const excluded = new Set(excludeSlugs);
  const ranked = [...board].sort((a, b) => a.rank - b.rank);

  for (const entry of ranked) {
    if (excluded.has(entry.miner_slug)) continue;
    if (requireActive && entry.activation_status !== "active") continue;
    const integ = bySlug.get(entry.miner_slug);
    if (!integ?.base_url) continue;
    const ep = pickEndpoint(integ, intent);
    if (!ep) continue;
    return {
      intent,
      slug: entry.miner_slug,
      name: integ.name ?? entry.miner_slug,
      rank: entry.rank,
      score: entry.score,
      baseUrl: integ.base_url.replace(/\/$/, ""),
      gatewayPath: ep.path,
      method: ep.method?.toUpperCase() ?? "POST",
      minPriceUsdc: integ.min_price_usdc ?? null,
      inputSchema: integ.input_schema ?? null,
      outputSchema: integ.output_schema ?? null,
    };
  }
  return null;
}

/** Resolve top miners for several intents in one pass over the two endpoints. */
export async function discoverRoutes(
  intents: string[],
  opts: SelectOpts = {},
  f: FetchImpl = fetch,
): Promise<Record<string, MinerRoute | null>> {
  const [leaderboard, integrations] = await Promise.all([
    fetchLeaderboard(f),
    fetchIntegrations(f),
  ]);
  const out: Record<string, MinerRoute | null> = {};
  for (const intent of intents) {
    out[intent] = selectTopMiner(leaderboard, integrations, intent, opts);
  }
  return out;
}
