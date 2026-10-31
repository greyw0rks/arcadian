# Arcadian liquidity-depth evaluation material

**56 synthetic development pairs submitted October 30, 2026; all 56 are now eligible.** Telegraph accepted them with zero duplicates or rejections, initially admitted them, then included them in the epoch-1609 active snapshot. This is evaluation material, not a trained adapter, an independently reviewed benchmark or evidence of ranking improvement.

Intent: `LIQUIDITY_DEPTH_VERIFY_GENERAL`. User-selected contributor: `0x2c051eD5452B3630B2151203d5003b759ECBFDF1`. The node accepted the submission signature on Ethereum Sepolia, chain **11155111**.

Submitted JSONL: **48,124 bytes**, SHA-256 `f0b0a0e97b21d92aafab718a5641b00d1b21ab7aa302f9ee4a252a94f847bad5`.

## Reproduce

From the repository root with Node 22 and Python 3:

```bash
npm ci
npm run check:evaluation
npm run test:evaluation
npm run check:liquidity-impact
```

The combined check verifies export reproducibility, arithmetic, review positions and matching artifact hashes. It checks the saved official audit; rerun that audit with:

```bash
git clone https://github.com/telegraphprotocol/telegraph-wasm-baseline.git /tmp/arcadian-adapter-kit
git -C /tmp/arcadian-adapter-kit checkout 5fa5d68bbcf76aaa2093c5d0578f53462bc0e36e
uv venv /tmp/arcadian-eval-venv
uv pip install --python /tmp/arcadian-eval-venv/bin/python numpy==2.3.3
/tmp/arcadian-eval-venv/bin/python evaluation/liquidity-depth/check-official.py --trainer /tmp/arcadian-adapter-kit/wide_runtime/train_adapter.py
```

The wrapper pins source SHA-256 `537174609914de0a23a72c488fc508bad63cf4982949019e57540864c9c3b3c3`. It loads no model and changes no thresholds or seeds. The pinned kit uses `wide_runtime`; the older web guide's `float_runtime` commands are stale.

## Actual official audit

| Check | Observed | Required |
| --- | ---: | ---: |
| Distinct rejected answers | 100% | ≥80% |
| Largest repeated-answer share | 1.79% | ≤2% |
| Character-length shortcut | 57.14% | ≤65% |
| Exact rejected-answer leakage | 0% | ≤10% |
| Answer-only word probe, official five-seed mean | 65% | ≤65% |

The gate **passes**, but the style probe sits exactly at its boundary. This is limited development evidence, not robust generalization or training readiness. The separate word-length heuristic scores 50% with half credit for ties.

The original 24 cases failed the size/share and surface checks. Expansion to 56 initially yielded a 67.5% surface probe. Ten supported-evidence cases were then revised to penalize unjustified refusals, balancing sensible caution with recognition of sufficient evidence. The resulting audit passes at 65%. Both prior versions and failures are preserved in `history/`; no lucky seed or lower threshold was selected.

## Coverage and reference calculations

The material spans **11 families**: order books (8), reference evidence (5), AMM reserves (7), units (8), freshness (3), identity (1), routing (6), fees (5), slippage (4), concentrated liquidity (3) and execution constraints (6).

Cases cover VWAP, price bands, exact-output swaps, integer rounding, fee scales, shared routes, tick crossings, RFQ expiry/taker/size limits, paused venues and supported firm quotes. Every market and observation is invented and self-contained. Provenance remains `source_kind: synthetic`, which Telegraph treats as unverified. No historical-source or human-attestation claim is made.

`reference-calculations.py` calculates **43 cases** with Decimal arithmetic; new numeric cases carry expression trees, expected values and tolerances. Thirteen reasoning cases remain listed separately. Reviewers must still compare the assumptions, prose and calculations; arithmetic checks are not automatic semantic validation.

`mission-impact.json` records **7/7 synthetic integration checks** using Arcadian's production parser and policy. TVL substitution, wrong chain, stale data, insufficient shared depth, metadata instructions and raw quantities without known units hold the trade. A supported-depth control proceeds. Other checks and payment flags are fixtures. This demonstrates the application's evidence boundary, not real purchases, an incumbent comparison or measured network improvement.

## Independent review

Give a DeFi reviewer `blind-review.json` and `review-template.json` before the labeled source. Positions are balanced **28 A / 28 B**. Record A, B, tie or invalid, rationale, identity, project relationship and whether labels were consulted.

```bash
node evaluation/liquidity-depth/review.mjs --review /path/to/completed-review.json
```

The tool checks hashes and IDs and reports disagreements and missing cases. Identity/independence are self-reported, and label agreement is not objective accuracy. **No independent human review has been recorded.** This public development corpus is not a secret test set. Future evaluation needs a larger reviewed corpus and separately authored private challenges, with related scenario/source families kept together in splits.

## Submitted evidence and next states

- `submission-request-2026-10-30.json`: selected contributor, chain, nonce, exact message and body hash.
- `submission-response-2026-10-30.json`: signed HTTP 200; 56 accepted and initially admitted.
- `submission-rows-2026-10-30.json`: all 56 individual row hashes, case IDs, eligible states and unverified synthetic provenance.
- `pool-status-2026-10-30.json`: eligible pool at epoch 1612; active snapshot `dbc273c044fe413ea05409468943d73c7a9b7f1991eed85b36c115d0153dacda`, activation epoch 1609, 27 qualification / 29 ranking rows, one eligible contributor.
- `submission-rows-admitted-2026-10-30.json` and `pool-status-admitted-2026-10-30.json`: initial admission snapshots, retained separately.

The first transport attempt stored no rows; this was checked before retrying with a fresh nonce. Submission spent no tokens.

`submission.mjs` prepares exact JSONL/message/request files for an explicit contributor and chain. `upload.mjs` checks their hashes, defaults to a dry run and refuses automatic replay after an uncertain attempt. It uses `EVALPOOL_PRIVATE_KEY`, or the application key only with explicit `--use-agent-payer`.

```bash
node evaluation/liquidity-depth/submission.mjs --submitter YOUR_ADDRESS --chain-id 11155111 --out /tmp/new-eval-packet
node evaluation/liquidity-depth/upload.mjs --packet /tmp/new-eval-packet
# For a new contribution only; the current 56 rows are already submitted:
node --env-file=.env.local evaluation/liquidity-depth/upload.mjs --packet /tmp/new-eval-packet --send
```

Check [contributor rows](https://devnode.telegraphprotocol.com/api/evalpool/submissions/mine?submitter=0x2c051eD5452B3630B2151203d5003b759ECBFDF1&intent_id=LIQUIDITY_DEPTH_VERIFY_GENERAL) and [pool status](https://devnode.telegraphprotocol.com/api/evalpool/status?intent_id=LIQUIDITY_DEPTH_VERIFY_GENERAL) for current state. Eligibility is confirmed, but question use requires **five independent contributors**; this submission supplies one. The active snapshot alone does not establish use in a ranking. Bounty #85 requires eligibility for its /submit step; H2 material qualification has a separate rubric and can precede activation. No bounty comment, H2 submission or award is claimed.
