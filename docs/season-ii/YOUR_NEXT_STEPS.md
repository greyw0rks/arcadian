# Arcadian — your remaining steps

The app is deployed with verified shared storage, and Anjoman has accepted the exact hosted measurement YAML. October's paid proof remains a correctly held `NO_DATA` review; a useful H2 paid trade result is still missing. The evaluator's 56 submitted rows remain eligible; this is separate from competition submission.

Try the hosted [desk](https://arcadian-gamma.vercel.app/desk) and [verifier](https://arcadian-gamma.vercel.app/verify). Public review source: https://github.com/greyw0rks/arcadian/tree/submission/season-ii. Clone that branch, run `npm ci` and `npm run dev`, then open `/desk` to preview a request without payment credentials. Review [PR #1](https://github.com/greyw0rks/arcadian/pull/1) before merging into `main`.

## 1. Resolve coverage with Telegraph

The [provider report](UPSTREAM_REPORT.md) has been [posted on bounty #85](https://github.com/telegraphprotocol/bounties/issues/85#issuecomment-6587112597) with your approval. It contains the actual requests, transaction links and schema questions; no new purchase is needed to reproduce them. We still need answers on:

- The supported Engine Intent/schema for block-anchored token contract reads.
- A route returning executable depth for a token contract, chain and USD notional, rather than pool reserves or a generic exchange pair.
- Resolution of the paid liquidity 500/upstream 502 and audit 503, and routing that binds onchain/wash answers to the requested subject.

The public catalogue can be refreshed without credentials or spending:

```bash
npm run check:coverage -- --out .evidence/provider-coverage.json
```

A listed provider or payment challenge is not proof of useful coverage. Do not repeat the previous four purchases solely to see whether the same failures recur.

## 2. Finish the new measurement miner registration

Vercel login, server configuration, deployment and journal migration are complete. [Hosted smoke checks](../evidence/hosted-smoke-nov02.json) confirm both measurements, request preview and access to the archived review. The original local journal remains intact; [migration fingerprints](../evidence/journal-migration-nov02.json) match.

The chosen Anjoman account owns the new `arcadian-defi-measurements` identity (YAML ID 20261102). [Anjoman validation](../evidence/anjoman-validation-nov02.json) passes for the exact hosted hash. The account has 5 test MACHINA, but sponsored registration returns HTTP 500 and the address-only simulation reports insufficient MACHINA allowance. Finish bond approval through Anjoman's supported email-account flow, then confirm the returned transaction, registration ID and node activation. No new registration is claimed; leave the old owner's registrations 173/401 alone.

```bash
npm run check:yaml -- --anjoman-report docs/evidence/anjoman-validation-nov02.json
# After a confirmed new registration:
REGISTER_ID=<confirmed-id> npm run check:telegraph
```

## 3. Obtain independent evaluator review

Give a DeFi reviewer only [the blind-review ZIP](../reviewer-packet/arcadian-liquidity-review.zip), not the labeled dataset first. It contains all 56 questions, an empty answer template and instructions. Ask them to record A/B/tie/invalid plus calculations/rationale and their relationship to this project.

Validate their returned JSON with:

```bash
node evaluation/liquidity-depth/review.mjs --review /path/to/completed-review.json
```

Keep the submitted dataset frozen. Resolve disagreements in a new version. This review is not a hidden benchmark or a measured network ranking improvement. Five contributors are needed for question use; the November 2 pool has two, including Arcadian. H2 material qualification can precede network activation.

## 4. Capture the H2 workflow and submit

Once coverage is confirmed, run one deliberately capped useful review during **November 1–December 1**, using [OPERATIONS.md](OPERATIONS.md). Preserve the exact subject, result, raw provider evidence, actual cost/elapsed time, settlement transactions and receipts. Have an independent operator reproduce a new input and a failure case. Record actual use and repeat use if making adoption claims.

Record the 2–5 minute demonstration using [the prepared sequence](SUBMISSION.md). Automated demo preparation currently cannot install its HyperFrames workflow because the GitHub skill manifest is unreachable; retry the download before creating the composition. The app and evaluator can be distinct entries: [app draft](SUBMISSION.md), [evaluator draft](EVALUATOR_SUBMISSION.md), [score/evidence plan](SCORE_PLAN.md). Confirm competition registration and complete the official form at https://hackathon.telegraphprotocol.com with your team/contact details and selected permissions. The material upload is not the final entry.

Deadline: **December 1, 2026, 23:59 UTC / December 2, 00:59 Lagos**. November 14 is an integration progress check. The approved upstream report was posted; the final competition forms remain unsubmitted.
