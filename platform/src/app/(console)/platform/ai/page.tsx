import { AlertTriangle, Coins, Cpu, Hourglass, MessageSquareText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Hint } from "@/components/hints/hint";
import { EmptyState, Notice, PageHeader, SectionTitle, StatCard, TableWrap } from "@/components/ui";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { FAMILIES, secondsLabel } from "@/lib/generation-models";
import { requirePlatform } from "@/lib/session";
import { budgetPercent, getBudget, providerBalance } from "@/server/ai-credits";
import { listModels } from "@/server/ai-models";
import { recentLedgerMoves, usageReport } from "@/server/ai-usage";
import { getPricing } from "@/server/pricing-store";

import { BudgetForm, CreditMoves, ModelRow, type ModelRowView } from "./ai-controls";

export const metadata: Metadata = { title: "AI & credits" };
export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("en-KE", { dateStyle: "medium", timeZone: "Africa/Nairobi" });
const n1 = (v: number) => v.toLocaleString("en-KE", { maximumFractionDigits: 1 });

/**
 * Platform admin → AI & credits: the platform's Higgsfield balance (recorded
 * here, since Higgsfield has no balance API), alert levels, the model
 * catalogue customers choose from, and where the spend goes.
 */
export default async function AiCreditsPage() {
  await requirePlatform();
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [balance, budget, models, report, moves, pricing, observed] = await Promise.all([
    providerBalance(),
    getBudget(),
    listModels({ force: true }),
    usageReport(30),
    recentLedgerMoves(),
    getPricing(),
    db.generatedAsset.groupBy({
      by: ["modelKey"],
      where: { status: "READY", providerMilliCredits: { not: null }, createdAt: { gte: since } },
      _sum: { providerMilliCredits: true, durationSeconds: true },
      _count: { _all: true },
    }),
  ]);
  const e = env();
  const live = e.GENERATION_PROVIDER === "higgsfield";
  const usdToKes = pricing.conversion?.usdToKes ?? 130;
  const obs = new Map(observed.map((o) => [o.modelKey ?? "", o]));

  const rows: ModelRowView[] = models.map((m) => {
    const spec = FAMILIES[m.family];
    const o = obs.get(m.key);
    const perUnit =
      o && o._count._all > 0
        ? spec.media === "IMAGE"
          ? (o._sum.providerMilliCredits ?? 0) / 1000 / o._count._all
          : (o._sum.durationSeconds ?? 0) > 0
            ? (o._sum.providerMilliCredits ?? 0) / 1000 / ((o._sum.durationSeconds ?? 0) / pricing.videoStepSeconds)
            : null
        : null;
    return {
      key: m.key,
      label: m.label,
      familyName: spec.name,
      media: spec.media,
      modes: Object.keys(m.endpoints) as ModelRowView["modes"],
      enabled: m.enabled,
      defaultFor: m.defaultFor,
      creditsPerImage: m.creditsPerImage,
      creditsPerStep: m.creditsPerStep,
      listRate: spec.media === "IMAGE" ? pricing.imageCredits : pricing.videoCreditsPerStep,
      providerMilliCreditsHint: m.providerMilliCreditsHint,
      observedProviderCredits: perUnit,
      creditValueCents: pricing.creditValueCents,
      description: m.description,
      limits: spec.media === "IMAGE" ? `${spec.resolution}, ${spec.aspects?.join(" · ")}` : `${secondsLabel(spec.seconds)}, ${spec.resolution}${spec.sound ? ", sound" : ""}`,
    };
  });

  const monthPct = budgetPercent(balance.usedThisMonthCredits, budget.monthlyCredits);
  const textMonth = report.daily.slice(-new Date(Date.now() + 3 * 3_600_000).getUTCDate()).reduce((n, d) => n + d.textUsd, 0);
  const textPct = budgetPercent(textMonth, budget.textMonthlyUsd);
  const low = budget.lowBalanceCredits !== null && balance.hasTopUps && balance.credits < budget.lowBalanceCredits;
  const maxDay = Math.max(1, ...report.daily.map((d) => d.providerCredits));

  return (
    <>
      <PageHeader
        title="AI & credits"
        subtitle="The platform's Higgsfield balance, alert levels, the models customers can choose, and where the spend goes."
        actions={
          <a href="https://console.higgsfield.ai" target="_blank" rel="noreferrer" className="btn-quiet">
            Higgsfield console
          </a>
        }
      />

      <Hint id="platform.ai" title="Keep this balance honest">
        Higgsfield has no balance API, so record each top-up here and use “Match the Higgsfield console” now and then. Every finished render subtracts what Higgsfield estimated it cost.
      </Hint>

      {!live ? (
        <Notice tone="info" title="Generation is on the simulator">
          Renders use sample media and record simulated costs. Switch to Live with Higgsfield credentials in{" "}
          <Link href="/settings" className="underline">
            Settings
          </Link>{" "}
          to spend real credits.
        </Notice>
      ) : null}
      {low ? (
        <Notice tone="warning" title="Credits are below your alert level">
          About {n1(balance.credits)} left against an alert level of {n1(budget.lowBalanceCredits!)}. Top up on console.higgsfield.ai, then record it below.
        </Notice>
      ) : null}
      {!balance.hasTopUps ? (
        <Notice tone="warning" title="No top-ups recorded yet">
          The balance below counts usage only. Record what your Higgsfield account holds (as a top-up) so alerts work.
        </Notice>
      ) : null}

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Higgsfield balance (recorded)" value={`${n1(balance.credits)} credits`} hint={balance.lastTopUpAt ? `Last top-up ${dateFmt.format(new Date(balance.lastTopUpAt))}` : "Record your first top-up below"} icon={<Coins className="h-4 w-4" />} />
        <StatCard
          label="Used this month"
          value={`${n1(balance.usedThisMonthCredits)} credits`}
          hint={monthPct !== null ? `${monthPct}% of the ${n1(budget.monthlyCredits!)}-credit budget` : "No monthly budget set"}
          icon={<Cpu className="h-4 w-4" />}
        />
        <StatCard
          label="Expiring in 30 days"
          value={`${n1(balance.expiringSoonCredits)} credits`}
          hint={balance.nextExpiry ? `Next on ${dateFmt.format(new Date(balance.nextExpiry))}` : "Nothing expiring soon"}
          icon={<Hourglass className="h-4 w-4" />}
        />
        <StatCard
          label="Text AI this month"
          value={`US$${textMonth.toFixed(2)}`}
          hint={textPct !== null ? `${textPct}% of the US$${budget.textMonthlyUsd!.toFixed(2)} budget` : "Claude / NVIDIA, no budget set"}
          icon={<MessageSquareText className="h-4 w-4" />}
        />
      </div>

      <section className="mt-10" aria-labelledby="models">
        <SectionTitle id="models">Models customers can choose</SectionTitle>
        <p className="-mt-2 mb-4 max-w-3xl text-sm text-muted">
          Switch a model on to offer it in the Studio; the default for each mode is what a quote starts with. A model without its own rate costs the price list&apos;s ({pricing.imageCredits} credits an image, {pricing.videoCreditsPerStep} per started {pricing.videoStepSeconds} s of video). Margin compares what customers pay at the pay-as-you-go rate with Higgsfield&apos;s cost at about US$0.075 a credit.
        </p>
        <TableWrap>
          <table className="w-full min-w-[960px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-muted">
                <th className="px-4 py-2 font-medium">Model</th>
                <th className="px-4 py-2 font-medium">Offered</th>
                <th className="px-4 py-2 font-medium">Default for</th>
                <th className="px-4 py-2 font-medium">Customer price</th>
                <th className="px-4 py-2 text-right font-medium">Higgsfield cost</th>
                <th className="px-4 py-2 text-right font-medium">Margin</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <ModelRow key={m.key} model={m} usdToKes={usdToKes} />
              ))}
            </tbody>
          </table>
        </TableWrap>
      </section>

      <section className="mt-10" aria-labelledby="balance">
        <SectionTitle id="balance">Top-ups and adjustments</SectionTitle>
        <CreditMoves />
        {moves.length ? (
          <div className="mt-4">
            <TableWrap>
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-muted">
                    <th className="px-4 py-2 font-medium">When</th>
                    <th className="px-4 py-2 font-medium">What</th>
                    <th className="px-4 py-2 text-right font-medium">Credits</th>
                    <th className="px-4 py-2 font-medium">Expires / left</th>
                    <th className="px-4 py-2 font-medium">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {moves.map((m) => (
                    <tr key={m.id} className="border-b border-line last:border-0">
                      <td className="px-4 py-2 text-muted">{dateFmt.format(new Date(m.createdAt))}</td>
                      <td className="px-4 py-2">{m.kind === "TOPUP" ? "Top-up" : m.kind === "ADJUST" ? "Adjustment" : "Expired"}{m.by ? <span className="text-xs text-muted"> · {m.by}</span> : null}</td>
                      <td className={`px-4 py-2 text-right tabular-nums ${m.credits < 0 ? "text-red-300" : ""}`}>{m.credits > 0 ? "+" : ""}{n1(m.credits)}{m.usd !== null ? <span className="block text-xs text-muted">US${n1(m.usd)}</span> : null}</td>
                      <td className="px-4 py-2 text-muted">{m.expiresAt ? `${dateFmt.format(new Date(m.expiresAt))}${m.remaining !== null ? ` · ${n1(m.remaining)} left` : ""}` : "—"}</td>
                      <td className="px-4 py-2 text-muted">{m.note ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          </div>
        ) : null}
      </section>

      <section className="mt-10" aria-labelledby="alerts">
        <SectionTitle id="alerts">Alerts</SectionTitle>
        <BudgetForm budget={budget} />
        <p className="mt-2 text-xs text-muted">
          Who gets alerted and how is set in{" "}
          <Link href="/platform/notifications" className="underline">
            Notifications
          </Link>
          . SMS goes to admins who added a mobile number in their{" "}
          <Link href="/account" className="underline">
            profile
          </Link>
          .
        </p>
      </section>

      <section className="mt-10" aria-labelledby="usage">
        <SectionTitle id="usage">Usage, last 30 days</SectionTitle>
        {report.totals.generations === 0 && report.text.length === 0 ? (
          <EmptyState title="No AI usage yet">Finished generations and AI writing show up here.</EmptyState>
        ) : (
          <>
            <div className="card p-5">
              <p className="text-sm text-muted">
                {report.totals.generations.toLocaleString("en-KE")} finished generations: customers paid {report.totals.customerCredits.toLocaleString("en-KE")} credits; Higgsfield charged about {n1(report.totals.providerCredits)} credits
                {report.totals.providerUsd ? ` (US$${report.totals.providerUsd.toFixed(2)})` : ""}. Text AI cost US${report.totals.textUsd.toFixed(2)}.
              </p>
              <div className="mt-4 flex h-28 items-end gap-[3px]" role="img" aria-label="Higgsfield credits used per day over the last 30 days">
                {report.daily.map((d) => (
                  <div key={d.day} className="group relative flex-1">
                    <div className="w-full rounded-t bg-primary/70 group-hover:bg-primary" style={{ height: `${Math.max(2, (d.providerCredits / maxDay) * 100)}%` }} />
                    <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded bg-black/80 px-2 py-1 text-[11px] text-white group-hover:block">
                      {d.day}: {n1(d.providerCredits)} cr · US${d.textUsd.toFixed(2)} text
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 grid gap-4 xl:grid-cols-2">
              <TableWrap>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-muted">
                      <th className="px-4 py-2 font-medium">By model</th>
                      <th className="px-4 py-2 text-right font-medium">Made</th>
                      <th className="px-4 py-2 text-right font-medium">Failed</th>
                      <th className="px-4 py-2 text-right font-medium">Customer credits</th>
                      <th className="px-4 py-2 text-right font-medium">Higgsfield credits</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.models.map((m) => (
                      <tr key={m.modelKey} className="border-b border-line last:border-0">
                        <td className="px-4 py-2">{models.find((x) => x.key === m.modelKey)?.label ?? m.modelKey}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{m.generations}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-muted">{m.failed}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{m.customerCredits.toLocaleString("en-KE")}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{n1(m.providerCredits)}</td>
                      </tr>
                    ))}
                    {report.text.map((t) => (
                      <tr key={t.model} className="border-b border-line last:border-0">
                        <td className="px-4 py-2">
                          {t.model} <span className="text-xs text-muted">text</span>
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">{t.calls}</td>
                        <td className="px-4 py-2 text-right text-muted">—</td>
                        <td className="px-4 py-2 text-right text-muted">—</td>
                        <td className="px-4 py-2 text-right tabular-nums">US${t.usd.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
              <TableWrap>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-muted">
                      <th className="px-4 py-2 font-medium">By organisation</th>
                      <th className="px-4 py-2 text-right font-medium">Renders</th>
                      <th className="px-4 py-2 text-right font-medium">Higgsfield credits</th>
                      <th className="px-4 py-2 text-right font-medium">Text AI</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.organizations.map((o) => (
                      <tr key={o.organizationId} className="border-b border-line last:border-0">
                        <td className="px-4 py-2">
                          <Link href={`/platform/orgs/${o.organizationId}`} className="text-primary underline-offset-2 hover:underline">
                            {o.name}
                          </Link>
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">{o.generations}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{n1(o.providerCredits)}</td>
                        <td className="px-4 py-2 text-right tabular-nums">US${o.textUsd.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            </div>
          </>
        )}
      </section>

      <p className="mt-8 flex items-start gap-2 text-xs text-muted">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        Higgsfield charges nothing for failed, blocked or cancelled requests, so only finished renders are counted. An organisation that saved its own Higgsfield key in its Settings pays Higgsfield directly and does not draw on this balance.
      </p>
    </>
  );
}
