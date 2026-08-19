# Arcadian

**DeFi Risk Score Miner for the Telegraph Protocol**

Arcadian is a Track 1 miner that returns a verifiable **0–100 risk score** for any DeFi protocol or pool. Lower score = safer. Every score is reproducible against public on-chain and off-chain data — no black boxes.

Live at **[arcadian-gamma.vercel.app](https://arcadian-gamma.vercel.app)**

---

## What it does

You pick a chain and an asset (e.g. Base + USDC). Arcadian:

1. Queries DefiLlama for every protocol offering that asset on that chain
2. Scores each one across six components (see below)
3. Returns them ranked safest-first with APY, TVL, and an AI-generated explanation

Telegraph agents and consumers can query the `/api/telegraph/risk` endpoint directly. The top-level integers always reflect the safest available protocol, so callers always get a usable score.

---

## Scoring — 6 components, 100 points

| # | Component | Max pts | Data source |
|---|-----------|---------|-------------|
| 1 | APY credibility | 20 | DefiLlama Pools (sigma, outlier detection, 30d trend, reward ratio) |
| 2 | Liquidity depth | 20 | DefiLlama Pools + History (TVL tiers, 30d drawdown) |
| 3 | Exploit history | 20 | DefiLlama Hacks (589 real incidents, recency-weighted) |
| 4 | Protocol maturity | 20 | DefiLlama Protocols (age, audits, fork status) |
| 5 | Concentration / IL | 10 | DefiLlama Pools (LP vs single-sided, stable vs volatile) |
| 6 | Reward token risk | 10 | CoinGecko (market cap rank + 30d volatility) |

**Verdict bands:** ≤20 LOW · ≤45 MEDIUM · ≤70 HIGH · >70 VERY_HIGH

---

## API

### Discovery mode (default)

No protocol slug required — just chain + asset.

```http
POST /api/telegraph/risk
Content-Type: application/json

{ "chain": "Base", "asset": "USDC" }
```

```json
{
  "mode": "ranked",
  "safest": { "protocol": "aave-v3", "risk_score": 18, "verdict": "LOW", ... },
  "ranked": [...],
  "protocols_scanned": 12,
  "pools_scanned": 47,
  "risk_score": 18,
  "apy_bps": 412,
  "tvl_k": 980400,
  "confidence": 92,
  "components": { ... },
  "flags": [],
  "explanation": "..."
}
```

Returns `404` with a `suggestions[]` array of real assets on that chain if nothing matches.

### Direct mode

Pin a specific protocol or pool.

```http
POST /api/telegraph/risk
{ "protocol": "aave-v3", "chain": "Ethereum" }
POST /api/telegraph/risk
{ "pool_id": "<DefiLlama uuid>" }
```

### Picker data

```http
GET /api/telegraph/universe?chain=Base
→ { chains: [...], assets: [...] }
```

### Health check

```http
GET /api/health
→ { status: "ok", miner: "arcadian" }
```

On-chain integers: `risk_score`, `apy_bps` (APY × 100), `tvl_k` (TVL / 1000), `confidence`.

---

## Payments (x402)

Arcadian sets a `$0.01 USDC` price floor per query. The Telegraph gateway enforces the 402 payment flow and proxies paid requests to this endpoint — Arcadian's route stays a plain JSON API. Earnings settle to `FEE_ADDRESS` on Base Sepolia.

---

## Tech stack

- **Next.js 14** (App Router) + TypeScript, deployed on Vercel (serverless)
- **Data:** DefiLlama (pools, hacks, protocols) + CoinGecko free API
- **AI explanations:** Qwen `qwen3.7-max` via Anthropic-compatible endpoint (`@anthropic-ai/sdk`), graceful fallback if unset
- **On-chain registration:** `viem` → Base Sepolia MinerRegistry

---

## Project structure

```
app/
  page.tsx                         UI — chain + asset pickers, ranked protocol table
  globals.css                      design tokens + fonts
  api/health/route.ts              GET → {status:"ok"}
  api/telegraph/risk/route.ts      GET+POST → ranked or single risk JSON
  api/telegraph/universe/route.ts  GET → live chain + asset lists
lib/
  defillama.ts    fetchPools, fetchHistory, findPools
  discover.ts     listChains, listAssets, discoverProtocols
  sources.ts      fetchHacks, fetchProtocols, fetchTokenRisk
  scorer.ts       6-component scorer, verdictFromScore
  ai.ts           explainRisk (Qwen) + fallback
public/
  telegraph-risk.yaml   Telegraph miner config (base_url, x402 price, on-chain fields)
scripts/
  register-miner.ts     viem registration to Base Sepolia MinerRegistry
```

---

## Local development

```bash
cp .env.local.example .env.local
# fill in QWEN_API_KEY, QWEN_BASE_URL, QWEN_MODEL

npm install
npm run dev        # http://localhost:3000
npm run build      # production build check
```

### Register on Telegraph (Base Sepolia)

```bash
REGISTER_PRIVATE_KEY=0x... FEE_ADDRESS=0x... npm run register
```

**MinerRegistry (Base Sepolia):** `0x122396E8602BEed349434AA6E83123E7dD97F5A0`

---

## Hackathon

Telegraph Protocol — Season I · Aug 17 – Sep 7 2026 · $15K USDC prize pool

Track: **Track 1 — Financial Data + On-chain Analytics**
