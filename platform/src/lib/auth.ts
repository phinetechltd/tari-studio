import "server-only";

import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { cache } from "react";

import { audit } from "./audit";
import { db } from "./db";
import { env } from "./env";
import { normaliseEmail } from "./identity";
import { MODULE_KEYS } from "./modules";
import { hit } from "./ratelimit";
import { ALL_PERMISSIONS, ROLES, type Permission, type Principal, type Role } from "./rbac";
import { decryptFor } from "./secrets";
import { verifyTotp } from "./totp";

/**
 * One credential store, one token shape.
 *
 * The console holds an HTTP-only session cookie carrying a signed JWT. The
 * token records *who* (sub), *which organisation they are working in* (org) and
 * a `tv` (token version) — and deliberately nothing about role or licences.
 * Those are read from the database on every request, so removing a member,
 * changing a role or revoking a module takes effect at once instead of at
 * sign-out. Bumping `User.tokenVersion` revokes every session a user has.
 */

export const SESSION_COOKIE = "ap_session";
const ISSUER = "agency-platform";

export interface SessionClaims {
  sub: string;
  /** Active organisation id; null means platform mode (platform admins only). */
  org: string | null;
  tv: number;
  name: string;
  email: string;
}

function secretKey(): Uint8Array {
  return new TextEncoder().encode(env().AUTH_SECRET);
}

// ── passwords ──────────────────────────────────────────────────────────

const MIN_PASSWORD = 10;

export class WeakPasswordError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WeakPasswordError";
  }
}

export function assertPasswordAcceptable(password: string, email?: string): void {
  if (password.length < MIN_PASSWORD) {
    throw new WeakPasswordError(`Use at least ${MIN_PASSWORD} characters.`);
  }
  if (password.length > 200) throw new WeakPasswordError("That password is too long.");
  if (email && password.toLowerCase() === email.toLowerCase()) {
    throw new WeakPasswordError("The password must not be your email address.");
  }
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 11);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// A valid hash of a random string, compared against when the email is unknown so
// an unknown address and a wrong password cost the same time.
const DUMMY_HASH = bcrypt.hashSync("dummy-password-for-timing", 11);

// ── session tokens ─────────────────────────────────────────────────────

export async function signSession(claims: SessionClaims): Promise<string> {
  return new SignJWT({ org: claims.org, tv: claims.tv, name: claims.name, email: claims.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setExpirationTime(`${env().ACCESS_TOKEN_TTL_MIN}m`)
    .sign(secretKey());
}

export async function verifySession(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), { issuer: ISSUER });
    if (typeof payload.sub !== "string" || typeof payload.tv !== "number") return null;
    return {
      sub: payload.sub,
      org: typeof payload.org === "string" ? payload.org : null,
      tv: payload.tv,
      name: String(payload.name ?? ""),
      email: String(payload.email ?? ""),
    };
  } catch {
    return null;
  }
}

export async function setSessionCookie(claims: SessionClaims): Promise<void> {
  const token = await signSession(claims);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: env().ACCESS_TOKEN_TTL_MIN * 60,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

export async function readSessionClaims(): Promise<SessionClaims | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySession(token);
}

// ── sign-in ────────────────────────────────────────────────────────────

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  tokenVersion: number;
  activeOrganizationId: string | null;
  isPlatformAdmin: boolean;
}

export type AuthResult =
  | { ok: true; user: AuthenticatedUser }
  | {
      ok: false;
      reason: "INVALID" | "TOTP_REQUIRED" | "TOTP_INVALID" | "RATE_LIMITED";
      retryAfterSec?: number;
    };

export const LOGIN_LIMIT = { limit: 10, windowSec: 15 * 60 };

/**
 * Checks email + password (+ TOTP code when the user has enrolled).
 *
 * "Unknown email", "wrong password" and "suspended account" are one answer
 * (`INVALID`) so the form cannot be used to discover who has an account. The
 * rate limit is keyed on the email, not the caller's IP.
 */
export async function authenticate(input: {
  email: string;
  password: string;
  totp?: string;
  request?: Request;
}): Promise<AuthResult> {
  const email = normaliseEmail(input.email);
  const limiterKey = `login:${email ?? "invalid"}`;

  const rate = await hit(limiterKey, LOGIN_LIMIT);
  if (!rate.allowed) return { ok: false, reason: "RATE_LIMITED", retryAfterSec: rate.retryAfterSec };

  const user = email ? await db.user.findUnique({ where: { email } }) : null;
  const passwordOk = await verifyPassword(input.password, user?.passwordHash ?? DUMMY_HASH);

  if (!user || !passwordOk || user.status !== "ACTIVE") {
    await audit({
      action: "LOGIN_FAILED",
      entity: "User",
      entityId: user?.id ?? null,
      userId: user?.id ?? null,
      changes: { email },
      request: input.request,
    });
    return { ok: false, reason: "INVALID" };
  }

  // TOTP: if the user has enrolled, require a valid code (unless TOTP is disabled
  // at the environment level, e.g. for local / staging environments that want to
  // showcase the product without forcing every login through a second factor).
  if (user.totpEnabledAt && env().REQUIRE_TOTP) {
    if (!input.totp) {
      return { ok: false, reason: "TOTP_REQUIRED" };
    }
    const seed = decryptFor(user.id, {
      cipherText: user.totpCipher!,
      iv: user.totpIv!,
      authTag: user.totpTag!,
    });
    if (!seed) {
      // Sealed blob is corrupt or key rotated — treat as unconfigured rather
      // than locking the user out. The enrolment flow can re-seal.
      return { ok: false, reason: "TOTP_INVALID" };
    }
    const verify = verifyTotp(seed, input.totp);
    if (!verify.ok) {
      return { ok: false, reason: "TOTP_INVALID" };
    }
    // Reject a replay: the counter must always advance.
    if (user.totpLastCounter != null && verify.counter <= user.totpLastCounter) {
      return { ok: false, reason: "TOTP_INVALID" };
    }
    // Record the counter so a stale code can never be replayed.
    await db.user.update({
      where: { id: user.id },
      data: { totpLastCounter: verify.counter },
    });
  }

  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await audit({ action: "LOGIN", entity: "User", entityId: user.id, userId: user.id, request: input.request });

  return {
    ok: true,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      tokenVersion: user.tokenVersion,
      activeOrganizationId: user.activeOrganizationId,
      isPlatformAdmin: user.isPlatformAdmin,
    },
  };
}

// ── organisation context ───────────────────────────────────────────────

/** Organisations a user can currently work in (active membership, active org). */
export async function activeMemberships(userId: string) {
  return db.membership.findMany({
    where: { userId, status: "ACTIVE", organization: { status: "ACTIVE" } },
    select: { organizationId: true, role: true, organization: { select: { name: true, slug: true } } },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * The organisation to open at sign-in: the one used last if it is still valid,
 * else (for ordinary users) their first. A platform admin with no valid "last"
 * organisation opens in platform mode (null).
 */
export async function organisationForLogin(user: AuthenticatedUser): Promise<string | null> {
  const memberships = await activeMemberships(user.id);
  const valid = new Set(memberships.map((m) => m.organizationId));
  if (user.activeOrganizationId && valid.has(user.activeOrganizationId)) {
    return user.activeOrganizationId;
  }
  if (user.isPlatformAdmin) return null;
  return memberships[0]?.organizationId ?? null;
}

/**
 * Changes the organisation a user is working in. `null` (platform mode) is for
 * platform admins only. Returns false when the target is not allowed.
 */
export async function switchOrganization(userId: string, organizationId: string | null): Promise<boolean> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { isPlatformAdmin: true } });
  if (!user) return false;

  if (organizationId === null) {
    if (!user.isPlatformAdmin) return false;
  } else {
    const ok = (await activeMemberships(userId)).some((m) => m.organizationId === organizationId);
    if (!ok) return false;
  }
  await db.user.update({ where: { id: userId }, data: { activeOrganizationId: organizationId } });
  return true;
}

/** Signs a user out everywhere: every session issued so far stops verifying. */
export async function revokeAllSessions(userId: string): Promise<void> {
  await db.user.update({ where: { id: userId }, data: { tokenVersion: { increment: 1 } } });
}

// ── principal resolution ───────────────────────────────────────────────

const KNOWN_PERMISSIONS = new Set<string>(ALL_PERMISSIONS);
const ORG_ROLES = new Set<string>(ROLES.filter((r) => r !== "SUPER_ADMIN"));

function parseExtraPermissions(raw: unknown): Permission[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((p): p is Permission => typeof p === "string" && KNOWN_PERMISSIONS.has(p));
}

/**
 * Turns claims into a Principal by loading live state: the user's standing, the
 * membership in the active organisation, and that organisation's licences.
 * Returns null for anything that should no longer have access.
 */
export async function principalFromClaims(claims: SessionClaims): Promise<Principal | null> {
  // The three lookups do not depend on each other, so they run together.
  const [user, membership, licences] = await Promise.all([
    db.user.findUnique({
      where: { id: claims.sub },
      select: { id: true, status: true, tokenVersion: true, isPlatformAdmin: true, totpEnabledAt: true },
    }),
    claims.org
      ? db.membership.findUnique({
          where: { userId_organizationId: { userId: claims.sub, organizationId: claims.org } },
          select: { role: true, status: true, extraPermissions: true, organization: { select: { status: true } } },
        })
      : null,
    claims.org ? db.organizationModule.findMany({ where: { organizationId: claims.org, enabled: true }, select: { moduleKey: true } }) : [],
  ]);
  if (!user || user.status !== "ACTIVE" || user.tokenVersion !== claims.tv) return null;

  // REQUIRE_TOTP=false switches the second factor off for local and demo use,
  // for sign-in and for the MFA-gated actions alike. Production always
  // requires enrolment, whatever the variable says.
  const mfa = user.totpEnabledAt != null || (!env().REQUIRE_TOTP && process.env.NODE_ENV !== "production");

  if (claims.org === null) {
    // Platform mode is for platform staff only.
    if (!user.isPlatformAdmin) return null;
    return {
      userId: user.id,
      organizationId: null,
      role: "SUPER_ADMIN",
      extraPermissions: [],
      enabledModules: new Set<string>(MODULE_KEYS),
      mfa,
    };
  }

  if (!membership || membership.status !== "ACTIVE" || membership.organization.status !== "ACTIVE") {
    return null;
  }
  // A corrupt or hand-edited role must never resolve to something powerful.
  if (!ORG_ROLES.has(membership.role)) return null;

  return {
    userId: user.id,
    organizationId: claims.org,
    role: membership.role as Role,
    extraPermissions: parseExtraPermissions(membership.extraPermissions),
    enabledModules: new Set(licences.map((l) => l.moduleKey)),
    mfa,
  };
}

/**
 * Someone who is signed in but may not be inside a team (just signed up, or
 * removed from the team they were working in). They can reach the welcome
 * screen, create a team or pick one, and nothing else.
 */
export interface AccountSession {
  userId: string;
  name: string;
  email: string;
  emailVerified: boolean;
  isPlatformAdmin: boolean;
  hasPassword: boolean;
  phone: string | null;
  phoneVerified: boolean;
}

export async function accountFromClaims(claims: SessionClaims): Promise<AccountSession | null> {
  const user = await db.user.findUnique({
    where: { id: claims.sub },
    select: { id: true, name: true, email: true, status: true, tokenVersion: true, emailVerifiedAt: true, isPlatformAdmin: true, hasPassword: true, phone: true, phoneVerifiedAt: true },
  });
  if (!user || user.status !== "ACTIVE" || user.tokenVersion !== claims.tv) return null;
  return {
    userId: user.id,
    name: user.name,
    email: user.email,
    emailVerified: user.emailVerifiedAt != null,
    isPlatformAdmin: user.isPlatformAdmin,
    hasPassword: user.hasPassword,
    phone: user.phone,
    phoneVerified: user.phoneVerifiedAt != null,
  };
}

export const getAccountSession = cache(async (): Promise<AccountSession | null> => {
  const claims = await readSessionClaims();
  return claims ? accountFromClaims(claims) : null;
});

/** Opens a session for a verified person in the team they used last (or none yet). Returns where to go next. */
export async function startSession(user: {
  id: string;
  name: string;
  email: string;
  tokenVersion: number;
  activeOrganizationId: string | null;
  isPlatformAdmin: boolean;
}): Promise<{ org: string | null; next: string }> {
  const org = await organisationForLogin(user);
  await setSessionCookie(claimsFor(user, org));
  return { org, next: org === null ? (user.isPlatformAdmin ? "/platform" : "/welcome") : "/app" };
}

/** Console-side principal, resolved from the session cookie. */
export const getSessionPrincipal = cache(async (): Promise<Principal | null> => {
  const claims = await readSessionClaims();
  return claims ? principalFromClaims(claims) : null;
});

export async function getPrincipal(): Promise<Principal | null> {
  return getSessionPrincipal();
}

/** Claims for a user in a chosen organisation, ready to sign. */
export function claimsFor(user: AuthenticatedUser, org: string | null): SessionClaims {
  return { sub: user.id, org, tv: user.tokenVersion, name: user.name, email: user.email };
}
