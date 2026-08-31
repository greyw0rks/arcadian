import { test } from "node:test";
import assert from "node:assert/strict";
import { matchHacks, type HackRecord } from "./sources";

const hack = (name: string, defillamaId: string | null = null): HackRecord => ({
  name,
  defillamaId,
  date: 1_600_000_000,
  amount: 5_000_000,
  classification: "Protocol Logic",
  technique: "Logic error",
  chain: ["Ethereum"],
  returnedFunds: null,
});

const HACKS = [
  hack("Aave"),
  hack("Aave V3"),
  hack("Aavegotchi"),
  hack("Uniswap V1"),
  hack("Zunami Protocol"),
  hack("Origin Protocol"),
  hack("Yield Protocol"),
  hack("Curve DEX"),
  hack("Maya Protocol"),
  hack("Some Unlinked Incident", "centrifuge"),
];

test("brand tokens match version variants of the same protocol", () => {
  const names = matchHacks(HACKS, "aave-v3").map((h) => h.name);
  assert.deepEqual(names, ["Aave", "Aave V3"]);
});

test("word boundaries prevent unrelated-name collisions", () => {
  // "Aavegotchi" contains "aave" as a substring but is a different project.
  assert.equal(matchHacks(HACKS, "aave-v3").some((h) => h.name === "Aavegotchi"), false);
});

test("generic slug words do not sweep in other projects' exploits", () => {
  // The bug: "centrifuge-protocol" matched every hack named "<x> Protocol",
  // inflating exploit_history to the full 20/20 penalty.
  assert.deepEqual(matchHacks(HACKS, "centrifuge-protocol"), []);
});

test("all-generic slugs fall back to a whole-phrase match", () => {
  const names = matchHacks(HACKS, "yield-protocol").map((h) => h.name);
  assert.deepEqual(names, ["Yield Protocol"]);
});

test("defillamaId is authoritative even when the name does not match", () => {
  const names = matchHacks(HACKS, "centrifuge-protocol", "centrifuge").map((h) => h.name);
  assert.deepEqual(names, ["Some Unlinked Incident"]);
});

test("generic-only slugs shorter than the phrase floor match nothing", () => {
  assert.deepEqual(matchHacks(HACKS, "dex"), []);
});
