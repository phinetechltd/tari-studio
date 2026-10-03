import crypto from "node:crypto";

/**
 * Tracked links: short codes, the WhatsApp links they point at, and the ref code
 * that ties a WhatsApp conversation back to the campaign that started it.
 *
 * A wa.me link cannot carry UTM parameters into WhatsApp, so attribution rides in
 * the pre-filled message instead: "…\n\nRef: K7M2QX9A". When that message
 * arrives on the webhook, the code names the link and therefore the campaign.
 */

/** No 0/O or 1/I/L: codes get read aloud and typed from posters. */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 8;

export function newShortCode(): string {
  const bytes = crypto.randomBytes(CODE_LENGTH);
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length];
  return code;
}

export function isShortCode(value: string): boolean {
  return new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`).test(value);
}

export function whatsAppLink(waId: string, message: string, ref?: string): string {
  const text = ref ? `${message.trim()}\n\nRef: ${ref}` : message.trim();
  return `https://wa.me/${waId}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

/** The ref code in an inbound message, if the customer came through a tracked link. */
export function extractRefCode(text: string | null | undefined): string | null {
  if (!text) return null;
  const m = text.match(new RegExp(`\\bRef:\\s*([${CODE_ALPHABET}]{${CODE_LENGTH}})\\b`, "i"));
  return m ? m[1]!.toUpperCase() : null;
}

/** Adds UTM parameters to a web destination without overriding ones already there. */
export function withUtm(destination: string, utm: Record<string, string | undefined>): string {
  let url: URL;
  try {
    url = new URL(destination);
  } catch {
    return destination;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return destination;
  if (url.hostname === "wa.me" || url.hostname.endsWith("whatsapp.com")) return destination;
  for (const [key, value] of Object.entries(utm)) {
    if (value && !url.searchParams.has(key)) url.searchParams.set(key, value);
  }
  return url.toString();
}

/**
 * Link-preview fetchers and crawlers. WhatsApp, Facebook and Telegram each fetch
 * a link the moment it is pasted into a chat; counting those would credit every
 * share as a click.
 */
const BOT_UA =
  /bot\b|bot\/|crawl|spider|slurp|facebookexternalhit|facebookcatalog|meta-externalagent|whatsapp\/|telegrambot|twitterbot|linkedinbot|slackbot|discordbot|skypeuripreview|embedly|preview|headlesschrome|curl\/|wget\/|python-requests|go-http-client|okhttp/i;

export function isBotUserAgent(ua: string | null | undefined): boolean {
  if (!ua || ua.trim().length < 8) return true;
  return BOT_UA.test(ua);
}

export function deviceType(ua: string | null | undefined): "mobile" | "tablet" | "desktop" | "unknown" {
  if (!ua) return "unknown";
  if (/ipad|tablet|kindle|silk/i.test(ua)) return "tablet";
  if (/mobi|android|iphone|ipod|opera mini|kaios/i.test(ua)) return "mobile";
  return "desktop";
}
