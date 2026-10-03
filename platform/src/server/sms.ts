import "server-only";

import { env } from "@/lib/env";
import { providerName } from "@/lib/providers";
import { kenyanMsisdn, maskMsisdn, parseBongaResponse } from "@/lib/sms";

/**
 * SMS through Bonga (bongasms.co.ke), the same contract IntelliCash runs in
 * production: a multipart POST of apiClientID, key, secret, txtMessage, MSISDN
 * and serviceID. Bonga answers HTTP 200 whatever happened; only `status: 222`
 * means accepted.
 *
 *   bonga    live; credentials in Platform admin → Settings → SMS (Bonga)
 *   console  records and prints (development; refused in production)
 *   off      sends nothing; notification SMS are not even queued
 *
 * A failed live send is a failure. The console adapter is never a fallback.
 */

export interface SmsMessage {
  to: string;
  text: string;
}

export interface SmsResult {
  ok: boolean;
  provider: string;
  reference?: string | null;
  error?: string;
  mock?: boolean;
}

// Shared across module reloads so tests can read what was "sent".
const globalForOutbox = globalThis as unknown as { __smsOutbox?: SmsMessage[] };
export const smsOutbox: SmsMessage[] = (globalForOutbox.__smsOutbox ??= []);

/** "off" | "console" | "bonga", without the production refusal: for deciding whether to queue at all. */
export function smsMode(): "off" | "console" | "bonga" {
  return env().SMS_PROVIDER;
}

export async function sendSms(message: SmsMessage): Promise<SmsResult> {
  const mode = smsMode();
  if (mode === "off") return { ok: false, provider: "off", error: "SMS is switched off (Settings → SMS)." };
  const name = providerName("SMS"); // throws for the console stand-in in production

  const msisdn = kenyanMsisdn(message.to);
  if (!msisdn) return { ok: false, provider: name, error: "Not a Kenyan mobile number." };
  const text = message.text.trim();
  if (!text) return { ok: false, provider: name, error: "The message is empty." };

  if (name === "console") {
    smsOutbox.push({ to: msisdn, text });
    console.info(`[sms:console] → ${maskMsisdn(msisdn)}: ${text.slice(0, 80)}`);
    return { ok: true, provider: "console", reference: `console-${smsOutbox.length}`, mock: true };
  }

  const e = env();
  const missing = [
    ["API client ID", e.BONGA_SMS_CLIENT_ID],
    ["API key", e.BONGA_SMS_API_KEY],
    ["API secret", e.BONGA_SMS_API_SECRET],
    ["service ID", e.BONGA_SMS_SERVICE_ID],
  ]
    .filter(([, v]) => !v)
    .map(([label]) => label);
  if (missing.length) return { ok: false, provider: "bonga", error: `Bonga ${missing.join(", ")} not set (Settings → SMS).` };

  const form = new FormData();
  form.append("apiClientID", e.BONGA_SMS_CLIENT_ID!);
  form.append("key", e.BONGA_SMS_API_KEY!);
  form.append("secret", e.BONGA_SMS_API_SECRET!);
  form.append("txtMessage", text);
  form.append("MSISDN", msisdn);
  form.append("serviceID", e.BONGA_SMS_SERVICE_ID!);

  let res: Response;
  try {
    res = await fetch(e.BONGA_SMS_ENDPOINT, { method: "POST", body: form, signal: AbortSignal.timeout(20_000) });
  } catch (error) {
    return { ok: false, provider: "bonga", error: `Could not reach Bonga (${(error instanceof Error ? error.message : String(error)).slice(0, 200)}).` };
  }
  const body = await res.json().catch(() => null);
  if (!res.ok && !body) return { ok: false, provider: "bonga", error: `Bonga returned HTTP ${res.status}.` };
  const verdict = parseBongaResponse(body);
  return verdict.ok
    ? { ok: true, provider: "bonga", reference: verdict.reference }
    : { ok: false, provider: "bonga", reference: verdict.reference, error: verdict.message.slice(0, 300) };
}
