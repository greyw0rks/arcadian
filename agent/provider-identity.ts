export interface ProviderIdentityRequest { minerId: string; registrationId: string; intent: string }
export interface ProviderIdentity { minerId: string; registrationId: string; slug: string; yamlUrl: string }

/** Engine IDs come from YAML; receipt IDs come from the onchain registration. */
export function matchProviderIdentity(catalog: unknown, registry: unknown, expected: ProviderIdentityRequest): ProviderIdentity | null {
  if (!Array.isArray(catalog) || !registry || typeof registry !== "object") return null;
  const record = (registry as any).miner ?? registry;
  const candidates = catalog.filter(m => m && String(m.id) === expected.minerId);
  if (candidates.length !== 1) return null;
  const miner = candidates[0];
  if (String(record.registration_id) !== expected.registrationId || typeof miner.slug !== "string" || miner.slug !== record.slug ||
    typeof miner.yaml_url !== "string" || miner.yaml_url !== record.yaml_url ||
    typeof miner.wallet_address !== "string" || typeof record.miner_address !== "string" ||
    miner.wallet_address.toLowerCase() !== record.miner_address.toLowerCase() ||
    miner.activation_status !== "active" || record.activation_status !== "active" ||
    !Array.isArray(miner.supported_intents) || !miner.supported_intents.includes(expected.intent) ||
    !Array.isArray(record.supported_intents) || !record.supported_intents.includes(expected.intent)) return null;
  return { minerId: expected.minerId, registrationId: expected.registrationId, slug: miner.slug, yamlUrl: miner.yaml_url };
}

export async function resolveProviderIdentity(gateway: string, expected: ProviderIdentityRequest, f: typeof fetch = fetch): Promise<ProviderIdentity | null> {
  if (!/^\d+$/.test(expected.minerId) || !/^\d+$/.test(expected.registrationId)) return null;
  const origin = new URL(gateway).origin;
  try {
    const get = async (path: string) => {
      const response = await f(origin + path, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10_000) });
      if (!response.ok) throw new Error("Provider identity could not be read");
      return response.json();
    };
    const [catalog, registry] = await Promise.all([
      get("/api/miners?intent=" + encodeURIComponent(expected.intent)),
      get("/api/miners/" + expected.registrationId),
    ]);
    return matchProviderIdentity(catalog, registry, expected);
  } catch { return null; }
}
