import { z } from "zod";

import { handler, parseBody } from "@/lib/api";
import { orgIdOf } from "@/lib/tenant";
import { payForCredits } from "@/server/subscriptions";

export const dynamic = "force-dynamic";

const body = z.object({
  pack: z.string().min(1).max(40),
  method: z.enum(["MPESA", "PAYSTACK"]),
  phone: z.string().trim().max(20).optional(),
  email: z.string().trim().max(254).optional(),
});

/** Buys a credit pack. Credits are added only once M-Pesa or Paystack confirms. */
export const POST = handler({ permission: "token:buy" }, async ({ principal, request }) => {
  const input = await parseBody(request, body);
  return payForCredits({ organizationId: orgIdOf(principal), userId: principal.userId, request }, input.pack, input);
});
