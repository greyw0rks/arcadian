import { test } from "node:test";
import assert from "node:assert/strict";
import { matchProviderIdentity } from "./provider-identity";
const expected = { minerId: "71008", registrationId: "3626", intent: "ONCHAIN_METRIC_VERIFY_GENERAL" };
const miner = { id: "71008", slug: "fixture-provider", yaml_url: "https://example.org/miner.yaml",
  wallet_address: "0x1111111111111111111111111111111111111111", activation_status: "active", supported_intents: [expected.intent] };
const registry = { registration_id: 3626, slug: miner.slug, yaml_url: miner.yaml_url, miner_address: miner.wallet_address,
  activation_status: "active", supported_intents: [expected.intent] };
test("distinct Engine and receipt IDs require a matching registry/catalog identity", () => {
  assert.deepEqual(matchProviderIdentity([miner], { miner: registry }, expected),
    { minerId: "71008", registrationId: "3626", slug: miner.slug, yamlUrl: miner.yaml_url });
  for (const change of [{ registration_id: 3627 }, { slug: "unrelated" }, { yaml_url: "https://example.org/other.yaml" },
    { miner_address: "0x2222222222222222222222222222222222222222" }, { supported_intents: [] }, { activation_status: "rejected" }]) {
    assert.equal(matchProviderIdentity([miner], { ...registry, ...change }, expected), null);
  }
  assert.equal(matchProviderIdentity([miner, miner], registry, expected), null);
});
