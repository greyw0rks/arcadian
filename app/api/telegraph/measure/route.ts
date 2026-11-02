import { NextRequest, NextResponse } from "next/server";
import { fetchPools } from "@/lib/defillama";
import { fetchProtocols } from "@/lib/sources";
import { parseQuestion } from "@/lib/nlq";
import { measureTvl, measureSupplyYield, measurementIntent } from "@/lib/measurements";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  return POST(new NextRequest(req.url, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(Object.fromEntries(req.nextUrl.searchParams)),
  }));
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    const raw = await req.text();
    if (Buffer.byteLength(raw) > 8192) return NextResponse.json({ error: "Request is too large" }, { status: 413 });
    body = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
  } catch { return NextResponse.json({ error: "Provide a JSON object" }, { status: 400 }); }
  const intent = measurementIntent(body.intent);
  if (!intent) return NextResponse.json({ error: "Choose TVL_LOOKUP_GENERAL or CRYPTO_YIELD_RATE_GENERAL" }, { status: 400 });
  for (const field of ["query", "protocol", "chain", "asset", "pool_id"]) {
    if (body[field] !== undefined && (typeof body[field] !== "string" || (body[field] as string).length > 2000)) return NextResponse.json({ error: field + " must be a string of at most 2000 characters" }, { status: 400 });
  }
  if (!body.query && !body.protocol && !body.pool_id) return NextResponse.json({ error: "Name a protocol or exact pool_id, or ask a question naming one" }, { status: 400 });
  try {
    const [pools, protocols] = await Promise.all([fetchPools(), fetchProtocols()]);
    const extracted = typeof body.query === "string" ? parseQuestion(body.query, pools) : null;
    const query = { protocol: body.protocol as string | undefined ?? extracted?.protocol,
      chain: body.chain as string | undefined ?? extracted?.chain,
      asset: body.asset as string | undefined, pool_id: body.pool_id as string | undefined };
    let measurement;
    try { measurement = intent === "TVL_LOOKUP_GENERAL" ? measureTvl(query, pools, protocols) : measureSupplyYield(query, pools); }
    catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 422 }); }
    return NextResponse.json({ intent, signal: intent === "TVL_LOOKUP_GENERAL"
      ? measurement.protocol + " on " + measurement.chain + " has " + measurement.value.toFixed(2) + " USD TVL (" + measurement.scope + ")."
      : measurement.protocol + " on " + measurement.chain + " yields " + measurement.value.toFixed(4) + "% APY (" + measurement.scope + ").",
      ...measurement, ...(intent === "TVL_LOOKUP_GENERAL" ? { tvl_usd: measurement.value, protocol_or_chain: measurement.protocol + " on " + measurement.chain,
        ...(measurement.scope === "protocol_chain" ? { chain_tvl_usd: measurement.value } : {}) } : {}),
      confidence: 1, retrieved_at: new Date().toISOString(), maximum_cache_age_seconds: intent === "TVL_LOOKUP_GENERAL" ? 300 : 60,
      source_updated_at: null, limitations: ["Source freshness follows the public feed; retrieval time is not a source observation time."] });
  } catch { return NextResponse.json({ error: "The public data source is unavailable; no measurement was fabricated" }, { status: 503 }); }
}
