import { AlertTriangle, CreditCard, Repeat, TrendingUp } from "lucide-react";

import { Badge, StatCard, type Tone } from "@/components/ui";
import { formatKES } from "@/lib/money";
import type { RevenueSummary } from "@/server/platform-admin";

/** Server-safe pieces shared by the platform admin's money pages. */

export function paymentTone(status: string): Tone {
  if (status === "SUCCEEDED") return "success";
  if (status === "FAILED") return "danger";
  return "warning";
}

export function PaymentStatus({ status }: { status: string }) {
  const label = status === "SUCCEEDED" ? "Paid" : status === "FAILED" ? "Failed" : status === "PROCESSING" ? "Waiting" : "Pending";
  return <Badge tone={paymentTone(status)}>{label}</Badge>;
}

export function SubscriptionStatus({ status }: { status: string }) {
  if (status === "ACTIVE") return <Badge tone="success">Active</Badge>;
  if (status === "PAST_DUE") return <Badge tone="warning">Past due</Badge>;
  return <Badge>Ended</Badge>;
}

export function RevenueCards({ r }: { r: RevenueSummary }) {
  const active = r.activePlans.BASIC + r.activePlans.PRO + r.activePlans.MAX;
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        label="Collected this month"
        value={formatKES(r.monthCents)}
        hint={`${r.monthCount} payment${r.monthCount === 1 ? "" : "s"} · ${formatKES(r.last30Cents)} in the last 30 days`}
        icon={<TrendingUp className="h-4 w-4" />}
        href="/platform/payments?status=SUCCEEDED"
      />
      <StatCard
        label="Monthly recurring revenue"
        value={formatKES(r.mrrCents)}
        hint="Running plans at the price each was bought; yearly ÷ 12"
        icon={<Repeat className="h-4 w-4" />}
        href="/platform/subscriptions"
      />
      <StatCard
        label="Running plans"
        value={active}
        hint={`Basic ${r.activePlans.BASIC} · Pro ${r.activePlans.PRO} · Max ${r.activePlans.MAX}${r.complimentary ? ` · ${r.complimentary} complimentary` : ""}`}
        icon={<CreditCard className="h-4 w-4" />}
        href="/platform/subscriptions?status=ACTIVE"
      />
      <StatCard
        label="Needs attention"
        value={r.pastDue + r.failed7d}
        hint={`${r.pastDue} past due · ${r.failed7d} failed payments this week · ${r.processing} waiting`}
        icon={<AlertTriangle className="h-4 w-4" />}
        href={r.pastDue > 0 ? "/platform/subscriptions?status=PAST_DUE" : "/platform/payments?status=FAILED"}
      />
    </div>
  );
}

export function RevenueBreakdown({ r }: { r: RevenueSummary }) {
  const purpose: Record<string, string> = { SUBSCRIPTION: "Plans", CREDITS: "Top-ups", ORDER: "Done-for-you orders", TOKENS: "Tokens (old)" };
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {[
        { title: "This month by type", rows: r.byPurpose.map((x) => ({ label: purpose[x.purpose] ?? x.purpose, cents: x.cents, count: x.count })) },
        { title: "This month by method", rows: r.byMethod.map((x) => ({ label: x.method, cents: x.cents, count: x.count })) },
      ].map((block) => (
        <div key={block.title} className="card p-4">
          <p className="text-xs font-medium text-muted">{block.title}</p>
          {block.rows.length === 0 ? (
            <p className="mt-3 text-sm text-muted">Nothing collected yet this month.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {block.rows.map((row) => {
                const share = r.monthCents > 0 ? Math.round((row.cents / r.monthCents) * 100) : 0;
                return (
                  <li key={row.label}>
                    <div className="flex justify-between text-sm">
                      <span className="text-ink">{row.label}</span>
                      <span className="tabular-nums text-ink">
                        {formatKES(row.cents)} <span className="text-muted">({row.count})</span>
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-wash/[0.06]">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${share}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
