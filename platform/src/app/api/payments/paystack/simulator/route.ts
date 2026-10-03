import { z } from "zod";

import { fail, handler, parseBody } from "@/lib/api";
import { isProduction } from "@/lib/env";
import { simulateCheckout } from "@/lib/payments/paystack";
import { configuredProviderName } from "@/lib/providers";
import { intentByReference, settleIntent } from "@/server/payments";

export const dynamic = "force-dynamic";

const body = z.object({ reference: z.string().min(6).max(100), outcome: z.enum(["success", "failed"]) });

/**
 * The Paystack simulator's "customer pressed Pay" (development only). Records
 * the outcome, then settles through the same verify path a real payment takes.
 */
export const POST = handler({ public: true }, async ({ request }) => {
  if (isProduction() || configuredProviderName("PAYSTACK") !== "simulator") {
    return fail(404, "NOT_FOUND", "Not found.");
  }
  const input = await parseBody(request, body);
  const intent = await intentByReference(input.reference);
  if (!intent || intent.provider !== "PAYSTACK_SIMULATOR") return fail(404, "NOT_FOUND", "No simulated checkout with that reference.");
  simulateCheckout(input.reference, input.outcome);
  const settled = await settleIntent(intent.id);
  return { status: settled.status };
});
