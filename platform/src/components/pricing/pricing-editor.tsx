"use client";

import { Calculator, Plus, RotateCcw, Save, Sparkles, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";

import { callApi } from "@/components/json-form";
import { formatKES } from "@/lib/money";
import {
  creditsToCents,
  HIGGSFIELD_USD,
  PAID_PLAN_KEYS,
  PLAN_META,
  recalculateFromUsd,
  resolvePricing,
  videoCreditsFor,
  type PaidPlanKey,
  type Pricing,
  type PricingInput,
} from "@/lib/pricing";
import { cn } from "@/lib/utils";

interface Status {
  input: PricingInput;
  defaults: PricingInput;
  custom: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
}

/** The editor works in whole shillings and plain strings; the server stores cents. */
interface PlanForm {
  monthly: string;
  yearly: string;
  credits: string;
  parallel: string;
  badge: string;
}
interface Form {
  imageCredits: string;
  videoCreditsPerStep: string;
  freeParallel: string;
  plans: Record<PaidPlanKey, PlanForm>;
  packs: Array<{ credits: string; price: string }>;
  conversion: { usdToKes: string; marginPct: string; roundToKes: string };
}

const kes = (cents: number) => String(Math.round(cents / 100));
const num = (s: string) => (s.trim() === "" ? NaN : Number(s));

function toForm(input: PricingInput): Form {
  const plans = {} as Record<PaidPlanKey, PlanForm>;
  for (const k of PAID_PLAN_KEYS) {
    const p = input.plans[k];
    plans[k] = { monthly: kes(p.monthlyCents), yearly: kes(p.annualPerMonthCents), credits: String(p.creditsPerMonth), parallel: String(p.parallel), badge: p.badge ?? "" };
  }
  return {
    imageCredits: String(input.imageCredits),
    videoCreditsPerStep: String(input.videoCreditsPerStep),
    freeParallel: String(input.freeParallel),
    plans,
    packs: input.packs.map((p) => ({ credits: String(p.credits), price: kes(p.cents) })),
    conversion: {
      usdToKes: String(input.conversion.usdToKes),
      marginPct: String(Math.round(input.conversion.margin * 1000) / 10),
      roundToKes: String(input.conversion.roundToKes),
    },
  };
}

function fromForm(f: Form): PricingInput {
  const plans = {} as PricingInput["plans"];
  for (const k of PAID_PLAN_KEYS) {
    const p = f.plans[k];
    plans[k] = {
      monthlyCents: Math.round(num(p.monthly) * 100),
      annualPerMonthCents: Math.round(num(p.yearly) * 100),
      creditsPerMonth: num(p.credits),
      parallel: num(p.parallel),
      badge: p.badge.trim() || null,
    };
  }
  return {
    imageCredits: num(f.imageCredits),
    videoCreditsPerStep: num(f.videoCreditsPerStep),
    freeParallel: num(f.freeParallel),
    plans,
    packs: f.packs.map((p) => ({ credits: num(p.credits), cents: Math.round(num(p.price) * 100) })),
    conversion: { usdToKes: num(f.conversion.usdToKes), margin: num(f.conversion.marginPct) / 100, roundToKes: num(f.conversion.roundToKes) },
  };
}

/** The resolved list for the previews, or null while a field is half-typed. */
function preview(f: Form): Pricing | null {
  const input = fromForm(f);
  const values = [
    input.imageCredits,
    input.videoCreditsPerStep,
    input.freeParallel,
    ...PAID_PLAN_KEYS.flatMap((k) => [input.plans[k].monthlyCents, input.plans[k].annualPerMonthCents, input.plans[k].creditsPerMonth, input.plans[k].parallel]),
    ...input.packs.flatMap((p) => [p.credits, p.cents]),
  ];
  if (values.some((v) => !Number.isFinite(v) || v <= 0) || input.packs.length === 0) return null;
  return resolvePricing(input);
}

function Field({ label, value, onChange, suffix, prefix, width = "w-28", hint }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  suffix?: string;
  prefix?: string;
  width?: string;
  hint?: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      <span className={cn("flex items-center rounded-xl border border-line bg-wash/[0.04] focus-within:border-primary/60", width)}>
        {prefix ? <span className="pl-3 text-xs text-muted">{prefix}</span> : null}
        <input
          className="min-h-[40px] w-full bg-transparent px-3 text-sm tabular-nums text-ink focus:outline-none"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
        />
        {suffix ? <span className="pr-3 text-xs text-muted">{suffix}</span> : null}
      </span>
      {hint ? <span className="mt-1 block text-[11px] text-muted">{hint}</span> : null}
    </label>
  );
}

function Card({ title, subtitle, children, icon }: { title: string; subtitle?: string; children: ReactNode; icon?: ReactNode }) {
  return (
    <section className="card p-5 sm:p-6">
      <div className="flex items-start gap-3">
        {icon ? <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">{icon}</span> : null}
        <div>
          <h2 className="text-lg font-semibold text-ink">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-sm text-muted">{subtitle}</p> : null}
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

/**
 * Platform admin → Pricing. Everything customers pay comes from this list:
 * plan prices and monthly credits, how many credits a generation costs, and
 * the top-up packs. Saving needs two-factor sign-in and is audited.
 */
export function PricingEditor({ initial }: { initial: Status }) {
  const router = useRouter();
  const [status, setStatus] = useState(initial);
  const [form, setForm] = useState<Form>(() => toForm(initial.input));
  const [busy, setBusy] = useState<"save" | "reset" | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  const live = useMemo(() => preview(form), [form]);
  const dirty = JSON.stringify(fromForm(form)) !== JSON.stringify(status.input);

  const setPlan = (k: PaidPlanKey, field: keyof PlanForm, v: string) =>
    setForm((f) => ({ ...f, plans: { ...f.plans, [k]: { ...f.plans[k], [field]: v } } }));

  const recalc = () => {
    const c = { usdToKes: num(form.conversion.usdToKes), margin: num(form.conversion.marginPct) / 100, roundToKes: num(form.conversion.roundToKes) };
    if (![c.usdToKes, c.margin, c.roundToKes].every((v) => Number.isFinite(v) && v >= 0) || c.usdToKes <= 0 || c.roundToKes < 1) {
      setMessage({ tone: "danger", text: "Enter an exchange rate, a margin and a rounding step first." });
      return;
    }
    const base = fromForm(form);
    setForm(toForm(recalculateFromUsd(base, c)));
    setMessage({ tone: "success", text: "Plan and pack prices recalculated from Higgsfield's dollars. Review them, then save." });
  };

  const save = async () => {
    setBusy("save");
    setMessage(null);
    const r = await callApi<Status>("/api/platform/pricing", "PUT", { pricing: fromForm(form) });
    setBusy(null);
    if (!r.ok || !r.data) {
      setMessage({ tone: "danger", text: r.error?.message ?? "Could not save the prices." });
      return;
    }
    setStatus(r.data);
    setForm(toForm(r.data.input));
    setMessage({ tone: "success", text: "Saved. New prices apply to purchases from now on; every server picks them up within 10 seconds." });
    router.refresh();
  };

  const reset = async () => {
    if (!window.confirm("Go back to the default prices (Higgsfield's dollars × 130 × 1.3)? Existing subscriptions keep their price.")) return;
    setBusy("reset");
    setMessage(null);
    const r = await callApi<Status>("/api/platform/pricing", "DELETE");
    setBusy(null);
    if (!r.ok || !r.data) {
      setMessage({ tone: "danger", text: r.error?.message ?? "Could not reset the prices." });
      return;
    }
    setStatus(r.data);
    setForm(toForm(r.data.input));
    setMessage({ tone: "success", text: "Back to the default prices." });
    router.refresh();
  };

  return (
    <div className="space-y-6 pb-24">
      <div className="panel flex flex-col gap-2 p-5 text-sm sm:flex-row sm:items-center sm:justify-between">
        <p className="text-ink">
          {status.custom ? (
            <>
              <span className="font-semibold">Custom prices</span>
              {status.updatedAt ? `, saved ${new Date(status.updatedAt).toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short" })}` : ""}
              {status.updatedBy ? ` by ${status.updatedBy}` : ""}.
            </>
          ) : (
            <>
              <span className="font-semibold">Default prices</span>: Higgsfield&apos;s dollars × 130 × 1.3, rounded up to KES 50.
            </>
          )}
        </p>
        <p className="text-muted">Existing subscriptions keep the price and credits they were bought at until they change plan.</p>
      </div>

      <Card title="Plans" subtitle="Prices in whole shillings. The yearly price is per month, billed as one payment for 12 months." icon={<Sparkles className="h-4 w-4" />}>
        <div className="space-y-4">
          {PAID_PLAN_KEYS.map((k) => {
            const plan = live?.plans[k];
            const saving = plan && plan.monthlyCents > 0 ? Math.round((1 - plan.annualPerMonthCents / plan.monthlyCents) * 100) : null;
            return (
              <div key={k} className="rounded-2xl border border-wash/[0.08] p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-poppins text-base font-bold uppercase tracking-wide text-ink">{PLAN_META[k].name}</h3>
                  <p className="text-xs text-muted">
                    Higgsfield: ${HIGGSFIELD_USD.plans[k].monthly}/mo, ${HIGGSFIELD_USD.plans[k].annualPerMonth}/mo yearly
                  </p>
                </div>
                <div className="mt-3 flex flex-wrap gap-3">
                  <Field label="Monthly" prefix="KES" value={form.plans[k].monthly} onChange={(v) => setPlan(k, "monthly", v)} width="w-36" />
                  <Field
                    label="Yearly, per month"
                    prefix="KES"
                    value={form.plans[k].yearly}
                    onChange={(v) => setPlan(k, "yearly", v)}
                    width="w-36"
                    hint={plan ? `${formatKES(plan.annualCents)} a year${saving !== null && saving > 0 ? ` · save ${saving}%` : ""}` : undefined}
                  />
                  <Field label="Credits a month" value={form.plans[k].credits} onChange={(v) => setPlan(k, "credits", v)} width="w-32" />
                  <Field label="Generations at once" value={form.plans[k].parallel} onChange={(v) => setPlan(k, "parallel", v)} width="w-28" />
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-muted">Badge</span>
                    <input
                      className="input !min-h-[40px] w-40"
                      maxLength={24}
                      placeholder="none"
                      value={form.plans[k].badge}
                      onChange={(e) => setPlan(k, "badge", e.target.value)}
                    />
                  </label>
                </div>
                {plan && live ? (
                  <p className="mt-3 text-xs text-muted">
                    ≈ {Math.floor(plan.creditsPerMonth / live.imageCredits).toLocaleString("en-KE")} images or{" "}
                    {Math.floor(plan.creditsPerMonth / live.videoCreditsPerStep)} five-second videos a month ·{" "}
                    {((plan.creditsPerMonth * 10_000) / Math.max(plan.annualPerMonthCents, 1)).toFixed(1)} credits per KES 100 yearly
                  </p>
                ) : null}
              </div>
            );
          })}
          <div className="rounded-2xl border border-wash/[0.08] p-4">
            <h3 className="font-poppins text-base font-bold uppercase tracking-wide text-ink">Free</h3>
            <div className="mt-3">
              <Field label="Generations at once" value={form.freeParallel} onChange={(v) => setForm((f) => ({ ...f, freeParallel: v }))} />
            </div>
          </div>
        </div>
      </Card>

      <Card title="Credit costs" subtitle="What each generation takes from the wallet. Quotes in the Studio and on the landing page follow these at once.">
        <div className="flex flex-wrap gap-4">
          <Field label="Image" suffix="credits" value={form.imageCredits} onChange={(v) => setForm((f) => ({ ...f, imageCredits: v }))} width="w-36" />
          <Field
            label="Video, per started 5 seconds"
            suffix="credits"
            value={form.videoCreditsPerStep}
            onChange={(v) => setForm((f) => ({ ...f, videoCreditsPerStep: v }))}
            width="w-36"
            hint={live ? `A 10-second clip: ${videoCreditsFor(live, 10)} credits (${formatKES(creditsToCents(live, videoCreditsFor(live, 10)))} pay as you go)` : undefined}
          />
        </div>
      </Card>

      <Card title="Top-up packs" subtitle="Credits bought without a plan. The smallest pack sets the pay-as-you-go value of a credit, which also prices done-for-you orders.">
        <div className="space-y-3">
          {form.packs.map((p, i) => {
            const credits = num(p.credits);
            const price = num(p.price);
            return (
              <div key={i} className="flex flex-wrap items-end gap-3">
                <Field
                  label="Credits"
                  value={p.credits}
                  onChange={(v) => setForm((f) => ({ ...f, packs: f.packs.map((x, j) => (j === i ? { ...x, credits: v } : x)) }))}
                />
                <Field
                  label="Price"
                  prefix="KES"
                  value={p.price}
                  onChange={(v) => setForm((f) => ({ ...f, packs: f.packs.map((x, j) => (j === i ? { ...x, price: v } : x)) }))}
                  width="w-36"
                />
                <p className="pb-2.5 text-xs text-muted">
                  {credits > 0 && price > 0 ? `KES ${(price / credits).toFixed(2)} a credit` : ""}
                </p>
                <button
                  type="button"
                  className="mb-1 rounded-lg p-2 text-muted hover:bg-wash/[0.06] hover:text-danger disabled:opacity-40"
                  onClick={() => setForm((f) => ({ ...f, packs: f.packs.filter((_, j) => j !== i) }))}
                  disabled={form.packs.length <= 1}
                  aria-label={`Remove the ${p.credits}-credit pack`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          })}
          <button
            type="button"
            className="btn-quiet min-h-[36px] px-3 text-sm"
            disabled={form.packs.length >= 6}
            onClick={() => setForm((f) => ({ ...f, packs: [...f.packs, { credits: "", price: "" }] }))}
          >
            <Plus className="h-4 w-4" /> Add a pack
          </button>
          {live ? (
            <p className="text-xs text-muted">
              Pay-as-you-go: KES {(live.creditValueCents / 100).toFixed(2)} a credit. A done-for-you image costs {formatKES(creditsToCents(live, live.imageCredits))}; a
              10-second video {formatKES(creditsToCents(live, videoCreditsFor(live, 10)))}.
            </p>
          ) : null}
        </div>
      </Card>

      <Card
        title="Recalculate from Higgsfield"
        subtitle="Refill every plan and pack price from Higgsfield's dollar prices: × rate × (1 + margin), rounded up. Credits and costs stay as they are."
        icon={<Calculator className="h-4 w-4" />}
      >
        <div className="flex flex-wrap items-end gap-3">
          <Field label="KES per US dollar" value={form.conversion.usdToKes} onChange={(v) => setForm((f) => ({ ...f, conversion: { ...f.conversion, usdToKes: v } }))} />
          <Field label="Margin" suffix="%" value={form.conversion.marginPct} onChange={(v) => setForm((f) => ({ ...f, conversion: { ...f.conversion, marginPct: v } }))} />
          <Field label="Round up to" prefix="KES" value={form.conversion.roundToKes} onChange={(v) => setForm((f) => ({ ...f, conversion: { ...f.conversion, roundToKes: v } }))} />
          <button type="button" className="btn-quiet min-h-[40px] px-4" onClick={recalc}>
            <Calculator className="h-4 w-4" /> Recalculate prices
          </button>
        </div>
      </Card>

      <div className="sticky bottom-4 z-20">
        <div className="glass flex flex-col gap-3 rounded-2xl p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-h-[20px] text-sm" role="status">
            {message ? (
              <span className={message.tone === "success" ? "text-success" : "text-danger"}>{message.text}</span>
            ) : dirty ? (
              <span className="text-warning">Unsaved changes.</span>
            ) : (
              <span className="text-muted">Prices are up to date.</span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {status.custom ? (
              <button type="button" className="btn-quiet min-h-[40px] px-4" disabled={busy !== null} onClick={() => void reset()}>
                <RotateCcw className="h-4 w-4" /> Reset to defaults
              </button>
            ) : null}
            {dirty ? (
              <button type="button" className="btn-quiet min-h-[40px] px-4" disabled={busy !== null} onClick={() => { setForm(toForm(status.input)); setMessage(null); }}>
                Discard changes
              </button>
            ) : null}
            <button type="button" className="btn-primary min-h-[40px] px-5" disabled={busy !== null || !dirty} onClick={() => void save()}>
              <Save className="h-4 w-4" /> {busy === "save" ? "Saving…" : "Save prices"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
