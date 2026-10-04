import crypto from "node:crypto";

/**
 * Checks a `TikTok-Signature: t=<unix seconds>,s=<hex>` header: HMAC-SHA256 of
 * "<t>.<raw body>" with the client secret, and a timestamp no older than five
 * minutes, so a captured delivery cannot be replayed later.
 */
export function verifyTikTokSignature(header: string | null, rawBody: string, secret: string, nowSec = Math.floor(Date.now() / 1000), toleranceSec = 300): boolean {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(
    header.split(",").map((p) => {
      const i = p.indexOf("=");
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    }),
  );
  const t = Number(parts.t);
  const s = parts.s;
  if (!Number.isFinite(t) || !s || !/^[0-9a-f]+$/i.test(s)) return false;
  if (Math.abs(nowSec - t) > toleranceSec) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${parts.t}.${rawBody}`).digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(s, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
