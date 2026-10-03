import { z } from "zod";

import { handler, parseBody } from "@/lib/api";
import { retryOrderPayment } from "@/server/orders";

export const dynamic = "force-dynamic";

const body = z.object({
  phone: z.string().trim().max(20).optional(),
  payWith: z.enum(["MPESA", "PAYSTACK"]).optional(),
  email: z.string().trim().max(254).optional(),
});

/** Tries an unpaid order's payment again: a fresh M-Pesa prompt (optionally to another number) or a Paystack checkout. */
export const POST = handler<{ token: string }>({ public: true }, async ({ request, params }) => {
  const { phone, payWith, email } = await parseBody(request, body);
  return retryOrderPayment(params.token, phone || undefined, request, { payWith, email: email || undefined });
});
