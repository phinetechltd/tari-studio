import "server-only";

import crypto from "node:crypto";

import { jwtVerify, SignJWT } from "jose";

import { env } from "@/lib/env";

/**
 * The OAuth `state` for TikTok and Pinterest sign-ins, built like Facebook
 * Login's (src/server/meta-oauth.ts): signed with a key derived from
 * AUTH_SECRET for one purpose only, valid for ten minutes, and paired with a
 * nonce in an HTTP-only cookie, so a callback URL taken from someone else's
 * browser connects nothing.
 */

export type OAuthPurpose = "tiktok" | "tiktok-business" | "pinterest";

const COOKIE: Record<OAuthPurpose, { name: string; path: string }> = {
  tiktok: { name: "ap_tiktok_oauth", path: "/api/channels/tiktok" },
  "tiktok-business": { name: "ap_tiktok_biz_oauth", path: "/api/channels/tiktok/business" },
  pinterest: { name: "ap_pinterest_oauth", path: "/api/pinterest" },
};

export const oauthCookie = (purpose: OAuthPurpose) => COOKIE[purpose];

function key(purpose: OAuthPurpose): Uint8Array {
  return new Uint8Array(crypto.hkdfSync("sha256", env().AUTH_SECRET, Buffer.alloc(0), `${purpose}-oauth-state:v1`, 32));
}

export const appUrl = (path: string) => `${env().APP_BASE_URL.replace(/\/$/, "")}${path}`;

export interface StatePayload {
  userId: string;
  organizationId: string;
  /** A brand (TikTok channels), a channel (TikTok comments), or where to go back to (Pinterest) */
  ref: string;
}

export async function signState(purpose: OAuthPurpose, input: StatePayload): Promise<{ state: string; nonce: string }> {
  const nonce = crypto.randomBytes(16).toString("base64url");
  const state = await new SignJWT({ org: input.organizationId, ref: input.ref, nonce })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(input.userId)
    .setAudience(`${purpose}-oauth`)
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(key(purpose));
  return { state, nonce };
}

export async function readState(purpose: OAuthPurpose, state: string, nonceCookie: string | undefined): Promise<StatePayload | null> {
  try {
    const { payload } = await jwtVerify(state, key(purpose), { audience: `${purpose}-oauth` });
    if (typeof payload.sub !== "string" || typeof payload.org !== "string" || typeof payload.ref !== "string") return null;
    if (!nonceCookie || payload.nonce !== nonceCookie) return null;
    return { userId: payload.sub, organizationId: payload.org, ref: payload.ref };
  } catch {
    return null;
  }
}

/** Only same-site paths may be returned to after a sign-in. */
export function safeBack(path: string | null | undefined, fallback: string): string {
  return path && path.startsWith("/") && !path.startsWith("//") && !path.includes("\\") ? path.slice(0, 200) : fallback;
}
