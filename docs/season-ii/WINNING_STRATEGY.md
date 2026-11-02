# Arcadian: competitive plan for Season II

Updated October 24, 2026. Primary entry: **Apps & Agents, Mission 14**. Source: the [current official rules](https://hackathon.telegraphprotocol.com/rules), [Mission 14](https://hackathon.telegraphprotocol.com/missions/web3-defi), and the Season I winners supplied by the user. No official Arcadian score or organizer feedback exists.

## What the winners establish

| Winner | Observable strength | Implication for Arcadian |
| --- | --- | --- |
| Scam Shield, Apps first, 0.69/1 | Intelligence embedded in Gmail and SMS workflows | Put the decision inside a trader or agent's existing workflow and prove someone uses it. |
| Truvian Shield, Apps second, 0.59/1 | Four live purchases before an agent signs, with a supported decision | Four requests alone are familiar. Make Arcadian's decision independently inspectable and fresh for the exact proposed exposure. |
| ProofPact, Apps third, 0.45/1 | Frozen criteria, signed evidence and deterministic settlement | Preserve the policy and evidence; demonstrate that missing or altered proof prevents action. |
| TXlens, Miners first, 97.9 | Narrow, structured, machine-callable transaction intelligence | Supply exact fields and reproducible results. Do not advertise an audit, executable depth or fraud detection from unrelated TVL data. |

Miner scores and app scores belong to different tracks. These rankings do not predict Season II scores. Arcadian's target is a strong independently judged Apps & Agents entry, rather than matching a miner's numeric score.

## Product and differentiation

Arcadian gives a trading-agent operator a reproducible decision about one token contract, trading chain and USD notional. It buys security, trading-integrity, contract-state and executable-depth intelligence through the Telegraph Engine. Its signed memo includes the raw answers, policy, serving providers, receipts, authorizations and spend ledger.

The new `/verify` surface and `verify:memo` CLI let another consumer check a memo using an operator address obtained independently. They match the exact proposed trade, verify EIP-712 integrity, reread chain settlement and recorded signals, reparse the raw answers, recalculate spend, and apply the current policy. Old evidence remains inspectable but cannot authorize a current trade. The application does not execute swaps or sell insurance.

This is a concrete extension of the Season I safety-gate pattern. Its competitive value still needs independent demonstration: another bot operator must successfully consume the result for a new input and repeat the workflow. Do not call it novel solely because a different name or interface is attached.

## Score categories and acceptance evidence

| Category | Weight | Evidence to earn it | Remaining work |
| --- | ---: | --- | --- |
| Technical quality and mainnet readiness | 35; minimum 24 | Budget and chain enforcement, durable idempotency/recovery, signer trust, raw-evidence binding, freshness, denied-action cases, real autonomous purchase | Verify realistic provider coverage; share production storage and deploy configured paid access. Repeat purchase proof during H2. |
| Commercial viability | 30 | Named buyer type, real workflow, useful decision, measured spend/latency, comparison with their current process | Interview a bot operator and measure the same review manually. Pricing and willingness to pay are hypotheses until observed. |
| Independent adoption and retention | 15 | A person outside the team runs a new input, preserves their evidence and returns for another useful review | Obtain genuine tester participation and repeat use. Internal wallets, unit tests and screenshots earn no independent-adoption claim. |
| Telegraph integration and use | 10 | Live Engine requests, actual serving provider and Intent, bound consumption receipts, unique settlement count, signal records | Record routing failures and unsupported capabilities rather than substituting direct provider calls. |
| Proof, demo, tutorial and reproducibility | 10 | Working reviewer access, short setup, realistic unknown input, failure/recovery example, 2–5 minute demo and evidence pack | Finish a fresh event-period demo and independent reproduction; keep confidential credentials private. |

Do not assign optimistic self-scores to missing evidence. The purchase requirement is an eligibility condition. Passing unit tests or having a polished preview cannot substitute for it. The eventual award and score are determined by judges.

## Work sequence

1. Complete one real, explicitly capped testnet review now as preparation. Save the observations, actual routing, cost, receipts, transactions, latency and held/blocked/passed outcome.
2. Repair any genuine provider adapter or routing incompatibility exposed by the run. A receipt for an answer that cannot address the trade does not justify approval.
3. Make the tutorial reproducible locally and publish a reviewer preview of `/desk` and `/verify`. Configure a shared remote database before offering hosted paid reviews.
4. From November 1, repeat the workflow with new realistic inputs and event-period chain evidence. Demonstrate a supported current threat, unavailable-provider behavior, exact-trade mismatch, stale evidence and recovery without a second purchase.
5. Bring one independent trading-agent operator through the workflow. Measure useful completed actions and repeat use. Record the user's next action and what the result improved.
6. Finish the five commercial answers and 2–5 minute demonstration using observed results. Submit by December 1, 23:59 UTC. December challenges require separate new results.

## Separate miner work

The new `arcadian-defi-measurements` identity has a deployed byte-matching manifest and official Anjoman validation. Sponsored registration currently returns HTTP 500; the address-only simulation finds insufficient MACHINA allowance. No new registration is claimed. Historical registration 401 belongs to a different owner and is not being updated. Completing this separate measurement contribution will not establish a useful Mission 14 paid trade result.

## Independent tester record

For each actual tester, retain: consented identifier; relationship to the team; timestamp and network; unseen token/chain/notional; review UUID; resulting next action; receipt and transaction references; observed cost and elapsed time; whether they reproduced a failure; and a later repeat action. A testimonial without a completed action is interest, not adoption. Testnet activity remains labeled testnet.
