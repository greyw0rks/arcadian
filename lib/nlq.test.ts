import { test } from "node:test";
import assert from "node:assert/strict";
import { parseQuestion, classifyIntent } from "./nlq";
import { type LlamaPool } from "./defillama";

const pool = (chain: string, project: string, symbol: string, tvlUsd = 5_000_000): LlamaPool => ({
  chain, project, symbol, tvlUsd,
  apy: 5, apyBase: 5, apyReward: 0, pool: `${project}-${symbol}`,
});

const POOLS = [
  pool("Base", "aave-v3", "USDC"),
  pool("Base", "uniswap-v3", "USDC-WETH"),
  pool("Base", "aerodrome-v1", "WSTETH-WETH"),
  pool("Base", "aave-v3", "AAVE", 400_000),
  pool("Ethereum", "aave-v3", "USDC"),
  pool("Ethereum", "curve-dex", "DAI-USDC-USDT"),
  pool("Arbitrum One", "aave-v3", "USDC"),
  // Long-tail junk that would otherwise be read as an English word.
  pool("Base", "someproject", "SAFE", 200_000),
];

test("extracts chain, asset and protocol from a natural question", () => {
  const p = parseQuestion("Is Aave v3 on Base safe for USDC?", POOLS);
  assert.equal(p.chain, "Base");
  assert.equal(p.asset, "USDC");
  assert.equal(p.protocol, "aave-v3");
});

test("matches a protocol by brand, not the full slug", () => {
  // Nobody types "curve-dex" — they type "Curve".
  const p = parseQuestion("Has Curve been hacked?", POOLS);
  assert.equal(p.protocol, "curve-dex");
  assert.equal(p.intent, "FRAUD_DETECTION");
});

test("a protocol brand that is also a ticker is not read as the asset", () => {
  // AAVE is a real token, but here "Aave" names the protocol.
  const p = parseQuestion("Is Aave safe for USDC on Base?", POOLS);
  assert.equal(p.protocol, "aave-v3");
  assert.equal(p.asset, "USDC");
});

test("the full slug outranks a bare brand match", () => {
  const withVersion = parseQuestion("How risky is aerodrome v1 on Base?", POOLS);
  assert.equal(withVersion.protocol, "aerodrome-v1");
});

test("protocols whose names are English words are not matched on those words", () => {
  // DefiLlama really has "the-vault-liquid-staking" and "yield-yak-aggregator";
  // brand-matching "the" or "yield" once answered a weather question with a
  // Solana staking pool.
  const noise = [...POOLS, pool("Solana", "the-vault-liquid-staking", "VSOL", 138_000_000)];
  const p = parseQuestion("What is the weather in Paris?", noise);
  assert.equal(p.protocol, undefined);
  assert.equal(p.asset, undefined);
  assert.equal(p.chain, undefined);
});

test("a generic-named protocol still matches when written out in full", () => {
  const noise = [...POOLS, pool("Solana", "the-vault-liquid-staking", "VSOL", 138_000_000)];
  const p = parseQuestion("How safe is the vault liquid staking?", noise);
  assert.equal(p.protocol, "the-vault-liquid-staking");
});

test("a chain name is not also read as the asset", () => {
  // "BASE" is a plausible ticker, but here it is the chain.
  const p = parseQuestion("What is the best yield on Base?", POOLS);
  assert.equal(p.chain, "Base");
  assert.equal(p.asset, undefined);
});

test("multi-word chain names match", () => {
  const p = parseQuestion("How risky is USDC on Arbitrum One?", POOLS);
  assert.equal(p.chain, "Arbitrum One");
  assert.equal(p.asset, "USDC");
});

test("English words that are also tickers are not treated as assets", () => {
  // "SAFE" is a real symbol in the pool set; as a question word it must not win.
  const p = parseQuestion("Is it safe?", POOLS);
  assert.equal(p.asset, undefined);
});

test("prefers the longest ticker present", () => {
  const p = parseQuestion("Compare WSTETH and WETH on Base", POOLS);
  assert.equal(p.asset, "WSTETH");
});

test("asset resolution is scoped to the named chain", () => {
  // DAI only exists on Ethereum in this set, so a Base question shouldn't take it.
  const p = parseQuestion("Any DAI pools on Base?", POOLS);
  assert.equal(p.chain, "Base");
  assert.equal(p.asset, undefined);
});

test("intent classification picks the most specific ask", () => {
  assert.equal(classifyIntent("Has Curve been hacked?"), "FRAUD_DETECTION");
  assert.equal(classifyIntent("What is the TVL of Aave?"), "TVL_LOOKUP");
  assert.equal(classifyIntent("What APY does Aave pay?"), "FINANCIAL_DATA");
  // Exploit beats TVL when a question asks both.
  assert.equal(classifyIntent("What is Curve's TVL since the hack?"), "FRAUD_DETECTION");
  // Unrecognised questions still resolve to a servable intent.
  assert.equal(classifyIntent("Tell me about Aave"), "FINANCIAL_DATA");
});

test("reports what it extracted", () => {
  const p = parseQuestion("Is USDC safe on Base?", POOLS);
  assert.deepEqual(p.matched.sort(), ["asset=USDC", "chain=Base"]);
});
