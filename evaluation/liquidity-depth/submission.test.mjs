import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { prepareSubmission } from "./submission.mjs";

const options = { submitter: "0x1111111111111111111111111111111111111111", chainId: 84532, nonce: "fixture_nonce_123" };
const body = Buffer.from(JSON.stringify({ intent_id: "LIQUIDITY_DEPTH_VERIFY_GENERAL", prompt: "Synthetic fixture for request serialization.",
  chosen: "The complete fixture answer.", rejected: "A different fixture answer.", label_kind: "preference_pair", provenance: { source_kind: "synthetic" } }) + "\n");
test("submission signs the exact five-line message and exact body bytes", () => {
  const request = prepareSubmission(body, options);
  assert.equal(request.message, `Telegraph eval-pool submission v1\nintent_id: LIQUIDITY_DEPTH_VERIFY_GENERAL\nbody_sha256: ${createHash("sha256").update(body).digest("hex")}\nnonce: fixture_nonce_123\nchain_id: 84532`);
  assert.equal(request.message.endsWith("\n"), false);
  assert.notEqual(prepareSubmission(body.subarray(0, -1), options).bodySha256, request.bodySha256);
  assert.notEqual(prepareSubmission(body, { ...options, chainId: 11155111 }).message, request.message);
  assert.equal(new URL(request.url).searchParams.get("submitter"), options.submitter);
  assert.equal(request.submitted, false);
});
test("invalid identities, replay fields, row types and endpoints are refused", () => {
  for (const change of [{ submitter: "0x" + "0".repeat(40) }, { chainId: 0 }, { nonce: "short" },
    { node: "http://example.com" }, { node: "https://user:password@example.com" }]) {
    assert.throws(() => prepareSubmission(body, { ...options, ...change }));
  }
  assert.throws(() => prepareSubmission(Buffer.from('{"intent_id":"OTHER"}\n'), options));
  assert.throws(() => prepareSubmission(Buffer.concat([body, body]), options), /Duplicate/);
  assert.throws(() => prepareSubmission(Buffer.from([0xff]), options));
});
