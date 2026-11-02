# Liquidity evaluation material — submission draft

**Unsent H2 draft.** The material upload is complete; this document is not a bounty comment, competition entry or award claim.

Arcadian contributes 56 synthetic preference pairs for `LIQUIDITY_DEPTH_VERIFY_GENERAL`, measuring whether an answer distinguishes executable trade depth from reserve value, stale or unbound observations, incorrect units, shared routes and execution constraints. The intended user is a DeFi trading agent deciding whether evidence can support a proposed exposure.

Contributor: `0x2c051eD5452B3630B2151203d5003b759ECBFDF1`. Submitted October 30, 2026 on signing chain 11155111. All 56 rows are eligible; zero duplicates or rejections. JSONL: 48,124 bytes, SHA-256 `f0b0a0e97b21d92aafab718a5641b00d1b21ab7aa302f9ee4a252a94f847bad5`.

The [material directory](../../evaluation/liquidity-depth/README.md) contains 11 scenario families, 43 executable arithmetic references, 13 reasoning cases, balanced blind-review packets, versioned failed iterations, pinned official audit output and signed submission evidence. The official audit passes with an answer-only probe of 65%, exactly its boundary. This is limited development evidence, not robust generalization.

[Seven synthetic impact checks](../../evaluation/liquidity-depth/mission-impact.json) exercise Arcadian's production parser and policy: TVL substitution, wrong chain, stale data, insufficient shared depth, metadata instructions and unspecified units hold the trade; a supported-depth control proceeds. Other check/payment inputs are fixtures. These checks demonstrate application boundaries, not live routing improvement or an independently measured baseline gain.

The [October 30 network snapshot](../../evaluation/liquidity-depth/pool-status-2026-10-30.json) contains 56 rows, one contributor, 27 qualification / 29 ranking rows, activation epoch 1609 and corpus version `dbc273c044fe413ea05409468943d73c7a9b7f1991eed85b36c115d0153dacda`. The [November 2 metadata check](../evidence/provider-coverage-nov02.json) reports 136 eligible pool rows and two contributors, and [all 56 Arcadian rows remain eligible](../evidence/evaluator-rows-nov02.json). Question use requires five contributors. Snapshot existence does not prove actual use in rankings.

## Reproduce

```bash
npm ci
npm run check:evaluation
npm run test:evaluation
npm run check:liquidity-impact
```

Follow the material README to rerun the source-pinned official Python audit. Give an independent DeFi reviewer the unlabeled packet and template before disclosing labels. No independent human review, trained adapter, private unseen benchmark or network-performance gain is claimed. Synthetic provenance remains unverified on the node.

Before formal H2 submission, include independent reference review, a current network-state snapshot, a public reproducible source revision and the actual demonstration. Disclose the October preparation date and confirm any event-period contribution requirements. See [the score plan](SCORE_PLAN.md) for the separate validity threshold and missing evidence. Bounty #85 is unfunded and has a separate claim/submit process; no comment has been posted.
