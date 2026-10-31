# Arcadian — current handoff

## October 31 delivery preparation

The `submission/season-ii` review branch packages the restored application, payment recovery/verifier, 56 frozen evaluator rows, public evidence and [human next steps](docs/season-ii/YOUR_NEXT_STEPS.md). Fresh checks pass: 87 app tests, production build/typecheck, two evaluator-submission tests, 56-row/43-calculation artifact checks and seven synthetic impact cases. The dataset SHA-256 remains unchanged.

The [independent review ZIP](docs/reviewer-packet/arcadian-liquidity-review.zip) contains only unlabeled questions, an empty response template and instructions. `npm run check:coverage` refreshes public metadata without keys or payments; October 31 results preserve the provider coverage gap and 56 eligible evaluator rows. No useful paid workflow, independent human review or final H2 submission is claimed. Vercel CLI needs login; the preview branch may be built through the existing GitHub integration. Current `/desk` and `/verify` can be reproduced locally; hosted paid reviews still need shared remote storage. The report is ready for the builder to send. No messaging or purchase occurred in this pass.

Published as [draft PR #1](https://github.com/greyw0rks/arcadian/pull/1). No automated deployment status appeared; a new hosted preview remains unverified. Fresh [October 31 memo verification](docs/evidence/verification-oct31.json), run without a payer key, independently confirms the signature, 0.03 test USDC, three settlements and two receipts/signals. Exit 2 is expected for `NO_DATA` and an old memo; no fresh trade is authorized by archived evidence. [Validation record](docs/evidence/delivery-validation-oct31.json).

The October 30 evidence and restoration details below remain historical. References there to unpublished source describe the state before this review branch.

Updated October 30, 2026. Scope: Apps & Agents / Mission 14 and liquidity evaluation material. H2 runs November 1–December 1; the deadline is **December 1, 2026, 23:59 UTC** (December 2, 00:59 Lagos). October transactions are preparation.

**October 31 status check:** live contributor rows and pool status still confirm all 56 rows eligible, one eligible contributor of five required, and the same active corpus (current epoch 1947). Remote `main` remains `fee71f864506118e22d4ebe7680ced75c26a8a7e`; the October 30 app work is still local and unpublished. Live H2 rules confirm November 14 is a progress milestone, not the final deadline; a final app entry needs a purchase whose intelligence performs a meaningful task. No new purchase or provider retest was performed, so the October 30 `NO_DATA` result below remains the latest verified workflow. No H2 registration or final-entry confirmation was found in this review. Existing test/build results below were not rerun.

## Location and preservation

The current persistent checkout is **`/home/greyw0rks/arcadian`**. Workspace writes were restored and the October 30 delivery was restored from `/home/greyw0rks/arcadian-delivery-2026-10-30` after verifying every bundle checksum, all 130 source hashes, the 68 changed-file baselines and both database fingerprints. No push or deployment of these changes has occurred.

The authoritative journal is **`.data/delivery-2026-10-30/reviews.db`**, selected by `REVIEW_DB_URL` in the existing private `.env.local`. `TELEGRAPH_NETWORK=telegraph-sepolia`; the original payer key and operator token are preserved. The recovered journal includes historical recovery and October 30 purchases. The old `.data/reviews.db` remains only for inspection: do not use it for purchases. Source, private environment and the original database were backed up to `/home/greyw0rks/arcadian-backup-20261030T140620Z`. The delivery bundle remains unchanged as an archival copy; `/tmp/arcadian-finish-oct30` no longer exists.

## Live app result

The payer is `0x2c051eD5452B3630B2151203d5003b759ECBFDF1`. [Funding](https://sepolia.etherscan.io/tx/0xd2d8a3e33fdbcd72893cef151395ca68d6a8490edf52c90756de0c812ee372da) delivered **0.2 Telegraph test USDC**. The final read-only check at 12:49 UTC found **0.17 remaining**, an unlocked wallet, compatible challenge and available working-copy storage.

Review `9706dc68-b433-4283-bd6f-07ba7fcf42ca` used a **0.05 test-USDC total ceiling**, spent **0.03**, and has **zero unresolved authorizations**. Independent verification confirms **three settlement transactions and two consumption receipts with matching signal records**. The decision is **`NO_DATA`**: neither returned answer supplied subject-specific evidence for the Base WETH / USD 1,000 trade.

| Check | Actual outcome |
| --- | --- |
| Contract audit | Engine 503 before payment; zero spent. |
| Wash trading | 0.01 settled; receipt/signal verified; unrelated token-boost response. |
| Onchain metric | 0.01 settled; receipt/signal verified; unrelated Bitcoin HTML. |
| Liquidity depth | 0.01 settled; Engine 500 reporting upstream 502; no consumption receipt or answer. |

See [the signed recovered review](docs/evidence/paid-review-reconciled-oct30.json), [independent verification](docs/evidence/verified-memo-oct30.json), [operator check](docs/evidence/final-operator.json), and [the unsent provider report](docs/season-ii/UPSTREAM_REPORT.md). Payment success is not a useful autonomous-review result. No further purchases are needed to reconcile these transactions.

Historical Base Sepolia review `8097704e-bb90-4894-ba0c-9384dcf69181` was reconciled: all four authorizations expired unused, zero spent/unresolved, and its wallet lock released in the working database. The first October 30 attempt `4dfb8088-3d9f-497e-bbc8-364a1dca5830` submitted no payments.

## Implementation completed

- Added the verified `telegraph-sepolia` deployment: Ethereum Sepolia 11155111, token `0xcc194e1a843B658526D0D5C431f670028582Ae17`, receiver `0x3624EB012B5E998BB57B6bE6C9Cfc9c4bc5eb99b`, EIP-712 domain `USD Coin` / `2`. This is not Circle faucet USDC. See [deployment evidence](docs/evidence/deployment-oct30.json).
- The x402 client explicitly allows only the configured chain/token and atomic cap. Logical checks map to current `_GENERAL` Intents; historical reviews preserve original bindings.
- Provider identity matches Engine YAML IDs to distinct receipt registration IDs using registry/catalogue records. Parsing uses the raw answer from the bound signal record. Signal binding is checked against the node; its cryptographic payload hash is not independently recomputed.
- Recovery reuses existing authorizations without purchases. Independent memo verification counts settled payments even when providers fail before returning evidence. The CLI exits 2 for held/incomplete reviews and can save verification output.
- Operator readiness checks funding, wallet locks, storage and the unsigned challenge. The desk labels the configured chain. Deterministic policy still rejects unsupported or unrelated evidence.

The current `ONCHAIN_METRIC_VERIFY_GENERAL` schema describes wallet native balance at a pinned block, not token contract state. `LIQUIDITY_DEPTH_VERIFY_GENERAL` calls `liquidity_usd` pool reserve value, not executable depth. [Intent evidence](docs/evidence/intent-schemas-oct30.json) records these gaps; neither is accepted as sufficient trade evidence.

## Evaluator contribution completed

**All 56 submitted rows are eligible**, credited to the payer above under `LIQUIDITY_DEPTH_VERIFY_GENERAL`, with zero duplicates/rejections. JSONL SHA-256: `f0b0a0e97b21d92aafab718a5641b00d1b21ab7aa302f9ee4a252a94f847bad5` (48,124 bytes). See [material and checks](evaluation/liquidity-depth/README.md).

The pinned official audit passes; its answer-only probe is **65%, exactly the threshold**. The material covers 11 synthetic families, with 43 arithmetic references and seven synthetic parser/policy checks. No independent human review, unseen accuracy or ranking improvement is claimed.

The saved active snapshot has 56 rows, one contributor, activation epoch 1609 and corpus version `dbc273c044fe413ea05409468943d73c7a9b7f1991eed85b36c115d0153dacda`. Question use requires five contributors; snapshot existence does not prove ranking use. No bounty comment or formal H2 entry has been sent.

## External work still required

Final verification: **87 app tests**, TypeScript, the production build, evaluator submission tests and artifact checks all pass. The seven synthetic impact checks and seven local production HTTP checks pass. Live memo verification independently confirms 0.03 spent / two receipts / three transactions while correctly exiting 2 for `NO_DATA`. See [validation record](docs/evidence/final-validation-oct30.json).

1. Persistent restoration and journal migration are complete. Use the configured checkout above and inspect [the restoration record](docs/evidence/restoration-oct30.json) before switching database paths.
2. Resolve paid provider failure, irrelevant routing and required evidence coverage before buying another full review. The prepared report is unsent; sending messages requires user instruction.
3. Collect a useful paid H2 workflow, independent app use and the final demo. The old preview at `https://arcadian-3yzy0pg08-greyw0rks-projects.vercel.app/desk` does not contain October 30 changes. Paid Vercel use needs shared remote libSQL storage and server credentials.
4. Obtain independent DeFi review of the frozen evaluator packet. Version future changes separately from submitted bytes. Complete the final evaluator entry with accurate eligibility and limitations.

Separate Season I miner registration 401 was historically rejected for a string `limitations` field. Its local manifest fix is not an active registration. Owner credentials, console validation and a stable published manifest remain prerequisites if pursuing that separate contribution; this pass did not broadcast an update. See [the postmortem](docs/season-ii/POSTMORTEM.md).
