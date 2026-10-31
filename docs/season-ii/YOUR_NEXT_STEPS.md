# Arcadian — your remaining steps

The app, recovery/verifier code and evaluator contribution are prepared for review. October's paid proof remains a correctly held `NO_DATA` review, not a successful useful trade review. The evaluator's 56 submitted rows are eligible; this is separate from competition submission.

## 1. Resolve coverage with Telegraph

Send the prepared [provider report](UPSTREAM_REPORT.md) to Telegraph support or the appropriate developer channel. It contains the actual requests, transaction links and the schema questions; no new purchase is needed to reproduce them. Ask for:

- The supported Engine Intent/schema for block-anchored token contract reads.
- A route returning executable depth for a token contract, chain and USD notional, rather than pool reserves or a generic exchange pair.
- Resolution of the paid liquidity 500/upstream 502 and audit 503, and routing that binds onchain/wash answers to the requested subject.

The public catalogue can be refreshed without credentials or spending:

```bash
npm run check:coverage -- --out .evidence/provider-coverage.json
```

A listed provider or payment challenge is not proof of useful coverage. Do not repeat the previous four purchases solely to see whether the same failures recur.

## 2. Restore hosting access

Vercel CLI currently requires a fresh login. The project is already linked to **arcadian** in **greyw0rks-projects**. Complete `vercel login`, then inspect the preview branch deployment. If GitHub did not create it, run `vercel deploy --scope greyw0rks-projects --yes --no-wait` from this repo. Use a preview while reviewing changes.

Paid hosted reviews additionally need a shared remote libSQL/Turso database (`REVIEW_DB_URL` and `REVIEW_DB_AUTH_TOKEN`), dedicated payer and operator token. The local recovered SQLite journal remains authoritative; do not discard it or replace it with the historical `.data/reviews.db`. Follow [OPERATIONS.md](OPERATIONS.md) before migrating. Preview/request planning can be demonstrated without payment credentials.

## 3. Obtain independent evaluator review

Give a DeFi reviewer only [the blind-review ZIP](../reviewer-packet/arcadian-liquidity-review.zip), not the labeled dataset first. It contains all 56 questions, an empty answer template and instructions. Ask them to record A/B/tie/invalid plus calculations/rationale and their relationship to this project.

Validate their returned JSON with:

```bash
node evaluation/liquidity-depth/review.mjs --review /path/to/completed-review.json
```

Keep the submitted dataset frozen. Resolve disagreements in a new version. This review is not a hidden benchmark or a measured network ranking improvement. Five contributors are needed for question use; you currently supply one. H2 material qualification can precede network activation.

## 4. Capture the H2 workflow and submit

Once coverage is confirmed, run one deliberately capped useful review during **November 1–December 1**, using [OPERATIONS.md](OPERATIONS.md). Preserve the exact subject, result, raw provider evidence, actual cost/elapsed time, settlement transactions and receipts. Have an independent operator reproduce a new input and a failure case. Record actual use and repeat use if making adoption claims.

Record the 2–5 minute demonstration using [the prepared sequence](SUBMISSION.md). The app and evaluator can be distinct entries: [app draft](SUBMISSION.md), [evaluator draft](EVALUATOR_SUBMISSION.md), [score/evidence plan](SCORE_PLAN.md). Confirm registration and complete the official form at https://hackathon.telegraphprotocol.com with your team/contact details and selected permissions. The material upload is not the final entry.

Deadline: **December 1, 2026, 23:59 UTC / December 2, 00:59 Lagos**. November 14 is an integration progress check, not the final deadline. No upstream message or final competition form has been sent by this work.
