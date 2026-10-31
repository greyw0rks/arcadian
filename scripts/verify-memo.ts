import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import { setDefaultResultOrder } from "node:dns";
import { isAddress, type Address } from "viem";
import { activeNetwork, telegraphGateway } from "../agent/config";
import { validateTradeSubject } from "../agent/policy";
import { verifyTradeMemo } from "../agent/verify";

setDefaultResultOrder("ipv4first");
async function main() {
  const { values } = parseArgs({ options: { file: { type: "string" }, signer: { type: "string" },
    token: { type: "string" }, chain: { type: "string" }, usd: { type: "string" }, out: { type: "string" }, help: { type: "boolean" } } });
  if (values.help) {
    console.log("npm run verify:memo -- --file <signed-memo.json> --signer <trusted-operator-address> --token <token-contract> --chain Base --usd 1000 [--out verification.json]\nRead-only: verifies signature, exact trade, current policy, chain payments and recorded signals. Exit 0 permits the proposed trade; exit 2 holds or blocks it; exit 1 is invalid configuration.");
    return;
  }
  if (!values.file || !values.signer || !isAddress(values.signer, { strict: false }) || !values.token || !values.chain || !values.usd) throw new Error("Provide --file, --signer, --token, --chain and --usd; get the trusted signer independently of the memo");
  const text = await readFile(values.file, "utf8");
  if (Buffer.byteLength(text) > 262_144) throw new Error("Memo exceeds 256 KiB");
  const subject = validateTradeSubject({ tokenAddress: values.token, chain: values.chain, notionalUsd: Number(values.usd) });
  const gateway = telegraphGateway();
  if (!gateway) throw new Error("Configure a supported Telegraph Engine URL");
  const input = JSON.parse(text);
  const report = await verifyTradeMemo(input.signature ? input : input.memo, { trustedSigner: values.signer as Address,
    expectedSubject: subject, net: activeNetwork(), gateway });
  const output = JSON.stringify(report, null, 2) + "\n";
  if (values.out) {
    await mkdir(dirname(values.out), { recursive: true });
    await writeFile(values.out, output, { mode: 0o600 });
  }
  console.log(output.trimEnd());
  if (!report.canProceed) process.exitCode = 2;
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Memo verification failed"); process.exitCode = 1; });
