# Arcadian — Handoff & Wrap-up

**DeFi Risk Score Miner for Telegraph Protocol Season I**
Status: **registered with corrected intents 2026-08-31; awaiting first scored epoch**
Last updated: 2026-08-31

---

## 0. Read this first — status

Arcadian is live and registered on Telegraph as miner **2847 /
`arcadian-defi-risk`**. It scored **0.000, rank 11 of 11** every epoch from
Aug 23 to Aug 31 under the wrong intents; the cause was found and fixed, and it
was **re-registered on 2026-08-31 19:38 UTC** with corrected intents, the right
registry, and a manifest URL that can't drift (§7).

**What to check next:** the explorer re-reads miner configs at the epoch
boundary, so the fix isn't reflected until then. After 2026-08-31 23:02 UTC, run
the curl in §5 and confirm:
- `supported_intents` → `FINANCIAL_DATA, TVL_LOOKUP, FRAUD_DETECTION`
- `yaml_url` → `https://arcadian-gamma.vercel.app/telegraph-risk.yaml`
- `scores` moves off the `TASK_COMPLETION` board onto the three real ones

If it still reads `TASK_COMPLETION` an epoch later, the indexer did not pick up
the re-registration — that's the thing to chase, not the code.

### Why the score was 0 — two causes, both now fixed

1. **Wrong intents.** The Aug 23 registration declared `TASK_COMPLETION`, so
   Arcadian was competing against `bedrock-kimi`, `litellm`, `gemini` and other
   chat-completion miners, graded on a task it does not do. Its actual peers are
   `FINANCIAL_DATA` (8 miners), `TVL_LOOKUP` (10) and `FRAUD_DETECTION` (15).
   The earlier note that these intents "aren't deployed on-chain yet" was
   **wrong** — verified by simulating `registerMiner` against the live registry:
   all three succeed, while `NOT_A_REAL_INTENT` and lowercase `financial_data`
   revert. The catalog is on-chain and validated.

2. **The router sends questions, not parameters.** Telegraph routes
   natural-language questions to miners. Arcadian only accepted
   `chain`/`asset`/`protocol`, so every routed request hit the 400 path. The
   pattern is visible in the leaderboard: `sarzops-transaction-risk`,
   `telegraph-sentinel` and `txlens` all take a free-text `query` and answer in
   prose, and all three score ~1.00 on `FRAUD_DETECTION`, while param-only
   miners cluster at 0.

Both are fixed and deployed. `lib/nlq.ts` extracts chain/asset/protocol from a
question against the live DefiLlama universe and classifies the intent; every
response now leads with `signal`, a number-first sentence, which is what a
validator grades. `signal_mapping.label_field` is `signal` to match.

### Also corrected: the registry address

`scripts/register-miner.ts` pointed at `0x122396E8…`, but Arcadian's own
successful registration went to **`0x5a2324aA18613FAD4e44bDF0d6c73Ec1f6D87ff8`**
— that is the registry the explorer indexes (400 miners, continuous traffic).
`0x122396E8…` still accepts registrations (55 miners) but is not read by the
network, so registering there would have been a silent no-op.

---

## 1. Session log — 2026-08-31

**Wrap-up pass.** Closed the July blockers, diagnosed the score-0 problem above,
fixed it, and re-registered on-chain at 19:38 UTC (§7).

**Blockers resolved**
- `YAML_URL` mismatch (old blocker #1) was already fixed in `638ac11`.
- **Served manifest was stale.** Commit `cccd545` changed
  `public/telegraph-risk.yaml` in git but was never deployed, so the file being
  served was 8 days behind the repo. Deployed; hosted now byte-matches, and
  `npm run register` refuses to run if it ever drifts again.
- Registry address and intents corrected (above) — the real content of old
  blocker #3.
- Stale 4-component doc comment in `route.ts` (old blocker #4) was already fixed.
- Deleted four unused `public/arcadian-*.png` mockups.

**Bug 1 — exploits attributed to the wrong protocols.** `matchHacks` split a
slug on `-` and substring-matched any token over 3 chars against hack names, so
`centrifuge-protocol` matched all 47 DefiLlama hacks named "<something>
Protocol" — Zunami, Origin, Maya — and took the maximum 20/20 exploit penalty
for other projects' incidents. `"aave"` also matched "Aavegotchi". Fixed with a
generic-token stoplist, version-suffix stripping, and word-boundary matching;
slugs made *only* of generic words (`yield-protocol`) fall back to a whole-phrase
match. Centrifuge went from 21/100 to 1/100.

**Bug 2 — components didn't add up to the score they explained.** `scoreMany`
TVL-weighted `risk_score` but plain-averaged the six components and unioned all
pool flags. A $57M protocol reported `liquidity_depth: 9` and "TVL <$1M — low
liquidity" beside a headline score of 1, and the AI explanation dutifully
described capital flight the score didn't reflect. Components now use the same
TVL weights; pool-level flags from pools under 5% of protocol TVL are dropped
unless every pool shares them, so protocol-wide signals survive. Verified in
production: components sum to the reported score (±1 rounding).

**Bug 3 — generic protocol brands hijacked questions.** DefiLlama has projects
named `the-vault-liquid-staking` and `yield-yak-aggregator`, so brand-matching on
"the" or "yield" answered *"What is the weather in Paris?"* with a Solana staking
pool. Generic brand words now only match when the full slug is written out, and
that question correctly 400s with a hint.

**Tests.** `npm test` — 19 tests (node:test via tsx) across `lib/nlq.test.ts` and
`lib/sources.test.ts`, including regressions for all three bugs above.

**Verified in production** at https://arcadian-gamma.vercel.app — health 200,
manifest byte-identical to repo, seven natural-language questions (including one
correctly refused), ranked and direct modes over both POST and GET, `universe`,
and the 400/404 paths. `tsc --noEmit`, `npm test`, `next build` all green.

---

## 2. What Arcadian is

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

## 2b. Tech stack

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
  nlq.ts                       parseQuestion — free text → chain/asset/protocol + intent
  nlq.test.ts                  extraction + intent-classification tests
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

Every response leads with **`signal`** — a number-first sentence. Telegraph
grades the prose answer, not the JSON, so that field is the product.

**Question mode — what the Telegraph router actually sends.**
```
POST /api/telegraph/risk  { "query": "Is Aave safe for USDC on Base?" }
→ { signal, intent, resolved_via:"question", extracted:["chain=Base","protocol=aave-v3","asset=USDC"],
    risk_score, verdict, apy_bps, tvl_k, confidence, components, flags, explanation }
→ 400 { error, hint, chains[] }             // question named no chain/asset
```
`lib/nlq.ts` resolves chain, asset and protocol against the live DefiLlama
universe (nothing hardcoded) and classifies the question into one of the three
declared intents. An extracted protocol is treated as a guess: if it yields no
pools but the question named a chain and asset, it falls back to ranked mode
rather than 404ing. Explicit params are the caller's assertion and still 404.

**Discovery mode — no protocol slug required; asset is free text.**
```
POST /api/telegraph/risk
{ "chain": "Base", "asset": "USDC" }        // limit optional, default 6, max 8
→ { mode:"ranked", signal, safest, ranked[], protocols_scanned, pools_scanned,
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
→ { mode:"single", signal, risk_score, verdict, apy_bps, tvl_k, ... }
```

All three modes work over GET too: `?query=`, `?chain=&asset=`, `?protocol=`.

**Picker data.** `GET /api/telegraph/universe?chain=Base → { chains[], assets[] }`

On-chain integers: `risk_score`, `apy_bps` (APY×100), `tvl_k` (TVL/1000), `confidence`.
On-chain strings: `verdict`, `signal`.

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
   --prod` → *then* register. The script now fetches the hosted file and refuses
   to run unless it byte-matches, so this can no longer go wrong silently.
2. **Deploy is not automatic on commit.** Commit `cccd545` changed the manifest
   in git and the served file stayed stale for 8 days. There is no GitHub-App CD
   on this project — `vercel --prod --yes` is the deploy.
3. **The registry is `0x5a2324aA18613FAD4e44bDF0d6c73Ec1f6D87ff8`**, not
   `0x122396E8…`. Both accept `registerMiner`, but only the former is indexed by
   the explorer and takes network traffic. Arcadian's live registration is there.
4. **Intents are validated on-chain.** `FINANCIAL_DATA`, `TVL_LOOKUP` and
   `FRAUD_DETECTION` all simulate successfully; `NOT_A_REAL_INTENT` and
   lowercase `financial_data` revert. `SUPPORTED_INTENTS` in the script must equal
   `semantics.supported_intents` in the YAML — both are now those three.
5. **Manifest id `2847`** — avoids the collision with `veridex-contract-risk-miner`
   at 1001.
6. **Re-registering the same slug replaces the config**, and must come from the
   owning wallet `0x634E8E643fb9a9919671824B48402D7AD93F321f`.

Local manifest hash (to be registered):
`e405b0f850a1a14e8d112ca5d26c539560bf42be106e87287fe4e5584fb0fe51`

---

## 4. TODO — what's left

### Now
- [ ] After the 2026-08-31 23:02 UTC epoch boundary, confirm the explorer shows
      the new intents and `yaml_url` (§0), and watch for the first non-zero score.
- [ ] Submit on the hackathon platform. Draft copy in §6.

### Nice to have
- [ ] X posts with contrasting live demos: Aave v3 Base·USDC (14/100 LOW) vs
      aerodrome-slipstream Base·WETH (39) vs an unaudited fork (VERY_HIGH).
- [ ] Optional: real in-app x402 handler (return 402 + verify payment) so the
      payment claim is true at the app layer, not only via Telegraph's gateway.
- [ ] Optional: extend test coverage to `scoreMany` TVL weighting.

---

## 5. Checking the live registration

```bash
# What the network thinks Arcadian is (intents, base_url, scores, activation):
curl -s https://explorer.telegraphprotocol.com/api/integrations \
  | python3 -c "import json,sys;print(json.dumps([m for m in json.load(sys.stdin) if m['slug']=='arcadian-defi-risk'],indent=1))"

# Where it ranks, per intent:
curl -s https://explorer.telegraphprotocol.com/api/leaderboard/miners

# Epoch clock (~9h epochs; activation lands on a boundary):
curl -s https://explorer.telegraphprotocol.com/api/epoch
```

These three endpoints are the only working Telegraph API surface found —
`api.telegraphprotocol.com` returns 404 for everything except `/`, and both
`guide.` and `hackathon.` subdomains 403 automated fetches.

---

## 6. Submission copy (ready to paste)

**Description:** "Arcadian is a DeFi Risk Score Miner for Telegraph. Ask it a
question in plain language — *'Is Aave safe for USDC on Base?'* — and it answers
with a verifiable 0–100 risk score (lower = safer) across six auditable
components built from live DefiLlama pools, 1,246 real hack records, protocol
audit/age metadata, and CoinGecko reward-token data. Every answer leads with a
number-first sentence and names its sources, and every score is reproducible
against public data. When no protocol is named it discovers every protocol
offering that asset on that chain and ranks them safest-first. Deployed on
Vercel, registered on Telegraph's Base Sepolia MinerRegistry."

**Track checkboxes:** Financial Data + On-chain Analytics (optionally AI/LLM Inference).

---

## 7. Quick reference

```bash
cd /home/greyw0rks/arcadian
npm run dev            # http://localhost:3000
npm test               # 19 unit tests
npm run build          # production build check
vercel --prod --yes    # deploy (serves arcadian-gamma.vercel.app)

REGISTER_PRIVATE_KEY=0x... FEE_ADDRESS=0x... npm run register
```

- **MinerRegistry (Base Sepolia):** `0x5a2324aA18613FAD4e44bDF0d6c73Ec1f6D87ff8`
- **Min price:** $0.01 USDC / query (`10_000` 6-dec units)
- **Qwen endpoint:** `https://token-plan.ap-southeast-1.maas.aliyuncs.com/apps/anthropic`
  · model `qwen3.7-max` · Anthropic-compatible via `@anthropic-ai/sdk`.
  Key/URL/model in `.env.local` (gitignored), sourced from
  `/home/greyw0rks/yieldscout/.env.local`.

### Registration record

**Current registration — 2026-08-31, the corrected one:**
- tx: `0x598de724cb966d7493da4dfa868cbbbf4d6b59124440806a93d5a7e20494b4c5`
- block 46218396, status SUCCESS, `registrationId` 401
- registry: `0x5a2324aA18613FAD4e44bDF0d6c73Ec1f6D87ff8`
- from / owner wallet: `0x634E8E643fb9a9919671824B48402D7AD93F321f`
  (key lives as `DEPLOYER_PRIVATE_KEY` in `/home/greyw0rks/goodquest/.env` —
  it is a Celo **mainnet** key with real funds, so read it from the file, never
  paste it)
- FEE_ADDRESS: `0xB9e3A2D811729C11F64313F59922Ab37Afa52010`
- yaml_url: `https://arcadian-gamma.vercel.app/telegraph-risk.yaml`
- yaml hash: `0xe405b0f850a1a14e8d112ca5d26c539560bf42be106e87287fe4e5584fb0fe51`
- intents: `FINANCIAL_DATA, TVL_LOOKUP, FRAUD_DETECTION`
- first non-zero epoch score: `________` ← still to observe

**Superseded — 2026-08-23, the one that scored 0:**
- tx: `0xe0fee59f8d9c347e2c61f54a5452d46d4c953c25b7b7b87644d3a159460bc124`
- intents: `TASK_COMPLETION` ← the problem
- yaml_url: `https://gateway.pinata.cloud/ipfs/QmUBTdRLxC1V3GaxHTr7igHskQoxN9ChLAJRFGSqNac5AW`
- yaml hash: `0xf3ed5c4d830bf43ac2220bf9aa0ff22f3c0108d276939771a7db95d34d7bf958`

That registered `yaml_url` was an IPFS gateway copy, not the repo file, and the
two had already diverged (formatting, `required` block placement). The current
registration points at the served file, so the hash and what nodes fetch can no
longer drift.


