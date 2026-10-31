import { activeNetwork, telegraphGateway } from "./config";
import { agentSigner } from "./wallet";
import { TRADE_INTENTS } from "./policy";
import { reviewStorageConfigured } from "./store";

export function deskReadiness() {
  const net = activeNetwork();
  const signer = agentSigner();
  const gateway = telegraphGateway();
  const access = process.env.DESK_ACCESS_TOKEN;
  const storage = reviewStorageConfigured();
  const configured = Boolean(signer && gateway && access && storage);
  return { net, signer, gateway, configured,
    public: {
      ok: configured,
      state: configured ? "configured" as const : "setup_required" as const,
      network: { name: net.name, chainId: net.chainId, testnet: net.testnet, explorer: net.txExplorer },
      config: { gatewayConfigured: Boolean(gateway), payerConfigured: Boolean(signer), spendingProtected: Boolean(access), storageConfigured: storage,
        payer: signer?.address ?? null, defaultIntents: [...TRADE_INTENTS], maximumSpendUsdc: "0.25" },
      reason: configured ? "Payment configuration is present. A paid result is verified after each run."
        : "Paid reviews need a dedicated agent wallet, an operator access token, and durable review storage. You can inspect the request plan without spending.",
    } };
}
