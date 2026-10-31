# Arcadian and Telegraph Early Beta

Verified October 29, 2026 against the live bounty board and Anjoman guides updated October 27. The user supplied the early-beta announcement ahead of H2's November 1 kickoff.

## Recommended first contribution

Contribute evaluation material for **liquidity-depth verification**, beginning with [bounty #85](https://github.com/telegraphprotocol/bounties/issues/85). Arcadian's gate already treats missing executable depth, stale observations and wrong-chain results as insufficient evidence. Evaluation pairs can help the network distinguish useful answers from plausible answers that conflate TVL, book depth, marginal price and trade-size execution.

Updated October 30: [56 synthetic preference pairs](../../evaluation/liquidity-depth/README.md) were signed and submitted using the user-selected payer wallet. All 56 are now **eligible**, with no duplicates or rejected rows. The official data gate passes with a 65% surface probe, exactly at its limit. The package includes 43 arithmetic references, a balanced review packet, seven synthetic integration checks and versioned prior failures. No model has been trained or independently evaluated, and no human review is claimed.

Keep the existing Apps & Agents / Mission 14 build as the main project. This preparation adds an evaluator contribution; it does not replace autonomous purchase proof, provider coverage, consumption receipts or independent adoption. The October 29 rules explicitly allow entries in multiple tracks when each is a real, distinct contribution. See [the score and evidence plan](SCORE_PLAN.md) for the verified evaluator rubric and separate app priorities.

## Verified opportunities

Every issue below was GitHub-open and labeled `status:open` and `reward:unfunded` when checked. Recheck before claiming.

| Issue | Exact material Intent | Reuse from Arcadian |
| --- | --- | --- |
| [#85 Liquidity depth](https://github.com/telegraphprotocol/bounties/issues/85) | `LIQUIDITY_DEPTH_VERIFY_GENERAL` | Executable depth vs TVL, trade size, units, freshness, chain binding. Start here. |
| [#87 Onchain metrics](https://github.com/telegraphprotocol/bounties/issues/87) | `ONCHAIN_METRIC_VERIFY_GENERAL` | Block-anchored contract reads, units, log scope, incorrect subject. |
| [#83 Wash trading](https://github.com/telegraphprotocol/bounties/issues/83) | `WASH_TRADING_DETECTION_GENERAL` | Incomplete windows, heuristic confidence, affiliated flows vs ordinary transfers. |
| [#128 Contract audit](https://github.com/telegraphprotocol/bounties/issues/128) | `SMART_CONTRACT_AUDIT_GENERAL` | Source/bytecode findings, scoped claims, current proxy implementation. |

Uploads use the exact child Intent named in each issue. Evaluator adapters register on its family prefix, e.g. `LIQUIDITY_DEPTH_VERIFY`. October 30 live Engine inspection independently established that providers now register on `_GENERAL` children and the family endpoints have zero miners. The app maps its logical policy checks to those exact children on the new deployment; legacy reviews preserve their original bindings.

## Material first, adapter later

The [material guide](https://anjoman.ai/docs/scoring/contribute-evaluation-data) accepts JSONL preference pairs, ground truths and graded exemplars. Questions for judgment/hybrid evaluation need a pool with at least five contributors before use. Truth sources for deterministic or hybrid reference values are a separate row shape and do not have that contributor minimum.

For these pairs, use self-contained questions with believable, distinct wrong answers and similar answer lengths. Label generated data honestly. Rows progress from quarantine through admission to eligibility at an epoch freeze; HTTP success and initial acceptance are not eligibility evidence.

The [adapter guide](https://anjoman.ai/docs/scoring/train-a-scoring-adapter) uses the official [telegraph-wasm-baseline kit](https://github.com/telegraphprotocol/telegraph-wasm-baseline): preference data → ModernBERT/LoRA → float32 ONNX → baked WASM → package validation → hosted module and registration. Training needs a larger, diverse dataset and preferably a GPU. The guide estimates roughly 3 GB disk per Intent and a roughly 574 MB baked module. An ordinary TypeScript scoring function is not that adapter.

The current kit at commit `5fa5d68bbcf76aaa2093c5d0578f53462bc0e36e` uses `wide_runtime.train_adapter`, not the web guide's `float_runtime` path; other export/package flags also differ. Follow the pinned repository README. The [official data audit](../../evaluation/liquidity-depth/quality-report.json) passes; prior failed versions remain in `history/`. A passing data audit does not demonstrate adapter acceptance or performance against the network's hidden pool.

## Work sequence and evidence

1. Independently review the 56-pair development set using the unlabeled packet. Fix contested references and style correlation. Add distinct scenario families and frozen, sourced examples rather than repetitive numerical variants.
2. Submission is complete under `LIQUIDITY_DEPTH_VERIFY_GENERAL`, credited to `0x2c051eD5452B3630B2151203d5003b759ECBFDF1`. Exact bytes, hash, response, initial admission and all 56 eligible row states are saved. Retain the distinction between eligibility and actual question/ranking use.
3. Claim the selected bounty when ready to participate. The issue requires `/claim`, progress at least every 72 hours, and `/submit` once the contributor's rows are eligible. Claims can coexist with others. No comment has been posted in this work.
4. Use actual eligibility evidence in the bounty submission. Record network use separately if it becomes available; do not equate eligibility with observed ranking use.
5. Expand to onchain metrics or a trained adapter after this first contribution establishes a working submission and review loop.

The October 29 pool was empty. The [October 30 saved status](../../evaluation/liquidity-depth/pool-status-2026-10-30.json) now shows 56 eligible rows, one eligible contributor and an active snapshot from epoch 1609. The minimum remains five contributors for question use. This snapshot does not prove actual ranking use; four more independent contributors are needed to reach that minimum.

The listed issues explicitly pay no money or tokens. Protocol evaluator rewards are separate, as are H2 prizes; no reward or eligibility is guaranteed by preparing this seed.
