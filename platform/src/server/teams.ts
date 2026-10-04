import "server-only";

import { z } from "zod";

import { ApiError } from "@/lib/api";
import { audit, auditAs } from "@/lib/audit";
import { db } from "@/lib/db";
import { ALL_PERMISSIONS, ASSIGNABLE_ROLES, permissionsOf, type Permission, type Principal, type Role } from "@/lib/rbac";
import { orgIdOf } from "@/lib/tenant";

/**
 * Teams from a person's point of view (every team they belong to, invitations
 * waiting for them, leaving a team) and from an Owner's (changing roles and
 * permissions, suspending and removing members).
 *
 * The rules that matter:
 *   - a team always keeps at least one active Owner;
 *   - nobody changes their own role, status or permissions (they can leave);
 *   - only an Owner can make or change an Owner;
 *   - extra permissions are checked against the real permission list, and
 *     "platform:manage" can never be handed out inside a team.
 */

// ── a person's teams ────────────────────────────────────────────────────

export async function myTeams(userId: string, activeOrganizationId: string | null) {
  const rows = await db.membership.findMany({
    where: { userId, organization: { status: "ACTIVE" } },
    orderBy: { createdAt: "asc" },
    select: { organizationId: true, role: true, status: true, organization: { select: { name: true, plan: true } } },
  });
  return rows.map((m) => ({
    id: m.organizationId,
    name: m.organization.name,
    plan: m.organization.plan,
    role: m.role,
    suspended: m.status !== "ACTIVE",
    current: m.organizationId === activeOrganizationId,
  }));
}

export async function pendingInvitesFor(email: string) {
  const rows = await db.invite.findMany({
    where: { email, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() }, organization: { status: "ACTIVE" } },
    orderBy: { createdAt: "desc" },
    select: { id: true, role: true, expiresAt: true, organization: { select: { name: true } } },
  });
  return rows.map((i) => ({ id: i.id, role: i.role, expiresAt: i.expiresAt, teamName: i.organization.name }));
}

/** A signed-in, verified person answers an invitation sent to their own address. No password is needed: they already proved who they are. */
export async function answerInvite(userId: string, inviteId: string, accept: boolean, request?: Request) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { email: true, emailVerifiedAt: true } });
  if (!user?.emailVerifiedAt) throw new ApiError(403, "EMAIL_UNVERIFIED", "Confirm your email address first.");
  const invite = await db.invite.findFirst({
    where: { id: inviteId, email: user.email, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
  });
  if (!invite) throw new ApiError(404, "NOT_FOUND", "That invitation is no longer open.");

  if (!accept) {
    await db.invite.updateMany({ where: { id: invite.id, acceptedAt: null, revokedAt: null }, data: { revokedAt: new Date() } });
    await audit({ organizationId: invite.organizationId, userId, action: "INVITE_REVOKE", entity: "Invite", entityId: invite.id, changes: { declined: true }, request });
    return { organizationId: null };
  }

  const org = await db.organization.findUnique({ where: { id: invite.organizationId }, select: { status: true } });
  if (!org || org.status !== "ACTIVE") throw new ApiError(404, "NOT_FOUND", "That team is not available.");

  await db.$transaction(async (tx) => {
    const claimed = await tx.invite.updateMany({ where: { id: invite.id, acceptedAt: null, revokedAt: null }, data: { acceptedAt: new Date() } });
    if (claimed.count === 0) throw new ApiError(409, "CONFLICT", "That invitation was just used.");
    await tx.membership.upsert({
      where: { userId_organizationId: { userId, organizationId: invite.organizationId } },
      create: { userId, organizationId: invite.organizationId, role: invite.role },
      update: { role: invite.role, status: "ACTIVE" },
    });
    await tx.user.update({ where: { id: userId }, data: { activeOrganizationId: invite.organizationId } });
  });
  await audit({ organizationId: invite.organizationId, userId, action: "INVITE_ACCEPT", entity: "Invite", entityId: invite.id, request });
  return { organizationId: invite.organizationId };
}

async function activeOwners(organizationId: string): Promise<number> {
  return db.membership.count({ where: { organizationId, role: "OWNER", status: "ACTIVE" } });
}

/** Leaves a team. The last Owner cannot leave: they must hand over ownership first. */
export async function leaveTeam(userId: string, organizationId: string, request?: Request) {
  const m = await db.membership.findUnique({ where: { userId_organizationId: { userId, organizationId } } });
  if (!m) throw new ApiError(404, "NOT_FOUND", "You are not in that team.");
  if (m.role === "OWNER" && m.status === "ACTIVE" && (await activeOwners(organizationId)) <= 1) {
    throw new ApiError(409, "LAST_OWNER", "You are the only Owner. Make someone else an Owner before you leave.");
  }
  await db.membership.delete({ where: { id: m.id } });
  await db.user.updateMany({ where: { id: userId, activeOrganizationId: organizationId }, data: { activeOrganizationId: null } });
  await audit({ organizationId, userId, action: "MEMBER_UPDATE", entity: "Membership", entityId: m.id, changes: { left: true }, request });
}

// ── an Owner managing members ───────────────────────────────────────────

const KNOWN = new Set<string>(ALL_PERMISSIONS);

export const memberPatchSchema = z.object({
  role: z.enum(ASSIGNABLE_ROLES as [Role, ...Role[]]).optional(),
  status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
  /** The complete list of extra permissions (beyond the role); replaces what was there */
  extraPermissions: z.array(z.string().max(60)).max(60).optional(),
});

async function target(principal: Principal, membershipId: string) {
  const m = await db.membership.findFirst({ where: { id: membershipId, organizationId: orgIdOf(principal) } });
  if (!m) throw new ApiError(404, "NOT_FOUND", "Member not found.");
  if (m.userId === principal.userId) throw new ApiError(409, "CONFLICT", "You cannot change your own role or access. Ask another Owner, or leave the team.");
  return m;
}

function assertOwnerMayTouch(principal: Principal, memberRole: string, newRole?: string) {
  const touchesOwner = memberRole === "OWNER" || newRole === "OWNER";
  if (touchesOwner && principal.role !== "OWNER" && principal.role !== "SUPER_ADMIN") {
    throw new ApiError(403, "FORBIDDEN", "Only an Owner can make or change an Owner.");
  }
}

export async function updateMember(principal: Principal, membershipId: string, input: z.infer<typeof memberPatchSchema>, request?: Request) {
  const m = await target(principal, membershipId);
  assertOwnerMayTouch(principal, m.role, input.role);
  const orgId = m.organizationId;

  const data: { role?: string; status?: string; extraPermissions?: Permission[] } = {};
  if (input.role !== undefined) data.role = input.role;
  if (input.status !== undefined) data.status = input.status;
  if (input.extraPermissions !== undefined) {
    const clean = [...new Set(input.extraPermissions)];
    const bad = clean.filter((p) => !KNOWN.has(p) || p === "platform:manage");
    if (bad.length > 0) throw new ApiError(422, "VALIDATION_FAILED", `Unknown permission: ${bad[0]}.`);
    const role = (data.role ?? m.role) as Role;
    // Store only what the role does not already carry, so changing the role later never leaves stale grants.
    const carried = new Set<string>(permissionsOf(role));
    data.extraPermissions = clean.filter((p) => !carried.has(p)) as Permission[];
  }
  if (Object.keys(data).length === 0) return m;

  const losesOwner = m.role === "OWNER" && m.status === "ACTIVE" && ((data.role !== undefined && data.role !== "OWNER") || data.status === "SUSPENDED");
  if (losesOwner && (await activeOwners(orgId)) <= 1) {
    throw new ApiError(409, "LAST_OWNER", "A team needs at least one active Owner. Make someone else an Owner first.");
  }

  const updated = await db.membership.update({ where: { id: m.id }, data });
  await auditAs(principal, "MEMBER_UPDATE", "Membership", m.id, { from: { role: m.role, status: m.status }, to: data }, request);
  return updated;
}

export async function removeMember(principal: Principal, membershipId: string, request?: Request) {
  const m = await target(principal, membershipId);
  assertOwnerMayTouch(principal, m.role);
  if (m.role === "OWNER" && m.status === "ACTIVE" && (await activeOwners(m.organizationId)) <= 1) {
    throw new ApiError(409, "LAST_OWNER", "A team needs at least one active Owner.");
  }
  await db.membership.delete({ where: { id: m.id } });
  await db.user.updateMany({ where: { id: m.userId, activeOrganizationId: m.organizationId }, data: { activeOrganizationId: null } });
  await auditAs(principal, "MEMBER_UPDATE", "Membership", m.id, { removed: true, role: m.role }, request);
}
