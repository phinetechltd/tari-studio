/**
 * What the product costs: the shape of the price list, its defaults, and the
 * arithmetic. Pure, so the browser can quote exactly what the server charges.
 *
 * The numbers themselves are set by a platform admin (Platform admin →
 * Pricing; stored by src/server/pricing-store.ts). Until they change anything
 * the defaults below apply, which are what the owner set on 2 Oct 2026:
 * Higgsfield's pricing structure (higgsfield.ai/pricing, read that day) in
 * Kenyan shillings, each price Higgsfield's US-dollar price × KES 130 × 1.3,
 * rounded *up* to the next KES 50:
 *
 *   plan    Higgsfield            in shillings                credits / month
 *   Free    free                  free                        0 (pay as you go)
 *   Basic   $9                    KES 1,550                   120
 *   Pro     $29 ($23 yearly)      KES 4,950 (KES 3,900)       600
 *   Max     $79 ($59 yearly)      KES 13,400 (KES 10,000)     1,800
 *
 * One credit wallet pays for everything: plan credits, top-up packs, Studio
 * generations and done-for-you orders. Credits never expire. By default an
 * image is 2 credits and video 22 credits per started 5 seconds, Higgsfield's
 * own rates for the models the Studio uses. The smallest top-up pack sets the
 * pay-as-you-go value of a credit, which prices done-for-you orders.
 *
 * Money is integer cents in KES (see ./money.ts). The server always recomputes
 * a price from the stored list; an amount sent by a browser is never trusted.
 */

import type { PlanKey } from "./limits";

// ---------------------------------------------------------------------------
// Fixed rules (not prices)

/** Video is charged per started step: 5 s is one step, 6 to 10 s two. */
export const VIDEO_STEP_SECONDS = 5;
/** The shortest and longest clip the video models accept (Seedance 2.5: 4 to 30 s). */
export const VIDEO_MIN_SECONDS = 4;
export const VIDEO_MAX_SECONDS = 30;
export const MAX_IMAGES_PER_ORDER = 20;

export const BILLING_PLAN_KEYS = ["FREE", "BASIC", "PRO", "MAX"] as const;
export type BillingPlanKey = (typeof BILLING_PLAN_KEYS)[number];
export const PAID_PLAN_KEYS = ["BASIC", "PRO", "MAX"] as const;
export type PaidPlanKey = (typeof PAID_PLAN_KEYS)[number];
export const BILLING_CYCLES = ["MONTHLY", "ANNUAL"] as const;
export type BillingCycle = (typeof BILLING_CYCLES)[number];

export function isPaidPlan(key: unknown): key is PaidPlanKey {
  return key === "BASIC" || key === "PRO" || key === "MAX";
}

export function isBillingCycle(v: unknown): v is BillingCycle {
  return v === "MONTHLY" || v === "ANNUAL";
}

/** What each plan is called and which workspace limits it unlocks (src/lib/limits.ts). */
export const PLAN_META: Record<BillingPlanKey, { name: string; tagline: string; workspacePlan: PlanKey | null }> = {
  FREE: { name: "Free", tagline: "Try the Studio, pay as you go", workspacePlan: null },
  BASIC: { name: "Basic", tagline: "For first-time AI creators", workspacePlan: "STARTER" },
  PRO: { name: "Pro", tagline: "For everyday AI creation", workspacePlan: "GROWTH" },
  MAX: { name: "Max", tagline: "For ambitious AI projects", workspacePlan: "PRO" },
};

/**
 * The image and video tokens sold before 2 Oct 2026 became credits at their
 * shilling value, rounded up in the customer's favour (image token, KES 100 →
 * 8 credits; video token, KES 1,000 → 73). Historical: the migration
 * 20261002190000_credits_billing_paystack used these, so they never change.
 */
export const LEGACY_IMAGE_TOKEN_CREDITS = 8;
export const LEGACY_VIDEO_TOKEN_CREDITS = 73;

export class PricingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PricingError";
  }
}

function assertWhole(n: number, what: string): void {
  if (!Number.isInteger(n)) throw new PricingError(`${what} must be a whole number`);
}

// ---------------------------------------------------------------------------
// The editable price list

export interface PlanPriceInput {
  monthlyCents: number;
  /** The per-month price when paid for a year at once */
  annualPerMonthCents: number;
  creditsPerMonth: number;
  /** Generations that may run at the same time (Higgsfield's concurrent jobs) */
  parallel: number;
  badge: string | null;
}

export interface Conversion {
  usdToKes: number;
  /** 0.3 = 30% */
  margin: number;
  roundToKes: number;
}

/** What a platform admin edits. Stored as JSON (PlatformSetting "pricing"). */
export interface PricingInput {
  imageCredits: number;
  videoCreditsPerStep: number;
  freeParallel: number;
  plans: Record<PaidPlanKey, PlanPriceInput>;
  packs: Array<{ credits: number; cents: number }>;
  /** The rate and margin last used to recalculate from Higgsfield's dollars */
  conversion: Conversion;
}

export interface BillingPlan {
  key: BillingPlanKey;
  name: string;
  tagline: string;
  badge: string | null;
  creditsPerMonth: number;
  monthlyCents: number;
  annualPerMonthCents: number;
  /** What a year costs, paid up front */
  annualCents: number;
  parallel: number;
  workspacePlan: PlanKey | null;
}

export interface CreditPack {
  key: string;
  credits: number;
  cents: number;
}

/** The resolved price list everything else reads. Plain data: safe to pass to the browser. */
export interface Pricing {
  imageCredits: number;
  videoCreditsPerStep: number;
  videoStepSeconds: number;
  plans: Record<BillingPlanKey, BillingPlan>;
  packs: CreditPack[];
  /** The pay-as-you-go value of one credit: the smallest pack's rate */
  creditValueCents: number;
  conversion: Conversion;
}

// ---------------------------------------------------------------------------
// Defaults: Higgsfield's dollars in shillings

/** Higgsfield's prices on 2 Oct 2026, for the defaults and the editor's "recalculate". */
export const HIGGSFIELD_USD = {
  plans: {
    BASIC: { monthly: 9, annualPerMonth: 9 },
    PRO: { monthly: 29, annualPerMonth: 23 },
    MAX: { monthly: 79, annualPerMonth: 59 },
  } satisfies Record<PaidPlanKey, { monthly: number; annualPerMonth: number }>,
  /** The 40-credit pack is Higgsfield's one-time $3 offer; 200 and 1,000 are the same rate. */
  packs: [
    { credits: 40, usd: 3 },
    { credits: 200, usd: 15 },
    { credits: 1000, usd: 75 },
  ],
} as const;

export const DEFAULT_CONVERSION: Conversion = { usdToKes: 130, margin: 0.3, roundToKes: 50 };

/** A dollar price in shillings (cents): × rate × (1 + margin), rounded up to `roundToKes`. */
export function kesCentsFromUsd(usd: number, c: Conversion = DEFAULT_CONVERSION): number {
  if (usd <= 0) return 0;
  const kes = usd * c.usdToKes * (1 + c.margin);
  // The epsilon keeps 1500.0000000002 from rounding up to 1550.
  return Math.ceil(kes / c.roundToKes - 1e-9) * c.roundToKes * 100;
}

/** Plan and pack prices recalculated from Higgsfield's dollars; credits and the rest kept from `base`. */
export function recalculateFromUsd(base: PricingInput, c: Conversion): PricingInput {
  const plans = { ...base.plans };
  for (const key of PAID_PLAN_KEYS) {
    const usd = HIGGSFIELD_USD.plans[key];
    plans[key] = { ...plans[key], monthlyCents: kesCentsFromUsd(usd.monthly, c), annualPerMonthCents: kesCentsFromUsd(usd.annualPerMonth, c) };
  }
  const packs = HIGGSFIELD_USD.packs.map((p) => ({ credits: p.credits, cents: kesCentsFromUsd(p.usd, c) }));
  return { ...base, plans, packs, conversion: c };
}

export function defaultPricingInput(): PricingInput {
  const base: PricingInput = {
    imageCredits: 2,
    videoCreditsPerStep: 22,
    freeParallel: 1,
    plans: {
      BASIC: { monthlyCents: 0, annualPerMonthCents: 0, creditsPerMonth: 120, parallel: 2, badge: null },
      PRO: { monthlyCents: 0, annualPerMonthCents: 0, creditsPerMonth: 600, parallel: 3, badge: "Most popular" },
      MAX: { monthlyCents: 0, annualPerMonthCents: 0, creditsPerMonth: 1800, parallel: 8, badge: "Best value" },
    },
    packs: [],
    conversion: DEFAULT_CONVERSION,
  };
  return recalculateFromUsd(base, DEFAULT_CONVERSION);
}

/** Turns an admin's input into the price list the rest of the system reads. */
export function resolvePricing(input: PricingInput): Pricing {
  const packs = [...input.packs]
    .sort((a, b) => a.credits - b.credits)
    .map((p) => ({ key: `PACK_${p.credits}`, credits: p.credits, cents: p.cents }));
  const plan = (key: BillingPlanKey, p: PlanPriceInput | null): BillingPlan => ({
    key,
    ...PLAN_META[key],
    badge: p?.badge ?? null,
    creditsPerMonth: p?.creditsPerMonth ?? 0,
    monthlyCents: p?.monthlyCents ?? 0,
    annualPerMonthCents: p?.annualPerMonthCents ?? 0,
    annualCents: (p?.annualPerMonthCents ?? 0) * 12,
    parallel: p?.parallel ?? input.freeParallel,
  });
  const smallest = packs[0];
  return {
    imageCredits: input.imageCredits,
    videoCreditsPerStep: input.videoCreditsPerStep,
    videoStepSeconds: VIDEO_STEP_SECONDS,
    plans: {
      FREE: plan("FREE", null),
      BASIC: plan("BASIC", input.plans.BASIC),
      PRO: plan("PRO", input.plans.PRO),
      MAX: plan("MAX", input.plans.MAX),
    },
    packs,
    creditValueCents: smallest ? smallest.cents / smallest.credits : 0,
    conversion: input.conversion,
  };
}

export const DEFAULT_PRICING: Pricing = resolvePricing(defaultPricingInput());

// ---------------------------------------------------------------------------
// Arithmetic, always against a price list

/** Credits a clip of `seconds` costs. */
export function videoCreditsFor(p: Pricing, seconds: number): number {
  assertWhole(seconds, "Video length");
  if (seconds < VIDEO_MIN_SECONDS || seconds > VIDEO_MAX_SECONDS) {
    throw new PricingError(`Video length must be between ${VIDEO_MIN_SECONDS} and ${VIDEO_MAX_SECONDS} seconds`);
  }
  return Math.ceil(seconds / p.videoStepSeconds) * p.videoCreditsPerStep;
}

export function imageCreditsFor(p: Pricing, images: number): number {
  assertWhole(images, "Number of images");
  if (images < 1) throw new PricingError("Choose at least one image");
  return images * p.imageCredits;
}

/** What one billing period of a plan costs. */
export function planPriceCents(p: Pricing, key: PaidPlanKey, cycle: BillingCycle): number {
  const plan = p.plans[key];
  return cycle === "ANNUAL" ? plan.annualCents : plan.monthlyCents;
}

/** What paying yearly saves over twelve monthly payments. */
export function annualSavingCents(p: Pricing, key: PaidPlanKey): number {
  const plan = p.plans[key];
  return plan.monthlyCents * 12 - plan.annualCents;
}

/** The best yearly discount across the paid plans, in whole percent (rounded down). */
export function maxAnnualSavingPercent(p: Pricing): number {
  let best = 0;
  for (const key of PAID_PLAN_KEYS) {
    const plan = p.plans[key];
    if (plan.monthlyCents > 0) best = Math.max(best, 1 - plan.annualPerMonthCents / plan.monthlyCents);
  }
  return Math.floor(best * 100 + 1e-9);
}

/** What a month of credits buys, as the plan cards show it. */
export function creditsBuy(p: Pricing, credits: number): { images: number; videos5s: number } {
  return { images: Math.floor(credits / p.imageCredits), videos5s: Math.floor(credits / p.videoCreditsPerStep) };
}

export function packByKey(p: Pricing, key: unknown): CreditPack | null {
  return p.packs.find((x) => x.key === key) ?? null;
}

/** Shillings for `credits` at the pay-as-you-go rate, rounded up to a whole shilling. */
export function creditsToCents(p: Pricing, credits: number): number {
  assertWhole(credits, "Credits");
  return Math.ceil((credits * p.creditValueCents) / 100) * 100;
}

// ---------------------------------------------------------------------------
// Done-for-you orders from the landing page

export type OrderRequest =
  | { kind: "IMAGE"; images: number }
  | { kind: "VIDEO"; seconds: number };

export interface CreditOrderQuote {
  images: number;
  videoSeconds: number;
  credits: number;
  amountCents: number;
}

/** Credits and price for a done-for-you order: the credits it uses, at the pay-as-you-go rate. */
export function quoteCreditOrder(p: Pricing, req: OrderRequest): CreditOrderQuote {
  if (req.kind === "IMAGE") {
    assertWhole(req.images, "Number of images");
    if (req.images < 1 || req.images > MAX_IMAGES_PER_ORDER) {
      throw new PricingError(`Order between 1 and ${MAX_IMAGES_PER_ORDER} images`);
    }
    const credits = imageCreditsFor(p, req.images);
    return { images: req.images, videoSeconds: 0, credits, amountCents: creditsToCents(p, credits) };
  }
  const credits = videoCreditsFor(p, req.seconds);
  return { images: 0, videoSeconds: req.seconds, credits, amountCents: creditsToCents(p, credits) };
}

// ---------------------------------------------------------------------------
// Extras

/** Services offered on request. No prices: none have been set. */
export interface Extra {
  key: string;
  label: string;
  description: string;
  priceCents: null;
}

export const EXTRAS: readonly Extra[] = [
  { key: "revisions", label: "Revisions", description: "Changes to a delivered image or video.", priceCents: null },
  { key: "copy", label: "Captions and copy", description: "Post captions, headlines and calls to action.", priceCents: null },
  { key: "voiceover", label: "Voice-over", description: "Narration recorded for your video.", priceCents: null },
  { key: "music", label: "Music and sound", description: "A soundtrack matched to the video.", priceCents: null },
  { key: "subtitles", label: "Subtitles", description: "Burned-in or separate subtitle files.", priceCents: null },
  { key: "resizes", label: "Platform resizes", description: "Cuts for Reels, TikTok, Stories, YouTube and print.", priceCents: null },
];

export const EXTRA_KEYS = EXTRAS.map((e) => e.key) as [string, ...string[]];
