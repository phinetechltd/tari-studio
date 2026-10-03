import { ApiError, handler, parseBody } from "@/lib/api";
import { getOrder, updateOrder, updateOrderSchema } from "@/server/platform-orders";

export const dynamic = "force-dynamic";

export const GET = handler<{ id: string }>({ permission: "platform:manage", allowPlatform: true }, async ({ params }) => {
  const { order } = await getOrder(params.id);
  return { id: order.id, status: order.status, amountCents: order.amountCents };
});

/** Correct an order's details, set its price (with a reason), or add a note. */
export const PATCH = handler<{ id: string }>({ permission: "platform:manage", allowPlatform: true }, async ({ principal, request, params }) => {
  if (!principal.mfa) throw new ApiError(403, "MFA_REQUIRED", "Turn on two-factor authentication before pricing orders.");
  const input = await parseBody(request, updateOrderSchema);
  const { order } = await updateOrder(principal, params.id, input, request);
  return { id: order.id, status: order.status, amountCents: order.amountCents };
});
