import { createHash } from "node:crypto";
import { parse } from "yaml";
import { MINER_INTENTS } from "./measurements";

export const MINER_REGISTRY = "0x3624EB012B5E998BB57B6bE6C9Cfc9c4bc5eb99b" as const;
export const MINER_MACHINA = "0xd68305cA83C7AF42A4F720144E7416fB53F8AaF4" as const;

/** Local checks against Anjoman's November 1 field reference; not node validation. */
export function inspectMinerManifest(yaml: string) {
  const manifest = parse(yaml);
  const errors: string[] = [];
  const top = new Set(["version", "kind", "id", "slug", "protocol", "name", "description", "base_url", "docs", "limitations", "auth", "rate_limit_per_sec", "cache_ttl_sec", "circuit_threshold", "circuit_cooldown_seconds", "errors", "endpoints", "input_schema", "output_schema", "semantics", "intent_mapping", "polling", "on_chain"]);
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) throw new Error("The manifest must be a YAML object");
  for (const key of Object.keys(manifest)) if (!top.has(key)) errors.push("Unknown top-level field: " + key);
  if (manifest.version !== "1" || manifest.kind !== "miner") errors.push("Use version '1' and kind miner");
  if (!Number.isSafeInteger(manifest.id) || manifest.id <= 0) errors.push("id must be a positive integer");
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(manifest.slug ?? "")) errors.push("slug must be kebab-case");
  if (typeof manifest.name !== "string" || !manifest.name.trim()) errors.push("name is required");
  try { if (new URL(manifest.base_url).protocol !== "https:") throw new Error(); } catch { errors.push("base_url must be HTTPS"); }
  if (!Array.isArray(manifest.limitations) || manifest.limitations.some((l: Record<string, unknown>) => typeof l.code !== "string" || typeof l.message !== "string")) errors.push("limitations must be an array of code/message objects");
  const intents = manifest.semantics?.supported_intents;
  if (!Array.isArray(intents) || JSON.stringify([...intents].sort()) !== JSON.stringify([...MINER_INTENTS].sort())) errors.push("Supported Intents must match the implemented canonical children");
  for (const key of Object.keys(manifest.semantics?.signal_mapping ?? {})) if (!["label_field", "confidence_field", "reason_field"].includes(key)) errors.push("Unknown signal_mapping field: " + key);
  const endpointKeys = new Set(["path", "external_path", "method", "description", "intents", "params", "endpoint_base_url", "content_type", "multipart_fields", "param_map"]);
  if (!Array.isArray(manifest.endpoints) || !manifest.endpoints.length) errors.push("At least one endpoint is required");
  for (const endpoint of manifest.endpoints ?? []) {
    for (const key of Object.keys(endpoint)) if (!endpointKeys.has(key)) errors.push("Unknown endpoint field: " + key);
    if (endpoint.path !== "/api/telegraph/measure" || endpoint.external_path !== "/api/telegraph/measure" || endpoint.method !== "POST") errors.push("The endpoint must point to the implemented POST measurement route");
    if (typeof endpoint.description !== "string" || !endpoint.description.trim()) errors.push("Each endpoint needs a description");
    if (!Array.isArray(endpoint.intents) || endpoint.intents.some((i: string) => !intents?.includes(i))) errors.push("Endpoint Intents must be declared in semantics");
    if (!endpoint.params?.body?.required?.some((p: { name: string }) => p.name === "intent")) errors.push("The request contract must require intent");
    for (const group of Object.values(endpoint.params ?? {}) as { required?: Record<string, unknown>[]; optional?: Record<string, unknown>[] }[]) {
      for (const parameter of [...(group.required ?? []), ...(group.optional ?? [])]) {
        if (parameter.accepted_fields !== undefined && (parameter.accepted_fields === null || typeof parameter.accepted_fields !== "object" || Array.isArray(parameter.accepted_fields))) errors.push("accepted_fields must be an object, as required by the live Anjoman validator");
      }
    }
  }
  for (const intent of MINER_INTENTS) {
    const mapping = manifest.intent_mapping?.[intent];
    if (!mapping || mapping.endpoint !== "/api/telegraph/measure" || mapping.input?.intent?.from !== "const" || mapping.input.intent.value !== intent) errors.push("Missing deterministic request mapping for " + intent);
  }
  if (manifest.intent_mapping?.CRYPTO_YIELD_RATE_GENERAL?.output?.supply_apy?.unit !== "basis points") errors.push("Canonical supply APY must map basis points");
  return { manifest, yamlSha256: createHash("sha256").update(yaml).digest("hex"), errors, passed: errors.length === 0 };
}

/** A saved public Anjoman response, bound to the bytes reviewed there. */
export function requireAnjomanValidation(report: unknown, yaml: string) {
  const { manifest, yamlSha256 } = inspectMinerManifest(yaml);
  const envelope = report as { source?: string; yamlSha256?: string; validation?: { valid?: boolean; slug?: string; name?: string; results?: { path: string; method: string; success: boolean; status: number }[] } };
  if (envelope?.source !== "anjoman" || envelope.yamlSha256 !== yamlSha256) throw new Error("Anjoman review must identify the exact current YAML SHA-256");
  const validation = envelope.validation;
  if (validation?.valid !== true || validation.slug !== manifest.slug || validation.name !== manifest.name) throw new Error("Anjoman has not accepted this manifest identity");
  for (const endpoint of manifest.endpoints) {
    const result = validation.results?.find(r => r.path === endpoint.path && r.method === endpoint.method);
    const reachable = result && ((result.status >= 200 && result.status < 300) || result.status === 400 || result.status === 422);
    if (!result?.success || !reachable) throw new Error("Anjoman must reach the real endpoint " + endpoint.path + "; a 404/405 does not establish endpoint correctness");
  }
  return validation;
}
