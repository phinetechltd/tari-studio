import "server-only";

import { z } from "zod";

import { ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { formatKES } from "@/lib/money";
import {
  DEFAULT_PRICING,
  defaultPricingInput,
  PAID_PLAN_KEYS,
  resolvePricing,
  type Pricing,
  type PricingInput,
} from "@/lib/pricing";
import type { Principal } from "@/lib/rbac";

/**
 * The price list a platform admin sets (Platform admin → Pricing), stored as
 * one JSON PlatformSetting row. Every process reads it through getPricing(),
 * cached for ten seconds, so a change reaches the web servers and the worker
 * within seconds. No row means the defaults in src/lib/pricing.ts.
 *
 * A change applies to new purchases and plan changes. Subscriptions keep the
 * price and monthly credits they were bought at (Subscription.priceCents and
 * creditsPerMonth) until the customer changes plan, so nobody is renewed at a
 * price they never agreed to.
 */

const KEY = "pricing";
const REFRESH_MS = 10_000;

const shillings = (max: number) =>
  z
    .number()
    .int("Prices are whole numbers of cents")
    .min(100, "A price must be at least KES 1")
    .max(max, `A price cannot exceed ${formatKES(max)}`)
    .refine((v) => v % 100 === 0, "Prices are in whole shillings");

const planSchema = z
  .object({
    monthlyCents: shillings(100_000_000),
    annualPerMonthCents: shillings(100_000_000),
    creditsPerMonth: z.number().int().min(1).max(10_000_000),
    parallel: z.number().int().min(1).max(100),
    badge: z.string().trim().max(24).nullable().transform((v) => (v ? v : null)),
  })
  .refine((p) => p.annualPerMonthCents <= p.monthlyCents, {
    message: "The yearly price per month cannot be higher than the monthly price",
    path: ["annualPerMonthCents"],
  });

export const pricingInputSchema = z.object({
  imageCredits: z.number().int().min(1).max(10_000),
  videoCreditsPerStep: z.number().int().min(1).max(100_000),
  freeParallel: z.number().int().min(1).max(100),
  plans: z.object({ BASIC: planSchema, PRO: planSchema, MAX: planSchema }),
  packs: z
    .array(z.object({ credits: z.number().int().min(1).max(10_000_000), cents: shillings(100_000_000) }))
    .min(1, "Keep at least one top-up pack: it sets the pay-as-you-go rate")
    .max(6, "At most six top-up packs")
    .refine((packs) => new Set(packs.map((p) => p.credits)).size === packs.length, "Two packs have the same number of credits"),
  conversion: z.object({
    usdToKes: z.number().min(1).max(10_000),
    margin: z.number().min(0).max(10),
    roundToKes: z.number().int().min(1).max(10_000),
  }),
}) satisfies z.ZodType<PricingInput, z.ZodTypeDef, unknown>;

let cache: { at: number; pricing: Pricing; input: PricingInput; custom: boolean } | null = null;

async function load(): Promise<{ pricing: Pricing; input: PricingInput; custom: boolean }> {
  const row = await db.platformSetting.findUnique({ where: { key: KEY } });
  if (!row?.value) return { pricing: DEFAULT_PRICING, input: defaultPricingInput(), custom: false };
  try {
    const input = pricingInputSchema.parse(JSON.parse(row.value)) as PricingInput;
    return { pricing: resolvePricing(input), input, custom: true };
  } catch (e) {
    // A row that no longer validates (hand-edited, older shape): defaults, loudly.
    console.error("[pricing] stored price list is invalid, using defaults:", e instanceof Error ? e.message : e);
    return { pricing: DEFAULT_PRICING, input: defaultPricingInput(), custom: false };
  }
}

async function current(force = false) {
  if (!force && cache && Date.now() - cache.at < REFRESH_MS) return cache;
  try {
    cache = { at: Date.now(), ...(await load()) };
  } catch {
    // Database down or table missing: keep what we had, or the defaults.
    if (!cache) return { at: 0, pricing: DEFAULT_PRICING, input: defaultPricingInput(), custom: false };
  }
  return cache!;
}

/** The price list in force. */
export async function getPricing(): Promise<Pricing> {
  return (await current()).pricing;
}

export interface PricingStatus {
  input: PricingInput;
  defaults: PricingInput;
  custom: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
}

export async function pricingStatus(): Promise<PricingStatus> {
  const c = await current(true);
  const row = await db.platformSetting.findUnique({ where: { key: KEY }, select: { updatedAt: true, updatedById: true } });
  const by = row?.updatedById ? await db.user.findUnique({ where: { id: row.updatedById }, select: { name: true } }) : null;
  return {
    input: c.input,
    defaults: defaultPricingInput(),
    custom: c.custom,
    updatedAt: row?.updatedAt.toISOString() ?? null,
    updatedBy: by?.name ?? null,
  };
}

function assertAdmin(principal: Principal) {
  if (principal.role !== "SUPER_ADMIN") throw new ApiError(403, "FORBIDDEN", "Only platform admins change pricing.");
}

/** A short, human summary of what changed, for the audit log. */
function diff(before: PricingInput, after: PricingInput): Record<string, string> {
  const out: Record<string, string> = {};
  const note = (k: string, a: unknown, b: unknown, fmt: (v: number) => string = String) => {
    if (a !== b) out[k] = `${typeof a === "number" ? fmt(a) : String(a)} → ${typeof b === "number" ? fmt(b) : String(b)}`;
  };
  note("imageCredits", before.imageCredits, after.imageCredits);
  note("videoCreditsPerStep", before.videoCreditsPerStep, after.videoCreditsPerStep);
  note("freeParallel", before.freeParallel, after.freeParallel);
  for (const key of PAID_PLAN_KEYS) {
    const a = before.plans[key];
    const b = after.plans[key];
    note(`${key}.monthly`, a.monthlyCents, b.monthlyCents, (v) => formatKES(v));
    note(`${key}.yearlyPerMonth`, a.annualPerMonthCents, b.annualPerMonthCents, (v) => formatKES(v));
    note(`${key}.credits`, a.creditsPerMonth, b.creditsPerMonth);
    note(`${key}.parallel`, a.parallel, b.parallel);
    note(`${key}.badge`, a.badge ?? "", b.badge ?? "");
  }
  const packs = (p: PricingInput) => p.packs.map((x) => `${x.credits}=${formatKES(x.cents)}`).sort().join(", ");
  note("packs", packs(before), packs(after));
  return out;
}

/** Saves a new price list. Platform admins only; the route also insists on two-factor sign-in. */
export async function savePricing(principal: Principal, raw: unknown, request?: Request): Promise<PricingStatus> {
  assertAdmin(principal);
  const parsed = pricingInputSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new ApiError(422, "VALIDATION_FAILED", first ? `${first.path.join(".") || "pricing"}: ${first.message}` : "The price list is not valid.", {
      issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  const input = parsed.data as PricingInput;
  const before = (await current(true)).input;

  await db.platformSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, value: JSON.stringify(input), updatedById: principal.userId },
    update: { value: JSON.stringify(input), cipherText: null, iv: null, authTag: null, updatedById: principal.userId },
  });
  await audit({
    organizationId: null,
    userId: principal.userId,
    action: "PRICING_UPDATE",
    entity: "PlatformSetting",
    entityId: KEY,
    changes: diff(before, input),
    request,
  });
  cache = null;
  return pricingStatus();
}

/** Back to the defaults in src/lib/pricing.ts. */
export async function resetPricing(principal: Principal, request?: Request): Promise<PricingStatus> {
  assertAdmin(principal);
  const before = (await current(true)).input;
  await db.platformSetting.deleteMany({ where: { key: KEY } });
  await audit({
    organizationId: null,
    userId: principal.userId,
    action: "PRICING_UPDATE",
    entity: "PlatformSetting",
    entityId: KEY,
    changes: { reset: "back to the defaults", ...diff(before, defaultPricingInput()) },
    request,
  });
  cache = null;
  return pricingStatus();
}

/** Tests only: forget the cached list. */
export function forgetPricingCache(): void {
  cache = null;
}
