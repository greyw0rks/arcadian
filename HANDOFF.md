# Arcadian — Handoff & TODO

**DeFi Risk Score Miner for Telegraph Protocol Hackathon Season I**
Last updated: 2026-07-31

## Session log — 2026-07-31

**Protocol auto-discovery shipped and DEPLOYED.** Users no longer pick a protocol slug —
they pick a chain and an asset, and Arcadian finds every protocol offering it, scores
each, and ranks them safest-first.

- Live and verified at **https://arcadian-gamma.vercel.app** (latest deployment
  `arcadian-k4awvv8lq`, project `arcadian` / `prj_AlrlTbCo0yomYywyMVAzBCnjReSa`).
- **Asset is free text, not a fixed list.** The dropdown was replaced with a typed
  input backed by a `<datalist>` of the top 150 assets on the selected chain — the
  suggestions are a convenience, not a constraint, so any of the ~15k pools' tokens
  can be reached. Changing chain no longer overwrites what the user typed.
- Matching is exact-token first (`USDC` in `USDC-WETH`), then a substring fallback
  (`USDCC` → still resolves). Input is upper-cased and trimmed, so `  cbBTC  ` works.
- A miss returns HTTP 404 **with a `suggestions[]` array** of real assets on that
  chain, rendered as clickable chips instead of a dead end.
- Added `lib/discover.ts` and `GET /api/telegraph/universe`. Chain and asset dropdowns
  are now populated from the live DefiLlama pool set, so no option can be picked that
  has nothing to score.
- `POST /api/telegraph/risk` gained a `mode:"ranked"` discovery path. Direct mode
  (`protocol` / `pool_id`) is unchanged, so existing agent/Telegraph callers still work.
- Migrated AI off DashScope/`qwen-plus` to `qwen3.7-max` via the Anthropic-compatible
  endpoint (see Tech stack). `QWEN_API_KEY` / `QWEN_BASE_URL` / `QWEN_MODEL` are set in
  Vercel Production; the stale `DASHSCOPE_API_KEY` was removed (no code reads it).
- Verified in production: universe endpoint (24 chains / 40 Base assets), ranked
  Base·USDC query returning a real Qwen explanation, and the new UI in the served HTML.
- Verified locally: Ethereum·USDC, Solana·USDC (non-EVM works), direct mode, plus the
  400 and 404 error paths. `tsc --noEmit` and `next build` both green.

**Bug found and fixed in the same session:** reported APY was TVL-weighted across a
protocol's *entire* pool list while only the top 5 were actually scored, so long-tail
dust pools dominated the number. `aerodrome-slipstream` displayed **7752% APY**. TVL and
APY are now computed over exactly the scored pools (105% for the same protocol), and the
table shows `pools_scored/pools_available` so the sampling is visible rather than implied.

**Second bug, found while testing free-text assets:** DefiLlama symbols like `O-USDC`
and `WETH-11-11` produce 1–2 char fragments. Because `"ZZZZNOTREAL".includes("O")` is
true, a garbage query suggested the junk ticker `O`. Suggestion lists now require ≥3
chars, and the substring fallback is skipped for 1-char queries. Such fragments remain
matchable if typed exactly — they're only excluded from *suggestions*.

---

## 1. What Arcadian is

A standalone Telegraph **Track 1 Miner** that returns a verifiable **0–100 DeFi risk score**
for any protocol/pool. Lower = safer. Every score is reproducible against public data.

- **Live:** https://arcadian-gamma.vercel.app (running the auto-discovery flow as of 2026-07-31)
- **Repo/dir:** `/home/greyw0rks/arcadian/`
- **Hackathon window:** Aug 17 – Sep 7, 2026 · $15K USDC prize pool
- **Chain:** Base Sepolia (Telegraph MinerRegistry)
- **Separate from** YieldScout and Treasury Agent (different hackathons).

### Scoring — 6 components, 100 pts (lower = safer)
| # | Component | Max | Source |
|---|-----------|-----|--------|
| 1 | APY credibility   | 20 | DefiLlama Pools (sigma, outlier, apyPct30D, reward ratio) |
| 2 | Liquidity depth   | 20 | DefiLlama Pools + History (TVL tiers, 30d drawdown) |
| 3 | Exploit history   | 20 | DefiLlama Hacks (589 real hacks, recency-weighted) |
| 4 | Protocol maturity | 20 | DefiLlama Protocols (age, audits, fork status) |
| 5 | Concentration/IL  | 10 | DefiLlama Pools (LP vs single, stable vs volatile) |
| 6 | Reward token      | 10 | CoinGecko (mcap rank + 30d volatility) |

Verdict bands: ≤20 LOW · ≤45 MEDIUM · ≤70 HIGH · >70 VERY_HIGH.

---

## 2. Tech stack

- **Next.js 14** (App Router) + **TypeScript**, deployed on **Vercel** (serverless).
- **Data:** DefiLlama (pools/hacks/protocols) + CoinGecko free API.
- **AI explanations:** Qwen `qwen3.7-max` via the Anthropic-compatible endpoint
  (`QWEN_API_KEY` / `QWEN_BASE_URL` / `QWEN_MODEL`, using `@anthropic-ai/sdk`).
  Graceful fallback if unset. Migrated off the old `DASHSCOPE_API_KEY` + `qwen-plus`
  OpenAI-style call on 2026-07-31.
- **On-chain registration:** `viem` → Base Sepolia MinerRegistry.
- **UI:** ChainGPT Labs style — cream `#EFEFE5`, orange `#FF7120`, Orbitron + Roboto Mono, blueprint grid, corner-bracket frames, segmented risk bars.

### File map
```
app/
  page.tsx                     UI — chain + asset pickers, ranked protocol table
  globals.css                  design tokens + fonts
  layout.tsx                   metadata
  api/health/route.ts          GET → {status:"ok", miner:"arcadian"}
  api/telegraph/risk/route.ts  GET+POST → ranked or single risk JSON (NO payment logic — by design)
  api/telegraph/universe/route.ts  GET → live chain + asset lists backing the pickers
lib/
  defillama.ts                 fetchPools/History, findPools, LlamaPool interface
  discover.ts                  assetTokens, listChains, listAssets, discoverProtocols
  sources.ts                   fetchHacks, matchHacks, fetchProtocols, findProtocol, fetchTokenRisk
  scorer.ts                    6-component scorer, scorePool/scoreMany, verdictFromScore
  ai.ts                        explainRisk (Qwen, Anthropic-compatible) + fallback
public/
  telegraph-risk.yaml          Telegraph miner config (base_url, on_chain fields, x402 price)
  arcadian-{1..4}.png          old UI mockups (unused now — can delete)
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
Arcadian resolves chain+asset → every protocol offering it, scores each, and returns
them sorted safest-first. Top-level on-chain integers mirror the **safest** protocol,
so Telegraph consumers always read a usable score. Asset matching is exact-token first,
then substring; input is trimmed and upper-cased.

**Direct mode — pin one protocol (unchanged, for agent callers).**
```
POST /api/telegraph/risk  { "protocol": "aave-v3", "chain": "Ethereum" }
POST /api/telegraph/risk  { "pool_id": "<DefiLlama uuid>" }
→ { mode:"single", risk_score, verdict, apy_bps, tvl_k, ... }
```

**Picker data.**
```
GET /api/telegraph/universe?chain=Base → { chains[], assets[] }
```
On-chain integers: `risk_score`, `apy_bps` (APY×100), `tvl_k` (TVL/1000), `confidence`.

Per protocol only the top 5 pools by TVL are scored, and the reported `tvl_usd`/`apy`
describe exactly those 5 (`pools_scored`/`pools_available` expose the split). Averaging
APY across a protocol's full long tail let dust pools produce absurd figures —
aerodrome-slipstream read 7752% before this was fixed.

### x402 payments (how it actually works)
Arcadian does **not** implement x402 in-app. It sets a price floor
(`min_price_usdc: 0.01` in the YAML; `10_000n` 6-dec units in register script) and
**Telegraph's gateway** enforces the 402 → USDC payment → proxies the paid request to
our endpoint, settling USDC to `FEE_ADDRESS`. Our route stays a plain JSON API.

---

## 3. ⚠️ Blockers / bugs to fix BEFORE registering

1. **YAML URL mismatch (must fix).**
   - `scripts/register-miner.ts:19` → `YAML_URL = "https://arcadian.vercel.app/telegraph-risk.yaml"`
   - Actual live base_url is `https://arcadian-gamma.vercel.app`
   - The registered YAML_URL must resolve or Telegraph nodes can't fetch/verify the config.
   - **Fix:** change line 19 to `https://arcadian-gamma.vercel.app/telegraph-risk.yaml`
     (or set up the `arcadian.vercel.app` alias in Vercel and point base_url there too).

2. **YAML hash is committed on-chain.** After ANY edit to `public/telegraph-risk.yaml`,
   you must redeploy so the hosted file matches, then register (the script SHA-256s the
   local file). Don't edit the YAML after registering without re-registering.

3. **supported_intents are placeholders.** Currently `fact_check, web_search,
   language_generation` (both in YAML and register script). Confirm these are the correct
   Telegraph intent enums for a financial/risk data feed — may need updating once the
   hackathon docs/Discord clarify the taxonomy.

4. **`components` doc comment in route.ts is stale** (`route.ts:21` still lists the old
   4-component names `apy_risk, liquidity_risk...`). Cosmetic only — actual code returns
   the 6 correct components. Worth cleaning up.

---

## 4. TODO — ordered

### Now (pre-registration prep)
- [ ] Fix `YAML_URL` mismatch in `scripts/register-miner.ts:19` (blocker #1).
- [x] `.env.local` created with `QWEN_API_KEY` / `QWEN_BASE_URL` / `QWEN_MODEL`
      (copied from `/home/greyw0rks/yieldscout/.env.local`). Verified live — real AI
      explanations returning from `qwen3.7-max`.
- [x] Added `QWEN_API_KEY`, `QWEN_BASE_URL`, `QWEN_MODEL` to the **Vercel** project env
      (Production) and removed the obsolete `DASHSCOPE_API_KEY`. Verified in production —
      real Qwen explanations returning from the deployed site.
- [ ] Prepare a funded Base Sepolia wallet for `REGISTER_PRIVATE_KEY` (needs testnet ETH
      for gas) and decide the `FEE_ADDRESS` (where USDC earnings settle).
- [ ] Confirm `supported_intents` enum values with Telegraph docs (blocker #3).
- [ ] Optional cleanup: delete unused `public/arcadian-{1..4}.png` mockups; fix stale
      comment in `route.ts:21`.

### Aug 17 (registration day)
- [ ] Register on the Telegraph hackathon site (early access + private Discord).
- [ ] Final deploy: `vercel --prod` (ensure YAML is live at the registered URL).
- [ ] Sanity-check: `curl https://arcadian-gamma.vercel.app/telegraph-risk.yaml` returns 200
      and `curl .../api/health` returns ok.
- [ ] Register the miner on-chain:
      `REGISTER_PRIVATE_KEY=0x... FEE_ADDRESS=0x... npm run register`
- [ ] Save the returned `registrationId` + tx hash (add to this file).

### Post-registration (demo & marketing)
- [ ] X posts with live scorer demos showing contrasting scores:
      Aave v3 (LOW) vs Curve (HIGH, July 2023 $70M hack) vs unknown fork (VERY_HIGH).
- [ ] Submit project on hackathon platform. Draft copy already written:
      - **Description:** "Arcadian is a DeFi Risk Score Miner for Telegraph — wraps live
        DefiLlama (pools, hacks, protocols) and CoinGecko into a verifiable 0–100 risk
        score, six auditable components. Agents query it for ground-truth risk before
        acting; every score reproducible against public data. Deployed on Vercel,
        registered on Telegraph's Base Sepolia MinerRegistry."
      - **Checkboxes:** Financial Data + On-chain Analytics (+ optionally AI/LLM Inference).
- [ ] (Optional) Implement a real in-app x402 handler (return 402 + verify payment) if you
      want the payment claim true at the app layer instead of relying on Telegraph's gateway.

---

## 5. Quick reference

```bash
# Local dev
cd /home/greyw0rks/arcadian
npm run dev            # http://localhost:3000
npm run build          # production build check
vercel --prod          # deploy (alias: arcadian-gamma.vercel.app)

# Register on Telegraph (Base Sepolia)
REGISTER_PRIVATE_KEY=0x... FEE_ADDRESS=0x... npm run register
```

- **MinerRegistry (Base Sepolia):** `0x122396E8602BEed349434AA6E83123E7dD97F5A0`
- **Min price:** $0.01 USDC / query (`10_000` 6-dec units)
- **Qwen endpoint:** `https://token-plan.ap-southeast-1.maas.aliyuncs.com/apps/anthropic`
  · model `qwen3.7-max` · Anthropic-compatible, called via `@anthropic-ai/sdk`.
  Key/URL/model live in `.env.local` (gitignored), sourced from
  `/home/greyw0rks/yieldscout/.env.local`.

### Fill in after registration
- registrationId: `________`
- register tx hash: `________`
- FEE_ADDRESS used: `________`
