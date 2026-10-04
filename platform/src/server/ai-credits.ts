import "server-only";

import { Prisma } from "@prisma/client";
import { z } from "zod";

import { ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { db, type Tx } from "@/lib/db";
import type { Principal } from "@/lib/rbac";

import { notify } from "./notify";

/**
 * The platform's own AI spend.
 *
 * Higgsfield has no balance API, so the balance is kept here: an admin records
 * each top-up (credits expire a year after purchase), every completed
 * generation writes what the provider charged (from its estimate endpoint), and
 * an adjustment brings the figure back in line with console.higgsfield.ai.
 * Usage draws down the oldest top-up first, so an expiry writes off only what
 * was really left. Text AI (Claude, NVIDIA) is metered per call in AiUsage.
 *
 * Budgets only warn. Running past a budget, or out of credits, alerts the
 * platform admins; it never stops customers generating.
 */

export const PROVIDER = "HIGGSFIELD";
const BUDGET_KEY = "aiBudget";
const DAY = 86_400_000;
/** Higgsfield: "credits expire one year after they are added". */
const TOPUP_LIFETIME_MS = 365 * DAY;

/** Start of the current month in East Africa time (UTC+3, no daylight saving). */
export function monthStartEAT(now = new Date()): Date {
  const eat = new Date(now.getTime() + 3 * 3_600_000);
  return new Date(Date.UTC(eat.getUTCFullYear(), eat.getUTCMonth(), 1) - 3 * 3_600_000);
}

/** "2026-10" for the month an instant falls in, East Africa time. */
export function monthKeyEAT(now = new Date()): string {
  const eat = new Date(now.getTime() + 3 * 3_600_000);
  return `${eat.getUTCFullYear()}-${String(eat.getUTCMonth() + 1).padStart(2, "0")}`;
}

const toMilli = (credits: number) => Math.round(credits * 1000);
/** Thousandths to credits; never "-0" (a negated zero sum). */
export const fromMilli = (milli: number) => milli / 1000 + 0;

// ── the ledger ───────────────────────────────────────────────────────────

/** Draws `milli` from the oldest unexpired top-ups first. Whatever no top-up covers is simply a negative balance. */
async function consume(tx: Tx, milli: number, now = new Date()): Promise<void> {
  let left = milli;
  if (left <= 0) return;
  const topups = await tx.$queryRaw<Array<{ id: string; milliCredits: number; consumedMilli: number }>>`
    SELECT "id", "milliCredits", "consumedMilli" FROM "ProviderCreditLedger"
    WHERE "provider" = ${PROVIDER} AND "kind" = 'TOPUP' AND "expiredAt" IS NULL
      AND "consumedMilli" < "milliCredits" AND ("expiresAt" IS NULL OR "expiresAt" > ${now})
    ORDER BY "expiresAt" ASC NULLS LAST, "createdAt" ASC
    FOR UPDATE`;
  for (const t of topups) {
    if (left <= 0) break;
    const take = Math.min(left, t.milliCredits - t.consumedMilli);
    await tx.providerCreditLedger.update({ where: { id: t.id }, data: { consumedMilli: { increment: take } } });
    left -= take;
  }
}

export interface ProviderBalance {
  /** Thousandths of a credit; negative when usage ran past the recorded top-ups */
  milliCredits: number;
  credits: number;
  /** Unused credits that lapse in the next 30 days */
  expiringSoonCredits: number;
  nextExpiry: string | null;
  lastTopUpAt: string | null;
  usedThisMonthCredits: number;
  hasTopUps: boolean;
}

export async function providerBalance(now = new Date()): Promise<ProviderBalance> {
  const [sum, month, soon, last] = await Promise.all([
    db.providerCreditLedger.aggregate({ where: { provider: PROVIDER }, _sum: { milliCredits: true } }),
    db.providerCreditLedger.aggregate({ where: { provider: PROVIDER, kind: "USAGE", createdAt: { gte: monthStartEAT(now) } }, _sum: { milliCredits: true } }),
    db.providerCreditLedger.findMany({
      where: { provider: PROVIDER, kind: "TOPUP", expiredAt: null, expiresAt: { gt: now, lte: new Date(now.getTime() + 30 * DAY) } },
      select: { milliCredits: true, consumedMilli: true, expiresAt: true },
      orderBy: { expiresAt: "asc" },
    }),
    db.providerCreditLedger.findFirst({ where: { provider: PROVIDER, kind: "TOPUP" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
  ]);
  const milli = sum._sum.milliCredits ?? 0;
  return {
    milliCredits: milli,
    credits: fromMilli(milli),
    expiringSoonCredits: fromMilli(soon.reduce((n, t) => n + (t.milliCredits - t.consumedMilli), 0)),
    nextExpiry: soon[0]?.expiresAt?.toISOString() ?? null,
    lastTopUpAt: last?.createdAt.toISOString() ?? null,
    usedThisMonthCredits: fromMilli(-(month._sum.milliCredits ?? 0)),
    hasTopUps: Boolean(last),
  };
}

const topUpSchema = z.object({
  credits: z.number().positive().max(10_000_000),
  usd: z.number().min(0).max(1_000_000).nullable().optional(),
  /** When it was bought, if not today (the expiry counts from then) */
  purchasedAt: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).nullable().optional(),
  note: z.string().trim().max(200).optional(),
});

/** Records credits bought on console.higgsfield.ai. */
export async function recordTopUp(principal: Principal, raw: unknown, request?: Request) {
  if (principal.role !== "SUPER_ADMIN") throw new ApiError(403, "FORBIDDEN", "Only platform admins record AI credit top-ups.");
  const input = topUpSchema.parse(raw);
  const bought = input.purchasedAt ? new Date(input.purchasedAt.length === 10 ? `${input.purchasedAt}T12:00:00+03:00` : input.purchasedAt) : new Date();
  if (Number.isNaN(bought.getTime()) || bought.getTime() > Date.now() + DAY) throw new ApiError(422, "VALIDATION_FAILED", "The purchase date is not valid.");
  const row = await db.providerCreditLedger.create({
    data: {
      provider: PROVIDER,
      kind: "TOPUP",
      milliCredits: toMilli(input.credits),
      usdMicros: input.usd != null ? Math.round(input.usd * 1_000_000) : null,
      expiresAt: new Date(bought.getTime() + TOPUP_LIFETIME_MS),
      note: input.note || null,
      createdById: principal.userId,
      createdAt: bought,
    },
  });
  await audit({ organizationId: null, userId: principal.userId, action: "AI_CREDITS_TOPUP", entity: "ProviderCreditLedger", entityId: row.id, changes: { credits: input.credits, usd: input.usd ?? null }, request });
  await rearmLowBalance();
  return providerBalance();
}

const adjustSchema = z.object({
  credits: z.number().refine((v) => v !== 0, "Enter a positive or negative number of credits").refine((v) => Math.abs(v) <= 10_000_000, "Too large"),
  note: z.string().trim().min(3, "Say why, e.g. 'matched the Higgsfield console on 3 Oct'").max(200),
});

/** Brings the balance in line with what console.higgsfield.ai shows. */
export async function adjustProviderCredits(principal: Principal, raw: unknown, request?: Request) {
  if (principal.role !== "SUPER_ADMIN") throw new ApiError(403, "FORBIDDEN", "Only platform admins adjust AI credits.");
  const input = adjustSchema.parse(raw);
  const milli = toMilli(input.credits);
  const row = await db.$transaction(async (tx) => {
    const created = await tx.providerCreditLedger.create({
      data: { provider: PROVIDER, kind: "ADJUST", milliCredits: milli, note: input.note, createdById: principal.userId },
    });
    if (milli < 0) await consume(tx, -milli);
    return created;
  });
  await audit({ organizationId: null, userId: principal.userId, action: "AI_CREDITS_ADJUST", entity: "ProviderCreditLedger", entityId: row.id, changes: { credits: input.credits, note: input.note }, request });
  if (milli > 0) await rearmLowBalance();
  return providerBalance();
}

/**
 * What one finished generation cost the platform. One row per asset, so a
 * redelivered worker job records it once.
 */
export async function recordUsage(input: { assetId: string; organizationId: string; modelKey: string | null; milliCredits: number; usdMicros: number | null; note?: string }): Promise<boolean> {
  if (input.milliCredits <= 0) return false;
  try {
    await db.$transaction(async (tx) => {
      await tx.providerCreditLedger.create({
        data: {
          provider: PROVIDER,
          kind: "USAGE",
          milliCredits: -input.milliCredits,
          usdMicros: input.usdMicros != null ? -input.usdMicros : null,
          organizationId: input.organizationId,
          assetId: input.assetId,
          modelKey: input.modelKey,
          note: input.note ?? null,
        },
      });
      await consume(tx, input.milliCredits);
    });
    return true;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return false;
    throw error;
  }
}

/** Writes off what is left of top-ups past their expiry. Idempotent. */
export async function expireTopUps(now = new Date()): Promise<number> {
  const due = await db.providerCreditLedger.findMany({
    where: { provider: PROVIDER, kind: "TOPUP", expiredAt: null, expiresAt: { lte: now } },
    select: { id: true },
    take: 100,
  });
  let expired = 0;
  for (const { id } of due) {
    await db.$transaction(async (tx) => {
      const [t] = await tx.$queryRaw<Array<{ milliCredits: number; consumedMilli: number; expiredAt: Date | null }>>`
        SELECT "milliCredits", "consumedMilli", "expiredAt" FROM "ProviderCreditLedger" WHERE "id" = ${id} FOR UPDATE`;
      if (!t || t.expiredAt) return;
      const left = t.milliCredits - t.consumedMilli;
      await tx.providerCreditLedger.update({ where: { id }, data: { expiredAt: now, consumedMilli: t.milliCredits } });
      if (left > 0) {
        await tx.providerCreditLedger.create({
          data: { provider: PROVIDER, kind: "EXPIRE", milliCredits: -left, note: "Unused credits from a top-up a year old" },
        });
      }
      expired += 1;
    });
  }
  return expired;
}

// ── budgets and alerts ───────────────────────────────────────────────────

export const budgetSchema = z.object({
  /** Alert when the Higgsfield balance falls below this many credits */
  lowBalanceCredits: z.number().min(0).max(10_000_000).nullable(),
  /** Higgsfield credits the platform plans to use a month */
  monthlyCredits: z.number().min(0).max(100_000_000).nullable(),
  /** Text AI (Claude, NVIDIA) spend a month, US dollars */
  textMonthlyUsd: z.number().min(0).max(1_000_000).nullable(),
});
export type AiBudget = z.infer<typeof budgetSchema>;
export const DEFAULT_BUDGET: AiBudget = { lowBalanceCredits: 500, monthlyCredits: null, textMonthlyUsd: null };
export const THRESHOLDS = [80, 100] as const;

export async function getBudget(): Promise<AiBudget> {
  const row = await db.platformSetting.findUnique({ where: { key: BUDGET_KEY } });
  if (!row?.value) return DEFAULT_BUDGET;
  try {
    return budgetSchema.parse(JSON.parse(row.value));
  } catch {
    return DEFAULT_BUDGET;
  }
}

export async function saveBudget(principal: Principal, raw: unknown, request?: Request): Promise<AiBudget> {
  if (principal.role !== "SUPER_ADMIN") throw new ApiError(403, "FORBIDDEN", "Only platform admins set AI budgets.");
  const next = budgetSchema.parse(raw);
  const before = await getBudget();
  await db.platformSetting.upsert({
    where: { key: BUDGET_KEY },
    create: { key: BUDGET_KEY, value: JSON.stringify(next), updatedById: principal.userId },
    update: { value: JSON.stringify(next), cipherText: null, iv: null, authTag: null, updatedById: principal.userId },
  });
  await audit({ organizationId: null, userId: principal.userId, action: "AI_BUDGET_UPDATE", entity: "PlatformSetting", entityId: BUDGET_KEY, changes: { before, after: next }, request });
  // A new level re-arms the low-balance alert.
  if (before.lowBalanceCredits !== next.lowBalanceCredits) await db.alertMark.deleteMany({ where: { key: `ai-low:${PROVIDER}` } });
  return next;
}

/** Claims an alert. True the first time for a key; false while the mark stands. */
export async function claimAlert(key: string): Promise<boolean> {
  const rows = await db.$executeRaw`INSERT INTO "AlertMark" ("key", "createdAt") VALUES (${key}, ${new Date()}) ON CONFLICT ("key") DO NOTHING`;
  return rows === 1;
}

async function rearmLowBalance(): Promise<void> {
  const [budget, balance] = await Promise.all([getBudget(), providerBalance()]);
  if (budget.lowBalanceCredits === null || balance.credits >= budget.lowBalanceCredits) {
    await db.alertMark.deleteMany({ where: { key: `ai-low:${PROVIDER}` } });
  }
}

/** Percentage of a budget used, or null when there is no budget. */
export function budgetPercent(used: number, budget: number | null): number | null {
  if (budget === null || budget <= 0) return null;
  return Math.round((used / budget) * 1000) / 10;
}

/** The thresholds a percentage has crossed, highest last. */
export function crossed(percent: number | null): number[] {
  if (percent === null) return [];
  return THRESHOLDS.filter((t) => percent >= t);
}

export async function textUsageMicros(since: Date, organizationId?: string): Promise<number> {
  const agg = await db.aiUsage.aggregate({ where: { createdAt: { gte: since }, ...(organizationId ? { organizationId } : {}) }, _sum: { costMicros: true } });
  return agg._sum.costMicros ?? 0;
}

/**
 * The sweep's check: low balance, and this month's spend against each budget.
 * Each alert fires once per condition (a threshold once a month; low balance
 * until a top-up lifts it again). Alerts only: nothing is paused.
 */
export async function checkAiBudgets(now = new Date()): Promise<string[]> {
  const fired: string[] = [];
  const [budget, balance] = await Promise.all([getBudget(), providerBalance(now)]);
  const month = monthKeyEAT(now);

  if (budget.lowBalanceCredits !== null && balance.hasTopUps) {
    if (balance.credits < budget.lowBalanceCredits) {
      if (await claimAlert(`ai-low:${PROVIDER}`)) {
        fired.push("low");
        await notify({
          event: "ai.credits_low",
          title: `Higgsfield credits are low: about ${Math.floor(balance.credits).toLocaleString("en-KE")} left`,
          body: `Below your alert level of ${budget.lowBalanceCredits.toLocaleString("en-KE")}. Top up on console.higgsfield.ai, then record it under AI & credits. Generation carries on until the provider refuses.`,
          href: "/platform/ai",
        });
      }
    } else {
      await db.alertMark.deleteMany({ where: { key: `ai-low:${PROVIDER}` } });
    }
  }

  const hf = budgetPercent(balance.usedThisMonthCredits, budget.monthlyCredits);
  for (const t of crossed(hf)) {
    if (await claimAlert(`ai-budget:${PROVIDER}:${month}:${t}`)) {
      fired.push(`higgsfield-${t}`);
      await notify({
        event: "ai.budget_threshold",
        title: `Higgsfield spend is at ${t}% of this month's budget`,
        body: `${balance.usedThisMonthCredits.toLocaleString("en-KE", { maximumFractionDigits: 1 })} of ${budget.monthlyCredits!.toLocaleString("en-KE")} credits used so far in ${month}. Customers keep generating; this is a warning only.`,
        href: "/platform/ai",
      });
    }
  }

  if (budget.textMonthlyUsd !== null) {
    const usedUsd = (await textUsageMicros(monthStartEAT(now))) / 1_000_000;
    for (const t of crossed(budgetPercent(usedUsd, budget.textMonthlyUsd))) {
      if (await claimAlert(`ai-budget:TEXT:${month}:${t}`)) {
        fired.push(`text-${t}`);
        await notify({
          event: "ai.budget_threshold",
          title: `Text AI spend is at ${t}% of this month's budget`,
          body: `US$${usedUsd.toFixed(2)} of US$${budget.textMonthlyUsd.toFixed(2)} used so far in ${month} on captions, replies and briefs. This is a warning only.`,
          href: "/platform/ai",
        });
      }
    }
  }
  return fired;
}

/** Higgsfield refused a generation for lack of credits: tell the admins (once a day). */
export async function alertProviderOutOfCredits(detail: string, now = new Date()): Promise<boolean> {
  const day = new Date(now.getTime() + 3 * 3_600_000).toISOString().slice(0, 10);
  if (!(await claimAlert(`ai-out:${PROVIDER}:${day}`))) return false;
  await notify({
    event: "ai.provider_out_of_credits",
    title: "Higgsfield refused a generation: out of credits",
    body: `${detail} Customers' credits were refunded. Top up on console.higgsfield.ai and record it under AI & credits.`,
    href: "/platform/ai",
  });
  return true;
}

let lastCheck = 0;

/** The billing sweep's hook: expiries and budget checks, at most every five minutes. */
export async function aiCreditsSweep(now = new Date()): Promise<{ expired: number; alerts: string[] } | null> {
  if (now.getTime() - lastCheck < 5 * 60_000) return null;
  lastCheck = now.getTime();
  const expired = await expireTopUps(now);
  const alerts = await checkAiBudgets(now);
  return { expired, alerts };
}
