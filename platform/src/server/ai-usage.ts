import "server-only";

import { db } from "@/lib/db";
import { effectiveLimits } from "@/lib/limits";

import { fromMilli, monthStartEAT, PROVIDER } from "./ai-credits";

/**
 * Reports for Platform admin → AI & credits and the organisation page: what
 * customers spent in credits, what the provider charged us, and what text AI
 * cost, by model, by organisation and by day.
 */

const DAY = 86_400_000;

export interface ModelUsageRow {
  modelKey: string;
  generations: number;
  failed: number;
  customerCredits: number;
  providerCredits: number;
  providerUsd: number;
}

export async function usageReport(days = 30, now = new Date()) {
  const since = new Date(now.getTime() - days * DAY);

  const [byModel, failedByModel, ledgerByModel, ledgerByOrg, ledgerRows, textByModel, textByOrg, textRows] = await Promise.all([
    db.generatedAsset.groupBy({ by: ["modelKey"], where: { createdAt: { gte: since }, status: "READY" }, _count: { _all: true }, _sum: { tokensCharged: true } }),
    db.generatedAsset.groupBy({ by: ["modelKey"], where: { createdAt: { gte: since }, status: "FAILED" }, _count: { _all: true } }),
    db.providerCreditLedger.groupBy({ by: ["modelKey"], where: { provider: PROVIDER, kind: "USAGE", createdAt: { gte: since } }, _sum: { milliCredits: true, usdMicros: true } }),
    db.providerCreditLedger.groupBy({ by: ["organizationId"], where: { provider: PROVIDER, kind: "USAGE", createdAt: { gte: since } }, _sum: { milliCredits: true }, _count: { _all: true } }),
    db.providerCreditLedger.findMany({ where: { provider: PROVIDER, kind: "USAGE", createdAt: { gte: since } }, select: { createdAt: true, milliCredits: true } }),
    db.aiUsage.groupBy({ by: ["model"], where: { createdAt: { gte: since } }, _count: { _all: true }, _sum: { costMicros: true, inputTokens: true, outputTokens: true } }),
    db.aiUsage.groupBy({ by: ["organizationId"], where: { createdAt: { gte: since } }, _sum: { costMicros: true }, _count: { _all: true } }),
    db.aiUsage.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true, costMicros: true } }),
  ]);

  const failed = new Map(failedByModel.map((r) => [r.modelKey ?? "", r._count._all]));
  const cost = new Map(ledgerByModel.map((r) => [r.modelKey ?? "", r._sum]));
  const models: ModelUsageRow[] = byModel
    .map((r) => {
      const key = r.modelKey ?? "";
      const c = cost.get(key);
      return {
        modelKey: key || "(before the catalogue)",
        generations: r._count._all,
        failed: failed.get(key) ?? 0,
        customerCredits: r._sum.tokensCharged ?? 0,
        providerCredits: fromMilli(-(c?.milliCredits ?? 0)),
        providerUsd: -(c?.usdMicros ?? 0) / 1_000_000 + 0,
      };
    })
    .sort((a, b) => b.providerCredits - a.providerCredits || b.generations - a.generations);

  // Organisations: generation credits and text AI side by side.
  const orgIds = Array.from(new Set([...ledgerByOrg.map((r) => r.organizationId), ...textByOrg.map((r) => r.organizationId)].filter((x): x is string => Boolean(x))));
  const orgs = await db.organization.findMany({ where: { id: { in: orgIds } }, select: { id: true, name: true } });
  const nameOf = new Map(orgs.map((o) => [o.id, o.name]));
  const textOf = new Map(textByOrg.map((r) => [r.organizationId, { usd: (r._sum.costMicros ?? 0) / 1_000_000, calls: r._count._all }]));
  const genOf = new Map(ledgerByOrg.map((r) => [r.organizationId ?? "", { credits: fromMilli(-(r._sum.milliCredits ?? 0)), generations: r._count._all }]));
  const organizations = orgIds
    .map((id) => ({
      organizationId: id,
      name: nameOf.get(id) ?? "(deleted)",
      generations: genOf.get(id)?.generations ?? 0,
      providerCredits: genOf.get(id)?.credits ?? 0,
      textUsd: textOf.get(id)?.usd ?? 0,
      textCalls: textOf.get(id)?.calls ?? 0,
    }))
    .sort((a, b) => b.providerCredits - a.providerCredits || b.textUsd - a.textUsd)
    .slice(0, 25);

  // Day by day, East Africa time.
  const dayKey = (d: Date) => new Date(d.getTime() + 3 * 3_600_000).toISOString().slice(0, 10);
  const daily = new Map<string, { providerCredits: number; textUsd: number }>();
  for (let i = days - 1; i >= 0; i--) daily.set(dayKey(new Date(now.getTime() - i * DAY)), { providerCredits: 0, textUsd: 0 });
  for (const r of ledgerRows) {
    const d = daily.get(dayKey(r.createdAt));
    if (d) d.providerCredits += fromMilli(-r.milliCredits);
  }
  for (const r of textRows) {
    const d = daily.get(dayKey(r.createdAt));
    if (d) d.textUsd += r.costMicros / 1_000_000;
  }

  return {
    days,
    models,
    organizations,
    daily: Array.from(daily, ([day, v]) => ({ day, ...v })),
    text: textByModel
      .map((r) => ({ model: r.model, calls: r._count._all, usd: (r._sum.costMicros ?? 0) / 1_000_000, inputTokens: r._sum.inputTokens ?? 0, outputTokens: r._sum.outputTokens ?? 0 }))
      .sort((a, b) => b.usd - a.usd),
    totals: {
      generations: models.reduce((n, m) => n + m.generations, 0),
      customerCredits: models.reduce((n, m) => n + m.customerCredits, 0),
      providerCredits: models.reduce((n, m) => n + m.providerCredits, 0),
      providerUsd: models.reduce((n, m) => n + m.providerUsd, 0),
      textUsd: textByModel.reduce((n, r) => n + (r._sum.costMicros ?? 0) / 1_000_000, 0),
    },
  };
}

/** The provider ledger's latest movements (top-ups, adjustments, expiries), for the admin page. */
export async function recentLedgerMoves(take = 15) {
  const rows = await db.providerCreditLedger.findMany({
    where: { provider: PROVIDER, kind: { in: ["TOPUP", "ADJUST", "EXPIRE"] } },
    orderBy: { createdAt: "desc" },
    take,
  });
  const people = await db.user.findMany({ where: { id: { in: rows.map((r) => r.createdById).filter((x): x is string => Boolean(x)) } }, select: { id: true, name: true } });
  const nameOf = new Map(people.map((p) => [p.id, p.name]));
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    credits: fromMilli(r.milliCredits),
    usd: r.usdMicros !== null ? r.usdMicros / 1_000_000 : null,
    expiresAt: r.expiresAt?.toISOString() ?? null,
    remaining: r.kind === "TOPUP" && !r.expiredAt ? fromMilli(r.milliCredits - r.consumedMilli) : null,
    note: r.note,
    by: r.createdById ? (nameOf.get(r.createdById) ?? null) : null,
    createdAt: r.createdAt.toISOString(),
  }));
}

/** One organisation's AI this month: generations by model, and text AI against its plan's allowance. */
export async function organizationAiUsage(organizationId: string, now = new Date()) {
  const since = monthStartEAT(now);
  const [org, gens, text, provider] = await Promise.all([
    db.organization.findUnique({ where: { id: organizationId }, select: { plan: true, limitsOverride: true } }),
    db.generatedAsset.groupBy({ by: ["modelKey", "status"], where: { organizationId, createdAt: { gte: since } }, _count: { _all: true }, _sum: { tokensCharged: true } }),
    db.aiUsage.aggregate({ where: { organizationId, createdAt: { gte: since } }, _sum: { costMicros: true }, _count: { _all: true } }),
    db.providerCreditLedger.aggregate({ where: { organizationId, provider: PROVIDER, kind: "USAGE", createdAt: { gte: since } }, _sum: { milliCredits: true } }),
  ]);
  const limit = org ? effectiveLimits(org.plan, org.limitsOverride).aiCreditsMicros : null;
  const byModel = new Map<string, { ready: number; failed: number; credits: number }>();
  for (const g of gens) {
    const key = g.modelKey ?? "(before the catalogue)";
    const row = byModel.get(key) ?? { ready: 0, failed: 0, credits: 0 };
    if (g.status === "READY") {
      row.ready += g._count._all;
      row.credits += g._sum.tokensCharged ?? 0;
    } else if (g.status === "FAILED") row.failed += g._count._all;
    byModel.set(key, row);
  }
  return {
    models: Array.from(byModel, ([modelKey, v]) => ({ modelKey, ...v })).sort((a, b) => b.credits - a.credits),
    providerCredits: fromMilli(-(provider._sum.milliCredits ?? 0)),
    textUsd: (text._sum.costMicros ?? 0) / 1_000_000,
    textCalls: text._count._all,
    textLimitUsd: limit === null ? null : limit / 1_000_000,
  };
}
