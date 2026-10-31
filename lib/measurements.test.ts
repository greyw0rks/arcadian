import { test } from "node:test";
import assert from "node:assert/strict";
import { measureTvl, measureYield } from "./measurements";
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
