import "server-only";

import type { PaymentIntent, Subscription } from "@prisma/client";

import { db, type Tx } from "@/lib/db";
import type { CardAuthorization } from "@/lib/payments/paystack";
import { isBillingCycle, isPaidPlan, PLAN_META, type BillingCycle, type PaidPlanKey } from "@/lib/pricing";
import { decryptFor, encryptFor, secretsAvailable } from "@/lib/secrets";

import { grantCredits } from "./credits";

/**
 * What a settled SUBSCRIPTION payment does, inside the settlement transaction
 * (src/server/payments.ts). Kept apart from src/server/subscriptions.ts, which
 * charges renewals through payments.ts, so the two never import each other.
 *
 *   - The period starts now, or at the end of the current one when the same
 *     plan is paid for again before it runs out (an M-Pesa customer renewing
 *     early loses nothing).
 *   - The price paid and the credits bought are recorded on the subscription:
 *     renewals charge that price and grant those credits, whatever the admin's
 *     price list says later, until the customer changes plan.
 *   - The first month of credits is granted at once. Yearly plans get the
 *     other eleven months one at a time, from the worker, on `nextGrantAt`.
 *   - A reusable Paystack card is sealed and the plan renews itself; M-Pesa
 *     cannot be charged without the customer, so those plans simply end.
 *   - The workspace limits rise to the plan's (src/lib/limits.ts), and the
 *     previous plan is remembered so expiry can put it back.
 */

export const MONTHS: Record<BillingCycle, number> = { MONTHLY: 1, ANNUAL: 12 };

/** Adds calendar months in UTC, clamping to the month's last day (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d;
}

export function authScope(organizationId: string): string {
  return `subscription:${organizationId}`;
}

/** The saved card's authorization code, or null when there is none or it cannot be opened. */
export function openAuthorization(sub: Pick<Subscription, "organizationId" | "authCipherText" | "authIv" | "authTag">): string | null {
  if (!sub.authCipherText || !sub.authIv || !sub.authTag) return null;
  return decryptFor(authScope(sub.organizationId), { cipherText: sub.authCipherText, iv: sub.authIv, authTag: sub.authTag });
}

function workspacePlanOf(key: PaidPlanKey) {
  return PLAN_META[key].workspacePlan;
}

export async function applySubscriptionPayment(
  tx: Tx,
  intent: PaymentIntent,
  authorization: CardAuthorization | null | undefined,
  now = new Date(),
): Promise<void> {
  const planKey = intent.planKey;
  const cycle = intent.billingCycle;
  if (!isPaidPlan(planKey) || !isBillingCycle(cycle)) {
    throw new Error(`Subscription payment ${intent.id} names no valid plan`);
  }
  const plan = PLAN_META[planKey];
  const [existing, org] = await Promise.all([
    tx.subscription.findUnique({ where: { organizationId: intent.organizationId } }),
    tx.organization.findUniqueOrThrow({ where: { id: intent.organizationId }, select: { plan: true } }),
  ]);

  const samePlanStillRunning =
    existing &&
    existing.status !== "EXPIRED" &&
    existing.plan === planKey &&
    existing.cycle === cycle &&
    existing.currentPeriodEnd > now;
  const start = samePlanStillRunning ? existing.currentPeriodEnd : now;
  const end = addMonths(start, MONTHS[cycle]);

  const viaCard = intent.provider === "PAYSTACK" || intent.provider === "PAYSTACK_SIMULATOR";
  let sealed: { authCipherText: string; authIv: string; authTag: string } | null = null;
  if (viaCard && authorization?.reusable && secretsAvailable()) {
    const s = encryptFor(authScope(intent.organizationId), authorization.code);
    sealed = { authCipherText: s.cipherText, authIv: s.iv, authTag: s.authTag };
  }
  // An automatic renewal keeps the card it charged; a new card replaces it; M-Pesa clears it.
  const card = intent.automatic
    ? {}
    : sealed
      ? { ...sealed, cardLabel: authorization?.label ?? null }
      : { authCipherText: null, authIv: null, authTag: null, cardLabel: null };
  const hasCard = intent.automatic ? Boolean(existing?.authCipherText) : Boolean(sealed);

  // Raise the workspace limits; remember what to restore. INTERNAL is never touched.
  const raise = org.plan !== "INTERNAL" ? workspacePlanOf(planKey) : null;
  const previousWorkspacePlan =
    existing && existing.status !== "EXPIRED" ? existing.previousWorkspacePlan : raise ? org.plan : null;
  if (raise && org.plan !== raise) {
    await tx.organization.update({ where: { id: intent.organizationId }, data: { plan: raise } });
  }

  const data = {
    plan: planKey,
    cycle,
    status: "ACTIVE",
    priceCents: intent.amountCents,
    creditsPerMonth: intent.credits,
    paymentMethod: viaCard ? "PAYSTACK" : "MPESA",
    autoRenew: intent.automatic ? (existing?.autoRenew ?? false) : hasCard,
    currentPeriodStart: start,
    currentPeriodEnd: end,
    nextGrantAt: cycle === "ANNUAL" ? addMonths(start, 1) : null,
    billingEmail: intent.email ?? existing?.billingEmail ?? null,
    renewalAttempts: 0,
    nextRenewalAttemptAt: null,
    previousWorkspacePlan,
    cancelledAt: intent.automatic ? (existing?.cancelledAt ?? null) : null,
    ...card,
  };
  await tx.subscription.upsert({
    where: { organizationId: intent.organizationId },
    create: { organizationId: intent.organizationId, ...data },
    update: data,
  });

  await grantCredits(tx, {
    organizationId: intent.organizationId,
    credits: intent.credits,
    grantKey: `sub:${intent.organizationId}:pay:${intent.id}`,
    paymentIntentId: intent.id,
    note: cycle === "ANNUAL" ? `${plan.name} plan (yearly), month 1 of 12` : `${plan.name} plan, monthly credits`,
  });
}

/**
 * A plan given by a platform admin without payment (a partner, a pilot, a
 * make-good). It starts now, grants its first month of credits, raises the
 * workspace limits like a paid plan, and never renews: when the period ends the
 * worker ends it. Any saved card is cleared, so nothing can be charged for it.
 */
export async function startComplimentaryPlan(
  tx: Tx,
  input: { organizationId: string; plan: PaidPlanKey; cycle: BillingCycle; creditsPerMonth: number; note: string },
  now = new Date(),
): Promise<void> {
  const meta = PLAN_META[input.plan];
  const [existing, org] = await Promise.all([
    tx.subscription.findUnique({ where: { organizationId: input.organizationId } }),
    tx.organization.findUniqueOrThrow({ where: { id: input.organizationId }, select: { plan: true } }),
  ]);
  const raise = org.plan !== "INTERNAL" ? workspacePlanOf(input.plan) : null;
  const previousWorkspacePlan =
    existing && existing.status !== "EXPIRED" ? existing.previousWorkspacePlan : raise ? org.plan : null;
  if (raise && org.plan !== raise) {
    await tx.organization.update({ where: { id: input.organizationId }, data: { plan: raise } });
  }
  const data = {
    plan: input.plan,
    cycle: input.cycle,
    status: "ACTIVE",
    priceCents: 0,
    creditsPerMonth: input.creditsPerMonth,
    paymentMethod: "COMP",
    autoRenew: false,
    currentPeriodStart: now,
    currentPeriodEnd: addMonths(now, MONTHS[input.cycle]),
    nextGrantAt: input.cycle === "ANNUAL" ? addMonths(now, 1) : null,
    renewalAttempts: 0,
    nextRenewalAttemptAt: null,
    previousWorkspacePlan,
    cancelledAt: null,
    authCipherText: null,
    authIv: null,
    authTag: null,
    cardLabel: null,
  };
  const sub = await tx.subscription.upsert({
    where: { organizationId: input.organizationId },
    create: { organizationId: input.organizationId, ...data },
    update: data,
  });
  await grantCredits(tx, {
    organizationId: input.organizationId,
    credits: input.creditsPerMonth,
    grantKey: `sub:${input.organizationId}:comp:${sub.id}:${now.toISOString()}`,
    note: `${meta.name} plan (complimentary): ${input.note}`.slice(0, 300),
  });
}

/** Puts the workspace limits back when a plan ends, unless an admin has changed them since. */
export async function restoreWorkspacePlan(tx: Tx | typeof db, sub: Subscription): Promise<void> {
  if (!isPaidPlan(sub.plan)) return;
  const raised = workspacePlanOf(sub.plan);
  await tx.organization.updateMany({
    where: { id: sub.organizationId, plan: raised ?? "__none__" },
    data: { plan: sub.previousWorkspacePlan ?? "TRIAL" },
  });
}
