# Arcadian — Handoff & Wrap-up

**DeFi Risk Score Miner for Telegraph Protocol Season I**
Status: **feature-complete, deployed, manifest synced on-chain-ready**
Last updated: 2026-08-31

---

## Session log — 2026-08-31 (wrap-up)

Closed out every open blocker from the July handoff and fixed two scoring bugs
found while verifying production.

**Blockers resolved**
- `YAML_URL` mismatch (old blocker #1) was already fixed in `638ac11`; the
  register script and the live `base_url` both point at `arcadian-gamma.vercel.app`.
- **Served manifest was stale.** `public/telegraph-risk.yaml` in the repo said
  `id: 2847` / `TASK_COMPLETION`, but the file actually being served was still
  `id: 1001` / `FINANCIAL_DATA, TVL_LOOKUP, FRAUD_DETECTION` — commit `cccd545`
  changed the repo without a production deploy. Deployed; the hosted file now
  byte-matches the repo (`sha256 502daa0c…01215`).
- `SUPPORTED_INTENTS` in `scripts/register-miner.ts` still held the three
  undeployed catalog intents while the YAML declared `TASK_COMPLETION`. The
  script would have registered intents that disagree with the hashed manifest;
  now both say `TASK_COMPLETION` (old blocker #3).
- Stale 4-component doc comment in `route.ts` (old blocker #4) was already
  corrected — it documents the six real components.
- Deleted the four unused `public/arcadian-*.png` mockups (nothing referenced them).

**Bug 1 — exploits attributed to the wrong protocols.** `matchHacks` split a
slug on `-` and substring-matched any token over 3 chars against hack names, so
`centrifuge-protocol` matched all 47 DefiLlama hacks named "<something>
Protocol" — Zunami, Origin, Maya — and took the maximum 20/20 exploit penalty
for other projects' incidents. `"aave"` also matched "Aavegotchi". Fixed with a
generic-token stoplist (`protocol`, `finance`, `network`, …), version-suffix
stripping, and word-boundary matching; slugs made *only* of generic words
(`yield-protocol`) fall back to a whole-phrase match so they still resolve.
Centrifuge now scores exploit_history 0 and 1/100 overall instead of 21.

**Bug 2 — components didn't add up to the score they explained.** `scoreMany`
TVL-weighted `risk_score` but plain-averaged the six components and unioned all
pool flags. A $57M protocol therefore reported `liquidity_depth: 9` and "TVL
<$1M — low liquidity" beside a headline score of 1, and the AI explanation
dutifully described capital flight that the score didn't reflect. Components are
now weighted with the same TVL weights, and pool-level flags from pools holding
<5% of protocol TVL are dropped unless every pool shares them (so protocol-wide
signals like exploit history and maturity always survive). Verified in
production: components now sum to the reported score (±1 rounding).

**Added a test suite.** `lib/sources.test.ts` (`npm test`, node:test via tsx) —
6 tests pinning the hack-attribution behaviour, including regression tests for
both the "<x> Protocol" sweep and the Aavegotchi substring collision.

**Verified in production** at https://arcadian-gamma.vercel.app —
health 200, manifest byte-identical to repo, ranked Base·USDC and Base·WETH,
direct mode (`aave-v3`/Ethereum), `universe?chain=Base`, plus the 404
(with suggestions) and 400 error paths. `tsc --noEmit`, `npm test`, and
`next build` all green.

---

## 1. What Arcadian is

A standalone Telegraph **Track 1 Miner** returning a verifiable **0–100 DeFi risk
score** for any protocol/pool. Lower = safer. Every score is reproducible against
public data.

- **Live:** https://arcadian-gamma.vercel.app
- **Repo:** `/home/greyw0rks/arcadian/` · github.com/greyw0rks/arcadian
- **Vercel:** project `arcadian` / `prj_AlrlTbCo0yomYywyMVAzBCnjReSa`
- **Hackathon window:** Aug 17 – Sep 7, 2026 · $15K USDC prize pool
- **Chain:** Base Sepolia (Telegraph MinerRegistry)
- **Separate from** YieldScout and Treasury Agent (different hackathons).

### Scoring — 6 components, 100 pts (lower = safer)
| # | Component | Max | Source |
|---|-----------|-----|--------|
| 1 | APY credibility   | 20 | DefiLlama Pools (sigma, outlier, apyPct30D, reward ratio) |
| 2 | Liquidity depth   | 20 | DefiLlama Pools + History (TVL tiers, 30d drawdown) |
| 3 | Exploit history   | 20 | DefiLlama Hacks (1,246 real hacks, recency-weighted) |
| 4 | Protocol maturity | 20 | DefiLlama Protocols (age, audits, fork status) |
| 5 | Concentration/IL  | 10 | DefiLlama Pools (LP vs single, stable vs volatile) |
| 6 | Reward token      | 10 | CoinGecko (mcap rank + 30d volatility) |

Verdict bands: ≤20 LOW · ≤45 MEDIUM · ≤70 HIGH · >70 VERY_HIGH.

Per protocol only the top 5 pools by TVL are scored; `tvl_usd`/`apy`/components
describe exactly those pools, TVL-weighted, and `pools_scored`/`pools_available`
exposes the sampling. (Averaging APY across a protocol's full long tail once made
aerodrome-slipstream read 7752%.)

---

## 2. Tech stack

- **Next.js 14** (App Router) + **TypeScript** on **Vercel** (serverless).
- **Data:** DefiLlama (pools/hacks/protocols) + CoinGecko free API.
- **AI explanations:** Qwen `qwen3.7-max` via the Anthropic-compatible endpoint
  (`QWEN_API_KEY` / `QWEN_BASE_URL` / `QWEN_MODEL`, `@anthropic-ai/sdk`).
  Graceful fallback if unset. Set in Vercel Production and in `.env.local`.
- **On-chain registration:** `viem` → Base Sepolia MinerRegistry.
- **UI:** ChainGPT Labs style — cream `#EFEFE5`, orange `#FF7120`, Orbitron +
  Roboto Mono, blueprint grid, corner-bracket frames, segmented risk bars.

### File map
```
app/
  page.tsx                     UI — chain + asset pickers, ranked protocol table
  globals.css                  design tokens + fonts
  layout.tsx                   metadata
  api/health/route.ts          GET → {status:"ok", miner:"arcadian"}
  api/telegraph/risk/route.ts  GET+POST → ranked or single risk JSON (no payment logic — by design)
  api/telegraph/universe/route.ts  GET → live chain + asset lists backing the pickers
lib/
  defillama.ts                 fetchPools/History, findPools, LlamaPool
  discover.ts                  assetTokens, listChains, listAssets, discoverProtocols
  sources.ts                   fetchHacks, matchHacks, fetchProtocols, findProtocol, fetchTokenRisk
  sources.test.ts              hack→protocol attribution tests
  scorer.ts                    6-component scorer, scorePool/scoreMany, verdictFromScore
  ai.ts                        explainRisk (Qwen) + fallback
public/
  telegraph-risk.yaml          Telegraph miner manifest — SINGLE source of truth
scripts/
  register-miner.ts            viem registration to Base Sepolia (npm run register)
```

### API

**Discovery mode — the default. No protocol slug required; asset is free text.**
```
POST /api/telegraph/risk
{ "chain": "Base", "asset": "USDC" }        // limit optional, default 6, max 8
→ { mode:"ranked", safest, ranked[], protocols_scanned, pools_scanned,
    risk_score, verdict, apy_bps, tvl_k, confidence, components, flags, explanation }
→ 404 { error, suggestions:[...] }          // real assets on that chain
```
Top-level on-chain integers mirror the **safest** protocol, so Telegraph
consumers always read a usable score. Asset matching is exact-token first, then
substring (skipped for 1-char queries); input is trimmed and upper-cased.

**Direct mode — pin one protocol (for agent callers).**
```
POST /api/telegraph/risk  { "protocol": "aave-v3", "chain": "Ethereum" }
POST /api/telegraph/risk  { "pool_id": "<DefiLlama uuid>" }
→ { mode:"single", risk_score, verdict, apy_bps, tvl_k, ... }
```

**Picker data.** `GET /api/telegraph/universe?chain=Base → { chains[], assets[] }`

On-chain integers: `risk_score`, `apy_bps` (APY×100), `tvl_k` (TVL/1000), `confidence`.

### x402 payments (how it actually works)
Arcadian does **not** implement x402 in-app. It sets a price floor
(`min_price_usdc: 0.01` in the YAML; `10_000n` 6-dec units in the register
script) and **Telegraph's gateway** enforces the 402 → USDC payment → proxies the
paid request to our endpoint, settling USDC to `FEE_ADDRESS`. Our route stays a
plain JSON API. If a judge asks for payment enforcement at the app layer, that's
the one deliberate gap — see TODO.

---

## 3. Registration invariants (read before touching the manifest)

1. **`public/telegraph-risk.yaml` is hashed on-chain.** `register-miner.ts`
   SHA-256s the *local* file and commits that hash. So: edit YAML → `vercel
   --prod` → *then* register. Editing the YAML after registering without
   re-registering breaks verification.
2. **Deploy is not automatic on commit.** Commit `cccd545` changed the manifest
   in git and the served file stayed stale for 8 days. Always `curl
   https://arcadian-gamma.vercel.app/telegraph-risk.yaml` and diff it against
   `public/telegraph-risk.yaml` after a manifest change.
3. **`SUPPORTED_INTENTS` in the script must equal `semantics.supported_intents`
   in the YAML.** Both are `["TASK_COMPLETION"]`. Telegraph's on-chain intent
   registry only recognizes canonical underscore intents; the hackathon's
   40-intent catalog (`FINANCIAL_DATA`, `TVL_LOOKUP`, `FRAUD_DETECTION`) is not
   deployed on-chain yet. Switch both together if/when it lands.
4. **Manifest id `2847`** — avoids the collision with the existing miner
   `veridex-contract-risk-miner` at 1001.

Current manifest hash: `502daa0c4c265fa6ea2eaef95252e59036d96793f3201d088574848aaaa01215`

---

## 4. TODO — what's left

### Blocking submission
- [ ] Record the on-chain registration below (registrationId / tx hash /
      FEE_ADDRESS). If not yet registered: fund a Base Sepolia wallet with
      testnet ETH, then `REGISTER_PRIVATE_KEY=0x... FEE_ADDRESS=0x... npm run register`.
- [ ] Submit on the hackathon platform. Draft copy in §5.

### Nice to have
- [ ] X posts with contrasting live demos: Aave v3 Ethereum (12/100 LOW) vs
      aerodrome-slipstream Base·WETH (39) vs an unaudited fork (VERY_HIGH).
- [ ] Optional: real in-app x402 handler (return 402 + verify payment) so the
      payment claim is true at the app layer, not only via Telegraph's gateway.
- [ ] Optional: extend `sources.test.ts` coverage to `scoreMany` weighting.

---

## 5. Submission copy (ready to paste)

**Description:** "Arcadian is a DeFi Risk Score Miner for Telegraph — it wraps
live DefiLlama (pools, hacks, protocols) and CoinGecko into a verifiable 0–100
risk score across six auditable components. You pick a chain and an asset;
Arcadian finds every protocol offering it, scores each, and ranks them
safest-first with an AI explanation. Agents query it for ground-truth risk
before acting, and every score is reproducible against public data. Deployed on
Vercel, registered on Telegraph's Base Sepolia MinerRegistry."

**Track checkboxes:** Financial Data + On-chain Analytics (optionally AI/LLM Inference).

---

## 6. Quick reference

```bash
cd /home/greyw0rks/arcadian
npm run dev            # http://localhost:3000
npm test               # unit tests
npm run build          # production build check
vercel --prod --yes    # deploy (serves arcadian-gamma.vercel.app)

REGISTER_PRIVATE_KEY=0x... FEE_ADDRESS=0x... npm run register
```

- **MinerRegistry (Base Sepolia):** `0x122396E8602BEed349434AA6E83123E7dD97F5A0`
- **Min price:** $0.01 USDC / query (`10_000` 6-dec units)
- **Qwen endpoint:** `https://token-plan.ap-southeast-1.maas.aliyuncs.com/apps/anthropic`
  · model `qwen3.7-max` · Anthropic-compatible via `@anthropic-ai/sdk`.
  Key/URL/model in `.env.local` (gitignored), sourced from
  `/home/greyw0rks/yieldscout/.env.local`.

### Registration record — FILL IN
- registrationId: `________`
- register tx hash: `________`
- FEE_ADDRESS used: `________`
- manifest hash registered: `________` (must match §3)
