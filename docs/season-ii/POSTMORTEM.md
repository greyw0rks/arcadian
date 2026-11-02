# Season I review — 22 October 2026

No organizer feedback was available. These findings describe observed technical failures, not a reconstructed judging decision.

## The corrected registration was rejected

The live node's `GET /api/miners/401` reports `activation_status: rejected` and:

> YAML schema validation failed: [limitations: Invalid type. Expected: array, given: string]. This will NOT be retried: fix the YAML and re-submit the registration with updateMiner().

The successful August 31 transaction proved that a registration was written onchain. It did not prove that Telegraph accepted the configuration. The old handoff's assertion that this was an indexer-propagation failure was incorrect.

The explorer still shows miner 2847 under `TASK_COMPLETION`, its old IPFS manifest, six requests served, and score 0 / rank 11 at epoch 298. The corrected record includes three intended Intents, but its YAML was never activated. Registration activation is event-driven; waiting for an epoch does not repair a terminal schema rejection.

## The original API did not match routed demand

Season I originally advertised `TASK_COMPLETION` and accepted structured pool parameters, while routed questions required a `query` contract. The later natural-language parser was a useful correction, but the node never accepted that manifest. Endpoints also lacked the now-documented `params` request contract.

## A risk score is not every advertised capability

Pool TVL is not executable order-book depth, and a six-component DeFi pool score is not a fraud detector or smart-contract audit. Advertising five Intents without separate matching outputs obscured this difference. Direct-mode aggregate scoring also inherited the representative pool's APY and TVL instead of reporting the aggregate it scored.

For Season II the pool scorer remains supporting research. Deterministic TVL and yield services should advertise only the Intents whose values they actually supply. Mission 14 purchases contract-security, wash-trading, and onchain-state intelligence from the network.

## The unfinished app was not connected to the live purchase contract

The existing agent guessed `${gateway}${minerPath}`, used custom routing headers, and hand-signed x402 v1. Telegraph documents `POST /engine/v1/ask`, x402 v2 `PAYMENT-REQUIRED` / `PAYMENT-SIGNATURE` / `PAYMENT-RESPONSE`, and a result envelope. A gateway URL alone could not make that code work.

It also accepted a header's transaction hash as settlement proof, counted each hash occurrence as a separate transaction, and labeled configuration as a live Full build. Telegraph batches payments: a consumption receipt identifies a call, while multiple calls can share a transaction. Failed or unpaid checks could still contribute a low-risk verdict. No receipt binding or chain verification protected that decision.

## The release process did not close the loop

The October manifest still differs from the live file. Local tests were green (39/39 before this work), but they mocked the guessed v1 gateway and never tested the documented contract or terminal registration rejection. The old Next.js 14.2.5 also carries published dependency advisories.

Season II release evidence must include official YAML validation, hosted-byte matching, node activation by registration ID, realistic fresh requests, verified payment authorizations onchain, Telegraph consumption receipts, reproducible failure cases, and a cold-open application check.

## References

- [Registration diagnostics and updates](https://docs.telegraphprotocol.com/docs/miners/miner-registration)
- [YAML configuration](https://docs.telegraphprotocol.com/docs/miners/yaml-config)
- [Validation API and its limits](https://docs.telegraphprotocol.com/docs/miners/validation-api)
- [Engine inference](https://docs.telegraphprotocol.com/docs/using/engine-ask)
- [x402 v2 and consumption receipts](https://docs.telegraphprotocol.com/docs/using/x402-inference)
