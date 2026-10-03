import "server-only";

import type { Prisma } from "@prisma/client";

import { db } from "./db";
import type { Principal } from "./rbac";

/**
 * Audit logging. Writes that change tenant state, and security events, are
 * recorded here.
 *
 * Failures are swallowed deliberately: an audit write must never be the reason
 * a legitimate business action fails. The trade-off is accepted because this is
 * an operational trail, not a regulatory ledger.
 */

export type AuditAction =
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "LOGIN"
  | "LOGIN_FAILED"
  | "LOGOUT"
  | "SWITCH_ORG"
  | "SUSPEND"
  | "ACTIVATE"
  | "INVITE"
  | "INVITE_ACCEPT"
  | "INVITE_REVOKE"
  | "MODULE_ENABLE"
  | "MODULE_DISABLE"
  | "LIMITS_UPDATE"
  | "MFA_ENROL"
  | "MFA_DISABLE"
  // Marketing workflow — declared now so the trail's vocabulary is stable.
  | "AI_GENERATE"
  | "SUBMIT"
  | "APPROVE"
  | "REQUEST_CHANGES"
  | "SCHEDULE"
  | "PUBLISH"
  | "CONNECT_CHANNEL"
  | "DISCONNECT_CHANNEL"
  | "ARCHIVE"
  | "CONNECT"
  | "DISCONNECT"
  // Orders, payments and tokens
  | "ORDER_CREATE"
  | "ORDER_STATUS"
  | "ORDER_UPDATE"
  | "ORDER_PRICE_SET"
  | "ORDER_SUBMIT"
  | "ORDER_ADMIN_CREATE"
  // Templates and characters
  | "TEMPLATE_CREATE"
  | "TEMPLATE_UPDATE"
  | "TEMPLATE_DELETE"
  | "CHARACTER_CREATE"
  | "CHARACTER_UPDATE"
  | "CHARACTER_ARCHIVE"
  | "PAYMENT_INITIATE"
  | "PAYMENT_SETTLED"
  | "PAYMENT_FAILED"
  | "TOKENS_CREDIT"
  | "TOKENS_SPEND"
  | "TOKENS_REFUND"
  | "SUBSCRIPTION_CANCEL"
  | "SUBSCRIPTION_RESUME"
  | "SUBSCRIPTION_EXPIRED"
  | "ASSET_SHOWCASE"
  | "PRICING_UPDATE"
  // Platform admin managing a tenant's billing and people
  | "CREDITS_ADJUST"
  | "SUBSCRIPTION_GRANT"
  | "SUBSCRIPTION_EXTEND"
  | "SUBSCRIPTION_END"
  | "PAYMENT_RECHECK"
  | "MEMBER_UPDATE"
  | "GENERATION_REQUEST"
  | "GENERATION_READY"
  | "GENERATION_FAILED"
  // AI models and the platform's provider credits
  | "AI_MODEL_UPDATE"
  | "AI_CREDITS_TOPUP"
  | "AI_CREDITS_ADJUST"
  | "AI_BUDGET_UPDATE"
  // Notifications, profile and onboarding
  | "NOTIFICATION_POLICY_UPDATE"
  | "NOTIFICATION_RETRY"
  | "NOTIFICATION_TEST"
  | "PROFILE_UPDATE"
  | "SETUP_UPDATE";

export interface AuditInput {
  organizationId?: string | null;
  userId?: string | null;
  action: AuditAction;
  entity: string;
  entityId?: string | null;
  changes?: unknown;
  request?: Request;
}

function clientIp(request?: Request): string | null {
  if (!request) return null;
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return request.headers.get("x-real-ip");
}

export async function audit(input: AuditInput): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        organizationId: input.organizationId ?? null,
        userId: input.userId ?? null,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? null,
        changes:
          input.changes === undefined
            ? undefined
            : (JSON.parse(JSON.stringify(input.changes)) as Prisma.InputJsonValue),
        ipAddress: clientIp(input.request),
        userAgent: input.request?.headers.get("user-agent") ?? null,
      },
    });
  } catch {
    // See note above — never let the trail break the action.
  }
}

/** Convenience wrapper for the common "principal did X to Y" case. */
export async function auditAs(
  principal: Principal,
  action: AuditAction,
  entity: string,
  entityId?: string | null,
  changes?: unknown,
  request?: Request,
): Promise<void> {
  await audit({
    organizationId: principal.organizationId,
    userId: principal.userId,
    action,
    entity,
    entityId,
    changes,
    request,
  });
}

/** Diffs two records down to the fields that actually changed. */
export function diff(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Record<string, { from: unknown; to: unknown }> {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of Object.keys(after)) {
    const a = before[key];
    const b = after[key];
    if (a instanceof Date && b instanceof Date) {
      if (a.getTime() !== b.getTime()) changes[key] = { from: a, to: b };
      continue;
    }
    if (a !== b) changes[key] = { from: a, to: b };
  }
  return changes;
}
