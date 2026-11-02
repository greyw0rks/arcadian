import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeEventTopics, encodeAbiParameters, type Hex, type Log } from "viem";
import { verifyAuthorizationReceipt } from "./settlement";
import { net, signer, txHash } from "./test-support";

const to = "0x5a2324aA18613FAD4e44bDF0d6c73Ec1f6D87ff8";
const authorization = { from: signer.address, to, value: "10000", validAfter: "0", validBefore: "2000000000", nonce: "0x" + "11".repeat(32) } as const;
const nonce = (n: string) => ({ address: net.usdc, data: "0x" as Hex,
  topics: encodeEventTopics({ abi: [{ type: "event", name: "AuthorizationUsed", inputs: [{ name: "authorizer", type: "address", indexed: true }, { name: "nonce", type: "bytes32", indexed: true }] }], eventName: "AuthorizationUsed", args: { authorizer: signer.address, nonce: n as Hex } }) });
const transfer = (value = 10000n) => ({ address: net.usdc,
  topics: encodeEventTopics({ abi: [{ type: "event", name: "Transfer", inputs: [{ name: "from", type: "address", indexed: true }, { name: "to", type: "address", indexed: true }, { name: "value", type: "uint256" }] }], eventName: "Transfer", args: { from: signer.address, to } }),
  data: encodeAbiParameters([{ type: "uint256" }], [value]) });
function receipt(logs: ReturnType<typeof transfer>[]) { return { status: "success", transactionHash: txHash as Hex, blockNumber: 123n,
  logs: logs.map(log => ({ ...log, topics: log.topics as Log["topics"] })) }; }
test("verify the correct authorization and transfer inside a batched transaction", () => {
  const result = verifyAuthorizationReceipt(receipt([nonce("0x" + "22".repeat(32)), transfer(), nonce(authorization.nonce), transfer()]), txHash as Hex, authorization as never, net);
  assert.equal(result.verified, true);
});
test("a successful unrelated USDC transfer cannot prove this payment", () => {
  assert.equal(verifyAuthorizationReceipt(receipt([transfer()]), txHash as Hex, authorization as never, net).verified, false);
  assert.equal(verifyAuthorizationReceipt(receipt([nonce(authorization.nonce), transfer(99999n)]), txHash as Hex, authorization as never, net).verified, false);
});
