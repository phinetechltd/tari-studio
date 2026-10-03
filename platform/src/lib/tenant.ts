import "server-only";

import { db } from "./db";
import { effectiveLimits, type Limits } from "./limits";
import type { Principal } from "./rbac";
import { isSelfScoped } from "./rbac";

/**
 * Tenant scoping.
 *
 * The single rule this file exists to enforce: **organizationId comes from the
 * authenticated principal, never from the request**. Any query that reaches
 * tenant data goes through `scope()`, so there is one place to audit rather
 * than a `where` clause per route to review.
 */

export class TenantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenantError";
  }
}

/**
 * Base filter for a tenant-owned table.
 *
 * A self-scoped principal (a designer) is additionally narrowed to their own
 * records where the caller passes `selfField`.
 */
export function scope(
  principal: Principal,
  opts?: { selfField?: string; ignoreSelfScope?: boolean },
): Record<string, unknown> {
  if (!principal.organizationId) {
    throw new TenantError(
      "Principal has no organisation. A platform admin must name the tenant explicitly.",
    );
  }

  const filter: Record<string, unknown> = { organizationId: principal.organizationId };

  if (opts?.selfField && isSelfScoped(principal) && !opts.ignoreSelfScope) {
    filter[opts.selfField] = principal.userId;
  }

  return filter;
}

/** The principal's organisation id, or a thrown error for platform-level principals. */
export function orgIdOf(principal: Principal): string {
  if (!principal.organizationId) {
    throw new TenantError("Operation requires an organisation-scoped principal");
  }
  return principal.organizationId;
}

/**
 * Confirms a record belongs to the principal's tenant before it is mutated.
 * Returns the record, or null when it is absent *or* owned by another tenant —
 * the two are deliberately indistinguishable to the caller, so probing for ids
 * cannot reveal another organisation's data.
 */
export function assertOwned<T extends { organizationId: string }>(
  principal: Principal,
  record: T | null,
): T | null {
  if (!record) return null;
  if (record.organizationId !== principal.organizationId) return null;
  return record;
}

/**
 * A platform admin crossing into a tenant. Separate from `scope()` on purpose:
 * the call site has to name the organisation, and the crossing is auditable.
 */
export function crossTenantScope(principal: Principal, organizationId: string): Record<string, unknown> {
  if (principal.role !== "SUPER_ADMIN") {
    throw new TenantError("Cross-tenant access requires a platform admin");
  }
  return { organizationId };
}

/** The limits in force for an organisation: plan defaults plus any override. */
export async function limitsFor(organizationId: string): Promise<Limits> {
  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { plan: true, limitsOverride: true },
  });
  if (!org) throw new TenantError("Unknown organisation");
  return effectiveLimits(org.plan, org.limitsOverride);
}

/**
 * Seats in use: active members plus invitations still open. Counting pending
 * invites stops an Owner sending twenty invitations against a five-seat plan.
 */
export async function seatUsage(organizationId: string): Promise<number> {
  const [members, pending] = await Promise.all([
    db.membership.count({ where: { organizationId, status: "ACTIVE" } }),
    db.invite.count({
      where: { organizationId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
    }),
  ]);
  return members + pending;
}
