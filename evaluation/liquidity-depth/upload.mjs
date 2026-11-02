import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { setDefaultResultOrder } from "node:dns";
import { privateKeyToAccount } from "viem/accounts";
import { prepareSubmission } from "./submission.mjs";

setDefaultResultOrder("ipv4first");
async function main() {
  const { values } = parseArgs({ options: { packet: { type: "string" }, send: { type: "boolean" }, "use-agent-payer": { type: "boolean" } } });
  if (!values.packet) throw new Error("Provide --packet <prepared-directory>; --send uploads after verification");
  const path = values.packet;
  const stored = JSON.parse(await readFile(`${path}/request.json`, "utf8"));
  const body = await readFile(`${path}/body.jsonl`);
  const message = await readFile(`${path}/message.txt`, "utf8");
  const prepared = prepareSubmission(body, { submitter: stored.submitter, chainId: stored.chainId, nonce: stored.nonce,
    node: new URL(stored.url).origin });
  if (prepared.bodySha256 !== stored.bodySha256 || prepared.message !== message || message !== stored.message || prepared.url !== stored.url) throw new Error("Packet bytes, message or request URL changed");
  if (!values.send) {
    console.log(JSON.stringify({ ...prepared, state: "ready_to_sign", paymentSigned: false, paymentSent: false }, null, 2));
    return;
  }
  // Refuse automatic retries after a response loss; inspect contributor row states first.
  const attemptFile = await import("node:fs/promises").then(fs => fs.open(`${path}/upload-attempt.json`, "wx", 0o600));
  await attemptFile.writeFile(JSON.stringify({ startedAt: new Date().toISOString(), submitter: prepared.submitter,
    bodySha256: prepared.bodySha256, nonce: prepared.nonce, chainId: prepared.chainId }) + "\n");
  await attemptFile.close();
  const key = values["use-agent-payer"] ? process.env.AGENT_PRIVATE_KEY : process.env.EVALPOOL_PRIVATE_KEY;
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error("Configure the selected contributor key server-side");
  const account = privateKeyToAccount(key);
  if (account.address.toLowerCase() !== prepared.submitter.toLowerCase()) throw new Error("Configured key is not the selected contributor");
  const signature = await account.signMessage({ message });
  const response = await fetch(prepared.url, { method: "POST", redirect: "error", signal: AbortSignal.timeout(30_000),
    headers: { ...prepared.headers, [prepared.signatureHeader]: signature }, body });
  const responseBody = await response.text();
  let result;
  try { result = JSON.parse(responseBody); } catch { result = { unparsedBody: responseBody.slice(0, 4000) }; }
  const report = { completedAt: new Date().toISOString(), httpStatus: response.status, submitter: account.address,
    chainId: prepared.chainId, bodySha256: prepared.bodySha256, bytes: prepared.bytes, submittedRows: prepared.rows,
    result, submissionSignatureCreated: true, paymentSigned: false, paymentSent: false };
  await writeFile(`${path}/upload-response.json`, JSON.stringify(report, null, 2) + "\n", { mode: 0o600 });
  console.log(JSON.stringify(report, null, 2));
  if (!response.ok) process.exitCode = 1;
}
main().catch(error => {
  console.error(error?.code === "EEXIST" ? "An upload attempt already exists. Query contributor row states before preparing a fresh nonce."
    : error instanceof TypeError ? "Upload transport failed; preserve the packet and inspect contributor rows before retrying."
    : error.message);
  process.exitCode = 1;
});
