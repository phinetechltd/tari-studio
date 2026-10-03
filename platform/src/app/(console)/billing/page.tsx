import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { BillingApp, type BillingPayment } from "@/components/billing/billing-app";
import { Hint } from "@/components/hints/hint";
import { Notice, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { formatKES } from "@/lib/money";
import { isBillingCycle, isPaidPlan, PLAN_META } from "@/lib/pricing";
import { can } from "@/lib/rbac";
import { requireTenant } from "@/lib/session";
import { wallet } from "@/server/credits";
import { intentByReference, settleIntent } from "@/server/payments";
import { getPricing } from "@/server/pricing-store";
import { getSubscription, paymentMethods } from "@/server/subscriptions";

export const metadata: Metadata = { title: "Plan & billing" };
export const dynamic = "force-dynamic";

function describe(p: { purpose: string; planKey: string | null; billingCycle: string | null; credits: number; automatic: boolean }): string {
  if (p.purpose === "SUBSCRIPTION" && isPaidPlan(p.planKey)) {
    const name = PLAN_META[p.planKey].name;
    return `${name} plan, ${p.billingCycle === "ANNUAL" ? "yearly" : "monthly"}${p.automatic ? " (renewal)" : ""}`;
  }
  if (p.purpose === "CREDITS") return `${p.credits.toLocaleString("en-KE")} credits`;
  if (p.purpose === "TOKENS") return "Tokens (before credits)";
  return p.purpose;
}

/**
 * Plan & billing. Paystack sends customers back here with ?reference=…, which
 * is settled straight away (by asking Paystack), so the page shows the outcome
 * without waiting for the webhook.
 */
export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; cycle?: string; reference?: string; trxref?: string }>;
}) {
  const { principal, organizationId } = await requireTenant();
  if (!can(principal, "org:read")) redirect("/app?denied=org%3Aread");
  const sp = await searchParams;

  let returned: { status: string; title: string; detail: string | null } | null = null;
  const reference = sp.reference ?? sp.trxref;
  if (reference) {
    const intent = await intentByReference(reference);
    if (intent && intent.organizationId === organizationId) {
      const settled = await settleIntent(intent.id);
      const what = describe({ ...settled });
      returned =
        settled.status === "SUCCEEDED"
          ? { status: "success", title: `Paid: ${what}`, detail: `${formatKES(settled.amountCents)} received. Thank you.` }
          : settled.status === "FAILED"
            ? { status: "danger", title: "The payment did not go through", detail: settled.failureReason }
            : { status: "info", title: "Waiting for Paystack to confirm", detail: "This usually takes a few seconds. Refresh the page, or carry on: credits arrive by themselves." };
    }
  }

  const [w, subscription, intents, me, pricing] = await Promise.all([
    wallet(organizationId),
    getSubscription(organizationId),
    db.paymentIntent.findMany({
      where: { organizationId, purpose: { in: ["CREDITS", "SUBSCRIPTION", "TOKENS"] } },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    db.user.findUnique({ where: { id: principal.userId }, select: { email: true } }),
    getPricing(),
  ]);
  const billingSub = await db.subscription.findUnique({ where: { organizationId }, select: { billingEmail: true } });

  const payments: BillingPayment[] = intents.map((p) => ({
    id: p.id,
    createdAt: p.createdAt.toISOString(),
    purpose: p.purpose,
    description: describe(p),
    amountCents: p.amountCents,
    status: p.status,
    method: p.provider.startsWith("PAYSTACK") ? `Paystack${p.channel ? ` (${p.channel.replace("_", " ")})` : ""}` : "M-Pesa",
    receiptRef: p.status === "SUCCEEDED" ? p.receiptRef : null,
  }));

  const preselect = isPaidPlan(sp.plan) ? { plan: sp.plan, cycle: isBillingCycle(sp.cycle) ? sp.cycle : ("MONTHLY" as const) } : null;

  return (
    <div className="space-y-6">
      <PageHeader title="Plan & billing" subtitle="Your plan, your credits, and how you pay: M-Pesa or Paystack." />
      <Hint id="billing.intro" title="How credits work">
        Credits pay for images and videos. A plan adds credits every month and runs more generations at once; top-up credits never expire. Pay by M-Pesa or card.
      </Hint>
      {returned ? (
        <Notice tone={returned.status as "success" | "danger" | "info"} title={returned.title}>
          {returned.detail}
        </Notice>
      ) : null}
      {!can(principal, "org:write") ? (
        <Notice tone="info" title="Only owners change the plan">
          You can see the plan and credits; ask an owner to change it.
        </Notice>
      ) : null}
      <BillingApp
        pricing={pricing}
        credits={w.credits}
        unmetered={w.unmetered}
        subscription={subscription}
        methods={paymentMethods()}
        billingEmail={billingSub?.billingEmail ?? me?.email ?? null}
        canPlan={can(principal, "org:write")}
        canTopUp={can(principal, "token:buy")}
        payments={payments}
        preselect={preselect}
      />
    </div>
  );
}
