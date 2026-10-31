import { createHash, timingSafeEqual } from "node:crypto";

/** No configured token means spending is disabled, including on testnet. */
export function spendingAuthorized(provided: string | null, expected: string | undefined): boolean {
  if (!expected || !provided) return false;
  return timingSafeEqual(createHash("sha256").update(provided).digest(), createHash("sha256").update(expected).digest());
}
