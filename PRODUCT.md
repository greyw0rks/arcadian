# Arcadian

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Season II focuses on Mission 14, Web3 Native and DeFi, as selected by the user on 22 October 2026. The initial operator is an onchain trader or trading agent checking a proposed trade before committing capital. Specific prospective customers and their current costs remain to be established.

## Product Purpose

Buy relevant intelligence through Telegraph and turn it into an inspectable pre-trade decision: proceed, block, or hold for review. Show the evidence, the policy, and the cost of the intelligence together.

## Operating Context

The application reviews an explicit token contract, trading chain, and proposed USD notional. Its intelligence payment network is configured separately from the chain being researched. It does not execute a trade in this first implementation.

## Capabilities and Constraints

- The existing Next.js application includes a DeFi pool risk scorer and an unfinished paid-agent desk. The scorer uses DefiLlama and CoinGecko; a pool risk score does not establish contract safety or executable liquidity.
- Telegraph's documented testnet Engine is `https://devnode.telegraphprotocol.com/engine`. It uses x402 v2 on Base Sepolia and returns separate payment, consumption receipt, and signal references.
- The application must never approve a trade from missing, unverified, unrelated, or purely narrative evidence.
- A dedicated payer wallet, explicit spending authorization, and capped requests are required for paid runs. Wallet keys stay on the server.
- Testnet, previews, provider observations, onchain payments, and network records must carry accurate labels. An agent signature proves authorship, not validator consensus or investment safety.
- Mainnet deployment and live customer adoption are not yet demonstrated.

## Brand Commitments

Keep the Arcadian name. The existing interface supplies the incumbent identity for the desk: cream surfaces, orange accents, dark text, Orbitron headings, and monospace data. No rebrand is part of this work.

## Evidence on Hand

- `docs/season-ii/POSTMORTEM.md` records the code review and live network findings.
- Miner registration 401 was rejected for an invalid YAML `limitations` field. No organizer judging feedback is available.
- Live Engine payment requirements and miner discovery are readable. Real paid application consumption has not yet been demonstrated.
- Unit fixtures are illustrative and must never be presented as paid live results.

## Product Principles

1. Make the buyer's decision the product.
2. Require evidence adequate to the claim being made.
3. Count independently verified consumption and unique settlement transactions separately.
4. Prefer a reproducible narrow workflow to broad unsupported capabilities.
5. Make configuration and missing prerequisites visible before money moves.
