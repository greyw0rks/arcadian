# Arcadian — submission draft

**Apps & Agents · Mission 14 · Web3 Native and DeFi.** Deadline: December 1, 2026, 23:59 UTC. This draft distinguishes implemented behavior from evidence still to collect. It is not a submitted entry or an official score.

## Five commercial answers

**Who is it for?** DeFi trading-agent operators reviewing a token before placing an order. The proposed recurring use is one evidence review per candidate exposure. Actual user frequency and buyer demand remain to be measured with independent testers.

**What does it improve?** It combines ranked intelligence purchases, a fixed decision policy and verifiable spend in a machine-readable memo. Another consumer can recheck the exact trade, freshness, payments and raw evidence instead of trusting an unexamined SAFE label. A comparison against a tester's current explorer/scanner workflow is still required; no speed savings or lower operating cost is claimed yet.

**What does it do today?** The desk supports a bounded testnet review, recovery and signed PROCEED/BLOCK/REVIEW/NO_DATA outcomes. `/verify` and the CLI independently recheck signatures, payments, receipts and raw answers. The October 30 run spent 0.03 Telegraph test USDC across three settlements, with two verified receipts/signals and no unresolved authorizations. Provider failure and unrelated answers correctly produced NO_DATA. See [live evidence](../evidence/verified-memo-oct30.json); a useful complete review remains unproven. October preparation is separate from H2-period evidence.

**Why would someone adopt it?** A trading bot can consume one inspectable decision and ledger for the exact exposure it proposes. Users still need suitable intelligence coverage, configured hosted storage, production permissions and their own execution integration. Interest, willingness to pay and repeat independent use remain unverified.

**How can someone try it?** Run the current source locally from `/home/greyw0rks/arcadian`, preview a trade at `/desk`, and inspect a saved memo at `/verify`. The previously published preview predates October 30 fixes. Follow [OPERATIONS.md](OPERATIONS.md) for the exact Telegraph Ethereum Sepolia test token and storage configuration before any capped purchase. The restored operator uses the recovered journal at `.data/delivery-2026-10-30/reviews.db`.

## Suggested 2–5 minute demonstration

| Segment | What the reviewer sees |
| --- | --- |
| Problem, 20–30 seconds | The actual token, chain and notional proposed by the trading operator. |
| Purchase, 45–60 seconds | Supported Telegraph Engine requests, the shared spending ceiling and actual serving providers/Intents. |
| Result, 45–60 seconds | Raw findings, the useful held/blocked/passed outcome, confirmed spend and unique settlement/receipt counts. |
| Independent check, 40–60 seconds | Import the signed memo with the trusted signer. Change the notional and observe refusal; restore it and inspect the live proof. |
| Failure/recovery, 30–45 seconds | A recorded response interruption recovers existing payments without purchasing again, or unsupported evidence holds the trade. |
| Try it, 15–30 seconds | Reviewer URL, short setup and known supported-network limitations. |

Record actual behavior. Do not stage five fictional honeypots, claim execution that did not occur, or describe illustrative test fixtures as live purchases.

## Evidence required before final submission

- A new useful paid workflow during November 1–December 1, with raw request/response, review ID, policy and signer.
- USDC authorization/Transfer proof, supported consumption accounting and recorded signals; batched transactions counted once.
- Measured authorized ceiling, settled cost, unresolved authorizations and actual elapsed time.
- An independent reviewer reproducing a new input and reasonable failure case.
- Actual third-party use and repeat use records, if claiming adoption or retention.
- A working demo/reviewer link, short tutorial and known limitations.
- Owner-authorized registration evidence only if claiming a Miner/Provider entry as well.
- User-selected team/contact, public showcase permissions and buyer-introduction consent in the official form.

Public summary draft: **Arcadian checks a proposed DeFi trade using intelligence purchased through Telegraph, then returns a signed decision with its evidence and cost attached. Traders and agents can independently recheck that memo for the exact exposure before using it. Supported testnet implementation; production execution and customer adoption are not yet demonstrated.**
