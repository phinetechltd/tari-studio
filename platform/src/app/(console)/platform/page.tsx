import type { Metadata } from "next";
import Link from "next/link";

import { Hint } from "@/components/hints/hint";
import { RevenueCards, SubscriptionStatus } from "@/components/platform/billing-bits";
import { LaunchChecklist } from "@/components/platform/launch-checklist";
import { Badge, EmptyState, PageHeader, TableWrap } from "@/components/ui";
import { db } from "@/lib/db";
import { PLAN_KEYS } from "@/lib/limits";
import { formatKES } from "@/lib/money";
import { isPaidPlan, PLAN_META } from "@/lib/pricing";
import { requirePlatform } from "@/lib/session";
import { revenueSummary } from "@/server/platform-admin";

import { CreateOrgForm } from "./create-org-form";

export const metadata: Metadata = { title: "Organisations" };
export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("en-KE", { dateStyle: "medium", timeZone: "Africa/Nairobi" });

/** Every agency on the platform, what it is on, and what it has paid. */
export default async function PlatformHome({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; plan?: string; billing?: string }> }) {
  await requirePlatform();
  const f = await searchParams;

  const where = {
    ...(f.q?.trim()
      ? { OR: [{ name: { contains: f.q.trim(), mode: "insensitive" as const } }, { slug: { contains: f.q.trim().toLowerCase() } }] }
      : {}),
    ...(f.status === "ACTIVE" || f.status === "SUSPENDED" ? { status: f.status } : {}),
    ...(f.plan && (PLAN_KEYS as readonly string[]).includes(f.plan) ? { plan: f.plan } : {}),
    ...(f.billing === "PAYING"
      ? { subscription: { status: { in: ["ACTIVE", "PAST_DUE"] }, paymentMethod: { not: "COMP" } } }
      : f.billing === "FREE"
        ? { OR: [{ subscription: null }, { subscription: { status: "EXPIRED" } }] }
        : f.billing === "PAST_DUE"
          ? { subscription: { status: "PAST_DUE" } }
          : {}),
  };

  const [orgs, summary, paid, balances] = await Promise.all([
    db.organization.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 300,
      select: {
        id: true,
        name: true,
        slug: true,
        plan: true,
        status: true,
        createdAt: true,
        subscription: { select: { plan: true, cycle: true, status: true, paymentMethod: true } },
        _count: { select: { memberships: { where: { status: "ACTIVE" } }, modules: { where: { enabled: true } } } },
      },
    }),
    revenueSummary(),
    db.paymentIntent.groupBy({ by: ["organizationId"], where: { status: "SUCCEEDED" }, _sum: { amountCents: true } }),
    db.tokenBalance.findMany({ where: { kind: "CREDIT" }, select: { organizationId: true, balance: true } }),
  ]);
  const paidBy = new Map(paid.map((p) => [p.organizationId, p._sum.amountCents ?? 0]));
  const creditsBy = new Map(balances.map((b) => [b.organizationId, b.balance]));
  const filtered = Boolean(f.q || f.status || f.plan || f.billing);

  return (
    <>
      <PageHeader
        title="Organisations"
        subtitle="Every agency on the platform: its plan, what it has paid, and its workspace."
        actions={
          <>
            <Link href="/platform/subscriptions" className="btn-quiet">
              Subscriptions
            </Link>
            <Link href="/platform/payments" className="btn-quiet">
              Payments
            </Link>
          </>
        }
      />

      <Hint id="platform.home" title="Your control room">
        Every agency on the platform is listed here. Open one to change its plan, credits or people. Subscriptions and Payments track the money; AI &amp; credits tracks what generation costs you; Notifications sets how alerts reach you.
      </Hint>

      <RevenueCards r={summary} />

      <LaunchChecklist />

      <form className="mt-8 flex flex-wrap items-end gap-3" method="get">
        <div>
          <label className="label" htmlFor="org-q">Search</label>
          <input id="org-q" name="q" className="input w-56" defaultValue={f.q ?? ""} placeholder="Name or slug" />
        </div>
        <div>
          <label className="label" htmlFor="org-billing">Billing</label>
          <select id="org-billing" name="billing" className="input w-40" defaultValue={f.billing ?? ""}>
            <option value="">Any</option>
            <option value="PAYING">On a paid plan</option>
            <option value="PAST_DUE">Past due</option>
            <option value="FREE">Free / ended</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="org-plan">Workspace plan</label>
          <select id="org-plan" name="plan" className="input w-40" defaultValue={f.plan ?? ""}>
            <option value="">Any</option>
            {PLAN_KEYS.map((p) => (
              <option key={p} value={p}>
                {p.charAt(0) + p.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="org-status">Status</label>
          <select id="org-status" name="status" className="input w-36" defaultValue={f.status ?? ""}>
            <option value="">Any</option>
            <option value="ACTIVE">Active</option>
            <option value="SUSPENDED">Suspended</option>
          </select>
        </div>
        <button type="submit" className="btn-primary">Filter</button>
        {filtered ? (
          <Link href="/platform" className="btn-quiet">Clear</Link>
        ) : null}
      </form>

      <div className="mt-4">
        {orgs.length === 0 ? (
          <EmptyState title={filtered ? "No organisations match" : "No organisations yet"}>{filtered ? "Clear the filters to see them all." : "Create the first one below."}</EmptyState>
        ) : (
          <TableWrap>
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-muted">
                  <th className="px-4 py-2 font-medium">Agency</th>
                  <th className="px-4 py-2 font-medium">Plan</th>
                  <th className="px-4 py-2 font-medium">Workspace</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 text-right font-medium">Credits</th>
                  <th className="px-4 py-2 text-right font-medium">Paid to date</th>
                  <th className="px-4 py-2 text-right font-medium">Members</th>
                  <th className="px-4 py-2 font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {orgs.map((o) => {
                  const s = o.subscription;
                  const running = s && s.status !== "EXPIRED" && isPaidPlan(s.plan);
                  return (
                    <tr key={o.id} className="border-b border-line last:border-0">
                      <td className="px-4 py-2">
                        <Link
                          href={`/platform/orgs/${o.id}`}
                          className="inline-flex min-h-[36px] items-center font-medium text-primary underline-offset-2 hover:underline"
                        >
                          {o.name}
                        </Link>
                        <div className="text-xs text-muted">{o.slug}</div>
                      </td>
                      <td className="px-4 py-2">
                        {running ? (
                          <span className="flex flex-wrap items-center gap-1.5">
                            {PLAN_META[s.plan as keyof typeof PLAN_META].name}
                            <span className="text-xs text-muted">{s.cycle === "ANNUAL" ? "yearly" : "monthly"}</span>
                            {s.paymentMethod === "COMP" ? <Badge tone="primary">Comp</Badge> : null}
                            {s.status === "PAST_DUE" ? <SubscriptionStatus status={s.status} /> : null}
                          </span>
                        ) : (
                          <span className="text-muted">Free</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-muted">{o.plan.charAt(0) + o.plan.slice(1).toLowerCase()}</td>
                      <td className="px-4 py-2">
                        <Badge tone={o.status === "ACTIVE" ? "success" : "danger"}>{o.status === "ACTIVE" ? "Active" : "Suspended"}</Badge>
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">{o.plan === "INTERNAL" ? "∞" : (creditsBy.get(o.id) ?? 0).toLocaleString("en-KE")}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{formatKES(paidBy.get(o.id) ?? 0)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{o._count.memberships}</td>
                      <td className="px-4 py-2 text-muted">{dateFmt.format(o.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
        )}
      </div>

      <section aria-labelledby="create" className="card mt-8 max-w-lg p-5">
        <h2 id="create" className="mb-3 text-lg font-medium">
          Create an organisation
        </h2>
        <CreateOrgForm />
      </section>
    </>
  );
}
