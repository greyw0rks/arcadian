# Arcadian: earning a strong H2 score

Verified October 29, 2026 against [Official Rules](https://hackathon.telegraphprotocol.com/rules), including the Evaluators tab. The [versioned reference](rules-reference-2026-10-29.json) records the source URLs and hashes. This is an evidence plan, not a predicted or awarded score.

Build two distinct contributions around one real need: Arcadian's Mission 14 trade review, and liquidity evaluation material that helps distinguish useful execution evidence. Material-only, adapter-only and combined evaluator entries are all allowed. A model is worthwhile when it demonstrably improves measurement; adding WASM by itself earns no stated bonus.

The main competition closes **December 1, 2026, 23:59 UTC**: **December 2, 00:59 in Lagos**. H2-specific activity and transaction evidence must come from the event period. Existing code and pre-event preparation are allowed when disclosed. The rules allow multiple tracks if each entry makes a real, distinct contribution.

## Evaluator rubric and what to produce

| Official category | Points | Evidence to pursue |
| --- | ---: | --- |
| Valid measurements, ability to distinguish quality, and baseline evidence | 40; minimum 28 | Defensible references, independent review, correct calculations, realistic unseen cases, and a fair existing-baseline comparison or credible new coverage. |
| Integrity and resistance to manipulation | 20 | No train/test overlap, balanced answer positions and styles, resistance to verbosity and authority cues, prompt injection, wrong units/chains, stale or inconsistent evidence. |
| Repeatable results and protocol compatibility | 15 | Versioned data and hashes, pinned toolchain, reproducible checks, exact Intent/schema, documented network statuses and errors. |
| Useful coverage and demonstrated improvement | 20 | Repeatable mission-specific tests showing which failure modes or missing capabilities the material measures and which app workflows benefit. |
| Documentation and integration | 5 | Clear setup, review/submission instructions, methods, limitations, and a concise demonstration. |

Winning requires **70/100 overall and at least 28/40 for measurement validity**. Thresholds establish eligibility, not an award guarantee. Excellence ranks qualifying entries by total score, then the main technical score and repeatable proof.

The initially empty liquidity question pool established an opportunity for new material; it now contains our 56 eligible rows. This does not prove no comparator or baseline exists. Inspect the deployed baseline before making that claim. Compare identical questions, conditions and anchors, reporting every scenario, ties, missing outputs and uncertainty.

## What exists and what is still missing

| Evidence | Current status |
| --- | --- |
| Material | 56 AI-authored synthetic development pairs across 11 families, with explicit assumptions and rationale. No real-market observation claims. |
| Format and basic checks | JSONL export passes structural checks; numeric calculations checked separately. |
| Official training-data gate | October 30 passes: largest answer share 1.79%, answer-only probe 65% (exactly the limit), character-length shortcut 57.14%, exact-negative leakage 0%. Prior failed versions retained. This is not model-performance evidence. |
| Independent reference review | Unlabeled packet and response template prepared; no human review completed. |
| Unseen performance | Not measured. Public development data is not a secret held-out benchmark. |
| Telegraph eligibility | All 56 rows eligible October 30, active snapshot at epoch 1609. Contributor is the user-selected Arcadian payer. One eligible contributor is below the five required for question use; snapshot existence does not prove ranking use. |
| Live measurement or ranking improvement | Not demonstrated. An eligible row, a local test and a finalized ranking are separate evidence. |
| Mission impact | Seven synthetic parser/policy integration checks pass, including a supported-depth control. Independent workflow-level and network improvement remain unverified. |

The training-data gate is more specific than material admission. Passing this small development corpus at the surface-probe boundary does not establish semantic validity or generalization; independent review and larger diverse material remain necessary before training claims.

## Highest-value next work

1. **Make the references trustworthy.** Get a DeFi reviewer to judge the unlabeled packet before seeing our labels. Record disagreements and resolve them against calculations or source evidence. Obtain a second review for ambiguous examples. Prefer executable reference calculations and frozen pool/book observations where appropriate.
2. **Fix generalization, not just the gate number.** Add supported positive cases where a good answer can give a precise result, as well as missing-evidence cases where it must qualify the result. Make wrong answers plausible and stylistically comparable. Include overconfident errors, unwarranted refusals, units, fees, routes, range liquidity, stale/reorganized state, and untrusted instructions. Use the official fixed checks, retaining each version and result; do not select a lucky split or silently remove difficult cases.
3. **Build a meaningful corpus.** A suggested engineering target is 150–250 independently reviewed development pairs across diverse sources and scenario families, plus a separately authored private challenge set. This is not an official row quota or a promise of points. At least 50 unique negatives are necessary to satisfy the kit's 2% rule, but fifty repetitive questions are still weak. Split by scenario/source family before tuning; keep near-identical market snapshots and numerical variants together.
4. **Measure the actual evaluator.** For a material entry, demonstrate defensible new coverage and the failures it exposes in candidate answers. For an adapter, compare pairwise accuracy against the available incumbent and simple length/style baselines on the untouched challenge set. Report confidence intervals and per-family results. Our packet-review agreement and an answer-only style probe are not model accuracy.
5. **Prove one app benefit, then expand.** A reviewer should reproduce an Arcadian-style request, see a plausible bad liquidity answer (for example, TVL used as depth), and verify the corrected evidence requirement using a mission-specific test. A test of synthetic output is labeled as such. Actual routing/ranking improvement requires corresponding network records. Repeat for a second independent app workflow only when it truly uses the contribution.
6. **Track use after eligibility.** Upload and eligibility are complete under `LIQUIDITY_DEPTH_VERIFY_GENERAL`; signed-body hash, response, row states and snapshot metadata are saved. Question use needs five contributors. Keep submitted bytes frozen and distinguish pool state from observed ranking use.

The H2 rules explicitly say useful evaluator work can qualify **before live activation**, supported by credible methods and mission-specific tests. The bounty's personal `/submit` requirement is different: rows must be `eligible` or a module must pass its checks. Neither is a shortcut to the other.

## Delivery awards versus excellence

Evaluator delivery awards select four qualifying independent groups, prioritizing, in order:

1. Distinct commercial missions enabled.
2. Distinct H2 app workflows enabled, unblocked or improved.
3. Independently verified missing mission-critical Intent needs met.
4. Combined technical quality.

Remaining evaluator ties favor proven measurement improvement or valuable new coverage, then validity. Bounty #85 names several potentially served missions, but those labels alone are not evidence that our dataset enables them. Start with one defensible Mission 14 test; use real tests to support any additional mission claims.

Published evaluator prizes are four $300 delivery awards and $500/$300 excellence awards. A group can receive one delivery and one excellence award in the same track. Bounty #85 is separately unfunded. No rewards are earned merely by claiming, uploading or reaching a passing score.

## Keep Arcadian's app score moving

Apps & Agents uses **35 technical / 30 commercial / 15 independent adoption / 10 integration / 10 proof**. Winning requires at least 70 overall, 24/35 technical, and a working autonomous Telegraph purchase whose result performs a useful task.

The October 24 authorizations were reconciled on October 30 as expired and unused. The current-deployment review then settled **0.03 test USDC across three transactions**, with **two receipts and matching signal records**, zero unresolved authorizations and a remaining balance of 0.17. Independent verification is saved in [live evidence](../evidence/verified-memo-oct30.json). Audit routing failed before payment; liquidity failed after settlement; the onchain/wash answers were unrelated. The correct outcome is **NO_DATA**, not a useful complete review. All transactions remain outside the H2 window.

Payment/interface migration and reconciliation are complete in the working copy. The app's next technical priority is useful provider coverage, documented in the [unsent upstream report](UPSTREAM_REPORT.md). After resolving it, collect fresh H2-period receipts and results from November 1. Preserve a held decision when useful evidence is missing; avoid spending solely to repeat the established failure.

For the 45 commercial/adoption points, find an independent trading-bot operator who genuinely needs this check. Observe their current process, have them try a new input, measure useful output, cost, latency and next action, then observe repeat use. Record observed outcomes rather than inferred willingness to pay. A dozen extra dataset rows cannot replace that evidence.

## Calendar and reviewer packet

| Window | Deliverable |
| --- | --- |
| Oct 29–31 | Review seed, fix style/reference issues, pin commands, investigate existing failed app attempt, prepare contributor account and registration. |
| Nov 1–7 | First submitted material and recorded states; fresh successful app integration evidence or a precise reproducible blocker. |
| Nov 8–14 | Larger reviewed material, private challenge design, one reproduced mission-specific test, and the app integration milestone. |
| Nov 15–20 | Untouched challenge run and fair baseline comparison if applicable; independent app trial and follow-up use. |
| Nov 21–27 | Reproduction by someone outside the implementation work; correct discrepancies; record final network states. |
| Nov 28–Dec 1 | Freeze artifacts, complete tutorial and 2–5 minute demonstration, submit each distinct entry through the H2 website. |

The evaluator demo should show the real need, a plausible wrong answer, a defensible reference, the method's full results and limitations, the exact version and network state, and how a reviewer reproduces the test. Include source provenance, official gate output, independent review records, applicable baseline results, per-family failures, and mission impact evidence. Share protected challenge material privately with judges.

Useful public updates can attract reviewers and real users, but the rules say likes, views, tags and posts do not change technical eligibility, judging weights or prize amounts.
