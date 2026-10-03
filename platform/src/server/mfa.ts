import "server-only";

import { ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { verifyPassword } from "@/lib/auth";
import { PRODUCT_NAME } from "@/lib/brand";
import { db } from "@/lib/db";
import { decryptFor, encryptFor } from "@/lib/secrets";
import { generateSecret, otpauthUri, verifyTotp } from "@/lib/totp";

/**
 * TOTP enrolment for Owners and Approvers (and anyone else who opts in).
 *
 * The seed is sealed with the *user id* as authenticated data, so a seed copied
 * from one user's row to another's cannot be used. Enrolment is two steps —
 * begin (stores a pending seed) then confirm (a valid code activates it) — so a
 * mistyped setup cannot lock someone out of an account that requires it.
 */

export async function beginEnrolment(userId: string): Promise<{ secret: string; uri: string }> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { email: true, totpEnabledAt: true } });
  if (!user) throw new ApiError(404, "NOT_FOUND", "Unknown user.");
  if (user.totpEnabledAt) throw new ApiError(409, "CONFLICT", "Two-factor authentication is already on.");

  const secret = generateSecret();
  const sealed = encryptFor(userId, secret);
  await db.user.update({
    where: { id: userId },
    data: { totpCipher: sealed.cipherText, totpIv: sealed.iv, totpTag: sealed.authTag, totpEnabledAt: null },
  });
  return { secret, uri: otpauthUri({ secret, account: user.email, issuer: PRODUCT_NAME }) };
}

export async function confirmEnrolment(userId: string, code: string): Promise<void> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { totpCipher: true, totpIv: true, totpTag: true, totpEnabledAt: true },
  });
  if (!user?.totpCipher || !user.totpIv || !user.totpTag) {
    throw new ApiError(409, "CONFLICT", "Start setup first.");
  }
  if (user.totpEnabledAt) throw new ApiError(409, "CONFLICT", "Two-factor authentication is already on.");

  const seed = decryptFor(userId, { cipherText: user.totpCipher, iv: user.totpIv, authTag: user.totpTag });
  const check = seed ? verifyTotp(seed, code) : ({ ok: false } as const);
  if (!check.ok) throw new ApiError(422, "TOTP_INVALID", "That code is not right. Check the time on your phone and try again.");

  await db.user.update({
    where: { id: userId },
    data: { totpEnabledAt: new Date(), totpLastCounter: check.counter },
  });
  await audit({ userId, action: "MFA_ENROL", entity: "User", entityId: userId });
}

/** Turning it off needs the account password, so a hijacked session cannot strip it. */
export async function disableMfa(userId: string, password: string): Promise<void> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw new ApiError(401, "INVALID_CREDENTIALS", "That password is not right.");
  }
  await db.user.update({
    where: { id: userId },
    data: { totpCipher: null, totpIv: null, totpTag: null, totpEnabledAt: null, totpLastCounter: null },
  });
  await audit({ userId, action: "MFA_DISABLE", entity: "User", entityId: userId });
}
