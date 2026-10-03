import crypto from "node:crypto";

import type { StkProvider } from "./types";

/**
 * A pretend STK push for development and tests, so the whole order flow can be
 * exercised without Safaricom. Production refuses it (src/lib/providers.ts).
 *
 * Behaviour, chosen to cover every branch the UI has to show:
 *   - the "prompt" is pending for SIMULATOR_PIN_MS (5 s by default), then succeeds;
 *   - numbers starting 2547000001 (0700 0001xx) cancel the prompt (Daraja code 1032);
 *   - numbers starting 2547000002 (0700 0002xx) time out (Daraja code 1037).
 * Prefixes rather than single numbers, so tests can use a fresh number each run
 * and never meet the per-phone rate limit left by an earlier run.
 */

export const SIMULATOR_CANCEL_PREFIX = "2547000001";
export const SIMULATOR_TIMEOUT_PREFIX = "2547000002";
/** One number from each range, for manual testing. */
export const SIMULATOR_CANCEL_PHONE = `${SIMULATOR_CANCEL_PREFIX}00`;
export const SIMULATOR_TIMEOUT_PHONE = `${SIMULATOR_TIMEOUT_PREFIX}00`;

export function simulatorProvider(pinDelayMs = Number(process.env.SIMULATOR_PIN_MS ?? 5000)): StkProvider {
  return {
    name: "SIMULATOR",
    configured: () => true,

    async initiate(input) {
      if (!/^254\d{9}$/.test(input.phone)) {
        return { ok: false, error: "Enter a Safaricom number, e.g. 0712 345 678." };
      }
      return {
        ok: true,
        providerRef: `ws_CO_SIM_${crypto.randomBytes(9).toString("hex")}`,
        merchantRequestId: `SIM-${crypto.randomBytes(4).toString("hex")}`,
        message: "Simulated prompt sent. It will be approved in a few seconds.",
      };
    },

    async verify({ phone, createdAt }) {
      if (Date.now() - createdAt.getTime() < pinDelayMs) return { status: "PENDING" };
      if (phone.startsWith(SIMULATOR_CANCEL_PREFIX)) {
        return { status: "FAILED", resultCode: "1032", failureReason: "The M-Pesa prompt was cancelled on the phone." };
      }
      if (phone.startsWith(SIMULATOR_TIMEOUT_PREFIX)) {
        return {
          status: "FAILED",
          resultCode: "1037",
          failureReason: "The M-Pesa prompt timed out before a PIN was entered.",
        };
      }
      return {
        status: "SUCCEEDED",
        resultCode: "0",
        receiptRef: `SIM${crypto.randomBytes(4).toString("hex").toUpperCase()}`,
      };
    },
  };
}
