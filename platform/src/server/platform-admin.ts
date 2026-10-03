import "server-only";

import type { Prisma } from "@prisma/client";

import { ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { isPaidPlan, PLAN_META, type BillingCycle, type PaidPlanKey } from "@/lib/pricing";
import { ROLES, type Principal, type Role } from "@/lib/rbac";

import { adjustCredits, recentLedger, wallet } from "./credits";
import { settleIntent } from "./payments";
import { getPricing } from "./pricing-store";
import { startComplimentaryPlan } from "./subscription-effects";
import { expire, getSubscription, setAutoRenew } from "./subscriptions";

/**
 * What a platform admin sees and does across every tenant's money: revenue,
 * subscriptions, payments, and hands-on fixes (credits, plans, members).
 *
 * Every change here is audited against the organisation it touches, with the
 * admin as the actor and the reason they gave.
 */

const NAIROBI_OFFSET = "+03:00";

function assertAdmin(principal: Principal) {
  if (principal.role !== "SUPER_ADMIN") throw new ApiError(403, "FORBIDDEN", "Platform admins only.");
}

/** Start of a calendar day in Nairobi, from "2026-10-03". */
function dayStart(day: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const d = new Date(`${day}T00:00:00${NAIROBI_OFFSET}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function monthStart(now = new Date()): Date {
  // The first of this month in Nairobi.
  const local = new Date(now.getTime() + 3 * 3_600_000);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - 3 * 3_600_000);
}

const PROVIDERS = {
  MPESA: ["MPESA_DARAJA", "SIMULATOR"],
  PAYSTACK: ["PAYSTACK", "PAYSTACK_SIMULATOR"],
} as const;

export function methodLabel(provider: string, channel?: string | null): string {
  if (provider.startsWith("PAYSTACK")) return `Paystack${channel ? ` · ${channel.replace("_", " ")}` : ""}${provider.endsWith("SIMULATOR") ? " (simulated)" : ""}`;
  return `M-Pesa${provider === "SIMULATOR" ? " (simulated)" : ""}`;
}

export function purposeLabel(p: { purpose: string; planKey: string | null; billingCycle: string | null; credits: number; automatic: boolean }): string {
  if (p.purpose === "SUBSCRIPTION" && isPaidPlan(p.planKey)) {
    return `${PLAN_META[p.planKey].name} plan, ${p.billingCycle === "ANNUAL" ? "yearly" : "monthly"}${p.automatic ? " (auto-renewal)" : ""}`;
  }
  if (p.purpose === "CREDITS") return `${p.credits.toLocaleString("en-KE")} credits`;
  if (p.purpose === "ORDER") return "Done-for-you order";
  if (p.purpose === "TOKENS") return "Tokens (before credits)";
  return p.purpose;
}

// ---------------------------------------------------------------------------
// Revenue

export interface RevenueSummary {
  monthCents: number;
  monthCount: number;
  last30Cents: number;
  mrrCents: number;
  activePlans: Record<PaidPlanKey, number>;
  complimentary: number;
  pastDue: number;
  failed7d: number;
  processing: number;
  byPurpose: Array<{ purpose: string; cents: number; count: number }>;
  byMethod: Array<{ method: string; cents: number; count: number }>;
}

export async function revenueSummary(now = new Date()): Promise<RevenueSummary> {
  const since30 = new Date(now.getTime() - 30 * 86_400_000);
  const since7 = new Date(now.getTime() - 7 * 86_400_000);
  const paidThisMonth = { status: "SUCCEEDED", completedAt: { gte: monthStart(now) } } satisfies Prisma.PaymentIntentWhereInput;

  const [month, last30, subs, failed7d, processing, byPurpose, byProvider] = await Promise.all([
    db.paymentIntent.aggregate({ where: paidThisMonth, _sum: { amountCents: true }, _count: true }),
    db.paymentIntent.aggregate({ where: { status: "SUCCEEDED", completedAt: { gte: since30 } }, _sum: { amountCents: true } }),
    db.subscription.findMany({ where: { status: { in: ["ACTIVE", "PAST_DUE"] } }, select: { plan: true, cycle: true, status: true, priceCents: true, paymentMethod: true } }),
    db.paymentIntent.count({ where: { status: "FAILED", createdAt: { gte: since7 } } }),
    db.paymentIntent.count({ where: { status: "PROCESSING" } }),
    db.paymentIntent.groupBy({ by: ["purpose"], where: paidThisMonth, _sum: { amountCents: true }, _count: true }),
    db.paymentIntent.groupBy({ by: ["provider"], where: paidThisMonth, _sum: { amountCents: true }, _count: true }),
  ]);

  const activePlans: Record<PaidPlanKey, number> = { BASIC: 0, PRO: 0, MAX: 0 };
  let mrr = 0;
  let complimentary = 0;
  let pastDue = 0;
  for (const s of subs) {
    if (s.status === "PAST_DUE") pastDue += 1;
    if (s.paymentMethod === "COMP") complimentary += 1;
    if (isPaidPlan(s.plan)) activePlans[s.plan] += 1;
    mrr += s.cycle === "ANNUAL" ? Math.round(s.priceCents / 12) : s.priceCents;
  }

  const methods = new Map<string, { cents: number; count: number }>();
  for (const row of byProvider) {
    const m = row.provider.startsWith("PAYSTACK") ? "Paystack" : "M-Pesa";
    const cur = methods.get(m) ?? { cents: 0, count: 0 };
    methods.set(m, { cents: cur.cents + (row._sum.amountCents ?? 0), count: cur.count + row._count });
  }

  return {
    monthCents: month._sum.amountCents ?? 0,
    monthCount: month._count,
    last30Cents: last30._sum.amountCents ?? 0,
    mrrCents: mrr,
    activePlans,
    complimentary,
    pastDue,
    failed7d,
    processing,
    byPurpose: byPurpose.map((r) => ({ purpose: r.purpose, cents: r._sum.amountCents ?? 0, count: r._count })).sort((a, b) => b.cents - a.cents),
    byMethod: [...methods.entries()].map(([method, v]) => ({ method, ...v })).sort((a, b) => b.cents - a.cents),
  };
}

// ---------------------------------------------------------------------------
// Payments

export interface PaymentFilters {
  status?: string;
  purpose?: string;
  method?: string;
  org?: string;
  q?: string;
  from?: string;
  to?: string;
}

export function paymentWhere(f: PaymentFilters): Prisma.PaymentIntentWhereInput {
  const where: Prisma.PaymentIntentWhereInput = {};
  if (f.status && ["SUCCEEDED", "FAILED", "PROCESSING", "PENDING"].includes(f.status)) where.status = f.status;
  if (f.purpose && ["SUBSCRIPTION", "CREDITS", "ORDER", "TOKENS"].includes(f.purpose)) where.purpose = f.purpose;
  if (f.method === "MPESA" || f.method === "PAYSTACK") where.provider = { in: [...PROVIDERS[f.method]] };
  if (f.org) where.organizationId = f.org;
  const from = f.from ? dayStart(f.from) : null;
  const toStart = f.to ? dayStart(f.to) : null;
  if (from || toStart) {
    where.createdAt = {
      ...(from ? { gte: from } : {}),
      ...(toStart ? { lt: new Date(toStart.getTime() + 86_400_000) } : {}),
    };
  }
  const q = f.q?.trim();
  if (q) {
    where.OR = [
      { organization: { name: { contains: q, mode: "insensitive" } } },
      { receiptRef: { contains: q, mode: "insensitive" } },
      { providerRef: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { phone: { contains: q.replace(/\D/g, "") || q } },
      { id: q },
    ];
  }
  return where;
}

export interface PaymentRow {
  id: string;
  createdAt: Date;
  completedAt: Date | null;
  organizationId: string;
  organizationName: string;
  description: string;
  method: string;
  amountCents: number;
  status: string;
  reference: string | null;
  failureReason: string | null;
  automatic: boolean;
}

export async function listPayments(f: PaymentFilters, page = 1, pageSize = 50) {
  const where = paymentWhere(f);
  const [rows, total, collected] = await Promise.all([
    db.paymentIntent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (Math.max(1, page) - 1) * pageSize,
      take: pageSize,
      include: { organization: { select: { name: true } } },
    }),
    db.paymentIntent.count({ where }),
    db.paymentIntent.aggregate({ where: { AND: [where, { status: "SUCCEEDED" }] }, _sum: { amountCents: true }, _count: true }),
  ]);
  return {
    rows: rows.map(
      (p): PaymentRow => ({
        id: p.id,
        createdAt: p.createdAt,
        completedAt: p.completedAt,
        organizationId: p.organizationId,
        organizationName: p.organization.name,
        description: purposeLabel(p),
        method: methodLabel(p.provider, p.channel),
        amountCents: p.amountCents,
        status: p.status,
        reference: p.receiptRef ?? p.providerRef,
        failureReason: p.failureReason,
        automatic: p.automatic,
      }),
    ),
    total,
    collectedCents: collected._sum.amountCents ?? 0,
    collectedCount: collected._count,
    pages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  // Quote everything; neutralise spreadsheet formulas (=, +, -, @ at the start).
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

const eat = (d: Date | null) =>
  d ? d.toLocaleString("en-GB", { timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";

/** Up to 10,000 payments matching the filters, as CSV for accounting. */
export async function paymentsCsv(f: PaymentFilters): Promise<string> {
  const rows = await db.paymentIntent.findMany({
    where: paymentWhere(f),
    orderBy: { createdAt: "desc" },
    take: 10_000,
    include: { organization: { select: { name: true } } },
  });
  const header = ["Created (EAT)", "Completed (EAT)", "Organisation", "For", "Method", "Amount (KES)", "Status", "Receipt / reference", "Failure reason", "Automatic", "Payment ID"];
  const lines = rows.map((p) =>
    [
      eat(p.createdAt),
      eat(p.completedAt),
      p.organization.name,
      purposeLabel(p),
      methodLabel(p.provider, p.channel),
      (p.amountCents / 100).toFixed(2),
      p.status,
      p.receiptRef ?? p.providerRef ?? "",
      p.failureReason ?? "",
      p.automatic ? "yes" : "",
      p.id,
    ]
      .map(csvCell)
      .join(","),
  );
  return String.fromCharCode(0xfeff) + [header.map(csvCell).join(","), ...lines].join("\r\n") + "\r\n";
}

export async function paymentDetail(id: string) {
  return db.paymentIntent.findUnique({
    where: { id },
    include: {
      organization: { select: { id: true, name: true } },
      order: { select: { id: true, number: true, customerName: true } },
      ledger: { select: { id: true, delta: true, reason: true, note: true, createdAt: true } },
    },
  });
}

/** Asks the provider again about a payment (stuck "processing", a disputed failure). */
export async function recheckPayment(principal: Principal, id: string, request?: Request) {
  assertAdmin(principal);
  const before = await db.paymentIntent.findUnique({ where: { id }, select: { status: true, organizationId: true } });
  if (!before) throw new ApiError(404, "NOT_FOUND", "Payment not found.");
  const after = await settleIntent(id);
  await audit({
    organizationId: before.organizationId,
    userId: principal.userId,
    action: "PAYMENT_RECHECK",
    entity: "PaymentIntent",
    entityId: id,
    changes: { before: before.status, after: after.status },
    request,
  });
  return { status: after.status, failureReason: after.failureReason, changed: before.status !== after.status };
}

// ---------------------------------------------------------------------------
// Subscriptions

export interface SubscriptionFilters {
  status?: string;
  plan?: string;
  q?: string;
}

export async function listSubscriptions(f: SubscriptionFilters) {
  const where: Prisma.SubscriptionWhereInput = {};
  if (f.status && ["ACTIVE", "PAST_DUE", "EXPIRED"].includes(f.status)) where.status = f.status;
  if (isPaidPlan(f.plan)) where.plan = f.plan;
  if (f.q?.trim()) where.organization = { name: { contains: f.q.trim(), mode: "insensitive" } };
  const subs = await db.subscription.findMany({
    where,
    orderBy: [{ status: "asc" }, { currentPeriodEnd: "asc" }],
    take: 500,
    include: { organization: { select: { id: true, name: true, status: true } } },
  });
  return subs.map((s) => ({
    id: s.id,
    organizationId: s.organization.id,
    organizationName: s.organization.name,
    organizationStatus: s.organization.status,
    plan: isPaidPlan(s.plan) ? PLAN_META[s.plan].name : s.plan,
    cycle: s.cycle === "ANNUAL" ? "Yearly" : "Monthly",
    status: s.status,
    source: s.paymentMethod === "COMP" ? "Complimentary" : s.paymentMethod === "PAYSTACK" ? (s.cardLabel ?? "Paystack") : "M-Pesa",
    autoRenew: s.autoRenew,
    priceCents: s.priceCents,
    creditsPerMonth: s.creditsPerMonth,
    currentPeriodEnd: s.currentPeriodEnd,
    renewalAttempts: s.renewalAttempts,
  }));
}

// ---------------------------------------------------------------------------
// One organisation

export async function organizationBilling(organizationId: string) {
  const [subscription, balance, ledger, payments, paidTotal] = await Promise.all([
    getSubscription(organizationId),
    wallet(organizationId),
    recentLedger(organizationId, 15),
    db.paymentIntent.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" }, take: 10 }),
    db.paymentIntent.aggregate({ where: { organizationId, status: "SUCCEEDED" }, _sum: { amountCents: true } }),
  ]);
  return {
    subscription,
    balance,
    ledger,
    paidTotalCents: paidTotal._sum.amountCents ?? 0,
    payments: payments.map((p) => ({
      id: p.id,
      createdAt: p.createdAt,
      description: purposeLabel(p),
      method: methodLabel(p.provider, p.channel),
      amountCents: p.amountCents,
      status: p.status,
    })),
  };
}

async function orgOrThrow(organizationId: string) {
  const org = await db.organization.findUnique({ where: { id: organizationId }, select: { id: true, name: true } });
  if (!org) throw new ApiError(404, "NOT_FOUND", "No such organisation.");
  return org;
}

function requireReason(reason: string | undefined): string {
  const r = reason?.trim() ?? "";
  if (r.length < 3) throw new ApiError(422, "VALIDATION_FAILED", "Say why, in a few words. It goes in the audit log.");
  return r.slice(0, 300);
}

export async function adminAdjustCredits(principal: Principal, organizationId: string, delta: number, reason: string, request?: Request) {
  assertAdmin(principal);
  await orgOrThrow(organizationId);
  const note = requireReason(reason);
  const balance = await adjustCredits({ organizationId, delta, note: `Platform admin: ${note}`, createdById: principal.userId });
  await audit({
    organizationId,
    userId: principal.userId,
    action: "CREDITS_ADJUST",
    entity: "Organization",
    entityId: organizationId,
    changes: { delta, balance, reason: note },
    request,
  });
  return { balance };
}

export type SubscriptionAction =
  | { action: "grant"; plan: PaidPlanKey; cycle: BillingCycle; reason: string }
  | { action: "extend"; days: number; reason: string }
  | { action: "end"; reason: string }
  | { action: "renewal"; on: boolean };

export async function adminManageSubscription(principal: Principal, organizationId: string, input: SubscriptionAction, request?: Request) {
  assertAdmin(principal);
  await orgOrThrow(organizationId);

  if (input.action === "renewal") {
    return setAutoRenew({ organizationId, userId: principal.userId, request }, input.on);
  }

  const reason = requireReason(input.reason);
  const sub = await db.subscription.findUnique({ where: { organizationId } });

  if (input.action === "grant") {
    const pricing = await getPricing();
    const credits = pricing.plans[input.plan].creditsPerMonth;
    await db.$transaction((tx) => startComplimentaryPlan(tx, { organizationId, plan: input.plan, cycle: input.cycle, creditsPerMonth: credits, note: reason }));
    await audit({
      organizationId,
      userId: principal.userId,
      action: "SUBSCRIPTION_GRANT",
      entity: "Subscription",
      entityId: organizationId,
      changes: { plan: input.plan, cycle: input.cycle, creditsPerMonth: credits, replaced: sub && sub.status !== "EXPIRED" ? `${sub.plan} ${sub.cycle}` : null, reason },
      request,
    });
    return getSubscription(organizationId);
  }

  if (!sub || sub.status === "EXPIRED") throw new ApiError(409, "CONFLICT", "There is no running plan to change.");

  if (input.action === "extend") {
    if (!Number.isInteger(input.days) || input.days < 1 || input.days > 366) {
      throw new ApiError(422, "VALIDATION_FAILED", "Extend by 1 to 366 days.");
    }
    const end = new Date(sub.currentPeriodEnd.getTime() + input.days * 86_400_000);
    await db.subscription.update({
      where: { id: sub.id },
      // A plan that was failing to renew gets a fresh start at the new end date.
      data: { currentPeriodEnd: end, status: "ACTIVE", renewalAttempts: 0, nextRenewalAttemptAt: null },
    });
    await audit({
      organizationId,
      userId: principal.userId,
      action: "SUBSCRIPTION_EXTEND",
      entity: "Subscription",
      entityId: sub.id,
      changes: { days: input.days, from: sub.currentPeriodEnd.toISOString(), to: end.toISOString(), reason },
      request,
    });
    return getSubscription(organizationId);
  }

  // end now
  await expire(sub, `Ended by a platform admin: ${reason}.`);
  await audit({
    organizationId,
    userId: principal.userId,
    action: "SUBSCRIPTION_END",
    entity: "Subscription",
    entityId: sub.id,
    changes: { plan: sub.plan, reason },
    request,
  });
  return getSubscription(organizationId);
}

export async function renameOrganization(principal: Principal, organizationId: string, name: string, request?: Request) {
  assertAdmin(principal);
  const org = await orgOrThrow(organizationId);
  const clean = name.trim();
  if (clean.length < 2 || clean.length > 120) throw new ApiError(422, "VALIDATION_FAILED", "Enter a name between 2 and 120 characters.");
  await db.organization.update({ where: { id: organizationId }, data: { name: clean } });
  await audit({ organizationId, userId: principal.userId, action: "UPDATE", entity: "Organization", entityId: organizationId, changes: { name: `${org.name} → ${clean}` }, request });
  return { name: clean };
}

// ---------------------------------------------------------------------------
// Members

/**
 * Changes a member's role or suspends/reactivates them. An organisation always
 * keeps at least one active Owner: the last one cannot be demoted or suspended.
 */
export async function adminUpdateMember(
  principal: Principal,
  organizationId: string,
  membershipId: string,
  input: { role?: string; status?: "ACTIVE" | "SUSPENDED" },
  request?: Request,
) {
  assertAdmin(principal);
  const m = await db.membership.findFirst({ where: { id: membershipId, organizationId }, include: { user: { select: { email: true } } } });
  if (!m) throw new ApiError(404, "NOT_FOUND", "No such member.");
  if (input.role && (input.role === "SUPER_ADMIN" || !(ROLES as readonly string[]).includes(input.role))) {
    throw new ApiError(422, "VALIDATION_FAILED", "Unknown role.");
  }
  const losesOwner = m.role === "OWNER" && m.status === "ACTIVE" && ((input.role && input.role !== "OWNER") || input.status === "SUSPENDED");
  if (losesOwner) {
    const owners = await db.membership.count({ where: { organizationId, role: "OWNER", status: "ACTIVE" } });
    if (owners <= 1) throw new ApiError(409, "LAST_OWNER", "This is the only active Owner. Make someone else an Owner first.");
  }
  const updated = await db.membership.update({
    where: { id: m.id },
    data: { ...(input.role ? { role: input.role as Role } : {}), ...(input.status ? { status: input.status } : {}) },
  });
  await audit({
    organizationId,
    userId: principal.userId,
    action: "MEMBER_UPDATE",
    entity: "Membership",
    entityId: m.id,
    changes: {
      member: m.user.email,
      ...(input.role && input.role !== m.role ? { role: `${m.role} → ${input.role}` } : {}),
      ...(input.status && input.status !== m.status ? { status: `${m.status} → ${input.status}` } : {}),
    },
    request,
  });
  return { role: updated.role, status: updated.status };
}

