import { test } from "node:test";
import assert from "node:assert/strict";
import {
  selectTopMiner,
  pickEndpoint,
  type Leaderboard,
  type Integration,
} from "./telegraph";

const board: Leaderboard = {
  epoch: 376,
  intents: {
    FRAUD_DETECTION: [
      { miner_slug: "txlens", score: 1, rank: 1, activation_status: "active" },
      { miner_slug: "ghost-miner", score: 0.9, rank: 2, activation_status: "active" },
      { miner_slug: "arcadian-defi-risk", score: 0.5, rank: 3, activation_status: "active" },
      { miner_slug: "sleepy", score: 0.4, rank: 4, activation_status: "inactive" },
    ],
    EMPTY_BOARD: [],
  },
};

const integ = (slug: string, extra: Partial<Integration> = {}): Integration => ({
  id: slug,
  slug,
  kind: "miner",
  base_url: `https://${slug}.example`,
  endpoints: [
    { path: "/ask", external_path: "/api/x", method: "POST", intents: ["FRAUD_DETECTION"] },
  ],
  min_price_usdc: 0.01,
  activation_status: "active",
  ...extra,
});

// txlens is top but has no integration record (not resolvable); ghost-miner has
// no base_url; arcadian is the first fully resolvable one.
const integrations: Integration[] = [
  integ("ghost-miner", { base_url: undefined }),
  integ("arcadian-defi-risk", { name: "Arcadian" }),
  integ("sleepy"),
];

test("skips higher-ranked miners that do not resolve, picks the first that does", () => {
  const r = selectTopMiner(board, integrations, "FRAUD_DETECTION");
  assert.equal(r?.slug, "arcadian-defi-risk");
  assert.equal(r?.rank, 3);
  assert.equal(r?.baseUrl, "https://arcadian-defi-risk.example");
  assert.equal(r?.gatewayPath, "/ask");
  assert.equal(r?.method, "POST");
});

test("excludeSlugs lets a buyer route around a given miner (e.g. itself)", () => {
  const r = selectTopMiner(board, integrations, "FRAUD_DETECTION", {
    excludeSlugs: ["arcadian-defi-risk"],
  });
  // only sleepy remains resolvable, but it is inactive → null under requireActive
  assert.equal(r, null);
});

test("requireActive:false allows an inactive miner through", () => {
  const r = selectTopMiner(board, integrations, "FRAUD_DETECTION", {
    excludeSlugs: ["arcadian-defi-risk"],
    requireActive: false,
  });
  assert.equal(r?.slug, "sleepy");
});

test("missing or empty board returns null", () => {
  assert.equal(selectTopMiner(board, integrations, "NOT_ON_BOARD"), null);
  assert.equal(selectTopMiner(board, integrations, "EMPTY_BOARD"), null);
});

test("pickEndpoint prefers a POST endpoint serving the intent", () => {
  const i = integ("m", {
    endpoints: [
      { path: "/health", method: "GET" },
      { path: "/other", method: "POST", intents: ["TVL_LOOKUP"] },
      { path: "/ask", method: "POST", intents: ["FRAUD_DETECTION"] },
    ],
  });
  assert.equal(pickEndpoint(i, "FRAUD_DETECTION")?.path, "/ask");
});

test("pickEndpoint falls back to any POST when none names the intent", () => {
  const i = integ("m", {
    endpoints: [
      { path: "/health", method: "GET" },
      { path: "/score", method: "POST" },
    ],
  });
  assert.equal(pickEndpoint(i, "FRAUD_DETECTION")?.path, "/score");
});
