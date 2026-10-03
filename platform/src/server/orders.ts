import "server-only";

import crypto from "node:crypto";

import type { Order, PaymentIntent } from "@prisma/client";
import { z } from "zod";

import { ApiError, fail } from "@/lib/api";
import { ASPECT_RATIOS } from "@/lib/generation-models";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { canonicalPhone, normaliseEmail } from "@/lib/identity";
import { nextNumber } from "@/lib/numbering";
import { paystackAvailable } from "@/lib/payments";
import { EXTRA_KEYS, MAX_IMAGES_PER_ORDER, PricingError, quoteCreditOrder, VIDEO_MAX_SECONDS, VIDEO_MIN_SECONDS } from "@/lib/pricing";
import { hit } from "@/lib/ratelimit";

import { notify } from "./notify";
import { refreshIfDue, settleIntent, startCheckout, startPayment } from "./payments";
import { getPricing } from "./pricing-store";

/**
 * Done-for-you orders from the public landing page.
 *
 * Anyone can ask for work without an account, but a platform admin prices and
 * submits every order (src/server/platform-orders.ts):
 *
 *   REQUESTED -> admin sets the price and submits -> PENDING_PAYMENT
 *     -> customer pays on their order page -> PAID -> IN_PRODUCTION -> DELIVERED
 *
 * So that anonymous requests cannot be abused:
 *   - **the price** is never taken from the browser: the calculator's estimate
 *     is stored as `suggestedCents` for the admin, and `amountCents` stays 0
 *     until the admin sets it;
 *   - **requests** are rate-limited per phone number and overall; and a payment
 *     prompt goes to a phone only after the customer asks for it on their
 *     order page, so a stranger's number cannot be made to receive one;
 *   - **the order page** is reachable only with the long random `publicToken`.
 */

export const phoneField = z
  .string()
  .trim()
  .min(9, "Enter your phone number")
  .max(20)
  .transform((v, ctx) => {
    const phone = canonicalPhone(v);
    if (!phone || !/^254[17]\d{8}$/.test(phone)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Enter a Safaricom number, e.g. 0712 345 678" });
      return z.NEVER;
    }
    return phone;
  });

export const emailField = z
  .string()
  .trim()
  .max(254)
  .optional()
  .transform((v, ctx) => {
    if (!v) return null;
    const email = normaliseEmail(v);
    if (!email) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "That email address does not look right" });
      return z.NEVER;
    }
    return email;
  });

export const linkField = z
  .string()
  .trim()
  .max(500)
  .optional()
  .transform((v, ctx) => {
    if (!v) return null;
    try {
      const url = new URL(v);
      if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("scheme");
      return url.toString();
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Paste a full link, starting with https://" });
      return z.NEVER;
    }
  });

const contact = {
  name: z.string().trim().min(2, "Tell us your name").max(120),
  phone: phoneField,
  email: emailField,
  business: z.string().trim().max(160).optional().transform((v) => v || null),
  /** Honeypot: real people never see this field, bots fill it in. */
  website: z.string().max(0).optional(),
};

export const orderSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("IMAGE"),
    images: z.coerce.number().int().min(1).max(MAX_IMAGES_PER_ORDER),
    brief: z.string().trim().min(10, "Describe what you need in a sentence or two").max(4000),
    aspectRatio: z.enum(ASPECT_RATIOS).default("1:1"),
    extras: z.array(z.enum(EXTRA_KEYS)).max(EXTRA_KEYS.length).default([]),
    referenceLink: linkField,
    ...contact,
  }),
  z.object({
    kind: z.literal("VIDEO"),
    seconds: z.coerce.number().int().min(VIDEO_MIN_SECONDS).max(VIDEO_MAX_SECONDS),
    brief: z.string().trim().min(10, "Describe what you need in a sentence or two").max(4000),
    aspectRatio: z.enum(ASPECT_RATIOS).default("9:16"),
    extras: z.array(z.enum(EXTRA_KEYS)).max(EXTRA_KEYS.length).default([]),
    referenceLink: linkField,
    ...contact,
  }),
]);

export const quoteRequestSchema = z.object({
  extras: z.array(z.enum(EXTRA_KEYS)).min(1, "Pick at least one service").max(EXTRA_KEYS.length),
  brief: z.string().trim().min(10, "Describe what you need in a sentence or two").max(4000),
  ...contact,
});

export type OrderInput = z.infer<typeof orderSchema>;

export async function ordersOrganization() {
  const slug = env().ORDERS_ORGANIZATION_SLUG;
  const org = await db.organization.findUnique({ where: { slug }, select: { id: true, status: true } });
  if (!org || org.status !== "ACTIVE") {
    throw new ApiError(503, "ORDERS_UNAVAILABLE", "Online ordering is not available right now. Please call or WhatsApp us.");
  }
  return org;
}

/** Limits requests from the public form per phone number and overall. Returns a 429 response when exceeded. */
async function guardRequests(phone: string) {
  const perPhone = await hit(`order:request:${phone}`, { limit: 6, windowSec: 60 * 60 });
  if (!perPhone.allowed) {
    return fail(429, "RATE_LIMITED", "You have sent several requests already. We will be in touch.", undefined, {
      headers: { "Retry-After": String(perPhone.retryAfterSec) },
    });
  }
  const overall = await hit("order:request:all", { limit: 300, windowSec: 60 * 60 });
  if (!overall.allowed) {
    return fail(429, "RATE_LIMITED", "We are receiving a lot of requests. Please try again shortly.", undefined, {
      headers: { "Retry-After": String(overall.retryAfterSec) },
    });
  }
  return null;
}

/** Limits STK prompts per phone number and overall. Returns a 429 response when exceeded. */
async function guardPrompts(phone: string) {
  const perPhone = await hit(`order:stk:${phone}`, { limit: 3, windowSec: 15 * 60 });
  if (!perPhone.allowed) {
    return fail(429, "RATE_LIMITED", "Too many payment prompts to this number. Try again in a few minutes.", undefined, {
      headers: { "Retry-After": String(perPhone.retryAfterSec) },
    });
  }
  const overall = await hit("order:stk:all", { limit: 120, windowSec: 60 * 60 });
  if (!overall.allowed) {
    return fail(429, "RATE_LIMITED", "We are receiving a lot of orders. Please try again shortly.", undefined, {
      headers: { "Retry-After": String(overall.retryAfterSec) },
    });
  }
  return null;
}

export function newPublicToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}

export async function createOrder(input: OrderInput, request: Request) {
  if (input.website) throw new ApiError(400, "BAD_REQUEST", "Request rejected.");
  const org = await ordersOrganization();
  const limited = await guardRequests(input.phone);
  if (limited) return limited;

  let quote;
  try {
    quote = quoteCreditOrder(await getPricing(), input.kind === "IMAGE" ? { kind: "IMAGE", images: input.images } : { kind: "VIDEO", seconds: input.seconds });
  } catch (e) {
    if (e instanceof PricingError) throw new ApiError(422, "VALIDATION_FAILED", e.message);
    throw e;
  }

  const order = await db.$transaction(async (tx) => {
    const number = await nextNumber(org.id, "ORDER", tx);
    return tx.order.create({
      data: {
        organizationId: org.id,
        number,
        publicToken: newPublicToken(),
        kind: input.kind,
        status: "REQUESTED",
        source: "PUBLIC",
        customerName: input.name,
        customerPhone: input.phone,
        customerEmail: input.email,
        businessName: input.business,
        brief: input.brief,
        imageTokens: quote.images,
        videoSeconds: quote.videoSeconds,
        credits: quote.credits,
        aspectRatio: input.aspectRatio,
        extras: input.extras,
        referenceLink: input.referenceLink,
        amountCents: 0,
        suggestedCents: quote.amountCents,
      },
    });
  });

  await audit({
    organizationId: org.id,
    action: "ORDER_CREATE",
    entity: "Order",
    entityId: order.id,
    changes: { number: order.number, kind: order.kind, suggestedCents: order.suggestedCents },
    request,
  });
  await alertStaff(order, order.kind === "VIDEO" ? `${order.videoSeconds}-second video` : `${order.imageTokens} image${order.imageTokens === 1 ? "" : "s"}`);

  return { number: order.number, token: order.publicToken, status: order.status };
}

/** Tells the operator's team a request is waiting for a price. */
async function alertStaff(order: Order, summary: string) {
  const staff = await db.membership.findMany({
    where: { organizationId: order.organizationId, status: "ACTIVE", role: { in: ["OWNER", "BRAND_MANAGER"] } },
    select: { userId: true },
  });
  if (staff.length === 0) return;
  await db.notification.createMany({
    data: staff.map((m) => ({
      organizationId: order.organizationId,
      userId: m.userId,
      kind: "QUOTE_REQUESTED",
      title: `${order.number}: new request from ${order.customerName}`,
      body: `${summary}. Waiting for a price.`,
      href: `/app/orders/${order.id}`,
    })),
  });
}

/** Starts collecting an order's price by the chosen method. */
async function collect(order: Order, payWith: "MPESA" | "PAYSTACK", phone: string, email: string | null, request: Request) {
  const common = { organizationId: order.organizationId, purpose: "ORDER" as const, orderId: order.id, amountCents: order.amountCents, request };
  if (payWith === "PAYSTACK" && email) {
    const r = await startCheckout({ ...common, email, returnPath: `/order/${order.publicToken}`, referencePrefix: "ORD" });
    return { intent: r.intent, message: r.message };
  }
  return startPayment({
    ...common,
    phone,
    reference: order.number,
    description: order.kind === "VIDEO" ? "AI video" : "AI images",
  });
}

export async function createQuoteRequest(input: z.infer<typeof quoteRequestSchema>, request: Request) {
  if (input.website) throw new ApiError(400, "BAD_REQUEST", "Request rejected.");
  const org = await ordersOrganization();
  const limited = await guardRequests(input.phone);
  if (limited) return limited;

  const order = await db.$transaction(async (tx) => {
    const number = await nextNumber(org.id, "ORDER", tx);
    return tx.order.create({
      data: {
        organizationId: org.id,
        number,
        publicToken: newPublicToken(),
        kind: "QUOTE",
        status: "REQUESTED",
        source: "PUBLIC",
        customerName: input.name,
        customerPhone: input.phone,
        customerEmail: input.email,
        businessName: input.business,
        brief: input.brief,
        extras: input.extras,
        amountCents: 0,
      },
    });
  });

  await audit({
    organizationId: org.id,
    action: "ORDER_CREATE",
    entity: "Order",
    entityId: order.id,
    changes: { number: order.number, kind: "QUOTE", extras: input.extras },
    request,
  });
  await alertStaff(order, input.extras.join(", "));

  return { number: order.number, token: order.publicToken, status: order.status };
}

async function reload(orderId: string) {
  return db.order.findUniqueOrThrow({ where: { id: orderId } });
}

async function latestIntent(orderId: string) {
  return db.paymentIntent.findFirst({ where: { orderId }, orderBy: { createdAt: "desc" } });
}

async function byToken(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  return db.order.findUnique({ where: { publicToken: token } });
}

/** What the customer may see about their own order. No internal ids, no staff names. */
export function publicView(order: Order, intent: PaymentIntent | null) {
  return {
    number: order.number,
    token: order.publicToken,
    kind: order.kind,
    status: order.status,
    brief: order.brief,
    images: order.imageTokens,
    videoSeconds: order.videoSeconds,
    credits: order.credits,
    aspectRatio: order.aspectRatio,
    amountCents: order.amountCents,
    /** False while the team is still working out the price */
    priced: order.status !== "REQUESTED",
    /** The calculator's estimate, shown while the price is being confirmed */
    estimateCents: order.suggestedCents,
    currency: order.currency,
    createdAt: order.createdAt.toISOString(),
    paidAt: order.paidAt?.toISOString() ?? null,
    deliveredAt: order.deliveredAt?.toISOString() ?? null,
    payment: intent
      ? {
          status: intent.status,
          failureReason: intent.failureReason,
          receiptRef: intent.receiptRef,
          phoneLast3: intent.phone?.slice(-3) ?? null,
          method: intent.provider === "PAYSTACK" || intent.provider === "PAYSTACK_SIMULATOR" ? "PAYSTACK" : "MPESA",
          checkoutUrl: intent.status === "PROCESSING" ? intent.checkoutUrl : null,
          simulated: intent.provider === "SIMULATOR" || intent.provider === "PAYSTACK_SIMULATOR",
        }
      : null,
  };
}

/** The status page's poll. Also asks M-Pesa for a verdict once the prompt has had time. */
export async function orderStatus(token: string) {
  const order = await byToken(token);
  if (!order) throw new ApiError(404, "NOT_FOUND", "We could not find that order.");

  let intent = await latestIntent(order.id);
  if (intent?.status === "PROCESSING") {
    const gate = await hit(`order:poll:${order.id}`, { limit: 30, windowSec: 60 });
    if (gate.allowed) intent = await refreshIfDue(intent);
  }
  const fresh = intent ? await reload(order.id) : order;

  const deliverables =
    fresh.status === "DELIVERED"
      ? await db.generatedAsset.findMany({
          where: { orderId: order.id, status: "READY", archivedAt: null },
          orderBy: { createdAt: "asc" },
          select: { id: true, mediaType: true, mimeType: true, durationSeconds: true, aspectRatio: true },
        })
      : [];

  return {
    ...publicView(fresh, intent),
    deliverables: deliverables.map((a) => ({
      id: a.id,
      mediaType: a.mediaType,
      mimeType: a.mimeType,
      durationSeconds: a.durationSeconds,
      url: `/api/orders/${fresh.publicToken}/assets/${a.id}`,
    })),
  };
}

/**
 * Tries an unpaid order's payment again (after a cancel, a timeout, a wrong PIN
 * or a declined card): a fresh M-Pesa prompt, or a new Paystack checkout.
 */
export async function retryOrderPayment(
  token: string,
  phoneInput: string | undefined,
  request: Request,
  opts: { payWith?: "MPESA" | "PAYSTACK"; email?: string } = {},
) {
  const order = await byToken(token);
  if (!order) throw new ApiError(404, "NOT_FOUND", "We could not find that order.");
  if (order.status !== "PAYMENT_FAILED" && order.status !== "PENDING_PAYMENT") {
    throw new ApiError(409, "CONFLICT", "This order does not need a payment.");
  }

  const current = await latestIntent(order.id);
  if (current && (current.status === "PROCESSING" || current.status === "PENDING")) {
    // Settle what is in flight first, so a slow PIN entry is never charged twice.
    const settled = await settleIntent(current.id);
    if (settled.status === "SUCCEEDED") return { ...publicView(await reload(order.id), settled), message: null };
    if (settled.status !== "FAILED" && Date.now() - settled.createdAt.getTime() < 90_000) {
      throw new ApiError(409, "PAYMENT_IN_PROGRESS", "A payment prompt is still open on the phone. Enter your PIN, or wait a minute and try again.");
    }
  }

  if (opts.payWith === "PAYSTACK") {
    if (!paystackAvailable()) throw new ApiError(409, "METHOD_UNAVAILABLE", "Card payments are not available right now. Pay with M-Pesa.");
    const email = emailField.safeParse(opts.email ?? order.customerEmail ?? undefined);
    if (!email.success || !email.data) throw new ApiError(422, "VALIDATION_FAILED", "Enter your email address for the Paystack receipt.");
    const gate = await hit(`order:checkout:${order.id}`, { limit: 6, windowSec: 15 * 60 });
    if (!gate.allowed) throw new ApiError(429, "RATE_LIMITED", "Too many attempts. Try again in a few minutes.");
    await db.order.updateMany({ where: { id: order.id, status: "PAYMENT_FAILED" }, data: { status: "PENDING_PAYMENT" } });
    const { intent, message } = await collect(order, "PAYSTACK", order.customerPhone, email.data, request);
    return { ...publicView(await reload(order.id), intent), message };
  }

  let phone = order.customerPhone;
  if (phoneInput) {
    const parsed = phoneField.safeParse(phoneInput);
    if (!parsed.success) throw new ApiError(422, "VALIDATION_FAILED", "Enter a Safaricom number, e.g. 0712 345 678");
    phone = parsed.data;
  }

  const limited = await guardPrompts(phone);
  if (limited) return limited;

  await db.order.updateMany({ where: { id: order.id, status: "PAYMENT_FAILED" }, data: { status: "PENDING_PAYMENT" } });
  const { intent, message } = await collect(order, "MPESA", phone, null, request);
  return { ...publicView(await reload(order.id), intent), message };
}

/** A delivered asset of a public order, found by the order's token. */
export async function orderAsset(token: string, assetId: string) {
  const order = await byToken(token);
  if (!order || order.status !== "DELIVERED") return null;
  return db.generatedAsset.findFirst({
    where: { id: assetId, orderId: order.id, status: "READY", archivedAt: null },
  });
}
