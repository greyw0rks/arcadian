import { NextRequest, NextResponse } from "next/server";
import { isAddress, type Address } from "viem";
import { activeNetwork, telegraphGateway } from "@/agent/config";
import { agentSigner } from "@/agent/wallet";
import { validateTradeSubject } from "@/agent/policy";
import { verifyTradeMemo } from "@/agent/verify";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    const net = activeNetwork();
    return NextResponse.json({ trustedSigner: agentSigner()?.address ?? null,
      network: { name: net.name, chainId: net.chainId, testnet: net.testnet }, readOnly: true }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ reason: "The operator must check verifier configuration" }, { status: 503 }); }
}

export async function POST(req: NextRequest) {
  try {
    const raw = await req.text();
    if (Buffer.byteLength(raw) > 262_144) return NextResponse.json({ reason: "Memo exceeds 256 KiB" }, { status: 413 });
    let body;
    try { body = JSON.parse(raw); } catch { return NextResponse.json({ reason: "Provide valid JSON" }, { status: 400 }); }
    if (!body || typeof body !== "object" || Array.isArray(body) || typeof body.trustedSigner !== "string" || !isAddress(body.trustedSigner, { strict: false })) return NextResponse.json({ reason: "Provide the operator's trusted signer independently of the memo" }, { status: 400 });
    let subject;
    try { subject = validateTradeSubject(body.subject); } catch (error) { return NextResponse.json({ reason: (error as Error).message }, { status: 400 }); }
    const gateway = telegraphGateway();
    if (!gateway) return NextResponse.json({ reason: "The operator must configure the supported Telegraph Engine" }, { status: 503 });
    const report = await verifyTradeMemo(body.memo, { trustedSigner: body.trustedSigner as Address,
      expectedSubject: subject, net: activeNetwork(), gateway });
    return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ reason: "Verification could not complete. Hold the trade and check the memo format or connection." }, { status: 502 }); }
}
