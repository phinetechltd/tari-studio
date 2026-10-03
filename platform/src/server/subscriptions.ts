import "server-only";

import type { Subscription } from "@prisma/client";

import { ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { canonicalPhone, normaliseEmail } from "@/lib/identity";
import { formatKES } from "@/lib/money";
import { mpesaAvailable, paystackAvailable } from "@/lib/payments";
import {
  isPaidPlan,
  packByKey,
  planPriceCents,
  PLAN_META,
  type BillingCycle,
  type BillingPlanKey,
  type PaidPlanKey,
  type Pricing,
} from "@/lib/pricing";
import { hit } from "@/lib/ratelimit";

import { claimAlert } from "./ai-credits";
import { grantCredits } from "./credits";
import { notify } from "./notify";
import { chargeSavedCard, reconcileCheckouts, startCheckout, startPayment } from "./payments";
import { getPricing } from "./pricing-store";
import { addMonths, openAuthorization, restoreWorkspacePlan } from "./subscription-effects";

/**
 * Plans and top-ups: starting a payment, and everything the worker does on a
 * schedule (src/worker/handlers.ts, "billing.sweep" every minute):
 *
 *   - yearly plans get their next month of credits when it falls due;
 *   - a plan whose period has ended renews by charging the saved card, or ends;
 *   - a failed renewal is retried daily, three times, then the plan ends;
 *   - plans paid by M-Pesa (which cannot be charged without the customer) get a
 *     reminder three days before they end;
 *   - Paystack checkouts nobody came back from are verified.
 *
 * Credits never expire, so a plan ending only stops new monthly credits and
 * puts the workspace limits back; nothing already bought is taken away.
 */

/** How a customer pays; COMP is a plan a platform admin gave without payment. */
export type PaymentMethod = "PAYSTACK" | "MPESA";
export type PlanSource = PaymentMethod | "COMP";

const RENEWAL_RETRIES = 3;
const RETRY_EVERY_MS = 24 * 60 * 60_000;
const REMIND_BEFORE_MS = 3 * 24 * 60 * 60_000;

export interface SubscriptionView {
  plan: BillingPlanKey;
  cycle: BillingCycle | null;
  status: "FREE" | "ACTIVE" | "PAST_DUE" | "EXPIRED";
  currentPeriodEnd: string | null;
  nextGrantAt: string | null;
  autoRenew: boolean;
  canAutoRenew: boolean;
  cardLabel: string | null;
  paymentMethod: PlanSource | null;
  cancelled: boolean;
  /** What the next renewal charges and grants: the price the plan was bought at */
  priceCents: number;
  creditsPerMonth: number;
}

export function subscriptionView(sub: Subscription | null): SubscriptionView {
  if (!sub || !isPaidPlan(sub.plan) || sub.status === "EXPIRED") {
    return {
      plan: "FREE",
      cycle: null,
      status: sub?.status === "EXPIRED" ? "EXPIRED" : "FREE",
      currentPeriodEnd: sub?.currentPeriodEnd.toISOString() ?? null,
      nextGrantAt: null,
      autoRenew: false,
      canAutoRenew: false,
      cardLabel: null,
      paymentMethod: null,
      cancelled: false,
      priceCents: 0,
      creditsPerMonth: 0,
    };
  }
  return {
    plan: sub.plan,
    cycle: sub.cycle === "ANNUAL" ? "ANNUAL" : "MONTHLY",
    status: sub.status === "PAST_DUE" ? "PAST_DUE" : "ACTIVE",
    currentPeriodEnd: sub.currentPeriodEnd.toISOString(),
    nextGrantAt: sub.nextGrantAt?.toISOString() ?? null,
    autoRenew: sub.autoRenew,
    canAutoRenew: Boolean(sub.authCipherText),
    cardLabel: sub.cardLabel,
    paymentMethod: sub.paymentMethod === "PAYSTACK" ? "PAYSTACK" : sub.paymentMethod === "COMP" ? "COMP" : "MPESA",
    cancelled: Boolean(sub.cancelledAt),
    priceCents: sub.priceCents,
    creditsPerMonth: sub.creditsPerMonth,
  };
}

export async function getSubscription(organizationId: string): Promise<SubscriptionView> {
  return subscriptionView(await db.subscription.findUnique({ where: { organizationId } }));
}

export function paymentMethods(): { paystack: boolean; mpesa: boolean } {
  return { paystack: paystackAvailable(), mpesa: mpesaAvailable() };
}

// ---------------------------------------------------------------------------
// Starting a payment

export interface PayInput {
  method: PaymentMethod;
  phone?: string;
  email?: string;
}

export type PayResult =
  | { kind: "checkout"; intentId: string; checkoutUrl: string }
  | { kind: "stk"; intentId: string; status: string; message: string | null; simulated: boolean };

function requirePhone(raw: string | undefined): string {
  const phone = raw ? canonicalPhone(raw) : null;
  if (!phone || !/^254[17]\d{8}$/.test(phone)) {
    throw new ApiError(422, "VALIDATION_FAILED", "Enter a Safaricom number, e.g. 0712 345 678.");
  }
  return phone;
}

function requireEmail(raw: string | undefined): string {
  const email = raw ? normaliseEmail(raw) : null;
  if (!email) throw new ApiError(422, "VALIDATION_FAILED", "Paystack sends your receipt by email: enter a valid email address.");
  return email;
}

async function guard(organizationId: string, method: PaymentMethod) {
  if (method === "PAYSTACK" && !paystackAvailable()) {
    throw new ApiError(409, "METHOD_UNAVAILABLE", "Card and Paystack payments are not set up yet. Pay with M-Pesa.");
  }
  if (method === "MPESA" && !mpesaAvailable()) {
    throw new ApiError(409, "METHOD_UNAVAILABLE", "M-Pesa payments are not set up yet. Pay with Paystack.");
  }
  const rate = await hit(`billing:${method}:${organizationId}`, { limit: method === "MPESA" ? 6 : 20, windowSec: 15 * 60 });
  if (!rate.allowed) {
    throw new ApiError(429, "RATE_LIMITED", "Too many payment attempts. Try again in a few minutes.", undefined);
  }
}

interface Purchase {
  organizationId: string;
  userId: string;
  amountCents: number;
  credits: number;
  purpose: "CREDITS" | "SUBSCRIPTION";
  planKey?: PaidPlanKey;
  cycle?: BillingCycle;
  /** Shown on the M-Pesa prompt (13 characters at most) */
  description: string;
  request?: Request;
}

async function pay(p: Purchase, input: PayInput): Promise<PayResult> {
  await guard(p.organizationId, input.method);
  const common = {
    organizationId: p.organizationId,
    purpose: p.purpose,
    credits: p.credits,
    planKey: p.planKey ?? null,
    billingCycle: p.cycle ?? null,
    amountCents: p.amountCents,
    createdById: p.userId,
    request: p.request,
  };
  if (input.method === "PAYSTACK") {
    const email = requireEmail(input.email);
    const { intent, checkoutUrl, message } = await startCheckout({
      ...common,
      email,
      returnPath: "/billing",
      referencePrefix: p.purpose === "SUBSCRIPTION" ? "PLAN" : "CREDITS",
    });
    if (!checkoutUrl) throw new ApiError(502, "PROVIDER_ERROR", message ?? "Paystack did not accept the request.");
    return { kind: "checkout", intentId: intent.id, checkoutUrl };
  }
  const phone = requirePhone(input.phone);
  const { intent, message } = await startPayment({ ...common, phone, reference: "TARI", description: p.description });
  return { kind: "stk", intentId: intent.id, status: intent.status, message, simulated: intent.provider === "SIMULATOR" };
}

/** Starts paying for a plan. The plan begins once the provider confirms. */
export async function payForPlan(
  ctx: { organizationId: string; userId: string; request?: Request },
  planKey: unknown,
  cycle: BillingCycle,
  input: PayInput,
): Promise<PayResult> {
  if (!isPaidPlan(planKey)) throw new ApiError(422, "VALIDATION_FAILED", "Choose Basic, Pro or Max.");
  const [pricing, existing] = await Promise.all([getPricing(), db.subscription.findUnique({ where: { organizationId: ctx.organizationId } })]);
  const plan = PLAN_META[planKey];
  // Renewing the same plan keeps the price it was bought at; a new plan or billing period takes today's list.
  const keeps = existing && existing.status !== "EXPIRED" && existing.plan === planKey && existing.cycle === cycle && existing.priceCents > 0;
  return pay(
    {
      ...ctx,
      amountCents: keeps ? existing.priceCents : planPriceCents(pricing, planKey, cycle),
      credits: keeps ? existing.creditsPerMonth : pricing.plans[planKey].creditsPerMonth,
      purpose: "SUBSCRIPTION",
      planKey,
      cycle,
      description: `${plan.name} plan`.slice(0, 13),
    },
    input,
  );
}

/** Starts buying a top-up pack. Credits arrive once the provider confirms. */
export async function payForCredits(ctx: { organizationId: string; userId: string; request?: Request }, packKey: unknown, input: PayInput) {
  const pricing = await getPricing();
  const pack = packByKey(pricing, packKey);
  if (!pack) throw new ApiError(422, "VALIDATION_FAILED", `Choose one of the packs: ${pricing.packs.map((p) => p.credits).join(", ")} credits.`);
  return pay({ ...ctx, amountCents: pack.cents, credits: pack.credits, purpose: "CREDITS", description: `${pack.credits} credits` }, input);
}

/** Turns renewal off (the plan runs to the end of the period) or back on (needs a saved card). */
export async function setAutoRenew(ctx: { organizationId: string; userId: string; request?: Request }, on: boolean): Promise<SubscriptionView> {
  const sub = await db.subscription.findUnique({ where: { organizationId: ctx.organizationId } });
  if (!sub || sub.status === "EXPIRED") throw new ApiError(409, "CONFLICT", "There is no plan to change.");
  if (on && !sub.authCipherText) {
    throw new ApiError(409, "CONFLICT", "Renewal needs a saved card. Pay for the plan with Paystack (card) to switch it on.");
  }
  const updated = await db.subscription.update({
    where: { id: sub.id },
    data: { autoRenew: on, cancelledAt: on ? null : new Date() },
  });
  await audit({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: on ? "SUBSCRIPTION_RESUME" : "SUBSCRIPTION_CANCEL",
    entity: "Subscription",
    entityId: sub.id,
    changes: { plan: sub.plan, periodEnd: sub.currentPeriodEnd.toISOString() },
    request: ctx.request,
  });
  return subscriptionView(updated);
}

// ---------------------------------------------------------------------------
// The worker's sweep

/** Billing notices go to the owners and lead to Billing. Never fails the sweep. */
async function notifyOwners(organizationId: string, event: "plan.ended" | "plan.ending" | "billing.renewal_failed", title: string, body: string) {
  await notify({ event, organizationId, title, body, href: "/billing" }).catch((error) => console.error("[billing] notification failed", error));
}

/**
 * What a subscription renews at: the price and credits it was bought at. Only
 * a row from before those were recorded (none should remain) falls back to
 * today's list.
 */
function termsOf(sub: Subscription, pricing: Pricing): { priceCents: number; creditsPerMonth: number } {
  const key = sub.plan as PaidPlanKey;
  const cycle: BillingCycle = sub.cycle === "ANNUAL" ? "ANNUAL" : "MONTHLY";
  return {
    priceCents: sub.priceCents > 0 ? sub.priceCents : planPriceCents(pricing, key, cycle),
    creditsPerMonth: sub.creditsPerMonth > 0 ? sub.creditsPerMonth : pricing.plans[key].creditsPerMonth,
  };
}

/** Grants the months of credits that yearly plans have come due for. */
export async function grantDueCredits(now = new Date()): Promise<number> {
  const due = await db.subscription.findMany({
    where: { status: { in: ["ACTIVE", "PAST_DUE"] }, nextGrantAt: { lte: now } },
    take: 100,
  });
  let granted = 0;
  const pricing = due.length ? await getPricing() : null;
  for (const sub of due) {
    if (!isPaidPlan(sub.plan) || !sub.nextGrantAt || !pricing) continue;
    const plan = PLAN_META[sub.plan];
    const credits = termsOf(sub, pricing).creditsPerMonth;
    const at = sub.nextGrantAt;
    const ok = await db.$transaction(async (tx) => {
      // Claim this month first: only the sweep that moves nextGrantAt on grants it.
      const next = addMonths(at, 1);
      const claimed = await tx.subscription.updateMany({
        where: { id: sub.id, nextGrantAt: at },
        data: { nextGrantAt: next < sub.currentPeriodEnd ? next : null },
      });
      if (claimed.count !== 1) return false;
      return grantCredits(tx, {
        organizationId: sub.organizationId,
        credits,
        grantKey: `sub:${sub.organizationId}:grant:${at.toISOString().slice(0, 10)}`,
        note: `${plan.name} plan (yearly), monthly credits`,
      });
    });
    if (ok) granted += 1;
  }
  return granted;
}

/** Ends a plan now (the worker at period end, or a platform admin). Credits stay; limits go back. */
export async function expire(sub: Subscription, reason: string) {
  await db.$transaction(async (tx) => {
    const won = await tx.subscription.updateMany({
      where: { id: sub.id, status: { in: ["ACTIVE", "PAST_DUE"] } },
      data: { status: "EXPIRED", autoRenew: false, nextGrantAt: null, nextRenewalAttemptAt: null },
    });
    if (won.count === 1) await restoreWorkspacePlan(tx, sub);
  });
  await audit({ organizationId: sub.organizationId, action: "SUBSCRIPTION_EXPIRED", entity: "Subscription", entityId: sub.id, changes: { plan: sub.plan, reason } });
  const name = isPaidPlan(sub.plan) ? PLAN_META[sub.plan].name : sub.plan;
  await notifyOwners(sub.organizationId, "plan.ended", `Your ${name} plan has ended`, `${reason} Your credits stay in your wallet. Choose a plan to get monthly credits again.`);
}

async function renew(sub: Subscription): Promise<"renewed" | "failed" | "pending"> {
  if (!isPaidPlan(sub.plan)) return "failed";
  const code = openAuthorization(sub);
  const cycle: BillingCycle = sub.cycle === "ANNUAL" ? "ANNUAL" : "MONTHLY";
  if (!code || !sub.billingEmail) return "failed";
  const terms = termsOf(sub, await getPricing());
  const intent = await chargeSavedCard({
    organizationId: sub.organizationId,
    purpose: "SUBSCRIPTION",
    planKey: sub.plan,
    billingCycle: cycle,
    credits: terms.creditsPerMonth,
    amountCents: terms.priceCents,
    email: sub.billingEmail,
    authorizationCode: code,
  });
  if (intent.status === "SUCCEEDED") return "renewed";
  if (intent.status === "PROCESSING") return "pending";
  return "failed";
}

/** Renews or ends plans whose period is over, and retries failed renewals. */
export async function renewDuePlans(now = new Date()): Promise<{ renewed: number; failed: number; expired: number }> {
  const out = { renewed: 0, failed: 0, expired: 0 };
  const due = await db.subscription.findMany({
    where: {
      OR: [
        { status: "ACTIVE", currentPeriodEnd: { lte: now } },
        { status: "PAST_DUE", nextRenewalAttemptAt: { lte: now } },
      ],
    },
    take: 50,
  });
  for (const sub of due) {
    if (!sub.autoRenew || !sub.authCipherText) {
      await expire(
        sub,
        sub.paymentMethod === "COMP"
          ? "The complimentary period is over."
          : sub.cancelledAt
            ? "Renewal was switched off."
            : "The period is over and plans paid by M-Pesa do not renew themselves.",
      );
      out.expired += 1;
      continue;
    }
    const result = await renew(sub);
    if (result === "renewed") {
      out.renewed += 1;
      continue;
    }
    if (result === "pending") continue; // verified by reference on a later sweep
    const attempts = sub.renewalAttempts + 1;
    if (attempts >= RENEWAL_RETRIES) {
      await expire(sub, `The card was declined ${attempts} times.`);
      out.expired += 1;
      continue;
    }
    await db.subscription.update({
      where: { id: sub.id },
      data: { status: "PAST_DUE", renewalAttempts: attempts, nextRenewalAttemptAt: new Date(now.getTime() + RETRY_EVERY_MS) },
    });
    const name = PLAN_META[sub.plan as PaidPlanKey]?.name ?? sub.plan;
    await notifyOwners(
      sub.organizationId,
      "billing.renewal_failed",
      `We could not renew your ${name} plan`,
      `${sub.cardLabel ?? "Your card"} was declined. We will try again tomorrow; you can also pay now from Billing.`,
    );
    const org = await db.organization.findUnique({ where: { id: sub.organizationId }, select: { name: true } });
    await notify({
      event: "platform.renewal_failed",
      title: `${org?.name ?? "An organisation"}: ${name} renewal declined (attempt ${attempts} of ${RENEWAL_RETRIES})`,
      body: `${sub.cardLabel ?? "The card"} was declined. Retrying tomorrow.`,
      href: `/platform/orgs/${sub.organizationId}`,
    }).catch((error) => console.error("[billing] notification failed", error));
    out.failed += 1;
  }
  return out;
}

/** Reminds owners of plans that will not renew themselves, three days before they end. */
export async function remindEndingPlans(now = new Date()): Promise<number> {
  const ending = await db.subscription.findMany({
    where: {
      status: "ACTIVE",
      autoRenew: false,
      currentPeriodEnd: { gt: now, lte: new Date(now.getTime() + REMIND_BEFORE_MS) },
    },
    take: 100,
  });
  let sent = 0;
  const pricing = ending.length ? await getPricing() : null;
  for (const sub of ending) {
    // Once per period: the mark names the period end it reminded about.
    if (!(await claimAlert(`plan-ending:${sub.id}:${sub.currentPeriodEnd.toISOString()}`))) continue;
    const plan = isPaidPlan(sub.plan) ? PLAN_META[sub.plan] : null;
    const terms = plan && pricing ? termsOf(sub, pricing) : null;
    const day = sub.currentPeriodEnd.toLocaleDateString("en-KE", { day: "numeric", month: "long", timeZone: "Africa/Nairobi" });
    await notifyOwners(
      sub.organizationId,
      "plan.ending",
      `Your ${plan?.name ?? sub.plan} plan ends on ${day}`,
      terms
        ? `Renew for ${formatKES(terms.priceCents)} to keep getting ${terms.creditsPerMonth.toLocaleString("en-KE")} credits a month.`
        : "Renew from Billing to keep your monthly credits.",
    );
    sent += 1;
  }
  return sent;
}

export async function runBillingSweep(now = new Date()) {
  const granted = await grantDueCredits(now);
  const renewals = await renewDuePlans(now);
  const reminded = await remindEndingPlans(now);
  const reconciled = await reconcileCheckouts();
  return { granted, ...renewals, reminded, reconciled };
}
