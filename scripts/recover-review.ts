import { parseArgs } from "node:util";
import { setDefaultResultOrder } from "node:dns";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { deskReadiness } from "../agent/readiness";
import { configuredReviewStore, validReviewId } from "../agent/store";
import { recoverReview, reviewResponse } from "../agent/reviews";

setDefaultResultOrder("ipv4first");
async function main() {
  const { values } = parseArgs({ options: { "request-id": { type: "string" }, out: { type: "string" }, help: { type: "boolean" } } });
  if (values.help) { console.log("npm run recover:review -- --request-id <uuid-v4> [--out .evidence/recovery.json]\nReads existing authorizations and chain state; signs the updated decision memo but sends no new payment."); return; }
  if (!validReviewId(values["request-id"])) throw new Error("Provide --request-id with the recorded review's UUID v4");
  const readiness = deskReadiness();
  if (!readiness.signer) throw new Error("Configure the review's original signer");
  const store = await configuredReviewStore();
  try {
    const review = await store.get(values["request-id"]);
    if (!review) throw new Error("Review not found");
    const recovered = await recoverReview(store, review, { signer: readiness.signer });
    const response = { ...reviewResponse(recovered), paymentSigned: false, paymentSent: false };
    if (values.out) {
      await mkdir(dirname(values.out), { recursive: true });
      await writeFile(values.out, JSON.stringify(response, null, 2) + "\n", { mode: 0o600 });
      console.log(JSON.stringify({ file: values.out, requestId: recovered.id, reconciliationRequired: recovered.reconciliationRequired,
        cost: recovered.signed?.memo.cost, checks: recovered.checks.map(c => ({ intent: c.intent, paid: c.paid,
          expiredUnused: c.authorizationExpired === true, error: c.error ?? null })), paymentSigned: false, paymentSent: false }, null, 2));
    } else console.log(JSON.stringify(response, null, 2));
    if (recovered.reconciliationRequired) process.exitCode = 2;
  } finally { store.client.close(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Recovery failed"); process.exitCode = 1; });
