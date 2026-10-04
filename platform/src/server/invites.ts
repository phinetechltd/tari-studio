import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { ApiError } from "@/lib/api";
import { assertPasswordAcceptable, hashPassword, verifyPassword } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { normaliseEmail } from "@/lib/identity";
import { assertWithinLimit } from "@/lib/limits";
import { ASSIGNABLE_ROLES, type Role } from "@/lib/rbac";
import { limitsFor, seatUsage } from "@/lib/tenant";

/**
 * Invitation-based onboarding.
 *
 * There is no open sign-up: people arrive by invitation from an Owner, or (for
 * the first Owner of a new tenant) from a platform admin. The emailed token is
 * a bearer secret, so only its SHA-256 is stored — a database dump cannot be
 * used to accept anyone's invitation.
 */

const INVITE_TTL_MS = 7 * 86_400_000;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createInvite(input: {
  organizationId: string;
  email: string;
  role: Role;
  invitedById: string | null;
  /** A brand-new tenant's first Owner is invited before any seats are counted. */
  skipSeatCheck?: boolean;
}): Promise<{ token: string; inviteId: string; email: string; expiresAt: Date }> {
  const email = normaliseEmail(input.email);
  if (!email) throw new ApiError(422, "VALIDATION_FAILED", "Enter a valid email address.");
  if (!ASSIGNABLE_ROLES.includes(input.role)) {
    throw new ApiError(422, "VALIDATION_FAILED", "That role cannot be assigned.");
  }

  const alreadyMember = await db.membership.findFirst({
    where: { organizationId: input.organizationId, user: { email }, status: "ACTIVE" },
    select: { id: true },
  });
  if (alreadyMember) throw new ApiError(409, "CONFLICT", "That person is already on this team.");

  // A newer invitation to the same address supersedes an older open one, so
  // re-sending never leaves two live links (and never double-counts a seat).
  await db.invite.updateMany({
    where: { organizationId: input.organizationId, email, acceptedAt: null, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  if (!input.skipSeatCheck) {
    const limits = await limitsFor(input.organizationId);
    assertWithinLimit(limits, "seats", await seatUsage(input.organizationId));
  }

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
  const invite = await db.invite.create({
    data: {
      organizationId: input.organizationId,
      email,
      role: input.role,
      tokenHash: hashToken(token),
      expiresAt,
      invitedById: input.invitedById,
    },
    select: { id: true },
  });

  await audit({
    organizationId: input.organizationId,
    userId: input.invitedById,
    action: "INVITE",
    entity: "Invite",
    entityId: invite.id,
    changes: { email, role: input.role },
  });

  return { token, inviteId: invite.id, email, expiresAt };
}

/** What an invitee sees before accepting. Returns null for any unusable token. */
export async function previewInvite(token: string) {
  const invite = await db.invite.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      email: true,
      role: true,
      expiresAt: true,
      acceptedAt: true,
      revokedAt: true,
      organization: { select: { name: true, status: true } },
    },
  });
  if (!invite || invite.acceptedAt || invite.revokedAt || invite.expiresAt < new Date()) return null;
  if (invite.organization.status !== "ACTIVE") return null;

  const existingUser = await db.user.findUnique({ where: { email: invite.email }, select: { id: true } });
  return {
    email: invite.email,
    role: invite.role as Role,
    organizationName: invite.organization.name,
    hasAccount: existingUser != null,
  };
}

export type AcceptResult = { userId: string; organizationId: string };

/**
 * Accepts an invitation. A new person sets a name and password; someone who
 * already has an account must prove it with their existing password before the
 * new membership attaches — holding the emailed link alone is not enough to
 * bind an existing account to an organisation.
 */
export async function acceptInvite(input: {
  token: string;
  name?: string;
  password: string;
}): Promise<AcceptResult> {
  const invalid = () => new ApiError(400, "INVITE_INVALID", "This invitation is invalid or has expired.");

  const invite = await db.invite.findUnique({ where: { tokenHash: hashToken(input.token) } });
  if (!invite || invite.acceptedAt || invite.revokedAt || invite.expiresAt < new Date()) throw invalid();

  const org = await db.organization.findUnique({ where: { id: invite.organizationId }, select: { status: true } });
  if (!org || org.status !== "ACTIVE") throw invalid();

  const existing = await db.user.findUnique({ where: { email: invite.email } });

  // Everything slow or fallible about the *person* happens before the
  // transaction: a wrong password must not burn the invitation, and bcrypt
  // should not hold a database connection open.
  let existingId: string | null = null;
  let newUser: { name: string; passwordHash: string } | null = null;
  if (existing) {
    if (existing.status !== "ACTIVE" || !(await verifyPassword(input.password, existing.passwordHash))) {
      throw new ApiError(401, "INVALID_CREDENTIALS", "That password does not match the existing account.");
    }
    existingId = existing.id;
  } else {
    const name = (input.name ?? "").trim();
    if (name.length < 2) throw new ApiError(422, "VALIDATION_FAILED", "Enter your name.");
    try {
      assertPasswordAcceptable(input.password, invite.email);
    } catch (e) {
      throw new ApiError(422, "WEAK_PASSWORD", e instanceof Error ? e.message : "Choose a stronger password.");
    }
    newUser = { name, passwordHash: await hashPassword(input.password) };
  }

  // One transaction: claim the invitation, create the user if new, attach the
  // membership. Claiming first means two clicks on one link accept once, and a
  // lost race never leaves an orphan account behind.
  const userId = await db.$transaction(async (tx) => {
    const claimed = await tx.invite.updateMany({
      where: { id: invite.id, acceptedAt: null, revokedAt: null },
      data: { acceptedAt: new Date() },
    });
    if (claimed.count === 0) throw invalid();

    const id =
      existingId ??
      (
        await tx.user.create({
          data: { email: invite.email, name: newUser!.name, passwordHash: newUser!.passwordHash, emailVerifiedAt: new Date() },
          select: { id: true },
        })
      ).id;

    await tx.membership.upsert({
      where: { userId_organizationId: { userId: id, organizationId: invite.organizationId } },
      create: { userId: id, organizationId: invite.organizationId, role: invite.role },
      update: { role: invite.role, status: "ACTIVE" },
    });
    await tx.user.update({ where: { id }, data: { activeOrganizationId: invite.organizationId } });
    // The invite went to this address and they opened it, so the address is proven.
    await tx.user.updateMany({ where: { id, emailVerifiedAt: null }, data: { emailVerifiedAt: new Date() } });
    return id;
  });

  await audit({
    organizationId: invite.organizationId,
    userId,
    action: "INVITE_ACCEPT",
    entity: "Invite",
    entityId: invite.id,
  });
  return { userId, organizationId: invite.organizationId };
}

export async function revokeInvite(organizationId: string, inviteId: string, byUserId: string): Promise<boolean> {
  const res = await db.invite.updateMany({
    where: { id: inviteId, organizationId, acceptedAt: null, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (res.count > 0) {
    await audit({ organizationId, userId: byUserId, action: "INVITE_REVOKE", entity: "Invite", entityId: inviteId });
  }
  return res.count > 0;
}
