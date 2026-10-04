import "server-only";

import crypto from "node:crypto";

import type { User } from "@prisma/client";
import { z } from "zod";

import { ApiError } from "@/lib/api";
import { assertPasswordAcceptable, hashPassword, verifyPassword, WeakPasswordError } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { PRODUCT_NAME } from "@/lib/brand";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { normaliseEmail } from "@/lib/identity";
import { MODULE_CATALOG, MODULE_KEYS, type ModuleKey } from "@/lib/modules";
import { hit } from "@/lib/ratelimit";
import { kenyanMsisdn } from "@/lib/sms";

import { renderEmail, sendEmail } from "./email";
import { createOrganization, setModuleEnabled } from "./organizations";
import { sendSms, smsMode } from "./sms";

/**
 * Self-service accounts: sign-up, proving an email or phone, signing in with a
 * code, recovering a forgotten password, changing a password, and creating a team.
 *
 * Every proof is a one-time token that can be used by its 6-digit code or by
 * its link. Both are stored only as hashes (the code as an HMAC bound to the
 * token, so a leaked row cannot be brute-forced offline), tokens live 15 minutes,
 * allow 5 wrong tries, and die when used or replaced. Anything that could reveal
 * whether an address has an account answers the same way either way.
 */

export type Purpose = "VERIFY_EMAIL" | "VERIFY_PHONE" | "RESET_PASSWORD" | "LOGIN_CODE";
export type Channel = "EMAIL" | "SMS";

const TTL_MS = 15 * 60_000;
const MAX_TRIES = 5;
export const MAX_TEAMS_PER_PERSON = 5;

const sha256 = (v: string) => crypto.createHash("sha256").update(v).digest("hex");
const codeHash = (id: string, code: string) => crypto.createHmac("sha256", env().AUTH_SECRET).update(`${id}:${code}`).digest("hex");
const safeEqual = (a: string, b: string) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
const baseUrl = () => env().APP_BASE_URL.replace(/\/$/, "");

// ---------------------------------------------------------------------------
// Tokens

const COPY: Record<Purpose, { title: string; line: string; button: string; path: string | null; sms: string }> = {
  VERIFY_EMAIL: {
    title: "Confirm your email address",
    line: "Use this code, or the button, to confirm your email and finish creating your account.",
    button: "Confirm my email",
    path: "/verify",
    sms: "confirm your phone",
  },
  VERIFY_PHONE: { title: "Confirm your phone number", line: "Use this code to confirm your phone number.", button: "", path: null, sms: "confirm your phone" },
  RESET_PASSWORD: {
    title: "Reset your password",
    line: "Use this code, or the button, to choose a new password. If you did not ask for this, ignore this message; your password has not changed.",
    button: "Choose a new password",
    path: "/reset-password",
    sms: "reset your password",
  },
  LOGIN_CODE: { title: "Your sign-in code", line: "Use this code to sign in. If you did not try to sign in, ignore this message.", button: "", path: null, sms: "sign in" },
};

/** Creates a token for `user`, replacing any earlier unused one of the same purpose, and sends it. */
async function issue(user: Pick<User, "id" | "name">, purpose: Purpose, channel: Channel, target: string): Promise<{ sent: boolean }> {
  const id = crypto.randomUUID();
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  const link = channel === "EMAIL" && COPY[purpose].path ? crypto.randomBytes(32).toString("base64url") : null;

  await db.$transaction([
    db.authToken.updateMany({ where: { userId: user.id, purpose, usedAt: null }, data: { usedAt: new Date() } }),
    db.authToken.create({
      data: {
        id,
        userId: user.id,
        purpose,
        channel,
        target,
        codeHash: codeHash(id, code),
        linkHash: link ? sha256(link) : null,
        expiresAt: new Date(Date.now() + TTL_MS),
      },
    }),
  ]);

  const copy = COPY[purpose];
  try {
    if (channel === "EMAIL") {
      const mail = renderEmail({
        product: PRODUCT_NAME,
        title: copy.title,
        body: `Hi ${user.name.split(" ")[0] ?? "there"},\n\n${copy.line}\n\nYour code: ${code}\n\nIt works for 15 minutes.`,
        action: link && copy.path ? { label: copy.button, url: `${baseUrl()}${copy.path}/${link}` } : null,
        footer: `Sent by ${PRODUCT_NAME}. Never share this code with anyone.`,
      });
      const r = await sendEmail({ to: target, subject: `${PRODUCT_NAME}: ${copy.title.toLowerCase()}`, text: mail.text, html: mail.html });
      return { sent: r.ok };
    }
    if (smsMode() === "off") return { sent: false };
    const r = await sendSms({ to: target, text: `${PRODUCT_NAME}: your code to ${copy.sms} is ${code}. It expires in 15 minutes. Never share it.` });
    return { sent: r.ok };
  } catch {
    return { sent: false };
  }
}

type Claimed = { userId: string; target: string; channel: string };

/** Claims a token by code for a target (address or phone). Counts wrong tries. */
async function claimByCode(purpose: Purpose, target: string, code: string): Promise<Claimed | null> {
  const token = await db.authToken.findFirst({
    where: { purpose, target, usedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!token || !/^\d{6}$/.test(code)) return null;
  if (token.attempts >= MAX_TRIES) return null;
  const bumped = await db.authToken.updateMany({ where: { id: token.id, usedAt: null, attempts: { lt: MAX_TRIES } }, data: { attempts: { increment: 1 } } });
  if (bumped.count === 0) return null;
  if (!safeEqual(codeHash(token.id, code), token.codeHash)) return null;
  const claimed = await db.authToken.updateMany({ where: { id: token.id, usedAt: null }, data: { usedAt: new Date() } });
  return claimed.count === 1 ? { userId: token.userId, target: token.target, channel: token.channel } : null;
}

/** Claims a token by its emailed link. */
async function claimByLink(purpose: Purpose, link: string): Promise<Claimed | null> {
  if (!/^[A-Za-z0-9_-]{30,64}$/.test(link)) return null;
  const token = await db.authToken.findFirst({ where: { purpose, linkHash: sha256(link), usedAt: null, expiresAt: { gt: new Date() } } });
  if (!token) return null;
  const claimed = await db.authToken.updateMany({ where: { id: token.id, usedAt: null }, data: { usedAt: new Date() } });
  return claimed.count === 1 ? { userId: token.userId, target: token.target, channel: token.channel } : null;
}

async function limited(key: string, limit: number, windowSec: number): Promise<boolean> {
  return !(await hit(key, { limit, windowSec })).allowed;
}

const TOO_MANY = () => new ApiError(429, "RATE_LIMITED", "Too many attempts. Wait a few minutes and try again.");
const BAD_CODE = () => new ApiError(422, "INVALID_CODE", "That code or link is wrong or has expired. Ask for a new one.");

// ---------------------------------------------------------------------------
// Sign-up and email verification

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Tell us your name").max(120),
  email: z.string().trim().max(254),
  password: z.string().min(1).max(200),
  acceptTerms: z.literal(true, { errorMap: () => ({ message: "Please accept the privacy and cookie policies to continue" }) }),
  /** Honeypot */
  website: z.string().max(0).optional(),
});

/** Creates an unverified account and sends the verification. The answer never says whether the email was already registered. */
export async function register(input: z.infer<typeof registerSchema>, request?: Request) {
  if (input.website) throw new ApiError(400, "BAD_REQUEST", "Request rejected.");
  const email = normaliseEmail(input.email);
  if (!email) throw new ApiError(422, "VALIDATION_FAILED", "That email address does not look right.", { issues: [{ path: "email", message: "That email address does not look right." }] });
  try {
    assertPasswordAcceptable(input.password, email);
  } catch (e) {
    if (e instanceof WeakPasswordError) throw new ApiError(422, "VALIDATION_FAILED", e.message, { issues: [{ path: "password", message: e.message }] });
    throw e;
  }
  if ((await limited(`register:${email}`, 5, 3600)) || (await limited("register:all", 300, 3600))) throw TOO_MANY();

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    if (existing.emailVerifiedAt) {
      // Same answer to the visitor; the real owner is told by email.
      const mail = renderEmail({
        product: PRODUCT_NAME,
        title: "You already have an account",
        body: `Someone tried to create a ${PRODUCT_NAME} account with this address. You already have one, so just sign in. If it was you and you forgot your password, you can reset it.`,
        action: { label: "Sign in", url: `${baseUrl()}/login` },
      });
      await sendEmail({ to: email, subject: `${PRODUCT_NAME}: you already have an account`, text: mail.text, html: mail.html }).catch(() => undefined);
    } else if (existing.hasPassword) {
      await issue(existing, "VERIFY_EMAIL", "EMAIL", email);
    }
    return { email };
  }

  const user = await db.user.create({
    data: { email, name: input.name, passwordHash: await hashPassword(input.password), hasPassword: true },
  });
  await audit({ userId: user.id, action: "CREATE", entity: "User", entityId: user.id, changes: { via: "signup" }, request });
  await issue(user, "VERIFY_EMAIL", "EMAIL", email);
  return { email };
}

/** Sends a fresh verification message to an unverified account. Always answers the same. */
export async function resendVerification(emailInput: string) {
  const email = normaliseEmail(emailInput);
  if (!email) return;
  if ((await limited(`resend:${email}`, 5, 3600)) || (await limited("resend:all", 300, 3600))) throw TOO_MANY();
  const user = await db.user.findUnique({ where: { email } });
  if (user && !user.emailVerifiedAt && user.status === "ACTIVE") await issue(user, "VERIFY_EMAIL", "EMAIL", email);
}

async function markEmailVerified(userId: string, request?: Request) {
  const user = await db.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
  await audit({ userId, action: "UPDATE", entity: "User", entityId: userId, changes: { emailVerified: true }, request });
  return user;
}

/** Verifies an email by code (with the address) or by link; returns the user to sign in. */
export async function verifyEmail(input: { email: string; code: string } | { link: string }, request?: Request): Promise<User> {
  let claimed: Claimed | null;
  if ("link" in input) {
    if (await limited("verify:link", 600, 3600)) throw TOO_MANY();
    claimed = await claimByLink("VERIFY_EMAIL", input.link);
  } else {
    const email = normaliseEmail(input.email);
    if (!email) throw BAD_CODE();
    if (await limited(`verify:${email}`, 20, 3600)) throw TOO_MANY();
    claimed = await claimByCode("VERIFY_EMAIL", email, input.code);
  }
  if (!claimed) throw BAD_CODE();
  const user = await markEmailVerified(claimed.userId, request);
  if (user.status !== "ACTIVE") throw BAD_CODE();
  return user;
}

// ---------------------------------------------------------------------------
// Finding people by what they type: an email address or a Kenyan phone number

type Who = { user: User; channel: Channel; target: string };

async function whoIs(identifier: string): Promise<Who | null> {
  const trimmed = identifier.trim();
  if (trimmed.includes("@")) {
    const email = normaliseEmail(trimmed);
    const user = email ? await db.user.findUnique({ where: { email } }) : null;
    return user && user.status === "ACTIVE" && email ? { user, channel: "EMAIL", target: email } : null;
  }
  const phone = kenyanMsisdn(trimmed);
  if (!phone) return null;
  // SMS goes only to a phone its owner has proven; an unverified number could be anyone's.
  const user = await db.user.findFirst({ where: { phone, phoneVerifiedAt: { not: null }, status: "ACTIVE" } });
  return user ? { user, channel: "SMS", target: phone } : null;
}

const identifierKey = (identifier: string) => (identifier.includes("@") ? (normaliseEmail(identifier) ?? "x") : (kenyanMsisdn(identifier) ?? "x"));

// ---------------------------------------------------------------------------
// Forgotten password

export async function requestPasswordReset(identifier: string) {
  const key = identifierKey(identifier);
  if ((await limited(`forgot:${key}`, 5, 3600)) || (await limited("forgot:all", 300, 3600))) throw TOO_MANY();
  const who = await whoIs(identifier);
  if (who) await issue(who.user, "RESET_PASSWORD", who.channel, who.target);
}

export const resetSchema = z
  .object({
    identifier: z.string().trim().max(254).optional(),
    code: z.string().trim().max(10).optional(),
    link: z.string().trim().max(80).optional(),
    password: z.string().min(1).max(200),
  })
  .refine((v) => v.link || (v.identifier && v.code), { message: "Enter the code we sent you" });

export async function resetPassword(input: z.infer<typeof resetSchema>, request?: Request): Promise<User> {
  let claimed: Claimed | null = null;
  if (input.link) {
    if (await limited("reset:link", 600, 3600)) throw TOO_MANY();
    // Check the password first so a weak one does not burn the link.
    claimed = null;
  } else {
    const key = identifierKey(input.identifier!);
    if (await limited(`reset:${key}`, 20, 3600)) throw TOO_MANY();
  }
  try {
    assertPasswordAcceptable(input.password);
  } catch (e) {
    if (e instanceof WeakPasswordError) throw new ApiError(422, "VALIDATION_FAILED", e.message, { issues: [{ path: "password", message: e.message }] });
    throw e;
  }
  if (input.link) claimed = await claimByLink("RESET_PASSWORD", input.link);
  else {
    const who = await whoIs(input.identifier!);
    claimed = who ? await claimByCode("RESET_PASSWORD", who.target, input.code!) : null;
  }
  if (!claimed) throw BAD_CODE();

  const existing = await db.user.findUnique({ where: { id: claimed.userId } });
  if (!existing || existing.status !== "ACTIVE") throw BAD_CODE();
  const user = await db.user.update({
    where: { id: claimed.userId },
    data: {
      passwordHash: await hashPassword(input.password),
      hasPassword: true,
      tokenVersion: { increment: 1 },
      // Receiving the email proves the mailbox; receiving the SMS proves the phone.
      ...(claimed.channel === "EMAIL" && !existing.emailVerifiedAt ? { emailVerifiedAt: new Date() } : {}),
      ...(claimed.channel === "SMS" && !existing.phoneVerifiedAt ? { phoneVerifiedAt: new Date() } : {}),
    },
  });
  await audit({ userId: user.id, action: "UPDATE", entity: "User", entityId: user.id, changes: { passwordReset: true, via: claimed.channel }, request });
  const mail = renderEmail({
    product: PRODUCT_NAME,
    title: "Your password was changed",
    body: `The password on your ${PRODUCT_NAME} account was just changed and you were signed out everywhere. If this was not you, reset it again now and write to us.`,
    action: { label: "Reset my password", url: `${baseUrl()}/forgot-password` },
  });
  await sendEmail({ to: user.email, subject: `${PRODUCT_NAME}: your password was changed`, text: mail.text, html: mail.html }).catch(() => undefined);
  return user;
}

/** A signed-in person changes their password. Returns the user with the new token version so the caller can re-sign the cookie. */
export async function changePassword(userId: string, current: string | undefined, next: string, request?: Request): Promise<User> {
  if (await limited(`pwchange:${userId}`, 8, 900)) throw TOO_MANY();
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw new ApiError(404, "NOT_FOUND", "Account not found.");
  if (user.hasPassword) {
    if (!current || !(await verifyPassword(current, user.passwordHash))) {
      throw new ApiError(422, "VALIDATION_FAILED", "Your current password is not right.", { issues: [{ path: "current", message: "Your current password is not right." }] });
    }
  }
  try {
    assertPasswordAcceptable(next, user.email);
  } catch (e) {
    if (e instanceof WeakPasswordError) throw new ApiError(422, "VALIDATION_FAILED", e.message, { issues: [{ path: "password", message: e.message }] });
    throw e;
  }
  const updated = await db.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(next), hasPassword: true, tokenVersion: { increment: 1 } },
  });
  await audit({ userId, action: "UPDATE", entity: "User", entityId: userId, changes: { passwordChanged: true }, request });
  return updated;
}

// ---------------------------------------------------------------------------
// Signing in with a code instead of a password

export async function requestLoginCode(identifier: string) {
  const key = identifierKey(identifier);
  if ((await limited(`logincode:${key}`, 5, 900)) || (await limited("logincode:all", 600, 3600))) throw TOO_MANY();
  const who = await whoIs(identifier);
  // Anyone with an authenticator app must use password + code, so a message alone is never enough for them.
  if (who && who.user.emailVerifiedAt && !who.user.totpEnabledAt) await issue(who.user, "LOGIN_CODE", who.channel, who.target);
}

export async function verifyLoginCode(identifier: string, code: string, request?: Request): Promise<User> {
  const key = identifierKey(identifier);
  if (await limited(`logincode-verify:${key}`, 20, 900)) throw TOO_MANY();
  const who = await whoIs(identifier);
  const claimed = who ? await claimByCode("LOGIN_CODE", who.target, code) : null;
  if (!claimed) throw BAD_CODE();
  const user = await db.user.update({ where: { id: claimed.userId }, data: { lastLoginAt: new Date() } });
  await audit({ userId: user.id, action: "LOGIN", entity: "User", entityId: user.id, changes: { via: `code:${claimed.channel}` }, request });
  return user;
}

// ---------------------------------------------------------------------------
// Proving a phone number (so it can receive recovery codes)

export async function requestPhoneVerification(userId: string) {
  if ((await limited(`phoneverify:${userId}`, 5, 3600)) || (await limited("phoneverify:all", 300, 3600))) throw TOO_MANY();
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user?.phone) throw new ApiError(422, "VALIDATION_FAILED", "Add your phone number to your profile first.");
  if (smsMode() === "off") throw new ApiError(409, "SMS_OFF", "Text messages are not available right now.");
  const r = await issue(user, "VERIFY_PHONE", "SMS", user.phone);
  if (!r.sent) throw new ApiError(502, "SMS_FAILED", "We could not send the text. Check the number and try again.");
}

export async function confirmPhoneVerification(userId: string, code: string, request?: Request) {
  if (await limited(`phoneconfirm:${userId}`, 20, 3600)) throw TOO_MANY();
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user?.phone) throw BAD_CODE();
  const claimed = await claimByCode("VERIFY_PHONE", user.phone, code);
  if (!claimed || claimed.userId !== userId) throw BAD_CODE();
  // One proven number belongs to one account, or a recovery code could reach the wrong person.
  const taken = await db.user.count({ where: { phone: user.phone, phoneVerifiedAt: { not: null }, id: { not: userId } } });
  if (taken > 0) throw new ApiError(409, "CONFLICT", "That number is already confirmed on another account.");
  await db.user.update({ where: { id: userId }, data: { phoneVerifiedAt: new Date() } });
  await audit({ userId, action: "UPDATE", entity: "User", entityId: userId, changes: { phoneVerified: true }, request });
}

// ---------------------------------------------------------------------------
// Teams

export const teamSchema = z.object({ name: z.string().trim().min(2, "Name your team").max(80) });

/** Turns on every shipped module for a new team, in dependency order. */
async function enableShippedModules(organizationId: string, byUserId: string) {
  const pending = MODULE_KEYS.filter((k) => !MODULE_CATALOG[k].comingSoon);
  const done = new Set<ModuleKey>();
  for (let pass = 0; pass < pending.length && done.size < pending.length; pass++) {
    for (const key of pending) {
      if (done.has(key)) continue;
      try {
        await setModuleEnabled({ organizationId, moduleKey: key, enabled: true, byUserId });
        done.add(key);
      } catch {
        /* a prerequisite is not on yet; the next pass picks it up */
      }
    }
  }
}

/** A verified person starts a team and owns it. */
export async function createTeam(userId: string, name: string, request?: Request) {
  if (await limited(`team:${userId}`, 10, 3600)) throw TOO_MANY();
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, status: true, emailVerifiedAt: true } });
  if (!user || user.status !== "ACTIVE") throw new ApiError(403, "FORBIDDEN", "This account cannot create teams.");
  if (!user.emailVerifiedAt) throw new ApiError(403, "EMAIL_UNVERIFIED", "Confirm your email address before creating a team.");
  const owned = await db.membership.count({ where: { userId, role: "OWNER", status: "ACTIVE", organization: { status: "ACTIVE" } } });
  if (owned >= MAX_TEAMS_PER_PERSON) {
    throw new ApiError(409, "LIMIT_REACHED", `You can own up to ${MAX_TEAMS_PER_PERSON} teams. Ask us if you need more.`);
  }
  const org = await createOrganization({ name, plan: "TRIAL", createdById: userId });
  await db.membership.create({ data: { userId, organizationId: org.id, role: "OWNER" } });
  await enableShippedModules(org.id, userId);
  await db.user.update({ where: { id: userId }, data: { activeOrganizationId: org.id } });
  await audit({ organizationId: org.id, userId, action: "CREATE", entity: "Membership", entityId: org.id, changes: { role: "OWNER", via: "self-service" }, request });
  return org;
}
