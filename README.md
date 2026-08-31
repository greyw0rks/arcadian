# Arcadian

**DeFi Risk Score Miner for the Telegraph Protocol**

Arcadian is a Track 1 miner that returns a verifiable **0–100 risk score** for any DeFi protocol or pool. Lower score = safer. Every score is reproducible against public on-chain and off-chain data — no black boxes.

Live at **[arcadian-gamma.vercel.app](https://arcadian-gamma.vercel.app)**

---

## What it does

Ask it a question, or name a chain and an asset.

```bash
curl -s https://arcadian-gamma.vercel.app/api/telegraph/risk \
  -H 'content-type: application/json' \
  -d '{"query":"Is Aave safe for USDC on Base?"}' | jq -r .signal
# aave-v3 on Base scores 14/100 (LOW_RISK, lower is safer) for USDC — 3.39% APY on $25,708,706 TVL.
```

Given a chain + asset with no protocol, Arcadian:

1. Queries DefiLlama for every protocol offering that asset on that chain
2. Scores each one across six components (see below)
3. Returns them ranked safest-first with APY, TVL, and an AI-generated explanation

The top-level integers always reflect the safest available protocol, so callers
always get a usable score.

---

## Scoring — 6 components, 100 points

| # | Component | Max pts | Data source |
|---|-----------|---------|-------------|
| 1 | APY credibility | 20 | DefiLlama Pools (sigma, outlier detection, 30d trend, reward ratio) |
| 2 | Liquidity depth | 20 | DefiLlama Pools + History (TVL tiers, 30d drawdown) |
| 3 | Exploit history | 20 | DefiLlama Hacks (1,246 real incidents, recency-weighted, brand-token matched) |
| 4 | Protocol maturity | 20 | DefiLlama Protocols (age, audits, fork status) |
| 5 | Concentration / IL | 10 | DefiLlama Pools (LP vs single-sided, stable vs volatile) |
| 6 | Reward token risk | 10 | CoinGecko (market cap rank + 30d volatility) |

**Verdict bands:** ≤20 LOW · ≤45 MEDIUM · ≤70 HIGH · >70 VERY_HIGH

---

## API

Every response leads with `signal` — a number-first sentence. Telegraph routes
natural-language questions to miners and grades the prose answer, not the JSON,
so that field is the product; the structured fields back it up.

### Question mode (what Telegraph actually sends)

Free text, no parameters. Chain, asset and protocol are extracted from the
question against the live DefiLlama universe, and the question is classified into
one of the three declared intents.

```http
POST /api/telegraph/risk
Content-Type: application/json

{ "query": "Is Aave safe for USDC on Base?" }
```

```json
{
  "signal": "aave-v3 on Base scores 14/100 (LOW_RISK, lower is safer) for USDC — 3.39% APY on $25,708,706 TVL.",
  "intent": "FRAUD_DETECTION",
  "resolved_via": "question",
  "extracted": ["chain=Base", "protocol=aave-v3", "asset=USDC"],
  "risk_score": 14,
  "verdict": "LOW_RISK",
  "...": "components, flags, explanation, apy_bps, tvl_k, confidence"
}
```

An unanswerable question (`"What is the weather in Paris?"`) returns `400` with a
`hint` and the deepest chains, rather than a confidently wrong default.

### Discovery mode

No protocol slug required — just chain + asset.

```http
POST /api/telegraph/risk
Content-Type: application/json

{ "chain": "Base", "asset": "USDC" }
```

```json
{
  "mode": "ranked",
  "signal": "centrifuge-protocol is the safest of 6 protocol(s) offering USDC on Base, scoring 1/100 ...",
  "safest": "centrifuge-protocol",
  "ranked": [...],
  "protocols_scanned": 6,
  "pools_scanned": 47,
  "risk_score": 1,
  "apy_bps": 499,
  "tvl_k": 57952,
  "confidence": 85,
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

All three modes work over `GET` too: `?query=`, `?chain=&asset=`, `?protocol=`.

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
On-chain strings: `verdict`, `signal`.

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
  nlq.ts          parseQuestion — free-text → chain/asset/protocol + intent
  nlq.test.ts     extraction and intent-classification tests
  sources.ts      fetchHacks, fetchProtocols, fetchTokenRisk, matchHacks
  sources.test.ts unit tests for hack→protocol attribution
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
npm test           # unit tests (node:test via tsx)
npm run build      # production build check
```

### Register on Telegraph (Base Sepolia)

```bash
REGISTER_PRIVATE_KEY=0x... FEE_ADDRESS=0x... npm run register
```

The script SHA-256s the local `public/telegraph-risk.yaml` and commits that hash
on-chain, so **deploy before registering**. It refuses to run if the hosted file
does not byte-match the local one, and simulates the call first (the registry
reverts on unknown intents). Re-registering the same `slug` replaces the config,
so this is also the update path — it must be sent from the wallet that owns the
slug.

**MinerRegistry (Base Sepolia):** `0x5a2324aA18613FAD4e44bDF0d6c73Ec1f6D87ff8`
— the registry the explorer reads. `0x122396E8…` is an older deployment that
still accepts registrations but is not indexed.

**Registered intents:** `FINANCIAL_DATA`, `TVL_LOOKUP`, `FRAUD_DETECTION`. These
are validated on-chain: unknown values and lowercase both revert, and they must
match `semantics.supported_intents` in the YAML.

Activation happens at the next epoch boundary (~9h epochs). Verify with:

```bash
curl -s https://explorer.telegraphprotocol.com/api/integrations \
  | grep -o '"slug":"arcadian-defi-risk"[^}]*'
```

---

## Hackathon

Telegraph Protocol — Season I · Aug 17 – Sep 7 2026 · $15K USDC prize pool

Track: **Track 1 — Financial Data + On-chain Analytics**
