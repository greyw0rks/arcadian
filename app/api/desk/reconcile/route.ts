import { NextRequest, NextResponse } from "next/server";
import { spendingAuthorized } from "@/agent/access";
import { deskReadiness } from "@/agent/readiness";
import { configuredReviewStore, validReviewId } from "@/agent/store";
import { recoverReview, reviewResponse } from "@/agent/reviews";
import { TRADE_INTENTS } from "@/agent/policy";
import type { Hex } from "viem";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  if (!spendingAuthorized(req.headers.get("x-desk-token"), process.env.DESK_ACCESS_TOKEN)) return NextResponse.json({ ok: false, state: "error", reason: "Enter operator access to recover a review" }, { status: 401 });
  try {
    const raw = await req.text();
    if (Buffer.byteLength(raw) > 8192) return NextResponse.json({ ok: false, reason: "Request is too large" }, { status: 413 });
    let body;
    try { body = JSON.parse(raw); } catch { return NextResponse.json({ ok: false, reason: "Invalid JSON body" }, { status: 400 }); }
    if (!validReviewId(body?.requestId)) return NextResponse.json({ ok: false, reason: "Provide a valid review requestId" }, { status: 400 });
    const transactions: Record<string, Hex> = {};
    if (body.transactions !== undefined) {
      if (!body.transactions || typeof body.transactions !== "object" || Array.isArray(body.transactions)) return NextResponse.json({ ok: false, reason: "transactions must map check Intents to settlement hashes" }, { status: 400 });
      for (const [intent, hash] of Object.entries(body.transactions)) {
        if (!(TRADE_INTENTS as readonly string[]).includes(intent) || typeof hash !== "string" || !/^0x[0-9a-f]{64}$/i.test(hash)) return NextResponse.json({ ok: false, reason: "Invalid check or settlement hash" }, { status: 400 });
        transactions[intent] = hash as Hex;
      }
    }
    const r = deskReadiness();
    if (!r.signer) return NextResponse.json({ ok: false, reason: "The operator must configure the review signer" }, { status: 503 });
    const store = await configuredReviewStore();
    try {
      const review = await store.get(body.requestId);
      if (!review) return NextResponse.json({ ok: false, reason: "Review not found" }, { status: 404 });
      return NextResponse.json(reviewResponse(await recoverReview(store, review, { signer: r.signer }, transactions)));
    } finally { store.client.close(); }
  } catch { return NextResponse.json({ ok: false, state: "error", reason: "Recovery could not complete. Your existing review remains recorded; no new payment was sent." }, { status: 502 }); }
}
