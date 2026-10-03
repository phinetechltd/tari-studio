import { handler, notFound } from "@/lib/api";
import { db } from "@/lib/db";
import { orgIdOf } from "@/lib/tenant";
import { refreshIfDue } from "@/server/payments";

export const dynamic = "force-dynamic";

/** Polled while an M-Pesa prompt is open; asks the provider for a verdict once it has had time. */
export const GET = handler<{ id: string }>({ authOnly: true }, async ({ principal, params }) => {
  const organizationId = orgIdOf(principal);
  const intent = await db.paymentIntent.findFirst({
    where: { id: params.id, organizationId, purpose: { in: ["CREDITS", "SUBSCRIPTION", "TOKENS"] } },
  });
  if (!intent) throw notFound("Payment not found.");
  const fresh = await refreshIfDue(intent);
  return {
    id: fresh.id,
    purpose: fresh.purpose,
    status: fresh.status,
    amountCents: fresh.amountCents,
    failureReason: fresh.failureReason,
    receiptRef: fresh.receiptRef,
  };
});
