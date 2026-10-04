import "server-only";

import crypto from "node:crypto";

import { SignJWT, createRemoteJWKSet, jwtVerify } from "jose";

import { ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { hashPassword } from "@/lib/auth";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { normaliseEmail } from "@/lib/identity";

/**
 * Sign in with Google (OpenID Connect, authorization-code flow with PKCE).
 *
 * `start` sends the browser to Google with a random state, a nonce and a PKCE
 * challenge, all remembered in a short-lived signed cookie. `callback` checks
 * the state, exchanges the code (with the PKCE verifier), verifies Google's ID
 * token (signature, issuer, audience, nonce) and requires a verified email.
 *
 * Linking policy: an account is matched by Google's stable id first, then by
 * the verified email (linking the identity); an unknown email creates a new,
 * already-verified account with no password. A person who has an authenticator
 * app set up must sign in with password and code, so Google alone is never a
 * way around their second factor.
 */

export const OAUTH_COOKIE = "oauth_state";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";

export function googleEnabled(): boolean {
  const e = env();
  return Boolean(e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET) && e.GOOGLE_AUTH_ENABLED !== "false";
}

export const redirectUri = () => `${env().APP_BASE_URL.replace(/\/$/, "")}/api/auth/google/callback`;

const secret = () => new TextEncoder().encode(env().AUTH_SECRET);
const b64url = (b: Buffer) => b.toString("base64url");

export interface GoogleProfile {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
}

/** The two calls to Google, replaceable in tests so the flow can be exercised without the network. */
export const googleTransport = {
  async exchange(code: string, verifier: string): Promise<{ idToken: string }> {
    const e = env();
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: e.GOOGLE_CLIENT_ID!,
        client_secret: e.GOOGLE_CLIENT_SECRET!,
        redirect_uri: redirectUri(),
        grant_type: "authorization_code",
        code_verifier: verifier,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const json = (await res.json().catch(() => null)) as { id_token?: string } | null;
    if (!res.ok || !json?.id_token) throw new ApiError(502, "GOOGLE_FAILED", "Google did not accept the sign-in. Try again.");
    return { idToken: json.id_token };
  },
  async verify(idToken: string, nonce: string): Promise<GoogleProfile> {
    const jwks = createRemoteJWKSet(new URL(JWKS_URL));
    const { payload } = await jwtVerify(idToken, jwks, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: env().GOOGLE_CLIENT_ID!,
    });
    if (payload.nonce !== nonce) throw new ApiError(400, "GOOGLE_FAILED", "The Google sign-in could not be verified.");
    return {
      sub: String(payload.sub),
      email: String(payload.email ?? ""),
      emailVerified: payload.email_verified === true,
      name: String(payload.name ?? payload.email ?? "Google user"),
    };
  },
};

/** Builds the Google URL and the cookie value that must come back unchanged. */
export async function beginGoogle(next: string | null): Promise<{ url: string; cookie: string }> {
  if (!googleEnabled()) throw new ApiError(404, "NOT_FOUND", "Google sign-in is not switched on.");
  const state = b64url(crypto.randomBytes(24));
  const nonce = b64url(crypto.randomBytes(24));
  const verifier = b64url(crypto.randomBytes(48));
  const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
  const cookie = await new SignJWT({ state, nonce, verifier, next })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(secret());
  const params = new URLSearchParams({
    client_id: env().GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: "openid email profile",
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  return { url: `${AUTH_URL}?${params}`, cookie };
}

/** Checks Google's answer against the cookie, and returns who signed in. */
export async function finishGoogle(cookieValue: string | undefined, query: URLSearchParams): Promise<{ profile: GoogleProfile; next: string | null }> {
  if (!googleEnabled()) throw new ApiError(404, "NOT_FOUND", "Google sign-in is not switched on.");
  if (!cookieValue) throw new ApiError(400, "GOOGLE_FAILED", "The sign-in took too long. Start again.");
  let saved: { state: string; nonce: string; verifier: string; next: string | null };
  try {
    const { payload } = await jwtVerify(cookieValue, secret());
    saved = payload as unknown as typeof saved;
  } catch {
    throw new ApiError(400, "GOOGLE_FAILED", "The sign-in took too long. Start again.");
  }
  const state = query.get("state") ?? "";
  if (query.get("error")) throw new ApiError(400, "GOOGLE_CANCELLED", "Google sign-in was cancelled.");
  if (!state || state.length !== saved.state.length || !crypto.timingSafeEqual(Buffer.from(state), Buffer.from(saved.state))) {
    throw new ApiError(400, "GOOGLE_FAILED", "The Google sign-in could not be verified. Start again.");
  }
  const code = query.get("code");
  if (!code) throw new ApiError(400, "GOOGLE_FAILED", "Google did not send a sign-in code.");
  const { idToken } = await googleTransport.exchange(code, saved.verifier);
  const profile = await googleTransport.verify(idToken, saved.nonce);
  return { profile, next: saved.next };
}

export type GoogleOutcome =
  | { kind: "ok"; user: { id: string; name: string; email: string; tokenVersion: number; activeOrganizationId: string | null; isPlatformAdmin: boolean }; created: boolean }
  | { kind: "needs_password_and_code" };

/** Finds, links or creates the account for a verified Google profile. */
export async function signInWithGoogle(profile: GoogleProfile, request?: Request): Promise<GoogleOutcome> {
  const email = normaliseEmail(profile.email);
  if (!email || !profile.emailVerified) throw new ApiError(403, "GOOGLE_UNVERIFIED", "Google has not verified that email address, so we cannot use it.");

  const select = { id: true, name: true, email: true, tokenVersion: true, activeOrganizationId: true, isPlatformAdmin: true, status: true, totpEnabledAt: true, emailVerifiedAt: true } as const;
  const identity = await db.authIdentity.findUnique({ where: { provider_subject: { provider: "GOOGLE", subject: profile.sub } }, select: { user: { select } } });
  let user = identity?.user ?? null;
  let created = false;

  if (!user) {
    const byEmail = await db.user.findUnique({ where: { email }, select });
    if (byEmail) {
      user = byEmail;
      await db.authIdentity.create({ data: { userId: byEmail.id, provider: "GOOGLE", subject: profile.sub, email } });
      if (!byEmail.emailVerifiedAt) await db.user.update({ where: { id: byEmail.id }, data: { emailVerifiedAt: new Date() } });
      await audit({ userId: byEmail.id, action: "UPDATE", entity: "User", entityId: byEmail.id, changes: { googleLinked: true }, request });
    } else {
      const made = await db.user.create({
        data: {
          email,
          name: profile.name.slice(0, 120),
          // Nobody knows this password; it exists only because the column is required.
          passwordHash: await hashPassword(crypto.randomBytes(32).toString("base64")),
          hasPassword: false,
          emailVerifiedAt: new Date(),
          authIdentities: { create: { provider: "GOOGLE", subject: profile.sub, email } },
        },
        select,
      });
      user = made;
      created = true;
      await audit({ userId: made.id, action: "CREATE", entity: "User", entityId: made.id, changes: { via: "google" }, request });
    }
  }

  if (user.status !== "ACTIVE") throw new ApiError(403, "FORBIDDEN", "This account is suspended.");
  if (user.totpEnabledAt && env().REQUIRE_TOTP) return { kind: "needs_password_and_code" };

  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await audit({ userId: user.id, action: "LOGIN", entity: "User", entityId: user.id, changes: { via: "google" }, request });
  return { kind: "ok", user, created };
}

