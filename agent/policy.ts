import { isAddress } from "viem";

export const TRADE_INTENTS = ["SMART_CONTRACT_AUDIT", "WASH_TRADING_DETECTION", "ONCHAIN_METRIC_VERIFY", "LIQUIDITY_DEPTH_VERIFY"] as const;
export type TradeIntent = typeof TRADE_INTENTS[number];
export type GateDecision = "PROCEED" | "BLOCK" | "REVIEW" | "NO_DATA";

export const TRADE_CHAINS = [
  { name: "Base", id: 8453 },
  { name: "Ethereum", id: 1 },
  { name: "Arbitrum", id: 42161 },
  { name: "Optimism", id: 10 },
  { name: "Polygon", id: 137 },
] as const;

export interface TradeSubject {
  tokenAddress: string;
  chain: string;
  chainId: number;
  notionalUsd: number;
  protocol?: string;
  token?: string;
}

export interface RiskObservation {
  subjectBound: boolean;
  observedAt: string | null;
  status: "pass" | "block" | "unknown";
  riskScore: number | null;
  confidence: number | null;
  flags: string[];
  /** Executable depth, never pool TVL or market capitalization. */
  liquidityUsd: number | null;
  /** A supported contract-state measurement, anchored to an explicit block. */
  stateVerified?: boolean;
  limitations?: string[];
  summary: string;
}

export const GATE_POLICY = {
  version: "2",
  maximumRiskScore: 20,
  minimumConfidence: 0.8,
  maximumAgeMs: 300_000,
  maximumNotionalShareOfDepth: 0.01,
  minimumWashWindowBlocks: 120,
  requiredIntents: [...TRADE_INTENTS],
} as const;

export function validateTradeSubject(value: unknown): TradeSubject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Provide a token contract, trading chain, and positive USD notional");
  const input = value as Record<string, unknown>;
  if (typeof input.tokenAddress !== "string" || !isAddress(input.tokenAddress, { strict: false }) || /^0x0{40}$/i.test(input.tokenAddress)) throw new Error("Enter a valid EVM token contract address");
  const chain = TRADE_CHAINS.find(c => c.name.toLowerCase() === String(input.chain).toLowerCase());
  if (!chain || (input.chainId !== undefined && input.chainId !== chain.id)) throw new Error("Select a supported trading chain with a matching chain ID");
  const notional = typeof input.notionalUsd === "number" ? input.notionalUsd : NaN;
  if (!Number.isFinite(notional) || notional <= 0 || notional > 100_000_000) throw new Error("Trade notional must be between 0 and 100 million USD");
  return { tokenAddress: input.tokenAddress, chain: chain.name, chainId: chain.id, notionalUsd: notional,
    ...(typeof input.protocol === "string" && input.protocol.length <= 100 ? { protocol: input.protocol } : {}),
    ...(typeof input.token === "string" && input.token.length <= 30 ? { token: input.token } : {}) };
}

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function number(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function flag(value: unknown): boolean | null {
  if (value === true || value === 1 || value === "1" || value === "true") return true;
  if (value === false || value === 0 || value === "0" || value === "false") return false;
  return null;
}

/** Conservative adapters: unsupported prose cannot authorize a trade. */
export function parseObservation(raw: unknown, intent: string, subject: TradeSubject, providerSlug?: string): RiskObservation {
  const body = object(raw);
  const who = object(body.subject);
  const address = who.token_address ?? who.tokenAddress ?? body.token_address ?? body.tokenAddress ?? body.contract_address ?? body.address;
  const chainId = who.chain_id ?? who.chainId ?? body.chain_id ?? body.chainId;
  const subjectBound = typeof address === "string" && address.toLowerCase() === subject.tokenAddress.toLowerCase() && Number(chainId) === subject.chainId;
  const risk = number(body.risk_score);
  const confidence = number(body.confidence);
  const flags = Array.isArray(body.flags) ? body.flags.filter((v): v is string => typeof v === "string").slice(0, 30) : [];
  const summaryValue = body.signal ?? body.summary ?? body.answer;
  const summary = typeof summaryValue === "string" ? summaryValue.slice(0, 2000) : "Provider returned no structured finding for this trade";
  const status = body.status === "pass" || body.status === "block" ? body.status : "unknown";
  const observation: RiskObservation = {
    subjectBound,
    observedAt: typeof body.observed_at === "string" && Number.isFinite(Date.parse(body.observed_at)) ? body.observed_at : null,
    status,
    riskScore: risk !== null && risk >= 0 && risk <= 100 ? risk : null,
    confidence: confidence !== null && confidence >= 0 && confidence <= 1 ? confidence : null,
    flags,
    liquidityUsd: intent === "LIQUIDITY_DEPTH_VERIFY" && body.metric === "executable_depth_usd" && number(body.value) !== null && (body.value as number) > 0 ? body.value as number : null,
    summary,
  };

  // Provider-specific units come from its published schema, not the query.
  if (intent === "WASH_TRADING_DETECTION" && providerSlug === "verifywire-wash-trading") {
    const score = number(body.risk_score);
    const window = number(body.window_blocks);
    observation.observedAt = typeof body.as_of === "string" && Number.isFinite(Date.parse(body.as_of)) ? body.as_of : null;
    observation.riskScore = score !== null && score >= 0 && score <= 1 ? score * 100 : null;
    const covered = window !== null && Number.isInteger(window) && window >= GATE_POLICY.minimumWashWindowBlocks && number(body.transfers) !== null && (body.transfers as number) > 0;
    observation.status = body.risk_label === "LOW" && body.verified === true && covered ? "pass" : "unknown";
    observation.limitations = ["Transfer-log patterns are a heuristic, not proof of artificial trading.",
      ...(covered ? [] : ["The scan does not cover the required 120-block window."])];
  }

  if (intent === "ONCHAIN_METRIC_VERIFY" && providerSlug === "verifywire-onchain-metric") {
    observation.observedAt = typeof body.as_of === "string" && Number.isFinite(Date.parse(body.as_of)) ? body.as_of : null;
    observation.riskScore = null;
    observation.stateVerified = subjectBound && body.metric === "view_call" && body.calldata === "0x18160ddd" &&
      typeof body.block === "string" && /^(?:0x[0-9a-f]+|[0-9]+)$/i.test(body.block) &&
      typeof body.value === "string" && /^0x[0-9a-f]{64}$/i.test(body.value) &&
      typeof body.value_uint === "string" && /^[0-9]+$/.test(body.value_uint) &&
      BigInt(body.value) === BigInt(body.value_uint);
    observation.status = observation.stateVerified ? "pass" : "unknown";
    observation.limitations = observation.stateVerified ? [] : ["Token totalSupply must be read at an explicit block; 'latest' is not a reproducible block anchor."];
  }

  if (intent === "LIQUIDITY_DEPTH_VERIFY" && providerSlug === "verifywire-liquidity-depth") {
    observation.observedAt = typeof body.as_of === "string" && Number.isFinite(Date.parse(body.as_of)) ? body.as_of : null;
    observation.riskScore = null;
    observation.status = "unknown";
    observation.limitations = ["This provider quotes a symbol pair and base-asset size. It does not bind executable USD depth to this token contract and proposed USD notional."];
  }

  // GoPlus' documented token-security object includes address-specific flags.
  // Its lack of an upstream observation timestamp remains visible and cannot pass.
  if (intent === "SMART_CONTRACT_AUDIT") {
    const security = object(object(body.result)[subject.tokenAddress.toLowerCase()]);
    const threats = ["is_honeypot", "is_blacklisted", "transfer_pausable", "cannot_sell_all", "slippage_modifiable", "is_proxy"];
    const present = threats.filter(key => flag(security[key]) !== null);
    const dangerous = present.filter(key => flag(security[key]) === true);
    if (present.length) {
      observation.flags = [...flags, ...dangerous];
      observation.status = dangerous.length ? "block" : "unknown";
      observation.summary = dangerous.length ? "Token-security flags: " + dangerous.join(", ") : "Token-security flags returned; complete timestamped coverage is still required";
      // Chain binding still comes from the response, never a request assumption.
      observation.subjectBound = Number(body.chain_id) === subject.chainId;
    }
  }
  return observation;
}

export interface PolicyCheck {
  intent: string;
  observation: RiskObservation | null;
  paid: boolean;
  receiptVerified: boolean;
  signalVerified: boolean;
  error?: string;
}

export function evaluateTrade(subject: TradeSubject, checks: PolicyCheck[], now: number = Date.now()): { decision: GateDecision; reasons: string[]; overallRisk: number | null } {
  const risks = checks.map(c => c.observation?.riskScore).filter((n): n is number => typeof n === "number");
  const overallRisk = risks.length ? Math.max(...risks) : null;
  const blocking = checks.filter(c => c.paid && c.receiptVerified && c.signalVerified && !c.error &&
    c.observation?.subjectBound && c.observation.status === "block" && c.observation.observedAt &&
    now - Date.parse(c.observation.observedAt) >= -60_000 && now - Date.parse(c.observation.observedAt) <= GATE_POLICY.maximumAgeMs);
  if (blocking.length) return { decision: "BLOCK", reasons: blocking.map(c => c.intent + ": " + c.observation!.summary), overallRisk };
  if (!checks.some(c => c.observation?.subjectBound)) return { decision: "NO_DATA", reasons: ["No subject-specific evidence was returned for this token and chain"], overallRisk: null };
  const reasons: string[] = [];
  for (const intent of TRADE_INTENTS) {
    const rows = checks.filter(c => c.intent === intent);
    if (rows.length !== 1) { reasons.push(intent + ": exactly one required check must resolve"); continue; }
    const check = rows[0];
    const o = check.observation;
    if (check.error || !check.paid || !check.receiptVerified || !check.signalVerified) { reasons.push(intent + ": " + (check.error ?? "payment or network evidence is unverified")); continue; }
    if (!o?.subjectBound) { reasons.push(intent + ": evidence names a different subject or chain"); continue; }
    const riskRequired = intent === "SMART_CONTRACT_AUDIT" || intent === "WASH_TRADING_DETECTION";
    if (o.status !== "pass" || (riskRequired && (o.riskScore === null || o.riskScore > GATE_POLICY.maximumRiskScore)) || o.confidence === null || o.confidence < GATE_POLICY.minimumConfidence) reasons.push(intent + ": " + (o.limitations?.join(" ") || "evidence does not meet the risk and confidence policy"));
    const age = o.observedAt ? now - Date.parse(o.observedAt) : Infinity;
    if (age < -60_000 || age > GATE_POLICY.maximumAgeMs) reasons.push(intent + ": evidence is stale or has no observation timestamp");
    if (intent === "LIQUIDITY_DEPTH_VERIFY" && (o.liquidityUsd === null || subject.notionalUsd / o.liquidityUsd > GATE_POLICY.maximumNotionalShareOfDepth)) reasons.push(intent + ": proposed trade exceeds 1% of verified executable depth, or depth is missing");
  }
  return { decision: reasons.length ? "REVIEW" : "PROCEED", reasons: reasons.length ? reasons : ["All required subject-specific checks meet the policy; trade execution remains with the operator"], overallRisk };
}
