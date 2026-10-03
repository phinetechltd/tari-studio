"use client";

import { CalendarClock, CreditCard, Smartphone, Sparkles, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { callApi } from "@/components/landing/order-events";
import { PayPanel, type PayMethods } from "@/components/payments/pay-panel";
import { PlanGrid } from "@/components/pricing/plan-grid";
import { PRODUCT_NAME } from "@/lib/brand";
import { formatKES } from "@/lib/money";
import {
  creditsToCents,
  isPaidPlan,
  planPriceCents,
  type Pricing,
  type BillingCycle,
  type BillingPlanKey,
} from "@/lib/pricing";
import { cn } from "@/lib/utils";

export interface BillingSubscription {
  plan: BillingPlanKey;
  cycle: BillingCycle | null;
  status: "FREE" | "ACTIVE" | "PAST_DUE" | "EXPIRED";
  currentPeriodEnd: string | null;
  nextGrantAt: string | null;
  autoRenew: boolean;
  canAutoRenew: boolean;
  cardLabel: string | null;
  paymentMethod: "PAYSTACK" | "MPESA" | "COMP" | null;
  cancelled: boolean;
  priceCents: number;
  creditsPerMonth: number;
}

export interface BillingPayment {
  id: string;
  createdAt: string;
  purpose: string;
  description: string;
  amountCents: number;
  status: string;
  method: string;
  receiptRef: string | null;
}

type Pending =
  | { kind: "plan"; plan: BillingPlanKey; cycle: BillingCycle }
  | { kind: "pack"; pack: string };

const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-KE", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Nairobi" }) : "";

function Dialog({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={onClose}
      className="w-[min(100vw-2rem,30rem)] rounded-card border border-line bg-raised p-0 text-ink backdrop:bg-black/60"
      aria-label={title}
    >
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        <button type="button" className="rounded-lg p-2 text-muted hover:bg-surface hover:text-ink" onClick={onClose} aria-label="Close">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="space-y-4 px-5 py-5">{children}</div>
    </dialog>
  );
}

export function BillingApp({
  pricing,
  credits,
  unmetered,
  subscription,
  methods,
  billingEmail,
  canPlan,
  canTopUp,
  payments,
  preselect,
}: {
  credits: number;
  unmetered: boolean;
  subscription: BillingSubscription;
  methods: PayMethods;
  billingEmail: string | null;
  canPlan: boolean;
  canTopUp: boolean;
  payments: BillingPayment[];
  preselect: { plan: BillingPlanKey; cycle: BillingCycle } | null;
  pricing: Pricing;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<Pending | null>(canPlan && preselect && isPaidPlan(preselect.plan) ? { kind: "plan", ...preselect } : null);
  const [renewBusy, setRenewBusy] = useState(false);
  const [renewError, setRenewError] = useState<string | null>(null);

  const paid = useCallback(() => {
    router.refresh();
  }, [router]);

  const setRenew = async (on: boolean) => {
    setRenewBusy(true);
    setRenewError(null);
    const r = await callApi("/api/billing/plan", { method: "PATCH", body: JSON.stringify({ autoRenew: on }) });
    setRenewBusy(false);
    if (r.error) setRenewError(r.error);
    else router.refresh();
  };

  const sub = subscription;
  const plan = pricing.plans[sub.plan];
  const active = sub.status === "ACTIVE" || sub.status === "PAST_DUE";

  let dialog: { title: string; body: ReactNode } | null = null;
  if (pending?.kind === "plan" && isPaidPlan(pending.plan)) {
    const p = pricing.plans[pending.plan];
    // Renewing the same plan keeps the price it was bought at (the server does the same).
    const keeps = active && sub.plan === pending.plan && sub.cycle === pending.cycle && sub.priceCents > 0;
    const amount = keeps ? sub.priceCents : planPriceCents(pricing, pending.plan, pending.cycle);
    const monthly = keeps ? sub.creditsPerMonth : p.creditsPerMonth;
    dialog = {
      title: `${p.name}, ${pending.cycle === "ANNUAL" ? "yearly" : "monthly"}`,
      body: (
        <>
          <div className="rounded-xl bg-wash/[0.04] p-4 text-sm">
            <p className="text-ink">
              {formatKES(amount)} {pending.cycle === "ANNUAL" ? "for a year" : "for a month"}: {monthly.toLocaleString("en-KE")} credits every month
              {pending.cycle === "ANNUAL" ? ", 12 months" : ""}.
            </p>
            <p className="mt-1 text-muted">
              The first month&apos;s credits arrive as soon as payment is confirmed. Paid by card, the plan renews itself until you switch renewal off; paid by M-Pesa, we remind you before it ends.
            </p>
          </div>
          <PayPanel
            key={`${pending.plan}-${pending.cycle}`}
            endpoint="/api/billing/plan"
            body={{ plan: pending.plan, cycle: pending.cycle }}
            amountCents={amount}
            methods={methods}
            defaultEmail={billingEmail}
            onPaid={paid}
            cta={`Start ${p.name}`}
          />
        </>
      ),
    };
  } else if (pending?.kind === "pack") {
    const pack = pricing.packs.find((x) => x.key === pending.pack) ?? pricing.packs[0]!;
    dialog = {
      title: `${pack.credits.toLocaleString("en-KE")} credits`,
      body: (
        <PayPanel
          key={pack.key}
          endpoint="/api/billing/topup"
          body={{ pack: pack.key }}
          amountCents={pack.cents}
          methods={methods}
          defaultEmail={billingEmail}
          onPaid={paid}
          cta={`${pack.credits} credits`}
        />
      ),
    };
  }

  return (
    <div className="space-y-10">
      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <section className="panel p-6" aria-labelledby="current-plan">
          <p className="text-xs font-medium uppercase tracking-wider text-muted">Current plan</p>
          <div className="mt-2 flex flex-wrap items-baseline gap-3">
            <h2 id="current-plan" className="font-poppins text-3xl font-bold uppercase tracking-wide text-ink">
              {plan.name}
            </h2>
            {active && sub.cycle ? <span className="text-sm text-muted">{sub.cycle === "ANNUAL" ? "Yearly" : "Monthly"}</span> : null}
            {sub.status === "PAST_DUE" ? <span className="tag-hot">Payment failed</span> : null}
            {sub.status === "EXPIRED" ? <span className="tag-hot">Ended {day(sub.currentPeriodEnd)}</span> : null}
          </div>

          {active ? (
            <div className="mt-4 space-y-2 text-sm">
              <p className="flex items-center gap-2 text-ink/90">
                <CalendarClock className="h-4 w-4 text-primary" aria-hidden />
                {sub.autoRenew ? `Renews on ${day(sub.currentPeriodEnd)}` : `Ends on ${day(sub.currentPeriodEnd)}`}
                {sub.priceCents ? ` at ${formatKES(sub.priceCents)}` : ""}
                {sub.nextGrantAt ? `; next ${(sub.creditsPerMonth || plan.creditsPerMonth).toLocaleString("en-KE")} credits on ${day(sub.nextGrantAt)}` : ""}
              </p>
              <p className="flex items-center gap-2 text-muted">
                {sub.paymentMethod === "PAYSTACK" ? <CreditCard className="h-4 w-4" aria-hidden /> : <Smartphone className="h-4 w-4" aria-hidden />}
                {sub.paymentMethod === "PAYSTACK"
                  ? `Paid with ${sub.cardLabel ?? "Paystack"}${sub.autoRenew ? ", charged automatically" : ""}`
                  : sub.paymentMethod === "COMP"
                    ? `Complimentary from ${PRODUCT_NAME}: choose a plan below to carry on after it ends`
                    : "Paid with M-Pesa: renew from here before it ends"}
              </p>
              {canPlan && sub.canAutoRenew ? (
                <div className="pt-2">
                  <button type="button" className="btn-quiet min-h-[36px] px-4 text-sm" disabled={renewBusy} onClick={() => void setRenew(!sub.autoRenew)}>
                    {sub.autoRenew ? "Turn off renewal" : "Turn renewal back on"}
                  </button>
                  {renewError ? <p className="mt-2 text-sm text-danger">{renewError}</p> : null}
                </div>
              ) : null}
              {canPlan && !sub.autoRenew && isPaidPlan(sub.plan) && sub.cycle ? (
                <button
                  type="button"
                  className="btn-primary mt-2 min-h-[36px] px-4 text-sm"
                  onClick={() => setPending({ kind: "plan", plan: sub.plan, cycle: sub.cycle! })}
                >
                  Renew now
                </button>
              ) : null}
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted">
              Pay as you go with top-ups, or choose a plan below for credits every month at a lower rate.
            </p>
          )}
        </section>

        <section className="panel flex flex-col p-6" aria-labelledby="wallet">
          <p id="wallet" className="text-xs font-medium uppercase tracking-wider text-muted">Credits</p>
          <p className="mt-2 flex items-center gap-2 font-poppins text-4xl font-bold text-ink">
            <Sparkles className="h-7 w-7 text-primary" aria-hidden />
            {unmetered ? "Unmetered" : credits.toLocaleString("en-KE")}
          </p>
          <p className="mt-2 text-sm text-muted">
            An image is {pricing.imageCredits} credits; video is {pricing.videoCreditsPerStep} credits per started {pricing.videoStepSeconds} seconds. Credits never expire.
          </p>
          {canTopUp && !unmetered ? (
            <button type="button" className="btn-primary mt-auto self-start" onClick={() => setPending({ kind: "pack", pack: pricing.packs[0]!.key })}>
              Top up
            </button>
          ) : null}
        </section>
      </div>

      {canPlan ? (
        <section aria-labelledby="plans">
          <h2 id="plans" className="text-center font-poppins text-2xl font-bold uppercase tracking-wide text-ink">
            Plans
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-center text-sm text-muted">Monthly credits at a lower rate than top-ups. Change or stop any time.</p>
          <div className="mt-6">
            <PlanGrid
              pricing={pricing}
              initialCycle={preselect?.cycle ?? sub.cycle ?? "ANNUAL"}
              current={active ? { plan: sub.plan, cycle: sub.cycle } : { plan: "FREE", cycle: null }}
              onChoose={(p, c) => setPending({ kind: "plan", plan: p, cycle: c })}
              compact
            />
          </div>
        </section>
      ) : null}

      {canTopUp ? (
        <section aria-labelledby="packs">
          <h2 id="packs" className="font-poppins text-xl font-bold uppercase tracking-wide text-ink">
            Top-up packs
          </h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-3">
            {pricing.packs.map((p) => (
              <li key={p.key}>
                <button
                  type="button"
                  onClick={() => setPending({ kind: "pack", pack: p.key })}
                  className="flex w-full items-center justify-between rounded-2xl border border-wash/[0.08] bg-wash/[0.03] p-5 text-left transition-colors hover:border-primary/60"
                >
                  <span>
                    <span className="flex items-center gap-2 text-2xl font-bold text-ink">
                      <Sparkles className="h-5 w-5 text-primary" aria-hidden /> {p.credits.toLocaleString("en-KE")}
                    </span>
                    <span className="text-sm text-muted">credits</span>
                  </span>
                  <span className="text-lg font-semibold text-ink">{formatKES(p.cents)}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">Pay-as-you-go rate {formatKES(creditsToCents(pricing, 100))} per 100 credits.</p>
        </section>
      ) : null}

      <section aria-labelledby="history">
        <h2 id="history" className="font-poppins text-xl font-bold uppercase tracking-wide text-ink">
          Payments
        </h2>
        {payments.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No payments yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-2xl border border-wash/[0.08]">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-wash/[0.03] text-left text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">For</th>
                  <th className="px-4 py-3 font-medium">Method</th>
                  <th className="px-4 py-3 text-right font-medium">Amount</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-t border-wash/[0.06]">
                    <td className="px-4 py-3 text-muted">{new Date(p.createdAt).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })}</td>
                    <td className="px-4 py-3 text-ink">{p.description}</td>
                    <td className="px-4 py-3 text-muted">{p.method}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-ink">{formatKES(p.amountCents)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "rounded-md px-1.5 py-0.5 text-[11px] font-medium uppercase",
                          p.status === "SUCCEEDED" ? "bg-success/10 text-success" : p.status === "FAILED" ? "bg-danger/10 text-danger" : "bg-warning/10 text-warning",
                        )}
                      >
                        {p.status === "SUCCEEDED" ? "Paid" : p.status === "FAILED" ? "Failed" : "Pending"}
                      </span>
                      {p.receiptRef ? <span className="ml-2 text-xs text-muted">{p.receiptRef}</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Dialog open={dialog !== null} onClose={() => setPending(null)} title={dialog?.title ?? ""}>
        {dialog?.body}
      </Dialog>
    </div>
  );
}
