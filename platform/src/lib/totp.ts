import crypto from "node:crypto";

/**
 * RFC 6238 time-based one-time passwords (HMAC-SHA1, 6 digits, 30 s step).
 *
 * Hand-rolled because it is ~40 lines and the algorithm is fixed by the RFC;
 * the unit test checks it against the RFC's own test vectors. Owners and
 * Approvers hold the keys to a client's public social accounts, so they enrol.
 */

const STEP_SECONDS = 30;
const DIGITS = 6;
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function generateSecret(bytes = 20): string {
  return base32Encode(crypto.randomBytes(bytes));
}

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.replace(/=+$/, "").replace(/\s+/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const ch of clean) {
    const idx = BASE32.indexOf(ch);
    if (idx === -1) throw new Error("Invalid base32 character");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** The code for a given moment. `digits` is exposed only so the RFC vectors (8 digits) can be checked. */
export function totpAt(secret: string, atMs: number, digits = DIGITS): string {
  const counter = Math.floor(atMs / 1000 / STEP_SECONDS);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));

  const hmac = crypto.createHmac("sha1", base32Decode(secret)).update(msg).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const bin =
    ((hmac[offset]! & 0x7f) << 24) |
    (hmac[offset + 1]! << 16) |
    (hmac[offset + 2]! << 8) |
    hmac[offset + 3]!;
  return String(bin % 10 ** digits).padStart(digits, "0");
}

/**
 * Verifies a code, tolerating one step of clock drift either way. Returns the
 * matched counter so a caller can refuse a replay of a code already used.
 */
export function verifyTotp(
  secret: string,
  code: string,
  nowMs = Date.now(),
  window = 1,
): { ok: true; counter: number } | { ok: false } {
  const clean = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(clean)) return { ok: false };

  const current = Math.floor(nowMs / 1000 / STEP_SECONDS);
  for (let w = -window; w <= window; w++) {
    const expected = totpAt(secret, (current + w) * STEP_SECONDS * 1000);
    const a = Buffer.from(expected);
    const b = Buffer.from(clean);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
      return { ok: true, counter: current + w };
    }
  }
  return { ok: false };
}

export function otpauthUri(params: { secret: string; account: string; issuer: string }): string {
  const label = encodeURIComponent(`${params.issuer}:${params.account}`);
  const q = new URLSearchParams({
    secret: params.secret,
    issuer: params.issuer,
    algorithm: "SHA1",
    digits: String(DIGITS),
    period: String(STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${q.toString()}`;
}
