import "server-only";

import type { Order, Prisma } from "@prisma/client";
import { z } from "zod";

import { ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { PRODUCT_NAME } from "@/lib/brand";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { ASPECT_RATIOS } from "@/lib/generation-models";
import { formatKES } from "@/lib/money";
import { nextNumber } from "@/lib/numbering";
import { EXTRA_KEYS, MAX_IMAGES_PER_ORDER, PricingError, quoteCreditOrder, VIDEO_MAX_SECONDS, VIDEO_MIN_SECONDS } from "@/lib/pricing";
import type { Principal } from "@/lib/rbac";
import { kenyanMsisdn } from "@/lib/sms";

import { renderEmail, sendEmail } from "./email";
import { emailField, linkField, newPublicToken, ordersOrganization, phoneField } from "./orders";
import { getPricing } from "./pricing-store";
import { sendSms, smsMode } from "./sms";

/**
 * Order management for platform admins. Customers ask for work on the public
 * form (src/server/orders.ts); the admin decides the price here, can correct
 * the details, enters orders taken by phone or WhatsApp, and submits the
 * priced order, which sends the customer to their order page to pay.
 *
 * Money rules:
 *   - the price is a whole number of shillings, set only by an admin;
 *   - it cannot change once the order is paid, or while a payment is in flight
 *     (the customer could be charged the old amount);
 *   - every change is audited against the orders organisation with the reason.
 */

function assertAdmin(principal: Principal) {
  if (principal.role !== "SUPER_ADMIN") throw new ApiError(403, "FORBIDDEN", "Platform admins only.");
}

/** Statuses in which an order's details and price may still be changed. */
const EDITABLE = ["REQUESTED", "PENDING_PAYMENT", "PAYMENT_FAILED"] as const;

export const ORDER_STATUSES = ["REQUESTED", "PENDING_PAYMENT", "PAYMENT_FAILED", "PAID", "IN_PRODUCTION", "DELIVERED", "CANCELLED"] as const;

export const STATUS_LABEL: Record<string, string> = {
  REQUESTED: "Needs a price",
  PENDING_PAYMENT: "Awaiting payment",
  PAYMENT_FAILED: "Payment failed",
  PAID: "Paid",
  IN_PRODUCTION: "In production",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

const priceField = z
  .number()
  .int("The price must be a whole number")
  .min(100, "The price must be at least KES 1")
  .max(10_000_000, "The price cannot be more than KES 100,000")
  .refine((v) => v % 100 === 0, "The price must be in whole shillings");

// ---------------------------------------------------------------------------
// Reading

export interface AdminOrderFilters {
  status?: string;
  source?: string;
  q?: string;
}

const PAGE_SIZE = 25;

export async function listOrders(filters: AdminOrderFilters, page = 1) {
  const where: Prisma.OrderWhereInput = {};
  if (filters.status && (ORDER_STATUSES as readonly string[]).includes(filters.status)) where.status = filters.status;
  if (filters.source === "PUBLIC" || filters.source === "ADMIN") where.source = filters.source;
  const q = filters.q?.trim();
  if (q) {
    where.OR = [
      { number: { contains: q, mode: "insensitive" } },
      { customerName: { contains: q, mode: "insensitive" } },
      { customerPhone: { contains: q.replace(/\D/g, "") || q } },
      { customerEmail: { contains: q, mode: "insensitive" } },
      { businessName: { contains: q, mode: "insensitive" } },
    ];
  }
  const [rows, total, grouped] = await Promise.all([
    db.order.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    db.order.count({ where }),
    db.order.groupBy({ by: ["status"], _count: true }),
  ]);
  const counts: Record<string, number> = {};
  for (const g of grouped) counts[g.status] = g._count;
  return { rows, total, page, pageSize: PAGE_SIZE, counts };
}

export async function getOrder(id: string) {
  const order = await db.order.findUnique({
    where: { id },
    include: {
      paymentIntents: { orderBy: { createdAt: "desc" } },
      organization: { select: { id: true, name: true } },
      studioThreads: { where: { archivedAt: null }, select: { id: true }, take: 1 },
    },
  });
  if (!order) throw new ApiError(404, "NOT_FOUND", "Order not found.");
  const readyFiles = await db.generatedAsset.count({ where: { orderId: id, status: "READY", archivedAt: null } });
  const pricedBy = order.pricedById ? await db.user.findUnique({ where: { id: order.pricedById }, select: { name: true } }) : null;
  return { order, readyFiles, pricedByName: pricedBy?.name ?? null };
}

// ---------------------------------------------------------------------------
// Changing

const detailsSchema = z.object({
  kind: z.enum(["IMAGE", "VIDEO", "QUOTE"]).optional(),
  images: z.coerce.number().int().min(1).max(MAX_IMAGES_PER_ORDER).optional(),
  seconds: z.coerce.number().int().min(VIDEO_MIN_SECONDS).max(VIDEO_MAX_SECONDS).optional(),
  aspectRatio: z.enum(ASPECT_RATIOS).nullable().optional(),
  brief: z.string().trim().min(3, "Write the brief").max(4000).optional(),
  extras: z.array(z.enum(EXTRA_KEYS)).max(EXTRA_KEYS.length).optional(),
  // Absent means "leave as it is"; the shared fields turn a missing value into null, so guard them.
  referenceLink: z.undefined().or(linkField),
  name: z.string().trim().min(2).max(120).optional(),
  phone: phoneField.optional(),
  email: z.undefined().or(emailField),
  business: z.string().trim().max(160).nullable().optional(),
  adminNote: z.string().trim().max(2000).nullable().optional(),
});

export const updateOrderSchema = z.object({
  details: detailsSchema.optional(),
  /** Whole shillings, in cents (KES 1,500 is 150000) */
  amountCents: priceField.optional(),
  /** Why the price is what it is; required when the price changes */
  reason: z.string().trim().max(300).optional(),
});

export type UpdateOrderInput = z.infer<typeof updateOrderSchema>;

async function orderOrThrow(id: string): Promise<Order> {
  const order = await db.order.findUnique({ where: { id } });
  if (!order) throw new ApiError(404, "NOT_FOUND", "Order not found.");
  return order;
}

async function assertNoPaymentInFlight(orderId: string) {
  const open = await db.paymentIntent.count({ where: { orderId, status: { in: ["PENDING", "PROCESSING"] } } });
  if (open > 0) {
    throw new ApiError(409, "PAYMENT_IN_PROGRESS", "A payment is in flight for this order. Wait for it to settle (Payments, Recheck) before changing the price.");
  }
}

/** Re-prices the order's calculator estimate and quantities from its (new) details. */
async function recalculated(order: Order, d: z.infer<typeof detailsSchema>) {
  const kind = d.kind ?? order.kind;
  if (kind === "QUOTE") return { kind, imageTokens: 0, videoSeconds: 0, credits: 0, suggestedCents: 0 };
  try {
    const quote = quoteCreditOrder(
      await getPricing(),
      kind === "IMAGE" ? { kind: "IMAGE", images: d.images ?? Math.max(1, order.imageTokens) } : { kind: "VIDEO", seconds: d.seconds ?? (order.videoSeconds || VIDEO_MIN_SECONDS) },
    );
    return { kind, imageTokens: quote.images, videoSeconds: quote.videoSeconds, credits: quote.credits, suggestedCents: quote.amountCents };
  } catch (e) {
    if (e instanceof PricingError) throw new ApiError(422, "VALIDATION_FAILED", e.message);
    throw e;
  }
}

export async function updateOrder(principal: Principal, id: string, input: UpdateOrderInput, request?: Request) {
  assertAdmin(principal);
  const order = await orderOrThrow(id);
  const data: Prisma.OrderUpdateInput = {};
  const changes: Record<string, unknown> = {};

  const d = input.details;
  if (d) {
    const touchesWork = d.kind !== undefined || d.images !== undefined || d.seconds !== undefined || d.aspectRatio !== undefined || d.brief !== undefined || d.extras !== undefined || d.referenceLink !== undefined;
    const touchesCustomer = d.name !== undefined || d.phone !== undefined || d.email !== undefined || d.business !== undefined;
    if ((touchesWork || touchesCustomer) && !(EDITABLE as readonly string[]).includes(order.status)) {
      throw new ApiError(409, "CONFLICT", "Once an order is paid its details are fixed. You can still add a note.");
    }
    if (touchesWork) {
      if (d.kind !== undefined || d.images !== undefined || d.seconds !== undefined) Object.assign(data, await recalculated(order, d));
      if (d.aspectRatio !== undefined) data.aspectRatio = d.aspectRatio;
      if (d.brief !== undefined) data.brief = d.brief;
      if (d.extras !== undefined) data.extras = d.extras;
      if (d.referenceLink !== undefined) data.referenceLink = d.referenceLink;
    }
    if (d.name !== undefined) data.customerName = d.name;
    if (d.phone !== undefined) data.customerPhone = d.phone;
    if (d.email !== undefined) data.customerEmail = d.email;
    if (d.business !== undefined) data.businessName = d.business;
    if (d.adminNote !== undefined) data.adminNote = d.adminNote;
    changes.details = Object.keys(d).filter((k) => (d as Record<string, unknown>)[k] !== undefined);
  }

  let priceChanged = false;
  if (input.amountCents !== undefined && input.amountCents !== order.amountCents) {
    if (!(EDITABLE as readonly string[]).includes(order.status)) {
      throw new ApiError(409, "CONFLICT", "The price cannot change once the order is paid.");
    }
    const reason = input.reason?.trim() ?? "";
    if (reason.length < 3) throw new ApiError(422, "VALIDATION_FAILED", "Say why the price is what it is, in a few words. It goes in the audit log.");
    await assertNoPaymentInFlight(id);
    data.amountCents = input.amountCents;
    data.pricedById = principal.userId;
    data.pricedAt = new Date();
    // A failed attempt at the old price is history; the customer may pay the new one.
    if (order.status === "PAYMENT_FAILED") data.status = "PENDING_PAYMENT";
    changes.price = { from: order.amountCents, to: input.amountCents, reason };
    priceChanged = true;
  }

  if (Object.keys(data).length === 0) return getOrder(id);
  await db.order.update({ where: { id }, data });

  await audit({
    organizationId: order.organizationId,
    userId: principal.userId,
    action: priceChanged ? "ORDER_PRICE_SET" : "ORDER_UPDATE",
    entity: "Order",
    entityId: id,
    changes,
    request,
  });
  return getOrder(id);
}

/** Tells the customer their order is priced, by SMS and email where we have the details. Best effort. */
async function tellCustomer(order: Order): Promise<{ sms: boolean; email: boolean }> {
  const url = `${env().APP_BASE_URL.replace(/\/$/, "")}/order/${order.publicToken}`;
  const result = { sms: false, email: false };
  const to = kenyanMsisdn(order.customerPhone);
  if (to && smsMode() !== "off") {
    try {
      const r = await sendSms({ to, text: `${PRODUCT_NAME}: your order ${order.number} is ready at ${formatKES(order.amountCents)}. Pay and follow it here: ${url}` });
      result.sms = r.ok;
    } catch {
      /* the order page still works; the admin sees "not sent" */
    }
  }
  if (order.customerEmail) {
    try {
      const mail = renderEmail({
        product: PRODUCT_NAME,
        title: `Your order ${order.number} is ready to pay`,
        body: `The price for your request is ${formatKES(order.amountCents)}. Pay by M-Pesa or card on your private order page and we start straight away.`,
        action: { label: "Open your order", url },
      });
      const r = await sendEmail({ to: order.customerEmail, subject: `${PRODUCT_NAME}: your order ${order.number} is ready to pay`, text: mail.text, html: mail.html });
      result.email = r.ok;
    } catch {
      /* ditto */
    }
  }
  return result;
}

/** Sends a priced order to the customer for payment. */
export async function submitOrder(principal: Principal, id: string, request?: Request) {
  assertAdmin(principal);
  const order = await orderOrThrow(id);
  if (order.status !== "REQUESTED") throw new ApiError(409, "CONFLICT", "Only a request that is waiting for a price can be submitted.");
  if (order.amountCents < 100) throw new ApiError(422, "VALIDATION_FAILED", "Set the price before submitting the order.");

  const moved = await db.order.updateMany({ where: { id, status: "REQUESTED" }, data: { status: "PENDING_PAYMENT", submittedAt: new Date() } });
  if (moved.count === 0) throw new ApiError(409, "CONFLICT", "That order was just submitted by someone else.");
  const fresh = await orderOrThrow(id);
  const notified = await tellCustomer(fresh);
  await audit({
    organizationId: order.organizationId,
    userId: principal.userId,
    action: "ORDER_SUBMIT",
    entity: "Order",
    entityId: id,
    changes: { amountCents: fresh.amountCents, notified },
    request,
  });
  return { ...(await getOrder(id)), notified };
}

// ---------------------------------------------------------------------------
// Entering an order for a customer

export const adminOrderSchema = z
  .object({
    kind: z.enum(["IMAGE", "VIDEO", "QUOTE"]),
    images: z.coerce.number().int().min(1).max(MAX_IMAGES_PER_ORDER).optional(),
    seconds: z.coerce.number().int().min(VIDEO_MIN_SECONDS).max(VIDEO_MAX_SECONDS).optional(),
    aspectRatio: z.enum(ASPECT_RATIOS).optional(),
    brief: z.string().trim().min(3, "Write the brief").max(4000),
    extras: z.array(z.enum(EXTRA_KEYS)).max(EXTRA_KEYS.length).default([]),
    referenceLink: linkField,
    name: z.string().trim().min(2, "Customer name").max(120),
    phone: phoneField,
    email: emailField,
    business: z.string().trim().max(160).optional(),
    amountCents: priceField,
    /** Send it to the customer for payment straight away */
    submit: z.boolean().default(true),
    adminNote: z.string().trim().max(2000).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.kind === "IMAGE" && !v.images) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["images"], message: "How many images?" });
    if (v.kind === "VIDEO" && !v.seconds) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["seconds"], message: "How many seconds?" });
  });

export async function createOrderForCustomer(principal: Principal, input: z.infer<typeof adminOrderSchema>, request?: Request) {
  assertAdmin(principal);
  const org = await ordersOrganization();
  const calc = await recalculated({ kind: input.kind, imageTokens: 0, videoSeconds: 0 } as Order, input);

  const order = await db.$transaction(async (tx) => {
    const number = await nextNumber(org.id, "ORDER", tx);
    return tx.order.create({
      data: {
        organizationId: org.id,
        number,
        publicToken: newPublicToken(),
        kind: input.kind,
        status: input.submit ? "PENDING_PAYMENT" : "REQUESTED",
        source: "ADMIN",
        customerName: input.name,
        customerPhone: input.phone,
        customerEmail: input.email,
        businessName: input.business || null,
        brief: input.brief,
        imageTokens: calc.imageTokens,
        videoSeconds: calc.videoSeconds,
        credits: calc.credits,
        suggestedCents: calc.suggestedCents,
        aspectRatio: input.aspectRatio ?? null,
        extras: input.extras,
        referenceLink: input.referenceLink,
        amountCents: input.amountCents,
        adminNote: input.adminNote || null,
        pricedById: principal.userId,
        pricedAt: new Date(),
        submittedAt: input.submit ? new Date() : null,
      },
    });
  });
  const notified = input.submit ? await tellCustomer(order) : null;
  await audit({
    organizationId: org.id,
    userId: principal.userId,
    action: "ORDER_ADMIN_CREATE",
    entity: "Order",
    entityId: order.id,
    changes: { number: order.number, kind: order.kind, amountCents: order.amountCents, submitted: input.submit, notified },
    request,
  });
  return { id: order.id, number: order.number, token: order.publicToken, status: order.status, notified };
}
