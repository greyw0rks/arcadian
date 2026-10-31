import { NextRequest, NextResponse } from "next/server";
import { validateTradeSubject, TRADE_INTENTS } from "@/agent/policy";
import { deskReadiness } from "@/agent/readiness";
import { spendingAuthorized } from "@/agent/access";
import { usdcToAtomic } from "@/agent/x402";
import { configuredReviewStore, ReviewStoreError, validReviewId } from "@/agent/store";
import { reviewResponse, startReview } from "@/agent/reviews";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("requestId");
    if (!id) return NextResponse.json(deskReadiness().public);
    if (!spendingAuthorized(req.headers.get("x-desk-token"), process.env.DESK_ACCESS_TOKEN)) return NextResponse.json({ ok: false, reason: "Enter operator access to recover a review" }, { status: 401 });
    if (!validReviewId(id)) return NextResponse.json({ ok: false, reason: "Invalid review ID" }, { status: 400 });
    const store = await configuredReviewStore();
    try {
      const review = await store.get(id);
      return review ? NextResponse.json(reviewResponse(review)) : NextResponse.json({ ok: false, reason: "Review not found" }, { status: 404 });
    } finally { store.client.close(); }
  }
  catch { return NextResponse.json({ ok: false, state: "setup_required", reason: "Payment configuration is invalid; the operator must check server settings." }); }
}
export async function POST(req: NextRequest) {
  try {
    const raw = await req.text();
    if (Buffer.byteLength(raw, "utf8") > 8192) return NextResponse.json({ ok: false, reason: "Request is too large" }, { status: 413 });
    let body: Record<string, unknown>;
    try { body = JSON.parse(raw); } catch { return NextResponse.json({ ok: false, reason: "Invalid JSON body" }, { status: 400 }); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ ok: false, reason: "Provide a trade object" }, { status: 400 });
    let subject;
    let maximum;
    try {
      subject = validateTradeSubject(body.subject ?? body);
      maximum = usdcToAtomic(typeof body.maximumSpendUsdc === "string" ? body.maximumSpendUsdc : "0.05");
      if (maximum > 250_000n) throw new Error("A review must be capped at 0.25 USDC or less");
    } catch (error) { return NextResponse.json({ ok: false, reason: (error as Error).message }, { status: 400 }); }
    const r = deskReadiness();
    const plan = { subject, intents: [...TRADE_INTENTS], maximumSpendUsdc: typeof body.maximumSpendUsdc === "string" ? body.maximumSpendUsdc : "0.05" };
    if (body.preview === true) return NextResponse.json({ ...r.public, ok: true, state: "preview", plan,
      reason: "Request plan only. No provider has been called and no payment has been authorized." });
    if (!r.configured || !r.signer || !r.gateway) return NextResponse.json({ ...r.public, plan }, { status: 503 });
    if (!spendingAuthorized(req.headers.get("x-desk-token"), process.env.DESK_ACCESS_TOKEN)) return NextResponse.json({ ok: false, state: "error", reason: "Enter the operator access token to authorize a paid review" }, { status: 401 });
    if (!validReviewId(body.requestId)) return NextResponse.json({ ok: false, reason: "A paid review needs a UUID v4 requestId" }, { status: 400 });
    const dailyLimit = usdcToAtomic(process.env.DESK_DAILY_LIMIT_USDC ?? "1");
    const store = await configuredReviewStore();
    try {
      const review = await startReview(store, { id: body.requestId, subject, maximumSpendAtomic: maximum, dailyLimitAtomic: dailyLimit },
        { signer: r.signer, net: r.net, gateway: r.gateway });
      return NextResponse.json(reviewResponse(review), { status: review.state === "running" && !review.signed ? 202 : 200 });
    } finally { store.client.close(); }
  } catch (error) {
    if (error instanceof ReviewStoreError) return NextResponse.json({ ok: false, state: "error", reason: error.message,
      ...(error.recoverRequestId ? { recoverRequestId: error.recoverRequestId } : {}) }, { status: error.status });
    return NextResponse.json({ ok: false, state: "error", reason: "The review could not complete. Check the server configuration and preserve any payment evidence before retrying." }, { status: 502 });
  }
}
