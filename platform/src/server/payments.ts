import "server-only";

import type { PaymentIntent } from "@prisma/client";

import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { formatKES } from "@/lib/money";
import { callbackUrl, checkoutProvider, checkoutProviderFor, isCheckoutProviderName, stkProvider, stkProviderFor } from "@/lib/payments";
import { newReference, type CardAuthorization } from "@/lib/payments/paystack";

import { creditPayment, legacyTokensAsCredits } from "./credits";
import { notify } from "./notify";
import { applySubscriptionPayment } from "./subscription-effects";

/**
 * Collecting money: M-Pesa STK push (Daraja) and Paystack (hosted checkout, and
 * saved-card charges for plan renewals). Used by public orders, credit
 * top-ups and plans.
 *
 * The rules (Raut's, and they have held up with real money):
 *
 *   1. **Nothing is "paid" until the provider says so.** Only `settleIntent`,
 *      which asks the provider directly (STK Query, Paystack verify), can mark
 *      an intent SUCCEEDED. A callback, a webhook, a redirect or a poll merely
 *      asks for that check to run.
 *   2. **Settlement happens once.** Callbacks repeat and polls overlap, so the
 *      move to a terminal state is a conditional update (`status IN (PENDING,
 *      PROCESSING)`); only the caller that wins it applies the effects (order
 *      marked paid, credits added, plan started), in the same transaction.
 *   3. **Amounts come from the server.** Every intent's amount was computed from
 *      src/lib/pricing.ts before it reached here, and a Paystack verdict whose
 *      amount or currency differs from the intent's is refused.
 */

export type Purpose = "ORDER" | "CREDITS" | "SUBSCRIPTION" | "TOKENS";

/** A Paystack checkout nobody completed is given up on after this long. */
const CHECKOUT_EXPIRY_MS = 2 * 60 * 60_000;

interface IntentFields {
  organizationId: string;
  purpose: Purpose;
  orderId?: string | null;
  credits?: number;
  planKey?: string | null;
  billingCycle?: string | null;
  amountCents: number;
  createdById?: string | null;
  request?: Request;
}

export interface StartPaymentInput extends IntentFields {
  /** Canonical, 2547XXXXXXXX */
  phone: string;
  /** Shown on the customer's phone prompt (12 characters at most) */
  reference: string;
  /** Shown on the prompt too (13 characters at most) */
  description: string;
}

/** M-Pesa: records the intent, then sends the STK push. The intent exists before any money can move. */
export async function startPayment(input: StartPaymentInput): Promise<{ intent: PaymentIntent; message: string | null }> {
  const provider = stkProvider();

  const intent = await db.paymentIntent.create({
    data: {
      ...intentData(input),
      provider: provider.name,
      phone: input.phone,
    },
  });

  let result;
  try {
    result = await provider.initiate({
      amountCents: input.amountCents,
      phone: input.phone,
      reference: input.reference,
      description: input.description,
      callbackUrl: callbackUrl(),
    });
  } catch (e) {
    result = { ok: false, error: "Could not reach M-Pesa. Try again shortly." };
    console.error("[payments] initiate threw", e instanceof Error ? e.message : e);
  }

  const updated = await db.paymentIntent.update({
    where: { id: intent.id },
    data: result.ok
      ? { status: "PROCESSING", providerRef: result.providerRef, merchantRequestId: result.merchantRequestId ?? null }
      : { status: "FAILED", failureReason: result.error ?? "M-Pesa did not accept the request", completedAt: new Date() },
  });

  await auditStart(input, intent.id, provider.name, result.ok, result.error);
  if (!result.ok) await markOrderPaymentFailed(input.orderId);
  return { intent: updated, message: result.ok ? (result.message ?? null) : (result.error ?? null) };
}

export interface StartCheckoutInput extends IntentFields {
  email: string;
  /** Where Paystack sends the customer back to; Paystack adds ?reference=… */
  returnPath: string;
  /** Prefix for the reference, e.g. ORD, PLAN, CREDITS */
  referencePrefix: string;
}

/**
 * Paystack: records the intent with our reference, then asks Paystack for a
 * hosted checkout page. The customer pays there (card, M-Pesa, Apple Pay) and
 * comes back to `returnPath`, which settles the intent.
 */
export async function startCheckout(
  input: StartCheckoutInput,
): Promise<{ intent: PaymentIntent; checkoutUrl: string | null; message: string | null }> {
  const provider = checkoutProvider();
  const reference = newReference(input.referencePrefix);

  const intent = await db.paymentIntent.create({
    data: {
      ...intentData(input),
      provider: provider.name,
      providerRef: reference,
      email: input.email,
    },
  });

  const returnUrl = new URL(input.returnPath, env().APP_BASE_URL).toString();
  let result;
  try {
    result = await provider.initialize({
      email: input.email,
      amountCents: input.amountCents,
      reference,
      callbackUrl: returnUrl,
      metadata: { intentId: intent.id, purpose: input.purpose, organizationId: input.organizationId },
    });
  } catch (e) {
    result = { ok: false, error: "Could not reach Paystack. Try again shortly." };
    console.error("[payments] paystack initialize threw", e instanceof Error ? e.message : e);
  }

  const updated = await db.paymentIntent.update({
    where: { id: intent.id },
    data: result.ok
      ? { status: "PROCESSING", checkoutUrl: result.authorizationUrl }
      : { status: "FAILED", failureReason: result.error ?? "Paystack did not accept the request", completedAt: new Date() },
  });

  await auditStart(input, intent.id, provider.name, result.ok, result.error);
  if (!result.ok) await markOrderPaymentFailed(input.orderId);
  return { intent: updated, checkoutUrl: result.ok ? (result.authorizationUrl ?? null) : null, message: result.ok ? null : (result.error ?? null) };
}

/**
 * Charges a saved card without the customer present (plan renewals). The
 * intent is recorded first, like every other payment, and the verdict is
 * applied through the same once-only settlement.
 */
export async function chargeSavedCard(input: IntentFields & { email: string; authorizationCode: string }): Promise<PaymentIntent> {
  const provider = checkoutProvider();
  const reference = newReference("RENEW");
  const intent = await db.paymentIntent.create({
    data: { ...intentData(input), provider: provider.name, providerRef: reference, email: input.email, automatic: true, status: "PROCESSING" },
  });

  let verdict;
  try {
    verdict = await provider.chargeAuthorization({
      email: input.email,
      amountCents: input.amountCents,
      authorizationCode: input.authorizationCode,
      reference,
      metadata: { intentId: intent.id, purpose: input.purpose, organizationId: input.organizationId, renewal: true },
    });
  } catch (e) {
    console.error("[payments] charge_authorization threw", e instanceof Error ? e.message : e);
    // Unknown outcome: leave it PROCESSING; the reconciler verifies it by reference.
    return intent;
  }
  return applyVerdict(intent, verdict);
}

function intentData(input: IntentFields) {
  return {
    organizationId: input.organizationId,
    purpose: input.purpose,
    orderId: input.orderId ?? null,
    credits: input.credits ?? 0,
    planKey: input.planKey ?? null,
    billingCycle: input.billingCycle ?? null,
    amountCents: input.amountCents,
    createdById: input.createdById ?? null,
  };
}

async function auditStart(input: IntentFields, intentId: string, provider: string, ok: boolean, error?: string) {
  await audit({
    organizationId: input.organizationId,
    userId: input.createdById ?? null,
    action: ok ? "PAYMENT_INITIATE" : "PAYMENT_FAILED",
    entity: "PaymentIntent",
    entityId: intentId,
    changes: {
      purpose: input.purpose,
      orderId: input.orderId ?? null,
      plan: input.planKey ?? undefined,
      credits: input.credits || undefined,
      amount: formatKES(input.amountCents),
      provider,
      error: ok ? undefined : error,
    },
    request: input.request,
  });
}

async function markOrderPaymentFailed(orderId: string | null | undefined) {
  if (!orderId) return;
  await db.order.updateMany({ where: { id: orderId, status: "PENDING_PAYMENT" }, data: { status: "PAYMENT_FAILED" } });
}

/** What a Daraja callback told us, kept only as a hint (see rule 1). */
export interface CallbackHint {
  receipt?: string | null;
}

interface Verdict {
  status: "PENDING" | "SUCCEEDED" | "FAILED";
  resultCode?: string;
  failureReason?: string;
  receiptRef?: string | null;
  amountCents?: number;
  currency?: string;
  channel?: string | null;
  authorization?: CardAuthorization | null;
  raw?: unknown;
}

/**
 * Asks the provider for the verdict and applies it once. Safe to call from a
 * poll, a callback, a webhook, a redirect, or all at the same moment.
 */
export async function settleIntent(intentId: string, hint: CallbackHint = {}): Promise<PaymentIntent> {
  const intent = await db.paymentIntent.findUnique({ where: { id: intentId } });
  if (!intent) throw new Error(`Payment intent ${intentId} not found`);

  // A late callback may still carry the receipt number the query never returns.
  if (intent.status === "SUCCEEDED" && !intent.receiptRef && hint.receipt) {
    return db.paymentIntent.update({ where: { id: intent.id }, data: { receiptRef: hint.receipt } });
  }
  if (intent.status === "SUCCEEDED" || intent.status === "FAILED" || !intent.providerRef) return intent;

  let verdict: Verdict;
  try {
    if (isCheckoutProviderName(intent.provider)) {
      const provider = checkoutProviderFor(intent.provider);
      if (!provider) return intent;
      verdict = await provider.verify(intent.providerRef);
    } else {
      const provider = stkProviderFor(intent.provider);
      if (!provider || !intent.phone) return intent;
      verdict = await provider.verify({ providerRef: intent.providerRef, phone: intent.phone, createdAt: intent.createdAt });
      if (hint.receipt && !verdict.receiptRef) verdict.receiptRef = hint.receipt;
    }
  } catch (e) {
    console.error("[payments] verify threw", e instanceof Error ? e.message : e);
    return intent;
  }
  return applyVerdict(intent, verdict);
}

/** Applies a provider's verdict to an intent, once. */
async function applyVerdict(intent: PaymentIntent, input: Verdict): Promise<PaymentIntent> {
  let verdict = input;
  const raw = verdict.raw == null ? null : JSON.stringify(verdict.raw).slice(0, 4000);

  // Paystack must have collected exactly what we asked for, in shillings.
  if (verdict.status === "SUCCEEDED" && isCheckoutProviderName(intent.provider) && verdict.amountCents !== undefined && !Number.isNaN(verdict.amountCents)) {
    if (verdict.amountCents !== intent.amountCents || (verdict.currency && verdict.currency !== intent.currency)) {
      verdict = {
        ...verdict,
        status: "FAILED",
        failureReason: `Paystack reported ${verdict.currency ?? "?"} ${(verdict.amountCents / 100).toFixed(2)}, expected ${formatKES(intent.amountCents)}. Not applied; contact support.`,
      };
    }
  }

  if (verdict.status === "PENDING") {
    const abandoned = isCheckoutProviderName(intent.provider) && Date.now() - intent.createdAt.getTime() > CHECKOUT_EXPIRY_MS;
    if (!abandoned) {
      // Touching the row moves updatedAt, which is what spaces out the next check.
      return db.paymentIntent.update({ where: { id: intent.id }, data: { providerPayload: raw ?? intent.providerPayload } });
    }
    verdict = { ...verdict, status: "FAILED", failureReason: "The checkout was not completed." };
  }

  if (verdict.status === "FAILED") {
    const won = await db.paymentIntent.updateMany({
      where: { id: intent.id, status: { in: ["PENDING", "PROCESSING"] } },
      data: {
        status: "FAILED",
        failureReason: verdict.failureReason ?? "The payment did not complete.",
        providerPayload: raw,
        channel: verdict.channel ?? null,
        completedAt: new Date(),
      },
    });
    if (won.count === 1) {
      await markOrderPaymentFailed(intent.orderId);
      await audit({
        organizationId: intent.organizationId,
        action: "PAYMENT_FAILED",
        entity: "PaymentIntent",
        entityId: intent.id,
        changes: { resultCode: verdict.resultCode, reason: verdict.failureReason, automatic: intent.automatic || undefined },
      });
    }
    return (await db.paymentIntent.findUnique({ where: { id: intent.id } }))!;
  }

  // SUCCEEDED: claim the transition and apply its effects in one transaction.
  const applied = await db.$transaction(async (tx) => {
    const won = await tx.paymentIntent.updateMany({
      where: { id: intent.id, status: { in: ["PENDING", "PROCESSING"] } },
      data: {
        status: "SUCCEEDED",
        receiptRef: verdict.receiptRef ?? null,
        providerPayload: raw,
        channel: verdict.channel ?? null,
        failureReason: null,
        completedAt: new Date(),
      },
    });
    if (won.count !== 1) return false;

    const common = { organizationId: intent.organizationId, paymentIntentId: intent.id, createdById: intent.createdById };
    if (intent.purpose === "ORDER" && intent.orderId) {
      await tx.order.updateMany({
        where: { id: intent.orderId, status: { in: ["PENDING_PAYMENT", "PAYMENT_FAILED"] } },
        data: { status: "PAID", paidAt: new Date() },
      });
    }
    if (intent.purpose === "CREDITS") await creditPayment(tx, { ...common, credits: intent.credits });
    if (intent.purpose === "TOKENS") {
      // Started before the switch to credits; credited at the conversion rate.
      await creditPayment(tx, { ...common, credits: legacyTokensAsCredits(intent.imageTokens, intent.videoTokens), note: "Token purchase, credited as credits" });
    }
    if (intent.purpose === "SUBSCRIPTION") {
      const fresh = await tx.paymentIntent.findUniqueOrThrow({ where: { id: intent.id } });
      await applySubscriptionPayment(tx, fresh, verdict.authorization);
    }
    return true;
  });

  if (applied) {
    await audit({
      organizationId: intent.organizationId,
      userId: intent.createdById,
      action: "PAYMENT_SETTLED",
      entity: "PaymentIntent",
      entityId: intent.id,
      changes: {
        purpose: intent.purpose,
        amount: formatKES(intent.amountCents),
        orderId: intent.orderId,
        plan: intent.planKey ?? undefined,
        credits: intent.credits || undefined,
        channel: verdict.channel ?? undefined,
      },
    });
    if (intent.purpose === "ORDER" && intent.orderId) await notifyOrderPaid(intent.orderId, intent.provider);
    if (intent.purpose === "SUBSCRIPTION" || intent.purpose === "CREDITS") await notifyPurchase(intent);
  }

  return (await db.paymentIntent.findUnique({ where: { id: intent.id } }))!;
}

/**
 * Re-checks a PROCESSING intent if it has been waiting long enough. For M-Pesa
 * that means time to find the phone (and Safaricom rate-limits STK Query); a
 * Paystack checkout is checked as soon as the customer is back. This is what
 * makes payments work on a machine the providers cannot call back (localhost),
 * and what rescues a lost callback or webhook.
 */
export async function refreshIfDue(
  intent: PaymentIntent,
  opts: { minAgeMs?: number; minGapMs?: number } = {},
): Promise<PaymentIntent> {
  if (intent.status !== "PROCESSING") return intent;
  const checkout = isCheckoutProviderName(intent.provider);
  const now = Date.now();
  if (now - intent.createdAt.getTime() < (opts.minAgeMs ?? (checkout ? 0 : 8_000))) return intent;
  if (now - intent.updatedAt.getTime() < (opts.minGapMs ?? (checkout ? 2_000 : 4_000))) return intent;
  return settleIntent(intent.id);
}

/** Finds the intent a Paystack reference belongs to. */
export async function intentByReference(reference: string): Promise<PaymentIntent | null> {
  if (!/^[A-Za-z0-9._=-]{6,100}$/.test(reference)) return null;
  return db.paymentIntent.findFirst({ where: { providerRef: reference, provider: { in: ["PAYSTACK", "PAYSTACK_SIMULATOR"] } } });
}

/** Verifies Paystack checkouts nobody came back from (closed tab, lost webhook). Run by the worker. */
export async function reconcileCheckouts(limit = 20): Promise<number> {
  const stale = await db.paymentIntent.findMany({
    where: {
      status: "PROCESSING",
      provider: { in: ["PAYSTACK", "PAYSTACK_SIMULATOR"] },
      updatedAt: { lt: new Date(Date.now() - 60_000) },
    },
    orderBy: { updatedAt: "asc" },
    take: limit,
    select: { id: true },
  });
  for (const s of stale) await settleIntent(s.id);
  return stale.length;
}

/** Tells the people who fulfil orders that one has been paid for. */
async function notifyOrderPaid(orderId: string, provider: string): Promise<void> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: { id: true, organizationId: true, number: true, kind: true, amountCents: true, customerName: true },
  });
  if (!order) return;
  const what = order.kind === "VIDEO" ? "video" : "image";
  const via = isCheckoutProviderName(provider) ? "Paystack" : "M-Pesa";
  await notify({
    event: "order.paid",
    organizationId: order.organizationId,
    title: `${order.number} paid: ${what} order from ${order.customerName}`,
    body: `${formatKES(order.amountCents)} received by ${via}. Ready to produce.`,
    href: `/app/orders/${order.id}`,
  });
}

/** A receipt for the owners, and a line for the platform admins when it was a plan. */
async function notifyPurchase(intent: PaymentIntent): Promise<void> {
  const via = isCheckoutProviderName(intent.provider) ? "card (Paystack)" : "M-Pesa";
  const plan = intent.purpose === "SUBSCRIPTION" && intent.planKey ? intent.planKey.charAt(0) + intent.planKey.slice(1).toLowerCase() : null;
  const cycle = intent.billingCycle === "ANNUAL" ? "yearly" : "monthly";
  try {
    await notify({
      event: "billing.payment_received",
      organizationId: intent.organizationId,
      title: plan ? `Payment received: ${plan} plan (${cycle})` : `Payment received: ${intent.credits.toLocaleString("en-KE")} credits`,
      body: `${formatKES(intent.amountCents)} by ${via}.${intent.receiptRef ? ` Receipt ${intent.receiptRef}.` : ""}`,
      href: "/billing",
    });
    if (plan) {
      const org = await db.organization.findUnique({ where: { id: intent.organizationId }, select: { name: true } });
      await notify({
        event: "platform.subscription_paid",
        title: `${org?.name ?? "An organisation"} paid for ${plan} (${cycle})`,
        body: `${formatKES(intent.amountCents)} by ${via}.`,
        href: `/platform/orgs/${intent.organizationId}`,
      });
    }
  } catch (error) {
    console.error("[payments] receipt notification failed", error);
  }
}
