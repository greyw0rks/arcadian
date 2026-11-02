# Operator walkthrough

## Current deployment

As verified October 30, the Engine uses **Telegraph's test USDC on Ethereum Sepolia**, chain **11155111**, token `0xcc194e1a843B658526D0D5C431f670028582Ae17`. Its receiver is `0x3624EB012B5E998BB57B6bE6C9Cfc9c4bc5eb99b`, token signing domain `USD Coin` / `2`. This differs from Circle faucet USDC and historical Base Sepolia funding. See [deployment inspection](../evidence/deployment-oct30.json).

Set `TELEGRAPH_NETWORK=telegraph-sepolia`. `setup:operator` creates a payer, operator token and local SQLite configuration only when `.env.local` does not already exist; it preserves older configurations. Never publish that file.

The current checkout is `/home/greyw0rks/arcadian`. Its private `.env.local` preserves the existing payer and operator token and selects the recovered journal at `.data/delivery-2026-10-30/reviews.db`. From this checkout, check the operator without spending:

```bash
npm run check:operator -- --out .evidence/operator-check.json
```

This sends no payment signature. It checks storage, wallet locks, RPC chain, funding and the unsigned challenge. Success establishes payment readiness, not provider coverage or permission for another purchase. The final October 30 check found **0.17 test USDC**, no unresolved authorizations and an unlocked wallet. Read [HANDOFF.md](../../HANDOFF.md) before a future paid run.

## Preview and verify without spending

For a new installation, run `npm ci`, `npm run setup:operator`, then `npm run dev`. Open `/desk`, enter a token contract, supported chain and positive USD notional, and select **Preview request plan**. The plan names four checks and a total ceiling; it performs no purchase.

Invalid addresses, unsupported chains, mismatched IDs, nonpositive notionals and ceilings above 0.25 USDC are refused. Fixtures are never served as live evidence.

The saved October 30 memo can be checked without a private key:

```bash
TELEGRAPH_NETWORK=telegraph-sepolia npm run verify:memo -- \
  --file docs/evidence/paid-review-reconciled-oct30.json \
  --signer 0x2c051eD5452B3630B2151203d5003b759ECBFDF1 \
  --token 0x4200000000000000000000000000000000000006 \
  --chain Base --usd 1000 --out .evidence/verification.json
```

Exit 2 is expected: the decision is `NO_DATA`, and archived observations cannot authorize a current trade. While chain/node records remain available, verification confirms three settlements totaling 0.03 test USDC and two receipts with matching signal records. Obtain the trusted signer independently of an imported memo.

## Paid runs and durable storage

A new review requires operator access and a deliberate ceiling. The default is **0.05 test USDC total**, maximum 0.25 per review, with a default daily cap of 1 USDC configured by `DESK_DAILY_LIMIT_USDC`. Keep the UUID and inspect actual evidence even when held.

For Vercel, use a shared remote `libsql://` or `https://` database in `REVIEW_DB_URL` and its `REVIEW_DB_AUTH_TOKEN`. Local SQLite is refused on Vercel. Keys and tokens stay server-side. The published preview predates October 30 changes.

## Recover an existing review

The desk saves the review ID in tab session storage before submission. After a disconnect, use **Recover review** with operator access. Recovery reads the journal, chain and existing signal records; it does not buy another answer.

**Supply known settlement transactions** accepts a hash per affected check. One transaction may cover several checks, but each authorization nonce and Transfer is verified separately. A settled request can lack a useful answer or receipt; it remains actual spend.

Unresolved authorizations retain locks/reservations. Proven expired and unused authorizations release reservations. Competing requests return `409` and `recoverRequestId`. Changing the UUID does not recover an authorization.

The authoritative journal is `.data/delivery-2026-10-30/reviews.db`; the old `.data/reviews.db` is a historical copy and must not be used for purchases. Stop payer processes before any future migration and compare logical database fingerprints before replacing state. The original delivery bundle and the pre-restoration backup are preserved outside the checkout.

## Evidence and coverage

Retain exact input, policy, UUID, raw answers, requested/reported Intents, provider YAML/registration IDs, nonces, receipts, signals, settlements, confirmed/unsettled cost and timestamps. Download the signed memo; an operator signature is not validator proof.

October 30 demonstrated payment/recovery and refusal: audit routing returned 503; liquidity settled then failed with 500/upstream 502; onchain and wash answers were unrelated. See the [reproduction report](UPSTREAM_REPORT.md), [posted on bounty #85](https://github.com/telegraphprotocol/bounties/issues/85#issuecomment-6587112597) with the user's approval. Current general schemas also fail to establish token contract state and executable depth. Resolve useful coverage before seeking fresh H2 purchase proof.

Independent use, verified threats and final H2 evidence must reflect actual behavior. Synthetic checks and October activity are labeled separately. Separate miner registration still needs owner credentials, official validation and hosted matching bytes; see [the postmortem](POSTMORTEM.md).
