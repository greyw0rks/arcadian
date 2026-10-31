# Arcadian

[Remaining human steps](docs/season-ii/YOUR_NEXT_STEPS.md) · [App submission draft](docs/season-ii/SUBMISSION.md) · [Evaluator review packet](docs/reviewer-packet/README.md)

Arcadian is a **DeFi pre-trade evidence gate** for Telegraph Season II, Mission 14. It takes a token contract, trading chain and USD notional, purchases four kinds of intelligence through Telegraph, and returns a signed policy decision with evidence and measured spend.

The repository also includes the original DeFi pool research UI and a miner providing deterministic TVL and yield measurements. The current hosted Season I site is [arcadian-gamma.vercel.app](https://arcadian-gamma.vercel.app); the new desk is under development.

## Run locally

Requires Node.js 22 and npm.

```bash
npm install
npm run setup:operator
npm run dev
```

Open `http://localhost:3000/desk` and select **Preview request plan**. Preview validates the input without calling providers or authorizing payment.

Setup creates `.env.local` with a dedicated testnet payer, random operator access token and durable local SQLite file. It preserves any existing environment file. Keys and tokens stay on the server; the operator token is entered into the desk's access field for a paid review.

```bash
npm run check:operator   # reads configuration, storage, USDC balance and a v2 challenge
npm test                # policy, payment, receipts, settlement, recovery and measurements
npm run build
```

The current Engine uses **Telegraph's test USDC on Ethereum Sepolia**, token `0xcc194e1a843B658526D0D5C431f670028582Ae17`, chain 11155111. Set `TELEGRAPH_NETWORK=telegraph-sepolia`; existing `.env.local` files are preserved by setup and must be updated explicitly. This token differs from Circle faucet USDC and from the old Base Sepolia token. The default maximum is **0.05 test USDC** across four checks, with a **0.25** per-review cap and configurable **1** daily limit. Run the operator check before funding or purchasing; see [the current handoff](HANDOFF.md) for actual live results.

## Gate behavior

| Check | Telegraph Intent |
|---|---|
| Contract security | `SMART_CONTRACT_AUDIT` |
| Trading integrity | `WASH_TRADING_DETECTION` |
| Token contract state | `ONCHAIN_METRIC_VERIFY` |
| Executable liquidity | `LIQUIDITY_DEPTH_VERIFY` |

The Engine owns routing. On the current deployment the four policy families map to their exact `_GENERAL` child Intents; requests, receipts and signal records must agree on that child. The official x402 v2 SDK permits only the configured payment chain/token and capped amount. Domain and timeout are checked before signing, and the authorization is stored before submission. Legacy Base Sepolia reviews retain their original payment network for recovery.

`PROCEED` requires all four checks, matching token and chain, observations at most five minutes old, confidence at least 0.8, and required risk scores at most 20/100. Trade size must be at most 1% of reported executable USD depth. Missing or unsupported evidence returns `REVIEW` or `NO_DATA`; a current verified threat returns `BLOCK`. See [agent/policy.ts](agent/policy.ts) for the versioned policy.

Confirmed spend requires a matching USDC authorization nonce and Transfer event. Consumption receipts and recorded signals are bound to the request and kept separately from the agent's signature. A signature proves memo authorship and integrity. Trade execution stays with the operator.

## API

| Route | Purpose |
|---|---|
| `GET /api/desk` | Configuration state |
| `POST /api/desk` | Preview or create an idempotent capped review |
| `GET /api/desk?requestId=<uuid>` | Read a stored review with operator access |
| `POST /api/desk/reconcile` | Verify existing authorizations and recover a review |
| `POST /api/telegraph/measure` | Deterministic TVL or observed yield |
| `GET` / `POST /api/telegraph/risk` | Original pool research score |
| `GET /api/telegraph/universe` | Pool research chains and assets |
| `GET /api/health` | Health |

A paid review requires a UUID v4 `requestId` and `x-desk-token`. Retries with the same ID return the stored review; another request cannot spend from a wallet with unresolved authorizations. Recovery accepts an optional `transactions` map from check Intent to known settlement hash.

```json
{
  "preview": true,
  "subject": {
    "tokenAddress": "0x4200000000000000000000000000000000000006",
    "chain": "Base",
    "notionalUsd": 1000
  },
  "maximumSpendUsdc": "0.05"
}
```

The token being researched is on Base **mainnet** in this example; intelligence is purchased with Telegraph's Ethereum Sepolia **test** USDC. These networks are configured separately.

## Evaluation material

[56 synthetic liquidity preference pairs](evaluation/liquidity-depth/README.md) were submitted under `LIQUIDITY_DEPTH_VERIFY_GENERAL` and all are **eligible** as of the saved October 30 snapshot. The pool has one of five required contributors for question use. The pinned official data gate passes; 43 cases have arithmetic references and seven synthetic Mission 14 integration checks pass. Independent human review, unseen accuracy and live ranking improvement remain unverified. Run `npm run check:evaluation` to reproduce the artifact checks.

## Miner registration

The manifest advertises **`TVL_LOOKUP` and `CRYPTO_YIELD_RATE`**. TVL uses complete DefiLlama protocol or protocol-chain totals, or exact pool TVL. Yield uses exact pool APY or a disclosed TVL-weighted sample of at most five pools. Pool TVL is not executable trade depth.

Registration 401 was rejected for a string `limitations` field. Activation is event-driven; waiting for an epoch will not repair it. The local manifest fixes the shape, but the stable hosted file still needs updating. See [the postmortem](docs/season-ii/POSTMORTEM.md).

```bash
npm run check:telegraph
# After publishing and configuring owner-wallet/console credentials:
REGISTER_ID=401 npm run register                 # validate, compare bytes, simulate
REGISTER_ID=401 npm run register -- --broadcast  # send the reviewed update
```

The script requires official validation, hosted bytes matching the local manifest, a successful real measurement request and canonical Intents. It reads the confirmed new registration ID from `MinerRegistered`. `check:telegraph` requires active node status, matching hash, URL and exact Intents.

## Deploy and reproduce

The app uses Next.js 15, React 18, TypeScript, viem, official x402 v2 packages and libSQL. A Vercel paid deployment requires a shared remote libSQL/Turso database; ephemeral local storage is refused. See [the operator guide](docs/season-ii/OPERATIONS.md), [build plan](docs/season-ii/BUILD.md) and [current handoff](HANDOFF.md).

The official H2 deadline is **December 1, 2026, 23:59 UTC** (December 2, 00:59 Lagos). October preparation and testnet activity are separate from H2-period evidence. See [the score plan](docs/season-ii/SCORE_PLAN.md).
