import { ApiError, handler } from "@/lib/api";
import { submitOrder } from "@/server/platform-orders";

export const dynamic = "force-dynamic";

/** Sends a priced order to the customer: it becomes payable on their order page. */
export const POST = handler<{ id: string }>({ permission: "platform:manage", allowPlatform: true }, async ({ principal, request, params }) => {
  if (!principal.mfa) throw new ApiError(403, "MFA_REQUIRED", "Turn on two-factor authentication before submitting orders.");
  const { order, notified } = await submitOrder(principal, params.id, request);
  return { id: order.id, status: order.status, notified };
});
