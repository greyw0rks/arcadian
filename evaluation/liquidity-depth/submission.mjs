import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";

export function prepareSubmission(body, { submitter, chainId, nonce, node = "https://devnode.telegraphprotocol.com" }) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(submitter) || /^0x0{40}$/i.test(submitter)) throw new Error("Choose an explicit contributor address");
  if (!Number.isSafeInteger(chainId) || chainId <= 0) throw new Error("Choose the independently confirmed node chain ID");
  if (!/^[a-zA-Z0-9_-]{8,128}$/.test(nonce)) throw new Error("Nonce must be 8–128 safe characters");
  const base = new URL(node);
  if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash || base.pathname !== "/") throw new Error("Use an HTTPS node origin without credentials");
  const intent = "LIQUIDITY_DEPTH_VERIFY_GENERAL";
  const text = new TextDecoder("utf-8", { fatal: true }).decode(body);
  const lines = text.trimEnd().split("\n");
  if (!lines.length || body.byteLength > 32 * 1024 * 1024) throw new Error("Invalid dataset size");
  const prompts = new Set();
  for (const line of lines) {
    const row = JSON.parse(line);
    if (Buffer.byteLength(line) > 64 * 1024 || row.intent_id !== intent || row.label_kind !== "preference_pair" || row.provenance?.source_kind !== "synthetic") throw new Error("Unexpected row format or provenance");
    for (const [key, min, max] of [["prompt", 16, 16000], ["chosen", 8, 32000], ["rejected", 8, 32000]]) {
      if (typeof row[key] !== "string" || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.test(row[key])) throw new Error("Invalid row text");
      const length = [...row[key].normalize("NFC").replace(/\s+/gu, " ").trim()].length;
      if (length < min || length > max) throw new Error("Invalid row text length");
    }
    const prompt = row.prompt.normalize("NFC").replace(/\s+/gu, " ").trim();
    if (prompts.has(prompt) || row.chosen.trim() === row.rejected.trim()) throw new Error("Duplicate prompt or identical answers");
    prompts.add(prompt);
  }
  const bodySha256 = createHash("sha256").update(body).digest("hex");
  const message = ["Telegraph eval-pool submission v1", `intent_id: ${intent}`, `body_sha256: ${bodySha256}`,
    `nonce: ${nonce}`, `chain_id: ${chainId}`].join("\n");
  const url = new URL("/api/evalpool/submissions", base);
  url.searchParams.set("intent_id", intent);
  url.searchParams.set("submitter", submitter);
  return { intent, submitter, chainId, nonce, bodySha256, bytes: body.byteLength, rows: lines.length,
    method: "POST", url: url.href, headers: { "Content-Type": "application/x-ndjson", "X-Evalpool-Nonce": nonce },
    signatureHeader: "X-Evalpool-Signature", message, signed: false, submitted: false,
    instructions: "Confirm contributor, node chain, and reviewed content. Sign message.txt with EIP-191, then send body.jsonl unchanged with that signature header. HTTP success is not eligibility; retain the response and query contributor row states." };
}

async function main() {
  const { values } = parseArgs({ options: { submitter: { type: "string" }, "chain-id": { type: "string" }, out: { type: "string" } } });
  if (!values.out) throw new Error("Usage: node evaluation/liquidity-depth/submission.mjs --submitter <address> --chain-id <confirmed-chain> --out <new-directory>");
  const body = await readFile(new URL("pairs.jsonl", import.meta.url));
  const request = prepareSubmission(body, { submitter: values.submitter, chainId: Number(values["chain-id"]), nonce: randomBytes(16).toString("hex") });
  const quality = JSON.parse(await readFile(new URL("quality-report.json", import.meta.url), "utf8"));
  if (quality.dataset_sha256 !== request.bodySha256) throw new Error("Quality report belongs to different bytes; rerun the official audit");
  await mkdir(values.out, { recursive: false });
  await writeFile(`${values.out}/body.jsonl`, body);
  await writeFile(`${values.out}/message.txt`, request.message);
  await writeFile(`${values.out}/request.json`, JSON.stringify({ ...request, officialDataGatePassed: quality.gate.ok,
    independentReview: "Confirm the separate review record; this tool does not verify reviewer identity." }, null, 2) + "\n");
  console.log(JSON.stringify({ directory: values.out, ...request }, null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => { console.error(error.message); process.exitCode = 1; });
