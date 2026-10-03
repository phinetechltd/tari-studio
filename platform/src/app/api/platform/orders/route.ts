import { ApiError, handler, parseBody } from "@/lib/api";
import { adminOrderSchema, createOrderForCustomer } from "@/server/platform-orders";

export const dynamic = "force-dynamic";

/**
 * Enter an order for a customer who asked by phone or WhatsApp. Platform admins
 * only; two-factor sign-in is required because it sets what someone is charged.
 */
export const POST = handler({ permission: "platform:manage", allowPlatform: true }, async ({ principal, request }) => {
  if (!principal.mfa) throw new ApiError(403, "MFA_REQUIRED", "Turn on two-factor authentication before pricing orders.");
  const input = await parseBody(request, adminOrderSchema);
  return createOrderForCustomer(principal, input, request);
});
