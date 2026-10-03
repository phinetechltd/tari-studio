import crypto from "node:crypto";

/**
 * Meta signs every webhook delivery with the app secret:
 * `X-Hub-Signature-256: sha256=<hex HMAC of the raw body>`.
 *
 * The check runs over the exact bytes received — re-serialising parsed JSON
 * changes spacing and escaping and would reject every genuine delivery — and
 * compares in constant time so the signature cannot be guessed byte by byte.
 */

export function signPayload(rawBody: string, appSecret: string): string {
  return "sha256=" + crypto.createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
}

export function verifyMetaSignature(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header || !appSecret) return false;
  const expected = Buffer.from(signPayload(rawBody, appSecret), "utf8");
  const received = Buffer.from(header.trim(), "utf8");
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}
