import { toWhatsAppId } from "./phone";

/**
 * Pure SMS helpers: the phone form Bonga accepts, how a Bonga reply is read,
 * and how many messages a text costs. The transport is src/server/sms.ts.
 */

/** A Kenyan mobile number as 2547XXXXXXXX or 2541XXXXXXXX, or null when it is not one. */
export function kenyanMsisdn(input: string | null | undefined): string | null {
  if (!input) return null;
  const id = toWhatsAppId(input);
  return id && /^254[17]\d{8}$/.test(id) ? id : null;
}

/** "254712345678" → "2547•••••678", for logs and lists. */
export function maskMsisdn(msisdn: string): string {
  return msisdn.length < 8 ? "••••" : `${msisdn.slice(0, 4)}•••••${msisdn.slice(-3)}`;
}

export interface BongaVerdict {
  ok: boolean;
  reference: string | null;
  message: string;
}

/**
 * Bonga answers HTTP 200 whatever happened; only `status: 222` means the
 * message was accepted. Anything else (or a body that is not JSON) is a
 * failure, with Bonga's own words when it gave any.
 */
export function parseBongaResponse(body: unknown): BongaVerdict {
  if (!body || typeof body !== "object") return { ok: false, reference: null, message: "Bonga returned an unreadable reply." };
  const b = body as { status?: unknown; status_message?: unknown; unique_id?: unknown };
  const message = typeof b.status_message === "string" && b.status_message.trim() ? b.status_message.trim() : `Bonga status ${String(b.status ?? "missing")}`;
  const ok = Number(b.status) === 222;
  const reference = b.unique_id === undefined || b.unique_id === null ? null : String(b.unique_id);
  return { ok, reference, message };
}

/** How many SMS a text is billed as: 160 characters for one, 153 a part after that (GSM-7). */
export function smsParts(text: string): number {
  // Characters outside GSM-7 force UCS-2: 70 for one, 67 a part.
  // eslint-disable-next-line no-control-regex
  const gsm = /^[\x0A\x0D\x20-\x7E£¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ¡ÄÖÑÜ§¿äöñüà€]*$/.test(text);
  const [single, part] = gsm ? [160, 153] : [70, 67];
  return text.length <= single ? 1 : Math.ceil(text.length / part);
}

/** One line for an SMS: the title, then the body, trimmed to two parts at most. */
export function smsText(title: string, body: string | null | undefined, product: string): string {
  const text = `${product}: ${title}${body ? `. ${body}` : ""}`.replace(/\s+/g, " ").trim();
  return text.length <= 306 ? text : `${text.slice(0, 303)}...`;
}
