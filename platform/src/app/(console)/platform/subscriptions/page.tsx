import type { Metadata } from "next";
import Link from "next/link";

import { Hint } from "@/components/hints/hint";
import { RevenueBreakdown, RevenueCards, SubscriptionStatus } from "@/components/platform/billing-bits";
import { Badge, EmptyState, PageHeader, TableWrap, formatDate } from "@/components/ui";
import { formatKES } from "@/lib/money";
import { requirePlatform } from "@/lib/session";
import { listSubscriptions, revenueSummary } from "@/server/platform-admin";

export const metadata: Metadata = { title: "Subscriptions" };
export const dynamic = "force-dynamic";

/** Every organisation's plan, with the revenue it brings in. */
export default async function SubscriptionsPage({ searchParams }: { searchParams: Promise<{ status?: string; plan?: string; q?: string }> }) {
  await requirePlatform();
  const f = await searchParams;
  const [summary, subs] = await Promise.all([revenueSummary(), listSubscriptions(f)]);

  return (
    <>
      <PageHeader
        title="Subscriptions"
        subtitle="Every organisation's plan, what it pays, and when it renews or ends."
        actions={
          <Link href="/platform/payments" className="btn-quiet">
            All payments
          </Link>
        }
      />
      <Hint id="platform.subscriptions" title="Every plan on the platform">
        Filter by plan or state. Past-due plans are being retried; complimentary plans never charge and end by themselves.
      </Hint>
      <RevenueCards r={summary} />
      <div className="mt-3">
        <RevenueBreakdown r={summary} />
      </div>

      <form className="mt-8 flex flex-wrap items-end gap-3" method="get">
        <div>
          <label className="label" htmlFor="sub-q">Organisation</label>
          <input id="sub-q" name="q" className="input w-56" defaultValue={f.q ?? ""} placeholder="Search by name" />
        </div>
        <div>
          <label className="label" htmlFor="sub-status">Status</label>
          <select id="sub-status" name="status" className="input w-40" defaultValue={f.status ?? ""}>
            <option value="">Any</option>
            <option value="ACTIVE">Active</option>
            <option value="PAST_DUE">Past due</option>
            <option value="EXPIRED">Ended</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="sub-plan">Plan</label>
          <select id="sub-plan" name="plan" className="input w-36" defaultValue={f.plan ?? ""}>
            <option value="">Any</option>
            <option value="BASIC">Basic</option>
            <option value="PRO">Pro</option>
            <option value="MAX">Max</option>
          </select>
        </div>
        <button type="submit" className="btn-primary">Filter</button>
        {f.q || f.status || f.plan ? (
          <Link href="/platform/subscriptions" className="btn-quiet">Clear</Link>
        ) : null}
      </form>

      <div className="mt-4">
        {subs.length === 0 ? (
          <EmptyState title="No subscriptions match">Organisations on the Free plan have no subscription.</EmptyState>
        ) : (
          <TableWrap>
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-muted">
                  <th className="px-4 py-2 font-medium">Organisation</th>
                  <th className="px-4 py-2 font-medium">Plan</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Pays with</th>
                  <th className="px-4 py-2 text-right font-medium">Price</th>
                  <th className="px-4 py-2 text-right font-medium">Credits / mo</th>
                  <th className="px-4 py-2 font-medium">Renews / ends</th>
                </tr>
              </thead>
              <tbody>
                {subs.map((s) => (
                  <tr key={s.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-2">
                      <Link href={`/platform/orgs/${s.organizationId}`} className="font-medium text-primary underline-offset-2 hover:underline">
                        {s.organizationName}
                      </Link>
                      {s.organizationStatus !== "ACTIVE" ? (
                        <span className="ml-2">
                          <Badge tone="danger">Suspended</Badge>
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-2">
                      {s.plan} <span className="text-muted">· {s.cycle}</span>
                    </td>
                    <td className="px-4 py-2">
                      <SubscriptionStatus status={s.status} />
                      {s.status === "PAST_DUE" ? <span className="ml-2 text-xs text-muted">{s.renewalAttempts} failed</span> : null}
                    </td>
                    <td className="px-4 py-2">
                      {s.source}
                      {s.autoRenew ? <span className="text-xs text-muted"> · auto-renews</span> : null}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{s.priceCents ? formatKES(s.priceCents) : "—"}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{s.creditsPerMonth.toLocaleString("en-KE")}</td>
                    <td className="px-4 py-2 text-muted">{formatDate(s.currentPeriodEnd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </div>
    </>
  );
}
