import { test } from "node:test";
import assert from "node:assert/strict";
import { measureTvl, measureYield, measureSupplyYield } from "./measurements";
import type { LlamaPool } from "./defillama";
import type { ProtocolMeta } from "./sources";
const pools: LlamaPool[] = [{ pool: "one", project: "aave-v3", chain: "Base", symbol: "USDC", tvlUsd: 90, apy: 2, apyBase: 2, apyReward: 0 }, { pool: "two", project: "aave-v3", chain: "Base", symbol: "USDC", tvlUsd: 10, apy: 20, apyBase: 20, apyReward: 0 }];
const protocols: ProtocolMeta[] = [{ id: "1", slug: "aave-v3", name: "Aave V3", tvl: 1_000_000, chainTvls: { Base: 500_000 },
  audits: "2", audit_links: [], listedAt: null, forkedFrom: null, category: "Lending", gecko_id: null }];
test("TVL uses the complete protocol-chain value instead of the sampled pool sum", () => {
  assert.equal(measureTvl({ protocol: "aave-v3", chain: "Base" }, pools, protocols).value, 500_000);
  assert.equal(measureTvl({ pool_id: "one" }, pools, protocols).value, 90);
  assert.throws(() => measureTvl({ protocol: "aave-v3", asset: "USDC" }, pools, protocols), /different measurement/);
});
test("yield weights the disclosed pools and refuses missing APY rather than returning zero", () => {
  assert.equal(measureYield({ protocol: "aave-v3", chain: "Base" }, pools).value, 3.8);
  assert.throws(() => measureYield({ pool_id: "one" }, [{ ...pools[0], apy: null }]), /unavailable/);
});
test("canonical supply yield excludes incentives and reports basis points", () => {
  const measured = measureSupplyYield({ protocol: "aave-v3", chain: "Base", asset: "USDC" }, pools.map(p => ({ ...p, apy: 50, apyReward: 48 })));
  assert.equal(measured.value, 3.8);
  assert.equal(measured.supply_apy, 380);
  assert.equal(measured.reward_incentives_included, false);
  assert.throws(() => measureSupplyYield({ protocol: "aave-v3", chain: "Base", asset: "USDC" }, [{ ...pools[0], apyBase: null }]), /unavailable/);
});
test("an exact pool cannot override the requested chain or supply asset", () => {
  assert.throws(() => measureTvl({ pool_id: "one", chain: "Ethereum" }, pools, protocols), /different chain/);
  assert.throws(() => measureSupplyYield({ pool_id: "one", chain: "Ethereum", asset: "USDC" }, pools), /different chain/);
  assert.throws(() => measureSupplyYield({ pool_id: "one", chain: "Base", asset: "ETH" }, pools), /matching/);
});
