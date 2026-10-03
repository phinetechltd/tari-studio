import "server-only";

import crypto from "node:crypto";

import { jwtVerify, SignJWT } from "jose";

import { env } from "@/lib/env";

/**
 * Facebook Login's `state`: who started the connection, for which organisation
 * and brand. Signed with a key derived from AUTH_SECRET for this purpose only
 * (so it can never pass as a session), valid for ten minutes, and paired with a
 * nonce in an HTTP-only cookie, so a callback URL lifted from someone else's
 * browser connects nothing.
 */

export const OAUTH_NONCE_COOKIE = "ap_meta_oauth";
const AUDIENCE = "meta-oauth";

function key(): Uint8Array {
  return new Uint8Array(crypto.hkdfSync("sha256", env().AUTH_SECRET, Buffer.alloc(0), "meta-oauth-state:v1", 32));
}

export function callbackUrl(): string {
  return `${env().APP_BASE_URL.replace(/\/$/, "")}/api/channels/meta/callback`;
}

export async function signOAuthState(input: { userId: string; organizationId: string; brandId: string }) {
  const nonce = crypto.randomBytes(16).toString("base64url");
  const state = await new SignJWT({ org: input.organizationId, brand: input.brandId, nonce })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(input.userId)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(key());
  return { state, nonce };
}

export async function readOAuthState(state: string, nonceCookie: string | undefined) {
  try {
    const { payload } = await jwtVerify(state, key(), { audience: AUDIENCE });
    if (typeof payload.sub !== "string" || typeof payload.org !== "string" || typeof payload.brand !== "string") return null;
    if (!nonceCookie || payload.nonce !== nonceCookie) return null;
    return { userId: payload.sub, organizationId: payload.org, brandId: payload.brand };
  } catch {
    return null;
  }
}
