"use client";

import { Check, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { formatKES } from "@/lib/money";
import {
  annualSavingCents,
  creditsBuy,
  isPaidPlan,
  maxAnnualSavingPercent,
  type BillingCycle,
  type BillingPlan,
  type BillingPlanKey,
  type PaidPlanKey,
  type Pricing,
} from "@/lib/pricing";
import { cn } from "@/lib/utils";

function features(p: Pricing, plan: BillingPlan): string[] {
  if (plan.key === "FREE") {
    return [
      "Top up credits whenever you need them",
      "Images and video in the Studio",
      `${plan.parallel} generation${plan.parallel === 1 ? "" : "s"} at a time`,
      "Pay by M-Pesa or card",
    ];
  }
  const buys = creditsBuy(p, plan.creditsPerMonth);
  return [
    `${plan.creditsPerMonth.toLocaleString("en-KE")} credits every month`,
    `≈ ${buys.images.toLocaleString("en-KE")} images or ${buys.videos5s} five-second videos`,
    `${plan.parallel} generations at once`,
    "Higher workspace limits: brands, seats, scheduled posts",
    "Credits never expire",
  ];
}

export function CycleToggle({ cycle, onChange, saving }: { cycle: BillingCycle; onChange: (c: BillingCycle) => void; saving: number }) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-wash/10 bg-wash/[0.04] p-1" role="radiogroup" aria-label="Billing period">
      {(["MONTHLY", "ANNUAL"] as const).map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={cycle === c}
          onClick={() => onChange(c)}
          className={cn(
            "flex min-h-[38px] items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors",
            cycle === c ? "bg-white text-black" : "text-ink/70 hover:text-ink",
          )}
        >
          {c === "MONTHLY" ? "Monthly" : "Yearly"}
          {c === "ANNUAL" && saving > 0 ? (
            <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold", cycle === c ? "bg-[#C8321E] text-white" : "bg-[#C8321E]/25 text-[#FF9A85]")}>
              Save up to {saving}%
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

/**
 * The four plans, Higgsfield's structure in shillings (src/lib/pricing.ts).
 * Public pages link each plan to Billing (signing in first); the Billing page
 * passes `onChoose` instead and opens its payment dialog.
 */
export function PlanGrid({
  pricing,
  initialCycle = "ANNUAL",
  current,
  onChoose,
  compact,
}: {
  /** The price list in force (src/server/pricing-store.ts) */
  pricing: Pricing;
  initialCycle?: BillingCycle;
  current?: { plan: BillingPlanKey; cycle: BillingCycle | null } | null;
  onChoose?: (plan: BillingPlanKey, cycle: BillingCycle) => void;
  compact?: boolean;
}) {
  const [cycle, setCycle] = useState<BillingCycle>(initialCycle);
  const plans = Object.values(pricing.plans);

  return (
    <div>
      <div className="flex justify-center">
        <CycleToggle cycle={cycle} onChange={setCycle} saving={maxAnnualSavingPercent(pricing)} />
      </div>
      <ul className={cn("mt-8 grid gap-4", compact ? "sm:grid-cols-2 xl:grid-cols-4" : "md:grid-cols-2 xl:grid-cols-4")}>
        {plans.map((plan) => {
          const paid = isPaidPlan(plan.key);
          const perMonth = cycle === "ANNUAL" ? plan.annualPerMonthCents : plan.monthlyCents;
          const discounted = paid && cycle === "ANNUAL" && plan.annualPerMonthCents < plan.monthlyCents;
          const featured = plan.key === "PRO";
          const isCurrent = current?.plan === plan.key && (plan.key === "FREE" || current?.cycle === cycle);
          const label = isCurrent ? "Your plan" : paid ? (current && current.plan === plan.key ? "Switch billing" : `Get ${plan.name}`) : "Start free";
          // Sign in first; already signed in, /login forwards straight to Billing.
          const href = `/login?next=${encodeURIComponent(paid ? `/billing?plan=${plan.key}&cycle=${cycle}` : "/billing")}`;

          return (
            <li
              key={plan.key}
              className={cn(
                "relative flex flex-col rounded-3xl p-6",
                featured
                  ? "border border-transparent bg-[linear-gradient(#1c100a,#1c100a)_padding-box,linear-gradient(135deg,#FFCF5A,#F5A623_40%,#D2562B_75%,#C8321E)_border-box] shadow-[0_30px_90px_-30px_rgba(245,166,35,0.5)]"
                  : "border border-wash/[0.08] bg-wash/[0.03]",
              )}
            >
              {plan.badge ? (
                <span
                  className={cn(
                    "absolute -top-3 left-6 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider",
                    featured ? "bg-[linear-gradient(90deg,#F5A623,#D2562B)] text-black" : "bg-[#C8321E] text-white",
                  )}
                >
                  {plan.badge}
                </span>
              ) : null}
              <h3 className="font-poppins text-xl font-bold uppercase tracking-wide text-ink">{plan.name}</h3>
              <p className="mt-1 text-sm text-muted">{plan.tagline}</p>

              <div className="mt-6 flex items-end gap-2">
                <span className={cn("whitespace-nowrap font-poppins font-bold tracking-tight text-ink", compact ? "text-3xl" : "text-4xl")}>{paid ? formatKES(perMonth) : "KES 0"}</span>
                <span className="whitespace-nowrap pb-1 text-sm text-muted">/ month</span>
              </div>
              <p className="mt-1 min-h-[20px] text-xs text-muted">
                {!paid
                  ? "No card needed"
                  : discounted
                    ? (
                        <>
                          <s className="mr-1">{formatKES(plan.monthlyCents)}</s>
                          {formatKES(plan.annualCents)} billed yearly · save {formatKES(annualSavingCents(pricing, plan.key as PaidPlanKey))}
                        </>
                      )
                    : cycle === "ANNUAL"
                      ? `${formatKES(plan.annualCents)} billed yearly`
                      : "Billed monthly"}
              </p>

              <div className="mt-5 flex items-center gap-2 rounded-2xl bg-wash/[0.05] px-4 py-3">
                <Sparkles className="h-4 w-4 text-primary" aria-hidden />
                <span className="text-sm font-semibold text-ink">
                  {paid ? `${plan.creditsPerMonth.toLocaleString("en-KE")} credits / month` : "Pay as you go"}
                </span>
              </div>

              <ul className="mt-5 flex-1 space-y-2.5 text-sm">
                {features(pricing, plan).map((f) => (
                  <li key={f} className="flex gap-2.5 text-ink/85">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              {onChoose ? (
                <button
                  type="button"
                  disabled={isCurrent || !paid}
                  onClick={() => onChoose(plan.key, cycle)}
                  className={cn("mt-6 w-full", featured ? "btn-primary" : "btn-quiet", (isCurrent || !paid) && "opacity-60")}
                >
                  {!paid && !isCurrent ? "Included" : label}
                </button>
              ) : (
                <Link href={href} className={cn("mt-6 w-full justify-center", featured ? "btn-primary" : "btn-quiet")}>
                  {label}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
