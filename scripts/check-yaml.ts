import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import { inspectMinerManifest, requireAnjomanValidation } from "../lib/miner-manifest";

async function main() {
  const { values } = parseArgs({ options: { out: { type: "string" }, "anjoman-report": { type: "string" } } });
  const yaml = await readFile("public/telegraph-risk.yaml", "utf8");
  const inspected = inspectMinerManifest(yaml);
  let anjomanValidated = false;
  if (values["anjoman-report"]) {
    requireAnjomanValidation(JSON.parse(await readFile(values["anjoman-report"], "utf8")), yaml);
    anjomanValidated = true;
  }
  const report = { checkedAt: new Date().toISOString(), yamlSha256: inspected.yamlSha256,
    localContractPassed: inspected.passed, anjomanValidated, errors: inspected.errors,
    slug: inspected.manifest.slug, intents: inspected.manifest.semantics.supported_intents,
    reference: "https://anjoman.ai/docs/miners/yaml-config", referenceUpdated: "2026-11-01",
    scope: "Local contract checks are not official node validation. Anjoman validation is reported only when a matching saved response is supplied." };
  if (values.out) { await mkdir(dirname(values.out), { recursive: true }); await writeFile(values.out, JSON.stringify(report, null, 2) + "\n"); }
  console.log(JSON.stringify(report, null, 2));
  if (!inspected.passed) process.exitCode = 1;
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
