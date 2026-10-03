import crypto from "node:crypto";

import { canonicalPhone } from "../identity";

import type { StkInitiateInput, StkInitiateResult, StkProvider, StkVerifyResult } from "./types";

/**
 * M-Pesa STK push through Safaricom Daraja.
 *
 * Ported from Raut (xos/platform/src/lib/payments.ts), which has collected real
 * money with it. Two rules carry over unchanged:
 *
 *   **Safaricom is the authority on whether money moved.** Daraja does not sign
 *   its callbacks, so a callback only tells us *which* request to re-check; the
 *   verdict always comes from an explicit STK Query (`verify`).
 *
 *   **Everything arrives more than once.** Callbacks are retried and customers
 *   press buttons twice, so settlement is idempotent on our side
 *   (src/server/payments.ts), keyed on the CheckoutRequestID.
 *
 * Here the platform is the merchant, so credentials come from the environment
 * only; there is no per-tenant till.
 */

export interface DarajaConfig {
  env: "sandbox" | "production";
  consumerKey?: string;
  consumerSecret?: string;
  shortcode?: string;
  passkey?: string;
  transactionType: "CustomerPayBillOnline" | "CustomerBuyGoodsOnline";
  partyB?: string;
}

/** Daraja wants `YYYYMMDDHHmmss` in Nairobi time and rejects anything else. */
export function darajaTimestamp(now = new Date()): string {
  const nairobi = new Date(now.getTime() + 3 * 3_600_000); // UTC+3, no DST in Kenya
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${nairobi.getUTCFullYear()}${p(nairobi.getUTCMonth() + 1)}${p(nairobi.getUTCDate())}` +
    `${p(nairobi.getUTCHours())}${p(nairobi.getUTCMinutes())}${p(nairobi.getUTCSeconds())}`
  );
}

/** Daraja's MSISDN is 2547XXXXXXXX or 2541XXXXXXXX: no plus, no leading zero, Kenyan only. */
export function toDarajaMsisdn(raw: string): string | null {
  const digits = canonicalPhone(raw);
  if (!digits) return null;
  return /^254[17]\d{8}$/.test(digits) ? digits : null;
}

export function stkPassword(shortcode: string, passkey: string, timestamp: string): string {
  return Buffer.from(`${shortcode}${passkey}${timestamp}`).toString("base64");
}

export interface ParsedStkCallback {
  checkoutRequestId: string;
  merchantRequestId: string | null;
  resultCode: string | null;
  resultDesc: string | null;
  receipt: string | null;
  amount: number | null;
  phone: string | null;
}

/**
 * Pulls the fields out of a Daraja STK callback. Returns null for anything that
 * is not shaped like one. Shape is all this checks: the body is unauthenticated.
 */
export function parseStkCallback(body: unknown): ParsedStkCallback | null {
  const cb = (body as { Body?: { stkCallback?: Record<string, unknown> } } | null)?.Body?.stkCallback;
  if (!cb || typeof cb !== "object") return null;
  const checkoutRequestId = cb.CheckoutRequestID;
  if (typeof checkoutRequestId !== "string" || checkoutRequestId === "") return null;

  const items = ((cb.CallbackMetadata as { Item?: unknown } | undefined)?.Item ?? []) as Array<{
    Name?: string;
    Value?: unknown;
  }>;
  const item = (name: string) => (Array.isArray(items) ? items.find((i) => i?.Name === name)?.Value : undefined);

  const amount = item("Amount");
  const receipt = item("MpesaReceiptNumber");
  const phone = item("PhoneNumber");

  return {
    checkoutRequestId,
    merchantRequestId: typeof cb.MerchantRequestID === "string" ? cb.MerchantRequestID : null,
    resultCode: cb.ResultCode == null ? null : String(cb.ResultCode),
    resultDesc: typeof cb.ResultDesc === "string" ? cb.ResultDesc : null,
    receipt: typeof receipt === "string" ? receipt : null,
    amount: typeof amount === "number" ? amount : amount != null ? Number(amount) || null : null,
    phone: phone == null ? null : String(phone),
  };
}

/** What to tell a customer for the common STK result codes. */
export function describeResult(code: string, fallback?: string | null): string {
  switch (code) {
    case "1032":
      return "The M-Pesa prompt was cancelled on the phone.";
    case "1037":
      return "The M-Pesa prompt timed out before a PIN was entered.";
    case "1":
      return "The M-Pesa balance was not enough for this payment.";
    case "2001":
      return "The M-Pesa PIN entered was wrong.";
    case "1019":
      return "The M-Pesa request expired.";
    case "1001":
      return "Another M-Pesa transaction was in progress on this phone. Try again in a minute.";
    default:
      return fallback?.trim() || `M-Pesa did not complete the payment (code ${code}).`;
  }
}

function base(cfg: DarajaConfig): string {
  return cfg.env === "production" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke";
}

/**
 * Access tokens live about an hour and Safaricom rate-limits the endpoint, so
 * they are cached per credential (keyed on a hash of the key, never the key).
 */
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

async function accessToken(cfg: DarajaConfig): Promise<string | null> {
  if (!cfg.consumerKey || !cfg.consumerSecret) return null;
  const cacheKey = crypto.createHash("sha256").update(cfg.consumerKey).digest("hex").slice(0, 16);
  const hit = tokenCache.get(cacheKey);
  if (hit && hit.expiresAt > Date.now() + 30_000) return hit.token;

  const basic = Buffer.from(`${cfg.consumerKey}:${cfg.consumerSecret}`).toString("base64");
  const res = await fetch(`${base(cfg)}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${basic}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return null;
  const json = (await res.json().catch(() => null)) as { access_token?: string; expires_in?: string | number } | null;
  if (!json?.access_token) return null;
  tokenCache.set(cacheKey, {
    token: json.access_token,
    expiresAt: Date.now() + Number(json.expires_in ?? 3599) * 1000,
  });
  return json.access_token;
}

async function postJson(url: string, body: unknown, token: string) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* keep the text for the error path */
  }
  return { ok: res.ok, status: res.status, json, text };
}

export function darajaProvider(cfg: DarajaConfig): StkProvider {
  const configured = () => Boolean(cfg.consumerKey && cfg.consumerSecret && cfg.shortcode && cfg.passkey);

  return {
    name: "MPESA_DARAJA",
    configured,

    async initiate(input: StkInitiateInput): Promise<StkInitiateResult> {
      if (!configured()) return { ok: false, error: "M-Pesa is not configured on this server." };
      const msisdn = toDarajaMsisdn(input.phone);
      if (!msisdn) return { ok: false, error: "Enter a Safaricom number, e.g. 0712 345 678." };

      // Daraja takes whole shillings. A fractional amount would be truncated on
      // their side and under-collect without telling anyone.
      if (input.amountCents % 100 !== 0 || input.amountCents < 100) {
        return { ok: false, error: "The amount must be a whole number of shillings." };
      }
      const shillings = input.amountCents / 100;

      const token = await accessToken(cfg);
      if (!token) return { ok: false, error: "Could not reach M-Pesa. Try again shortly." };

      const timestamp = darajaTimestamp();
      const res = await postJson(
        `${base(cfg)}/mpesa/stkpush/v1/processrequest`,
        {
          BusinessShortCode: cfg.shortcode,
          Password: stkPassword(cfg.shortcode!, cfg.passkey!, timestamp),
          Timestamp: timestamp,
          TransactionType: cfg.transactionType,
          Amount: shillings,
          PartyA: msisdn,
          PartyB: cfg.partyB || cfg.shortcode,
          PhoneNumber: msisdn,
          CallBackURL: input.callbackUrl,
          // Shown on the customer's prompt; Daraja rejects longer values.
          AccountReference: input.reference.slice(0, 12),
          TransactionDesc: input.description.slice(0, 13),
        },
        token,
      );

      const json = res.json as
        | {
            CheckoutRequestID?: string;
            MerchantRequestID?: string;
            ResponseCode?: string;
            CustomerMessage?: string;
            errorMessage?: string;
          }
        | null;

      if (!res.ok || !json?.CheckoutRequestID || (json.ResponseCode && json.ResponseCode !== "0")) {
        return { ok: false, error: json?.errorMessage ?? `M-Pesa refused the request (${res.status}).` };
      }
      return {
        ok: true,
        providerRef: json.CheckoutRequestID,
        merchantRequestId: json.MerchantRequestID ?? null,
        message: json.CustomerMessage ?? "Check your phone and enter your M-Pesa PIN.",
      };
    },

    async verify({ providerRef }): Promise<StkVerifyResult> {
      if (!configured()) return { status: "PENDING", failureReason: "M-Pesa is not configured" };
      const token = await accessToken(cfg);
      if (!token) return { status: "PENDING", failureReason: "Could not authenticate with M-Pesa" };

      const timestamp = darajaTimestamp();
      const res = await postJson(
        `${base(cfg)}/mpesa/stkpushquery/v1/query`,
        {
          BusinessShortCode: cfg.shortcode,
          Password: stkPassword(cfg.shortcode!, cfg.passkey!, timestamp),
          Timestamp: timestamp,
          CheckoutRequestID: providerRef,
        },
        token,
      );

      const json = res.json as { ResultCode?: string | number; ResultDesc?: string; errorCode?: string } | null;
      const code = json?.ResultCode == null ? null : String(json.ResultCode);

      if (code === "0") return { status: "SUCCEEDED", resultCode: code, raw: json };
      // While the prompt is still on the handset Daraja answers with an error
      // body ("The transaction is being processed"), not a result. Rate-limit
      // and transient errors look the same. None of them is a failure.
      if (code == null || code === "") return { status: "PENDING", raw: json };
      return {
        status: "FAILED",
        resultCode: code,
        failureReason: describeResult(code, json?.ResultDesc),
        raw: json,
      };
    },
  };
}
