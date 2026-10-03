import "server-only";

import crypto from "node:crypto";

import { env } from "@/lib/env";

/**
 * Public, expiring links to generated media.
 *
 * Instagram and Facebook fetch a post's image from a URL themselves, so the
 * file has to be reachable without a session. Rather than make the library
 * public, a publish hands Meta a signed link that names one asset and stops
 * working after a few days. The signature key is derived from AUTH_SECRET for
 * this one purpose, so a media link can never be replayed as anything else.
 */

const PURPOSE = "public-media-link:v1";

function key(): Buffer {
  return Buffer.from(crypto.hkdfSync("sha256", env().AUTH_SECRET, Buffer.alloc(0), PURPOSE, 32));
}

function sign(assetId: string, expires: number): string {
  return crypto.createHmac("sha256", key()).update(`${assetId}.${expires}`).digest("base64url").slice(0, 32);
}

export function mediaToken(assetId: string, ttlSec = 7 * 86_400, now = Date.now()): string {
  const expires = Math.floor(now / 1000) + ttlSec;
  return `${assetId}.${expires}.${sign(assetId, expires)}`;
}

export function publicMediaUrl(assetId: string, ttlSec?: number): string {
  return `${env().APP_BASE_URL.replace(/\/$/, "")}/media/${mediaToken(assetId, ttlSec)}`;
}

/** The asset id a token grants, or null when it is forged, altered or expired. */
export function verifyMediaToken(token: string, now = Date.now()): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [assetId, expiresRaw, signature] = parts as [string, string, string];
  const expires = Number(expiresRaw);
  if (!/^[a-z0-9]{10,40}$/i.test(assetId) || !Number.isInteger(expires)) return null;
  if (expires * 1000 < now) return null;
  const expected = Buffer.from(sign(assetId, expires));
  const given = Buffer.from(signature);
  return expected.length === given.length && crypto.timingSafeEqual(expected, given) ? assetId : null;
}
