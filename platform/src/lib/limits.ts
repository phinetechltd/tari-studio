/**
 * Plan limits — entitlement, not billing.
 *
 * Release 1 has no automated billing. A Platform Admin picks a plan and may
 * override individual limits per organisation; the limits are then enforced at
 * runtime and fail closed with 402 `LIMIT_REACHED`.
 *
 * PLACEHOLDER — every number below is a stand-in so enforcement can be built
 * and tested. They are commercial decisions that have not been made; do not
 * quote them to a customer. `null` means unlimited.
 *
 * Added: content generation daily limits for Higgsfield AI integration.
 */

import { db } from "@/lib/db";

export const LIMIT_KEYS = [
  "brands",
  "seats",
  "aiCreditsMicros",
  "connectedAccounts",
  "scheduledPostsPerMonth",
  "storageMb",
  "maxGenerationsPerDay",
] as const;

export type LimitKey = (typeof LIMIT_KEYS)[number];
export type Limits = Record<LimitKey, number | null>;

export const PLAN_KEYS = ["TRIAL", "STARTER", "GROWTH", "PRO", "INTERNAL"] as const;
export type PlanKey = (typeof PLAN_KEYS)[number];

export const LIMIT_LABELS: Record<LimitKey, string> = {
  brands: "Brands",
  seats: "Team seats",
  aiCreditsMicros: "AI credits / month (USD micro-units)",
  connectedAccounts: "Connected social accounts",
  scheduledPostsPerMonth: "Scheduled posts / month",
  storageMb: "Media storage (MB)",
  maxGenerationsPerDay: "AI generations / day",
};

export const PLAN_DEFAULTS: Record<PlanKey, Limits> = {
  TRIAL: {
    brands: 1,
    seats: 3,
    aiCreditsMicros: 2_000_000,
    connectedAccounts: 2,
    scheduledPostsPerMonth: 20,
    storageMb: 500,
    maxGenerationsPerDay: 5,
  },
  STARTER: {
    brands: 3,
    seats: 5,
    aiCreditsMicros: 10_000_000,
    connectedAccounts: 6,
    scheduledPostsPerMonth: 120,
    storageMb: 5_000,
    maxGenerationsPerDay: 20,
  },
  GROWTH: {
    brands: 10,
    seats: 15,
    aiCreditsMicros: 40_000_000,
    connectedAccounts: 20,
    scheduledPostsPerMonth: 600,
    storageMb: 25_000,
    maxGenerationsPerDay: 50,
  },
  PRO: {
    brands: 30,
    seats: 50,
    aiCreditsMicros: 150_000_000,
    connectedAccounts: 60,
    scheduledPostsPerMonth: 3_000,
    storageMb: 100_000,
    maxGenerationsPerDay: 200,
  },
  INTERNAL: {
    brands: null,
    seats: null,
    aiCreditsMicros: null,
    connectedAccounts: null,
    scheduledPostsPerMonth: null,
    storageMb: null,
    maxGenerationsPerDay: null,
  },
};

export function isPlanKey(value: string): value is PlanKey {
  return (PLAN_KEYS as readonly string[]).includes(value);
}

/**
 * The limits actually in force: the plan's defaults with any per-organisation
 * override applied on top. Unknown keys and non-numeric values in the stored
 * override are ignored rather than trusted.
 */
export function effectiveLimits(plan: string, overrides: unknown): Limits {
  const base = { ...PLAN_DEFAULTS[isPlanKey(plan) ? plan : "TRIAL"] };
  if (overrides && typeof overrides === "object") {
    for (const key of LIMIT_KEYS) {
      const v = (overrides as Record<string, unknown>)[key];
      if (v === null) base[key] = null;
      else if (typeof v === "number" && Number.isFinite(v) && v >= 0) base[key] = Math.floor(v);
    }
  }
  return base;
}

export class LimitReachedError extends Error {
  constructor(
    readonly limit: LimitKey,
    readonly max: number,
    readonly used: number,
  ) {
    super(`${LIMIT_LABELS[limit]} limit reached (${used} of ${max}).`);
    this.name = "LimitReachedError";
  }
}

/**
 * Throws when adding `adding` to `used` would exceed the limit. Unlimited never throws.
 */
export function assertWithinLimit(
  limits: Limits,
  key: LimitKey,
  used: number,
  adding = 1,
): void {
  const max = limits[key];
  if (max === null) return;
  if (used + adding > max) throw new LimitReachedError(key, max, used);
}

/**
 * Check daily content generation quota for a user.
 */
export async function checkContentGenerationLimit(userId: string): Promise<{ ok: boolean; status: number; body: Record<string, any> }> {
  const user = await db.user.findUnique({
    where: { id: userId },
    include: { memberships: { where: { status: "ACTIVE" }, take: 1 } },
  });

  if (!user || !user.memberships[0]) {
    return { ok: false, status: 403, body: { error: "No active organization membership" } };
  }

  const org = await db.organization.findUnique({
    where: { id: user.memberships[0].organizationId },
  });

  if (!org) {
    return { ok: false, status: 404, body: { error: "Organization not found" } };
  }

  const plan = org.plan || "TRIAL";
  const limits = effectiveLimits(plan, org.limitsOverride);
  const maxGenerationsPerDay = limits.maxGenerationsPerDay ?? 10;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const count = await db.generatedAsset.count({
    where: {
      createdById: userId,
      createdAt: { gte: today },
    },
  });

  if (count >= maxGenerationsPerDay) {
    return {
      ok: false,
      status: 429,
      body: {
        error: `Daily generation limit reached (${maxGenerationsPerDay}/day)`,
        limit: maxGenerationsPerDay,
        used: count,
        resetAt: new Date(today.getTime() + 86400000).toISOString(),
      },
    };
  }

  return { ok: true, status: 200, body: {} };
}
