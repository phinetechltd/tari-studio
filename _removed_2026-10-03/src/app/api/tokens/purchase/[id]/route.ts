import { handler, notFound } from "@/lib/api";
import { db } from "@/lib/db";
import { orgIdOf } from "@/lib/tenant";
import { refreshIfDue } from "@/server/payments";
import { balances } from "@/server/tokens";

export const dynamic = "force-dynamic";

/** Polled by the Buy tokens dialog; asks M-Pesa for a verdict once the prompt has had time. */
export const GET = handler<{ id: string }>({ permission: "token:buy" }, async ({ principal, params }) => {
  const organizationId = orgIdOf(principal);
  const intent = await db.paymentIntent.findFirst({ where: { id: params.id, organizationId, purpose: "TOKENS" } });
  if (!intent) throw notFound("Payment not found.");
  const fresh = await refreshIfDue(intent);
  return {
    id: fresh.id,
    status: fresh.status,
    amountCents: fresh.amountCents,
    failureReason: fresh.failureReason,
    receiptRef: fresh.receiptRef,
    balance: fresh.status === "SUCCEEDED" ? await balances(organizationId) : null,
  };
});
