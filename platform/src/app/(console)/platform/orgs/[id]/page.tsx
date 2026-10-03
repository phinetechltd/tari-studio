import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PaymentStatus } from "@/components/platform/billing-bits";
import { Badge, PageHeader, TableWrap, formatDateTime } from "@/components/ui";
import { db } from "@/lib/db";
import { LIMIT_KEYS, PLAN_KEYS, effectiveLimits } from "@/lib/limits";
import { MODULE_LIST } from "@/lib/modules";
import { formatKES } from "@/lib/money";
import { PAID_PLAN_KEYS, PLAN_META } from "@/lib/pricing";
import { ROLES, ROLE_LABELS } from "@/lib/rbac";
import { requirePlatform } from "@/lib/session";
import { listModels } from "@/server/ai-models";
import { organizationAiUsage } from "@/server/ai-usage";
import { organizationBilling } from "@/server/platform-admin";
import { getPricing } from "@/server/pricing-store";

import { OrgBilling } from "./org-billing";
import { OrgControls } from "./org-controls";
import { OrgMembers } from "./org-members";
import { RenameOrg } from "./rename-org";

export const metadata: Metadata = { title: "Organisation" };
export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("en-KE", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Nairobi" });

const LEDGER_REASON: Record<string, string> = {
  PURCHASE: "Bought",
  GRANT: "Plan credits",
  SPEND: "Used",
  REFUND: "Refunded",
  ADJUST: "Adjusted",
  CONVERT: "Converted",
};

export default async function OrgDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePlatform();
  const { id } = await params;

  const org = await db.organization.findUnique({
    where: { id },
    include: {
      modules: { where: { enabled: true }, select: { moduleKey: true } },
      memberships: {
        orderBy: { createdAt: "asc" },
        select: { id: true, role: true, status: true, user: { select: { name: true, email: true } } },
      },
    },
  });
  if (!org) notFound();

  const [audit, billing, pricing, ai, models] = await Promise.all([
    db.auditLog.findMany({
      where: { organizationId: id },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: { id: true, action: true, entity: true, entityId: true, createdAt: true, userId: true },
    }),
    organizationBilling(id),
    getPricing(),
    organizationAiUsage(id),
    listModels(),
  ]);
  const modelLabel = (key: string) => models.find((m) => m.key === key)?.label ?? key;

  const actorIds = [...new Set(audit.map((a) => a.userId).filter((v): v is string => Boolean(v)))];
  const actors = new Map(
    (await db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]),
  );

  const overrides = (org.limitsOverride ?? {}) as Record<string, number | null>;
  const effective = effectiveLimits(org.plan, org.limitsOverride);
  const sub = billing.subscription;

  return (
    <>
      <PageHeader
        title={org.name}
        subtitle={`${org.slug} · created ${dateFmt.format(org.createdAt)}`}
        back={{ href: "/platform", label: "All organisations" }}
        actions={
          <>
            <Link href={`/platform/payments?org=${org.id}`} className="btn-quiet">
              Payments
            </Link>
            <Badge tone={org.status === "ACTIVE" ? "success" : "danger"}>{org.status === "ACTIVE" ? "Active" : "Suspended"}</Badge>
          </>
        }
      />

      <div className="space-y-8">
        <OrgBilling
          orgId={org.id}
          sub={{ ...sub, planName: PLAN_META[sub.plan].name }}
          credits={billing.balance.credits}
          unmetered={billing.balance.unmetered}
          paidTotalCents={billing.paidTotalCents}
          plans={PAID_PLAN_KEYS.map((k) => ({ key: k, name: PLAN_META[k].name, creditsPerMonth: pricing.plans[k].creditsPerMonth }))}
        />

        <div className="grid gap-6 xl:grid-cols-2">
          <section aria-labelledby="recent-payments">
            <div className="mb-3 flex items-center justify-between">
              <h2 id="recent-payments" className="text-lg font-medium">
                Recent payments
              </h2>
              <Link href={`/platform/payments?org=${org.id}`} className="text-sm text-primary hover:underline">
                See all
              </Link>
            </div>
            <TableWrap>
              <table className="w-full text-sm">
                <tbody>
                  {billing.payments.map((p) => (
                    <tr key={p.id} className="border-b border-line last:border-0">
                      <td className="px-4 py-2 whitespace-nowrap">
                        <Link href={`/platform/payments/${p.id}`} className="text-primary hover:underline">
                          {formatDateTime(p.createdAt)}
                        </Link>
                      </td>
                      <td className="px-4 py-2">
                        {p.description}
                        <span className="block text-xs text-muted">{p.method}</span>
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">{formatKES(p.amountCents)}</td>
                      <td className="px-4 py-2">
                        <PaymentStatus status={p.status} />
                      </td>
                    </tr>
                  ))}
                  {billing.payments.length === 0 ? (
                    <tr>
                      <td className="px-4 py-3 text-muted">No payments yet.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </TableWrap>
          </section>

          <section aria-labelledby="ai-usage">
            <h2 id="ai-usage" className="mb-3 text-lg font-medium">
              AI this month
            </h2>
            <div className="card p-4 text-sm">
              <p className="text-muted">
                Text AI (captions, replies, briefs): <span className="font-medium text-ink">US${ai.textUsd.toFixed(2)}</span> in {ai.textCalls} call{ai.textCalls === 1 ? "" : "s"}
                {ai.textLimitUsd !== null ? ` of a US$${ai.textLimitUsd.toFixed(2)} monthly allowance` : ", no limit on this plan"}.
                {ai.providerCredits ? ` Higgsfield charged the platform about ${ai.providerCredits.toLocaleString("en-KE", { maximumFractionDigits: 1 })} credits for its renders.` : ""}
              </p>
              {ai.models.length ? (
                <table className="mt-3 w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-muted">
                      <th className="py-1.5 font-medium">Model</th>
                      <th className="py-1.5 text-right font-medium">Made</th>
                      <th className="py-1.5 text-right font-medium">Failed</th>
                      <th className="py-1.5 text-right font-medium">Credits</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ai.models.map((m) => (
                      <tr key={m.modelKey} className="border-b border-line last:border-0">
                        <td className="py-1.5">{modelLabel(m.modelKey)}</td>
                        <td className="py-1.5 text-right tabular-nums">{m.ready}</td>
                        <td className="py-1.5 text-right tabular-nums text-muted">{m.failed}</td>
                        <td className="py-1.5 text-right tabular-nums">{m.credits.toLocaleString("en-KE")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="mt-2 text-muted">No images or videos this month.</p>
              )}
            </div>
          </section>

          <section aria-labelledby="ledger">
            <h2 id="ledger" className="mb-3 text-lg font-medium">
              Credit history
            </h2>
            <TableWrap>
              <table className="w-full text-sm">
                <tbody>
                  {billing.ledger.map((l) => (
                    <tr key={l.id} className="border-b border-line last:border-0">
                      <td className="px-4 py-2 whitespace-nowrap text-muted">{formatDateTime(l.createdAt)}</td>
                      <td className="px-4 py-2">
                        {LEDGER_REASON[l.reason] ?? l.reason}
                        {l.note ? <span className="block max-w-[260px] truncate text-xs text-muted" title={l.note}>{l.note}</span> : null}
                      </td>
                      <td className={`px-4 py-2 text-right tabular-nums ${l.delta > 0 ? "text-success" : l.delta < 0 ? "text-ink" : "text-muted"}`}>
                        {l.delta > 0 ? `+${l.delta}` : l.delta}
                        {l.kind !== "CREDIT" ? <span className="ml-1 text-xs text-muted">{l.kind.toLowerCase()}</span> : null}
                      </td>
                    </tr>
                  ))}
                  {billing.ledger.length === 0 ? (
                    <tr>
                      <td className="px-4 py-3 text-muted">No credit movements yet.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </TableWrap>
          </section>
        </div>

        <OrgMembers
          orgId={org.id}
          members={org.memberships.map((m) => ({ id: m.id, name: m.user.name, email: m.user.email, role: m.role, status: m.status }))}
          roles={ROLES.filter((r) => r !== "SUPER_ADMIN").map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
        />

        <OrgControls
          orgId={org.id}
          plan={org.plan}
          status={org.status}
          plans={[...PLAN_KEYS]}
          enabledModules={org.modules.map((m) => m.moduleKey)}
          modules={MODULE_LIST.map((m) => ({
            key: m.key,
            name: m.name,
            summary: m.summary,
            requires: m.requires.map((r) => MODULE_LIST.find((x) => x.key === r)!.name),
            comingSoon: m.comingSoon,
            release: m.release,
          }))}
          limitKeys={[...LIMIT_KEYS]}
          overrides={overrides}
          effective={effective}
        />

        <RenameOrg orgId={org.id} name={org.name} />

        <section aria-labelledby="audit">
          <h2 id="audit" className="mb-3 text-lg font-medium">
            Recent activity
          </h2>
          <TableWrap>
            <table className="w-full text-sm">
              <tbody>
                {audit.map((a) => (
                  <tr key={a.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-2 font-medium">{a.action}</td>
                    <td className="px-4 py-2">
                      {a.entity}
                      {a.entityId ? <span className="text-muted"> · {a.entityId.slice(0, 12)}</span> : null}
                    </td>
                    <td className="px-4 py-2 text-muted">{(a.userId && actors.get(a.userId)) ?? "System"}</td>
                    <td className="px-4 py-2 text-muted">{dateFmt.format(a.createdAt)}</td>
                  </tr>
                ))}
                {audit.length === 0 ? (
                  <tr>
                    <td className="px-4 py-3 text-muted">Nothing recorded yet.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </TableWrap>
        </section>
      </div>
    </>
  );
}
