import { Check, Minus, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { SiteFooter, SiteHeader } from "@/components/landing/site-chrome";
import { PlanGrid } from "@/components/pricing/plan-grid";
import { JsonLd } from "@/components/seo/json-ld";
import { PRODUCT_NAME } from "@/lib/brand";
import { formatKES } from "@/lib/money";
import { creditsBuy, creditsToCents, maxAnnualSavingPercent, PAID_PLAN_KEYS, videoCreditsFor } from "@/lib/pricing";
import { faqFor } from "@/lib/showcase";
import { absoluteUrl, breadcrumbLd, faqLd, pageMetadata, softwareApplicationLd } from "@/lib/seo";
import { getPricing } from "@/server/pricing-store";
import { siteSeo } from "@/server/seo";

/** Prices come from the admin's price list, so the page is rendered per request. */
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const [{ plans }, site] = await Promise.all([getPricing(), siteSeo()]);
  return pageMetadata({
    title: "Pricing",
    description: `${PRODUCT_NAME} plans in Kenyan shillings: Free, Basic ${formatKES(plans.BASIC.monthlyCents)}, Pro ${formatKES(plans.PRO.monthlyCents)} and Max ${formatKES(plans.MAX.monthlyCents)} a month, cheaper yearly. Pay by M-Pesa or card.`,
    path: "/pricing",
    siteName: PRODUCT_NAME,
    noindex: !site.indexable,
  });
}

/** Credits per KES 100 spent: the "how far does a shilling go" row. */
function per100(credits: number, cents: number): string {
  return ((credits * 10_000) / cents).toFixed(1);
}

export default async function PricingPage() {
  const pricing = await getPricing();
  const PAID_PLANS = PAID_PLAN_KEYS.map((k) => pricing.plans[k]);
  const smallest = pricing.packs[0];
  const COSTS = [
    { what: "Image", detail: "Soul 2, 1080p, any social shape", credits: pricing.imageCredits },
    { what: "Video, 5 seconds", detail: "Seedance 2.5, 720p, with sound", credits: videoCreditsFor(pricing, 5) },
    { what: "Video, 10 seconds", detail: "A Reel or a Status", credits: videoCreditsFor(pricing, 10) },
    { what: "Video, 15 seconds", detail: "A TikTok or an Instagram ad", credits: videoCreditsFor(pricing, 15) },
    { what: "Video, 30 seconds", detail: "The longest clip, a TV-style spot", credits: videoCreditsFor(pricing, 30) },
  ];
  const saving = maxAnnualSavingPercent(pricing);
  const rows: Array<{ label: string; values: Array<string | boolean> }> = [
    { label: "Price, monthly", values: ["Free", ...PAID_PLANS.map((p) => formatKES(p.monthlyCents))] },
    { label: "Price per month, paid yearly", values: ["Free", ...PAID_PLANS.map((p) => formatKES(p.annualPerMonthCents))] },
    { label: "Credits every month", values: ["-", ...PAID_PLANS.map((p) => p.creditsPerMonth.toLocaleString("en-KE"))] },
    { label: "≈ Images a month", values: ["-", ...PAID_PLANS.map((p) => creditsBuy(pricing, p.creditsPerMonth).images.toLocaleString("en-KE"))] },
    { label: "≈ 5-second videos a month", values: ["-", ...PAID_PLANS.map((p) => String(creditsBuy(pricing, p.creditsPerMonth).videos5s))] },
    {
      label: "Credits per KES 100 (yearly)",
      values: [smallest ? per100(smallest.credits, smallest.cents) : "-", ...PAID_PLANS.map((p) => per100(p.creditsPerMonth, p.annualPerMonthCents))],
    },
    { label: "Generations at once", values: [String(pricing.plans.FREE.parallel), ...PAID_PLANS.map((p) => String(p.parallel))] },
    { label: "Higher workspace limits", values: [false, true, true, true] },
    { label: "Top up any time", values: [true, true, true, true] },
    { label: "Credits never expire", values: [true, true, true, true] },
    { label: "Pay by M-Pesa", values: [true, true, true, true] },
    { label: "Pay by card (Paystack)", values: [true, true, true, true] },
    { label: "Renews itself when paid by card", values: [false, true, true, true] },
  ];
  const site = await siteSeo();
  const structuredData = [
    breadcrumbLd(site.base, [
      { name: PRODUCT_NAME, path: "/" },
      { name: "Pricing", path: "/pricing" },
    ]),
    softwareApplicationLd({
      name: PRODUCT_NAME,
      url: site.base,
      description: `AI video and image ads, publishing and WhatsApp replies for African brands, priced in Kenyan shillings.`,
      image: absoluteUrl(site.base, "/showcase/showreel.jpg"),
      offers: [
        { name: "Free", monthlyCents: 0, description: "Top up credits as you go" },
        ...PAID_PLAN_KEYS.map((k) => ({ name: k.charAt(0) + k.slice(1).toLowerCase(), monthlyCents: pricing.plans[k].monthlyCents, description: `${pricing.plans[k].creditsPerMonth.toLocaleString("en-KE")} credits a month` })),
      ],
    }),
    // Only the questions this page shows: structured data must match the visible page.
    faqLd(faqFor(pricing).slice(0, 4).map((f) => ({ q: f.q, a: f.a }))),
  ];

  return (
    <div className="theme-afro theme-afro-night min-h-screen bg-bg text-ink">
      <JsonLd data={structuredData} />
      <SiteHeader />
      <main>
        <section className="relative overflow-hidden px-4 pb-10 pt-20 sm:px-6">
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(45%_60%_at_50%_0%,rgba(245,166,35,0.22),transparent_70%)]" />
          <div className="relative mx-auto max-w-3xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Pricing</p>
            <h1 className="mt-3 font-poppins text-4xl font-extrabold uppercase leading-[1.02] tracking-tight sm:text-6xl">
              Create more, <span className="text-brand-gradient">pay less</span>
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-lg text-muted">
              Plans in Kenyan shillings with monthly credits.{saving > 0 ? ` Pay yearly and save up to ${saving}%.` : ""} M-Pesa or card, change any time.
            </p>
          </div>
        </section>

        <section className="px-4 pb-16 sm:px-6">
          <div className="mx-auto max-w-[1400px]">
            <PlanGrid pricing={pricing} />
          </div>
        </section>

        <section className="px-4 py-16 sm:px-6">
          <div className="mx-auto grid max-w-[1400px] gap-10 lg:grid-cols-[2fr_3fr]">
            <div>
              <h2 className="font-poppins text-3xl font-extrabold uppercase tracking-tight">What a credit buys</h2>
              <p className="mt-3 text-muted">
                One wallet for everything. An image is {pricing.imageCredits} credits and video is {pricing.videoCreditsPerStep} credits per started {pricing.videoStepSeconds} seconds. You see the cost before anything is made, and a failed generation is refunded.
              </p>
            </div>
            <div className="overflow-x-auto rounded-3xl border border-wash/[0.08]">
              <table className="w-full min-w-[520px] text-sm">
                <thead className="bg-wash/[0.03] text-left text-xs uppercase tracking-wider text-muted">
                  <tr>
                    <th className="px-5 py-3 font-medium">Generation</th>
                    <th className="px-5 py-3 text-right font-medium">Credits</th>
                    <th className="px-5 py-3 text-right font-medium">Pay as you go</th>
                  </tr>
                </thead>
                <tbody>
                  {COSTS.map((c) => (
                    <tr key={c.what} className="border-t border-wash/[0.06]">
                      <td className="px-5 py-4">
                        <p className="font-medium text-ink">{c.what}</p>
                        <p className="text-xs text-muted">{c.detail}</p>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <span className="inline-flex items-center gap-1 font-semibold text-ink">
                          <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden /> {c.credits}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right tabular-nums text-muted">{formatKES(creditsToCents(pricing, c.credits))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="px-4 py-16 sm:px-6">
          <div className="mx-auto max-w-[1400px]">
            <h2 className="text-center font-poppins text-3xl font-extrabold uppercase tracking-tight">Compare plans</h2>
            <div className="mt-8 overflow-x-auto rounded-3xl border border-wash/[0.08]">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="bg-wash/[0.03]">
                    <th className="px-5 py-4 text-left text-xs font-medium uppercase tracking-wider text-muted">Plan</th>
                    {Object.values(pricing.plans).map((p) => (
                      <th key={p.key} className="px-5 py-4 text-center">
                        <span className="font-poppins text-base font-bold uppercase text-ink">{p.name}</span>
                        {p.badge ? <span className="mt-1 block text-[10px] font-semibold uppercase tracking-wider text-primary">{p.badge}</span> : null}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.label} className="border-t border-wash/[0.06]">
                      <td className="px-5 py-3.5 text-ink/85">{r.label}</td>
                      {r.values.map((v, i) => (
                        <td key={i} className="px-5 py-3.5 text-center">
                          {typeof v === "boolean" ? (
                            v ? <Check className="mx-auto h-4 w-4 text-success" aria-label="Yes" /> : <Minus className="mx-auto h-4 w-4 text-muted" aria-label="No" />
                          ) : (
                            <span className="tabular-nums text-ink">{v}</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-muted">The Free column&apos;s credits per KES 100 is the top-up rate. Prices are in Kenyan shillings.</p>
          </div>
        </section>

        <section className="px-4 py-16 sm:px-6">
          <div className="mx-auto max-w-[1400px]">
            <h2 className="font-poppins text-3xl font-extrabold uppercase tracking-tight">Top-up packs</h2>
            <p className="mt-2 text-muted">Need more this month? Top up on any plan, Free included.</p>
            <ul className="mt-6 grid gap-3 sm:grid-cols-3">
              {pricing.packs.map((p) => (
                <li key={p.key} className="flex items-center justify-between rounded-3xl border border-wash/[0.08] bg-wash/[0.03] p-6">
                  <span>
                    <span className="flex items-center gap-2 font-poppins text-3xl font-bold text-ink">
                      <Sparkles className="h-6 w-6 text-primary" aria-hidden /> {p.credits.toLocaleString("en-KE")}
                    </span>
                    <span className="text-sm text-muted">credits</span>
                  </span>
                  <span className="text-xl font-semibold text-ink">{formatKES(p.cents)}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="px-4 py-16 sm:px-6">
          <div className="mx-auto max-w-3xl">
            <h2 className="text-center font-poppins text-3xl font-extrabold uppercase tracking-tight">Billing questions</h2>
            <div className="mt-8 divide-y divide-wash/[0.08] rounded-3xl border border-wash/[0.08]">
              {faqFor(pricing).slice(0, 4).map((f) => (
                <details key={f.q} className="group px-6 py-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium text-ink [&::-webkit-details-marker]:hidden">
                    {f.q}
                    <span className="text-xl text-muted transition-transform group-open:rotate-45">+</span>
                  </summary>
                  <p className="mt-3 text-sm text-muted">{f.a}</p>
                </details>
              ))}
            </div>
            <p className="mt-8 text-center text-sm text-muted">
              Rather we made it for you?{" "}
              <Link href="/#order" className="font-medium text-primary hover:underline">
                Order a done-for-you ad
              </Link>
            </p>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
