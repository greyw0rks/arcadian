// Telegraph's documented x402 v2 flow. The official SDK creates the payload;
// this layer checks what the application may authorize before signing.
import { x402Client } from "@x402/core/client";
import { decodePaymentRequiredHeader, decodePaymentResponseHeader, encodePaymentSignatureHeader } from "@x402/core/http";
import type { PaymentPayload, PaymentRequired, PaymentRequirements, SettleResponse } from "@x402/core/types";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { isAddress, parseUnits, type Address, type Hex } from "viem";
import { activeNetwork, type NetworkConfig } from "./config";

export type { PaymentPayload, PaymentRequired, PaymentRequirements };
export type SettlementResponse = SettleResponse;
export const X402_VERSION = 2;

export interface Eip712TypedData {
  domain: Record<string, unknown>;
  types: Record<string, unknown>;
  primaryType: string;
  message: Record<string, unknown>;
}
export interface TypedDataSigner {
  address: Address;
  signTypedData(args: Eip712TypedData): Promise<Hex>;
}
export interface Authorization {
  from: Address;
  to: Address;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: Hex;
}

/** Synchronous reservations make concurrent authorizations respect one ceiling. */
export class SpendBudget {
  private reserved = 0n;
  constructor(readonly maximum: bigint) {
    if (maximum <= 0n) throw new Error("The intelligence budget must be positive");
  }
  reserve(amount: bigint): void {
    if (amount <= 0n || this.reserved + amount > this.maximum) {
      throw new Error("The payment challenge exceeds the remaining intelligence budget");
    }
    this.reserved += amount;
  }
}
export interface PayOptions {
  fetchImpl?: typeof fetch;
  net?: NetworkConfig;
  maxAmountAtomic?: bigint;
  budget?: SpendBudget;
  /** Must commit the authorization to durable storage before it is sent. */
  beforeSubmit?: (payment: PaymentPayload, requirements: PaymentRequirements) => Promise<void>;
}
export interface X402Result {
  response: Response;
  /** A signature was sent; money may still be unconfirmed. */
  paymentSubmitted: boolean;
  paid: boolean;
  requirements: PaymentRequirements | null;
  payment: PaymentPayload | null;
  settlement: SettlementResponse | null;
  txHash: Hex | null;
  amountAtomic: string | null;
}
export class PaymentTransportError extends Error {
  constructor(readonly payment: PaymentPayload, readonly requirements: PaymentRequirements) {
    super("Payment was authorized but the Engine response was lost; reconcile before retrying");
  }
}
export function usdcToAtomic(value: string): bigint {
  if (!/^\d+(?:\.\d{1,6})?$/.test(value)) throw new Error("Use a positive USDC amount with at most six decimal places");
  const atomic = parseUnits(value, 6);
  if (atomic <= 0n) throw new Error("The intelligence budget must be positive");
  return atomic;
}
export function validateRequirements(req: PaymentRequirements, net: NetworkConfig, maximum: bigint): void {
  if (req.scheme !== "exact" || req.network !== net.caip2) throw new Error("No exact x402 payment on the configured network");
  if (typeof req.asset !== "string" || req.asset.toLowerCase() !== net.usdc.toLowerCase()) throw new Error("Payment challenge names a different token");
  if (!isAddress(req.payTo, { strict: false }) || /^0x0{40}$/i.test(req.payTo)) throw new Error("Payment challenge has an invalid recipient");
  if (!/^\d+$/.test(req.amount) || BigInt(req.amount) <= 0n || BigInt(req.amount) > maximum) throw new Error("Payment challenge exceeds the per-call spending ceiling");
  if (!Number.isInteger(req.maxTimeoutSeconds) || req.maxTimeoutSeconds < 1 || req.maxTimeoutSeconds > 300) throw new Error("Payment authorization timeout is outside the allowed range");
  if (req.extra?.name !== net.usdcDomain.name || req.extra?.version !== net.usdcDomain.version) throw new Error("Payment challenge does not match the configured USDC signing domain");
  if (req.extra?.assetTransferMethod && req.extra.assetTransferMethod !== "eip3009") throw new Error("This gate supports EIP-3009 authorizations only");
}
export async function buildPayment(req: PaymentRequirements, signer: TypedDataSigner, net: NetworkConfig): Promise<PaymentPayload> {
  validateRequirements(req, net, BigInt(req.amount));
  const client = paymentClient(signer, net, BigInt(req.amount));
  return client.createPaymentPayload({
    x402Version: X402_VERSION,
    resource: { url: "https://arcadian.local/payment" },
    accepts: [req],
  });
}
function paymentClient(signer: TypedDataSigner, net: NetworkConfig, maximum: bigint) {
  // The current Telegraph test token is not the SDK's default Circle asset.
  // Opt in only to the already-validated chain/token with an atomic cap.
  return x402Client.fromConfig({
    schemes: [{ network: net.caip2, client: new ExactEvmScheme(signer) }],
    spendControls: { allowedAssets: [{ network: net.caip2, asset: net.usdc, maxAmountPerPayment: maximum.toString() }] },
  });
}
/** Telegraph's published example also supplies legacy top-level routing keys.
 * Keep the SDK's signed v2 payload intact; derive aliases from its accepted
 * requirement rather than choosing another network or payment amount.
 * https://github.com/telegraphprotocol/telegraph-examples/blob/facdb95e4139fb2075e795c648296a23b7df8ba9/src/lib/x402.ts
 */
export function encodePaymentHeader(payment: PaymentPayload): string {
  return encodePaymentSignatureHeader({ ...payment, scheme: payment.accepted.scheme,
    network: payment.accepted.network, extensions: payment.extensions ?? {} } as PaymentPayload);
}
export const decodeSettlement = decodePaymentResponseHeader;
export function paymentAuthorization(payment: PaymentPayload): Authorization {
  const a = payment.payload.authorization as Authorization | undefined;
  if (!a || !isAddress(a.from, { strict: false }) || !isAddress(a.to, { strict: false }) ||
      !/^\d+$/.test(a.value) || !/^0x[0-9a-f]{64}$/i.test(a.nonce)) {
    throw new Error("SDK payment did not contain an EIP-3009 authorization");
  }
  return a;
}
export async function payAndFetch(url: string, init: RequestInit, signer: TypedDataSigner, opts: PayOptions = {}): Promise<X402Result> {
  const f = opts.fetchImpl ?? fetch;
  const net = opts.net ?? activeNetwork();
  const boundedInit = { ...init, redirect: "error" as const, signal: init.signal ?? AbortSignal.timeout(30_000) };
  const first = await f(url, boundedInit);
  if (first.status !== 402) {
    return { response: first, paymentSubmitted: false, paid: false, requirements: null, payment: null, settlement: null, txHash: null, amountAtomic: null };
  }
  const header = first.headers.get("PAYMENT-REQUIRED");
  if (!header) throw new Error("Engine did not provide the x402 v2 PAYMENT-REQUIRED header");
  const challenge = decodePaymentRequiredHeader(header);
  if (challenge.x402Version !== X402_VERSION || !Array.isArray(challenge.accepts)) throw new Error("Unsupported x402 challenge version or shape");
  const req = challenge.accepts.find(r => r.scheme === "exact" && r.network === net.caip2 && r.asset?.toLowerCase() === net.usdc.toLowerCase());
  if (!req) throw new Error("No exact x402 payment on the configured network and token");
  validateRequirements(req, net, opts.maxAmountAtomic ?? 50_000n);
  opts.budget?.reserve(BigInt(req.amount));
  const client = paymentClient(signer, net, opts.maxAmountAtomic ?? 50_000n);
  const payment = await client.createPaymentPayload({ ...challenge, accepts: [req] });
  const authorization = paymentAuthorization(payment);
  if (authorization.from.toLowerCase() !== signer.address.toLowerCase() || authorization.to.toLowerCase() !== req.payTo.toLowerCase() || authorization.value !== req.amount) throw new Error("SDK authorization does not match the selected payment");
  const headers = new Headers(init.headers);
  headers.set("PAYMENT-SIGNATURE", encodePaymentHeader(payment));
  await opts.beforeSubmit?.(payment, req);
  let response: Response;
  try {
    response = await f(url, { ...boundedInit, signal: init.signal ?? AbortSignal.timeout(30_000), headers });
  } catch {
    throw new PaymentTransportError(payment, req);
  }
  let settlement: SettlementResponse | null = null;
  const settlementHeader = response.headers.get("PAYMENT-RESPONSE");
  if (settlementHeader) {
    try { settlement = decodePaymentResponseHeader(settlementHeader); } catch { /* Unverified settlement remains visible. */ }
  }
  const reported = Boolean(settlement?.success === true && settlement.network === net.caip2 &&
    (!settlement.payer || settlement.payer.toLowerCase() === signer.address.toLowerCase()) &&
    /^0x[0-9a-f]{64}$/i.test(settlement.transaction));
  return { response, paymentSubmitted: true, paid: false, requirements: req, payment,
    settlement, txHash: reported ? settlement!.transaction as Hex : null, amountAtomic: req.amount };
}
export function atomicToUsdc(atomic: string | number | bigint): string {
  const n = BigInt(atomic);
  if (n < 0n) throw new Error("USDC accounting amounts cannot be negative");
  const whole = n / 1_000_000n;
  const frac = (n % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
}
