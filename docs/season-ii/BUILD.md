# Season II — Mission 14

## The build

Arcadian is a pre-trade evidence gate for onchain traders and trading agents. Given a token contract, chain, and proposed notional, it purchases contract-security, wash-trading, and onchain-state intelligence through Telegraph. It returns a policy decision with the provider observations, consumption receipts, unique settlement transactions, and measured spend attached.

The first version produces a decision for another agent to consume. Trade execution, insurance coverage, guaranteed safety, and independent customer adoption are not claimed.

## Thirty-day delivery target

The user's target is **1 November–1 December 2026**. Prepare the integrations before November; preserve the final evidence from builds performed during the event.

| Date | Deliverable | Evidence required |
|---|---|---|
| Before 1 Nov | Fix Season I registration, verify the supported API, freeze a reproducible risk policy | Official YAML result, node registration status, tests against x402 v2 |
| 1–7 Nov | One narrow end-to-end trade review | Actual paid Telegraph call, result used by the gate, chain verification, consumption receipt |
| By 14 Nov | Checkpoint ahead of the user's original cutoff | Public demo that opens cold, a settled call, a reproducible blocked input and an unavailable-provider case |
| 15–21 Nov | Integrate one independent trading-agent user | Unseen input, independently reproduced output, meaningful repeat use if available |
| 22 Nov–1 Dec | Complete the submission pack | Working URL, tutorial, measured cost/latency, receipt and transaction references, concise commercial summary, demo recording |

## Current official rules

Refreshed from the [Official Rules](https://hackathon.telegraphprotocol.com/rules) on **24 October 2026**: the main competition ends **1 December 2026, 23:59 UTC**. The earlier December 20 page has been superseded. The prize allocation is $7,000 for the main competition and $3,000 for separate December challenges, which do not extend Season II.

Apps & Agents is scored **35 technical / 30 commercial / 15 independent adoption / 10 integration / 10 reproducibility**. Awards require **70/100** overall and **24/35** technical, including a working autonomous Telegraph purchase. The November 14 milestone is a progress check, not a disqualification deadline. Supported testnet use can qualify; H2-specific activity and transaction evidence must come from **November 1–December 1**.

Keep the user's November 1–December 1 target. A 2–5 minute demo, beginner-friendly tutorial, real payment and consumption evidence, useful result and reproducible failure case are required. See [the competitive strategy](WINNING_STRATEGY.md) and [submission draft](SUBMISSION.md).

## Commercial proof to collect

Prospective user: an onchain trader, trading-bot operator, or small risk team reviewing token exposure repeatedly. The existing alternative is separate explorer checks, security scanners, liquidity analysis, and manual reconciliation. Specific buyers, current prices, time savings, and willingness to pay still require evidence; do not invent those figures.

Collect the input, decision, successful evidence coverage, observed latency, authorized maximum, independently verified cost, repeat use, and the operator's next action. A receipt for a useless answer is not commercial validation. A denial with an explicit missing capability is better than an unsupported approval.

## Release gates

1. Official manifest validation and the node's active registration agree with the hosted file.
2. Payment signing uses the documented x402 v2 interface and strict chain/token/budget matching.
3. A transaction receipt confirms the signed authorization and matching USDC transfer.
4. The Telegraph receipt agrees with the call, amount, payer, network, and settlement; signal evidence is kept separately.
5. Every required check has supported, subject-specific evidence before a proceed decision.
6. Preview and mock results cannot count towards live consumption or spend.
7. A reviewer can run new inputs and failure cases using the documented configuration.
