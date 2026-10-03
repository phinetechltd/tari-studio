import { handler, parseBody } from "@/lib/api";
import { createOrder, orderSchema } from "@/server/orders";

export const dynamic = "force-dynamic";

/**
 * A done-for-you order from the landing page. Public: no account is needed.
 * The price is recomputed on the server and an M-Pesa prompt goes to the phone.
 */
export const POST = handler({ public: true }, async ({ request }) => {
  const input = await parseBody(request, orderSchema);
  return createOrder(input, request);
});
