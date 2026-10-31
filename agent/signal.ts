import { stableStringify } from "./memo";

export interface SignalBinding {
  query: string;
  payer: string;
  minerId: string;
  minerSlug: string;
  intent: string;
}

/** Bind the live node's stored payload to this request and raw answer.
 * This checks a network record, not a validator grading or a recomputed hash.
 */
export function signalRecordMatches(record: unknown, signalHash: string, result: unknown, expected: SignalBinding): boolean {
  if (!record || typeof record !== "object") return false;
  const r = record as Record<string, any>;
  const payload = r.payload;
  const signal = r.signal;
  if (!payload || typeof payload !== "object" || !signal || typeof signal !== "object") return false;
  return typeof r.signal_hash === "string" && r.signal_hash.toLowerCase() === signalHash.toLowerCase() &&
    typeof signal.signal_hash === "string" && signal.signal_hash.toLowerCase() === signalHash.toLowerCase() &&
    payload.request === expected.query && payload.response !== undefined &&
    stableStringify(payload.response) === stableStringify(result) &&
    payload.intent_id === expected.intent && signal.intent_id === expected.intent &&
    String(payload.subnet_id) === expected.minerId && String(signal.subnet_id) === expected.minerId &&
    payload.miner_slug === expected.minerSlug && signal.miner_slug === expected.minerSlug &&
    typeof payload.wallet_address === "string" && payload.wallet_address.toLowerCase() === expected.payer.toLowerCase() &&
    typeof signal.wallet_address === "string" && signal.wallet_address.toLowerCase() === expected.payer.toLowerCase();
}

export async function verifySignalRecord(gateway: string, signalHash: string, result: unknown, expected: SignalBinding, f: typeof fetch = fetch): Promise<boolean> {
  if (!/^0x[0-9a-f]{64}$/i.test(signalHash)) return false;
  try {
    const response = await f(gateway + "/v1/signal/" + signalHash, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10_000) });
    if (!response.ok) return false;
    return signalRecordMatches(await response.json(), signalHash, result, expected);
  } catch { return false; }
}

/** Return the committed raw answer, never the Engine's model-shaped convenience view. */
export async function readBoundSignal(gateway: string, signalHash: string, expected: SignalBinding, f: typeof fetch = fetch): Promise<{ response: unknown } | null> {
  if (!/^0x[0-9a-f]{64}$/i.test(signalHash)) return null;
  try {
    const response = await f(gateway + "/v1/signal/" + signalHash, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10_000) });
    if (!response.ok) return null;
    const record = await response.json();
    const raw = record?.payload?.response;
    return raw !== undefined && signalRecordMatches(record, signalHash, raw, expected) ? { response: raw } : null;
  } catch { return null; }
}
