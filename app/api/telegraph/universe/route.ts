import { NextRequest, NextResponse } from "next/server";
import { fetchPools } from "@/lib/defillama";
import { listChains, listAssets } from "@/lib/discover";

export const dynamic = "force-dynamic";

// Feeds the chain/asset pickers. Both lists are derived from the live pool set,
// so the UI never offers a chain or asset that has nothing to score.
//
// GET /api/telegraph/universe            → { chains: [...] }
// GET /api/telegraph/universe?chain=Base → { chains: [...], assets: [...] }

export async function GET(req: NextRequest) {
  const chain = req.nextUrl.searchParams.get("chain") ?? undefined;

  try {
    const pools = await fetchPools();
    return NextResponse.json({
      chains: listChains(pools),
      assets: chain ? listAssets(pools, chain, 150) : [],
    });
  } catch {
    return NextResponse.json({ error: "Upstream pool data unavailable" }, { status: 503 });
  }
}
