import "server-only";

import crypto from "node:crypto";

import { SignJWT, jwtVerify } from "jose";

import { ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { hashPassword } from "@/lib/auth";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { normaliseEmail } from "@/lib/identity";
import { hit } from "@/lib/ratelimit";
import { resendVerification } from "./accounts";
import type { TikTokTokens } from "./tiktok";

/**
 * Sign in with TikTok (Login Kit, authorization-code flow with PKCE + signed state).
 *
 * `begin` sends the browser to TikTok asking only for identity (scope user.info.basic
 * — posting is a separate connect step, which asks for video.publish there). `finish`
 * checks the signed cookie, exchanges the code, reads the TikTok profile.
 *
 * Linking policy: TikTok shares NO email address, so an account is matched only by a
 * previously linked TikTok identity (AuthIdentity provider="TIKTOK"). An unknown TikTok
 * identity gets a short-lived signed "pending" ticket; the account is created only after
 * the person picks a real email and proves it with the normal code verification — nobody
 * can ever sign up with an email address TikTok has not shown us and they have not owned.
 * A person who has an authenticator app set up must sign in with password and code, so
 * TikTok alone is never a way around their second factor.
 */

export const TIKTOK_OAUTH_COOKIE = "ap_tiktok_oauth";
export const TIKTOK_PENDING_COOKIE = "ap_tiktok_pending";
const AUTHORIZE_URL = "https://www.tiktok.com/v2/auth/authorize/";
const LOGIN_SCOPE = "user.info.basic";

export function tiktokLoginEnabled(): boolean {
  const e = env();
  return e.TIKTOK_PROVIDER === "live" && Boolean(e.TIKTOK_CLIENT_KEY?.trim() && e.TIKTOK_CLIENT_SECRET?.trim());
}

export const tiktokRedirectUri = () => `${env().APP_BASE_URL.replace(/\/$/, "")}/api/auth/tiktok/callback`;

const secret = () => new TextEncoder().encode(env().AUTH_SECRET);
const b64url = (b: Buffer) => b.toString("base64url");

export interface TiktokProfile {
  openId: string;
  displayName: string;
  avatarUrl: string | null;
}

/** Network boundary, replaceable in tests (the sandbox needs no live TikTok). */
export const tiktokLoginTransport: {
  exchange: ((code: string, verifier: string) => Promise<TikTokTokens>) | null;
  profile: ((accessToken: string) => Promise<TiktokProfile>) | null;
} = { exchange: null, profile: null };

const TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";

/** Code + PKCE verifier for access token; {code:0,data:{...}} envelope, errors as {error,error_description}. */
async function liveExchange(code: string, verifier: string): Promise<TikTokTokens> {
  const e = env();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: e.TIKTOK_CLIENT_KEY!,
      client_secret: e.TIKTOK_CLIENT_SECRET!,
      code,
      grant_type: "authorization_code",
      redirect_uri: tiktokRedirectUri(),
      code_verifier: verifier,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const b = (await res.json().catch(() => null)) as {
    access_token?: string;
    refresh_token?: string;
    open_id?: string;
    scope?: string;
    expires_in?: number;
    refresh_expires_in?: number;
    error?: string;
    error_description?: string;
    data?: { access_token?: string; refresh_token?: string; open_id?: string; scope?: string; expires_in?: number; refresh_expires_in?: number };
  } | null;
  const d = b?.data?.access_token ? b.data : b;
  if (!res.ok || !d?.access_token || (!b?.data?.open_id && !b?.open_id)) {
    throw new ApiError(502, "TIKTOK_FAILED", b?.error_description || b?.error || `TikTok did not accept the sign-in (${res.status}).`);
  }
  const openId = (b?.data?.open_id ?? b?.open_id)!;
  const expiresIn = d.expires_in ?? 86_400;
  const refreshExpiresIn = d.refresh_expires_in ?? 366 * 86_400;
  return {
    openId,
    accessToken: d.access_token,
    accessExpiresAt: new Date(Date.now() + expiresIn * 1000),
    refreshToken: d.refresh_token ?? "",
    refreshExpiresAt: new Date(Date.now() + refreshExpiresIn * 1000),
    scopes: (b?.data?.scope ?? b?.scope ?? LOGIN_SCOPE).split(",").filter(Boolean),
  };
}

/** The login identity read: open_id, display_name, avatar_url. */
async function liveProfile(accessToken: string): Promise<TiktokProfile> {
  const res = await fetch("https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url", {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(15_000),
  });
  const b = (await res.json().catch(() => null)) as { data?: { user?: { open_id?: string; display_name?: string; avatar_url?: string } } } | null;
  const u = b?.data?.user;
  if (!res.ok || !u?.open_id) throw new ApiError(502, "TIKTOK_FAILED", "Could not read the TikTok account after sign-in.");
  return { openId: u.open_id, displayName: u.display_name || "TikTok user", avatarUrl: u.avatar_url ?? null };
}

export async function beginTiktok(next: string | null): Promise<{ url: string; cookie: string }> {
  if (!tiktokLoginEnabled() && !(tiktokLoginTransport.exchange && tiktokLoginTransport.profile)) {
    throw new ApiError(404, "NOT_FOUND", "TikTok sign-in is not switched on.");
  }
  const state = b64url(crypto.randomBytes(24));
  const verifier = b64url(crypto.randomBytes(48));
  const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
  const cookie = await new SignJWT({ state, verifier, next })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(secret());
  const u = new URL(AUTHORIZE_URL);
  u.searchParams.set("client_key", env().TIKTOK_CLIENT_KEY || "test-client-key"); // transport-overridden tests have no real key
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", LOGIN_SCOPE);
  u.searchParams.set("redirect_uri", tiktokRedirectUri());
  u.searchParams.set("state", state);
  u.searchParams.set("code_challenge", challenge);
  u.searchParams.set("code_challenge_method", "S256");
  return { url: u.toString(), cookie };
}

/** Checks TikTok's answer against the cookie and returns tokens + the TikTok identity. */
export async function finishTiktok(
  cookieValue: string | undefined,
  query: URLSearchParams,
): Promise<{ tokens: TikTokTokens; profile: TiktokProfile; next: string | null }> {
  if (!cookieValue) throw new ApiError(400, "TIKTOK_FAILED", "The sign-in took too long. Start again.");
  let saved: { state: string; verifier: string; next: string | null };
  try {
    const { payload } = await jwtVerify(cookieValue, secret());
    saved = payload as unknown as typeof saved;
  } catch {
    throw new ApiError(400, "TIKTOK_FAILED", "The sign-in took too long. Start again.");
  }
  if (query.get("error")) throw new ApiError(400, "TIKTOK_CANCELLED", "TikTok sign-in was cancelled.");
  const state = query.get("state") ?? "";
  if (!state || state.length !== saved.state.length || !crypto.timingSafeEqual(Buffer.from(state), Buffer.from(saved.state))) {
    throw new ApiError(400, "TIKTOK_FAILED", "The TikTok sign-in could not be verified. Start again.");
  }
  const code = query.get("code");
  if (!code) throw new ApiError(400, "TIKTOK_FAILED", "TikTok did not send a sign-in code.");
  if (tiktokLoginTransport.exchange && tiktokLoginTransport.profile) {
    // Tests drive the flow with a scripted TikTok.
    const tokens = await tiktokLoginTransport.exchange(code, saved.verifier);
    const profile = await tiktokLoginTransport.profile(tokens.accessToken);
    return { tokens, profile, next: saved.next };
  }
  const tokens = await liveExchange(code, saved.verifier);
  const profile = await liveProfile(tokens.accessToken);
  return { tokens, profile, next: saved.next };
}

export type TiktokOutcome =
  | { kind: "ok"; user: { id: string; name: string; email: string; tokenVersion: number; activeOrganizationId: string | null; isPlatformAdmin: boolean } }
  | { kind: "needs_password_and_code" }
  | { kind: "new"; pending: { openId: string; name: string; avatarUrl: string | null } };

/** Who is this TikTok identity here? Linked account, or a pending ticket for a fresh, email-verified sign-up. */
export async function signInWithTiktok(profile: TiktokProfile, request?: Request): Promise<TiktokOutcome> {
  if (!profile.openId) throw new ApiError(502, "TIKTOK_FAILED", "TikTok did not tell us who signed in.");
  const select = { id: true, name: true, email: true, tokenVersion: true, activeOrganizationId: true, isPlatformAdmin: true, status: true, totpEnabledAt: true } as const;
  const identity = await db.authIdentity.findUnique({ where: { provider_subject: { provider: "TIKTOK", subject: profile.openId } }, select: { user: { select } } });
  const user = identity?.user ?? null;
  if (!user) {
    return { kind: "new", pending: { openId: profile.openId, name: profile.displayName.slice(0, 120), avatarUrl: profile.avatarUrl } };
  }
  if (user.status !== "ACTIVE") throw new ApiError(403, "FORBIDDEN", "This account is suspended.");
  if (user.totpEnabledAt && env().REQUIRE_TOTP) {
    await audit({ userId: user.id, action: "LOGIN_FAILED", entity: "User", entityId: user.id, changes: { via: "tiktok", reason: "totp_required" }, request }).catch(() => undefined);
    return { kind: "needs_password_and_code" };
  }
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await audit({ userId: user.id, action: "LOGIN", entity: "User", entityId: user.id, changes: { via: "tiktok" }, request });
  return { kind: "ok", user: { ...user } };
}

/** Seals the pending ticket (new TikTok identity) for the sign-up page. */
export async function sealTiktokPending(pending: { openId: string; name: string; avatarUrl: string | null }, next: string | null): Promise<string> {
  return new SignJWT({ ...pending, kind: "tiktok-pending", next })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(secret());
}

export async function readTiktokPending(cookieValue: string | undefined): Promise<{ openId: string; name: string; avatarUrl: string | null; next: string | null } | null> {
  if (!cookieValue) return null;
  try {
    const { payload } = await jwtVerify(cookieValue, secret());
    if (payload.kind !== "tiktok-pending" || typeof payload.openId !== "string") return null;
    return {
      openId: payload.openId,
      name: String(payload.name ?? "").slice(0, 120),
      avatarUrl: typeof payload.avatarUrl === "string" ? payload.avatarUrl : null,
      next: typeof payload.next === "string" ? payload.next : null,
    };
  } catch {
    return null;
  }
}

/**
 * Finishes a TikTok sign-up after email verification: creates the account with the
 * TikTok identity linked and sends the email confirmation code. The person signs in
 * with email + password (Google-style passwordless entry is for providers that prove an
 * email; TikTok never does).
 */
export async function completeTiktokSignup(
  pending: { openId: string; name: string; avatarUrl: string | null },
  input: { email: string; password: string; name?: string },
  request?: Request,
): Promise<{ email: string }> {
  const rl = await hit(`tiktoksignup:${pending.openId}`, { limit: 5, windowSec: 3600 });
  if (!rl.allowed) throw new ApiError(429, "RATE_LIMITED", "Too many attempts. Wait a little and try again.");
  const email = normaliseEmail(input.email);
  if (!email) throw new ApiError(422, "VALIDATION_FAILED", "Enter a valid email address.");
  if ((input.password ?? "").length < 10) throw new ApiError(422, "VALIDATION_FAILED", "Use at least 10 characters for the password.");
  const taken = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (taken) throw new ApiError(409, "CONFLICT", "An account with that email already exists. Sign in with it and link TikTok on your Security page.");

  const name = (input.name ?? "").trim().slice(0, 120) || pending.name || "TikTok user";
  const user = await db.user.create({
    data: {
      email,
      name,
      passwordHash: await hashPassword(input.password),
      authIdentities: { create: { provider: "TIKTOK", subject: pending.openId, email } },
    },
    select: { id: true },
  });
  await audit({ userId: user.id, action: "CREATE", entity: "User", entityId: user.id, changes: { via: "tiktok" }, request });
  await resendVerification(email);
  return { email };
}
