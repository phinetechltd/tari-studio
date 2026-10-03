import { handler } from "@/lib/api";
import { db } from "@/lib/db";
import { orgIdOf } from "@/lib/tenant";
import { recentLedger, wallet } from "@/server/credits";
import { getPricing } from "@/server/pricing-store";
import { paymentMethods } from "@/server/subscriptions";

export const dynamic = "force-dynamic";

/** The organisation's credits, recent movements, and the ways it can pay. */
export const GET = handler({ permission: "ai:generate" }, async ({ principal }) => {
  const organizationId = orgIdOf(principal);
  const [balance, ledger, sub, pricing] = await Promise.all([
    wallet(organizationId),
    recentLedger(organizationId, 30),
    db.subscription.findUnique({ where: { organizationId }, select: { billingEmail: true } }),
    getPricing(),
  ]);
  const me = await db.user.findUnique({ where: { id: principal.userId }, select: { email: true } });
  return {
    balance,
    methods: paymentMethods(),
    pricing,
    billingEmail: sub?.billingEmail ?? me?.email ?? null,
    ledger: ledger.map((l) => ({ ...l, createdAt: l.createdAt.toISOString() })),
  };
});
