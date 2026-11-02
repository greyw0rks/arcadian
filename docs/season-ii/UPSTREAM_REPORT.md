# Provider report: settled liquidity request failed; other routes returned unrelated evidence

Posted on November 2 with the user's approval: [Telegraph liquidity bounty #85](https://github.com/telegraphprotocol/bounties/issues/85#issuecomment-6587112597).

## November 2 follow-up

Read-only catalogue and direct-provider probes were refreshed on November 2. No new payment was signed or submitted. The public audit leaderboard now has 13 ranked providers. Arcadian's 56 evaluator rows remain eligible; the liquidity pool now has 136 rows from two contributors, below the five-contributor minimum.

VerifyWire's direct endpoints return subject-specific contract-call and wash-log data, and a WETH/USDC quote on Base. The raw probes are preserved in `docs/evidence/provider-probes-nov02.json`; these are direct reads, not successful paid Engine routing. The contract call's default block is the literal `latest`; the 120-block wash request returned only eight scanned blocks; the quote returns a symbol pair and base-asset size, not contract-bound executable USD depth. The quote's `fee_tier_bps: 3000` is also inconsistent with its prose describing a 0.30% tier (30 basis points).

The live Engine response schemas still describe `ONCHAIN_METRIC_VERIFY_GENERAL` as pinned native wallet balance and `LIQUIDITY_DEPTH_VERIFY_GENERAL` as pool reserve value. Please identify the supported Engine path for block-anchored token-contract reads and size-bound execution evidence, and clarify recovery/accounting for the settled liquidity failure below. Newly advertised coverage is not evidence that the previous paid-routing failure has been resolved.

The app is now available at https://arcadian-gamma.vercel.app/desk with shared remote review storage. The original transactions, signed memo and independent verifier remain sufficient to reproduce the October failure without another purchase.

**Original observations: October 30, 2026.** This records observed behavior; it does not assert a refund entitlement or identify a cause beyond the returned errors.

**October 31 metadata refresh:** [public catalogue evidence](../evidence/provider-coverage-oct31.json) lists 12 audit, 12 wash, 35 onchain-metric and 32 liquidity providers as active. The fetched leaderboard has no rows for these four child Intents. The previously selected Bitcoin-metrics and token-boost providers remain listed. VerifyWire advertises contract view calls and wash heuristics; its liquidity schema advertises a named exchange pair rather than token-contract-bound executable USD depth. These declarations do not demonstrate successful Engine routing or results. No provider endpoint or paid Engine replay was called during this refresh. Please identify a supported route/schema before another paid review.

## Environment and request

- Engine: `https://devnode.telegraphprotocol.com/engine/v1/ask`, official x402 v2 exact payments.
- Payment chain: Ethereum Sepolia 11155111; USDC `0xcc194e1a843B658526D0D5C431f670028582Ae17`; receiver `0x3624EB012B5E998BB57B6bE6C9Cfc9c4bc5eb99b`.
- Payer: `0x2c051eD5452B3630B2151203d5003b759ECBFDF1`.
- Review: `9706dc68-b433-4283-bd6f-07ba7fcf42ca`, 12:38:01.528–12:38:24.149 UTC (22.621 seconds wall-clock, including payments and journal work).
- Subject: token `0x4200000000000000000000000000000000000006`, Base chain 8453, proposed USD 1,000 exposure. The research chain and payment chain differ deliberately.
- Calls explicitly name the four `_GENERAL` Intents; exact query strings and raw errors are in the [saved review](../evidence/paid-review-reconciled-oct30.json).

Total ceiling was 0.05 test USDC; 0.03 settled in three transactions. [Independent verification](../evidence/verified-memo-oct30.json) confirms all three, two receipts/signals and a held `NO_DATA` decision. Zero authorizations remain unresolved. No repeated paid request was needed for reconciliation.

## Paid liquidity failure

Request: `LIQUIDITY_DEPTH_VERIFY_GENERAL`, executable USD depth for the exact subject and proposed notional. The query explicitly distinguishes executable depth from TVL.

Settlement: [0xb7c4c2c39b9cb57f48149e41517ac1a185fa8492f4c1106847a0666e2ea47690](https://sepolia.etherscan.io/tx/0xb7c4c2c39b9cb57f48149e41517ac1a185fa8492f4c1106847a0666e2ea47690), 10,000 atomic units (0.01 USDC), block 12026724.

Authorization nonce: `0x154a2fac6e9559ceec9ac7ed263bc646d1f42bb35f42f23b190a1cca569f69cc`.

The Engine returned HTTP 500 with `upstream call failed: status 502` and nginx HTML. No serving-provider identity, consumption receipt or answer was returned. Expected operator-facing behavior: retain a query/payment correlation and documented recovery or failure-accounting route when payment has settled but the upstream fails. Clarification is needed on the supported recovery procedure; blindly retrying would create another purchase.

## Unrelated routed answers

| Requested Intent | Provider identity | Settlement | Returned evidence |
| --- | --- | --- | --- |
| `ONCHAIN_METRIC_VERIFY_GENERAL` | YAML ID 71008; registration 3626; `ocm-blockchain-stats` | [0x5cb979…d48d46](https://sepolia.etherscan.io/tx/0x5cb979951a41dccfa44d2ceb28ba88849c7f0b29419b47946ff1efed3de48d46) | Unrelated Bitcoin HTML; shaped balance fields null. |
| `WASH_TRADING_DETECTION_GENERAL` | YAML ID 80004; registration 4277; `wash-dex-boost` | [0xc4235f…2fcc67f](https://sepolia.etherscan.io/tx/0xc4235f0773ca79212c366efb0b1f78801cc2bba192c31a2e5a66083bd2fcc67f) | Token boosts unrelated to the target contract's trading integrity. |

Raw signal records:

- [Onchain metric](https://devnode.telegraphprotocol.com/engine/v1/signal/0xc3f4f3665a778c5c7a11cf220df0943c2d71a3ce8b0691cb257cd8adab87a8d9)
- [Wash trading](https://devnode.telegraphprotocol.com/engine/v1/signal/0x04910c476a2261e173495485164e4f02b93bae8fcfec90534ea16ff5d5148d45)

Registry/catalogue matching resolves the distinct YAML and receipt IDs; both receipts and signal-record bindings verify. Arcadian parses the raw signal response and refuses to treat these as subject-specific findings. These are delivered, paid responses with insufficient task evidence.

Contract audit separately returned HTTP 503, `could not route this question now, try again later`, before any payment.

## Schema compatibility questions

The [captured live schemas](../evidence/intent-schemas-oct30.json) expose two app-integration gaps:

1. `ONCHAIN_METRIC_VERIFY_GENERAL` describes a wallet's native balance at a pinned block. Arcadian requested token `totalSupply()` calldata `0x18160ddd`, which is outside that current schema. Which Intent supports block-anchored contract reads? The unrelated Bitcoin response is recorded without claiming our requested operation fits the current child schema.
2. `LIQUIDITY_DEPTH_VERIFY_GENERAL` defines `liquidity_usd` as pool reserve value. Which supported path supplies trade-size executable depth, fees and slippage constraints? Pool reserve value alone cannot satisfy this gate.

## Reproduction without another purchase

Run the read-only verifier in [OPERATIONS.md](OPERATIONS.md) against the saved memo. Inspect the linked transactions and signal records, then compare exact queries with raw answers and schemas. The archive includes all local reproduction material; external chain/node availability still applies. Paid replay should wait for a proposed routing or upstream fix and an explicit spending decision.
