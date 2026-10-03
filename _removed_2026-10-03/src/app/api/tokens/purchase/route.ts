import { z } from "zod";

import { ApiError, fail, handler, parseBody } from "@/lib/api";
import { canonicalPhone } from "@/lib/identity";
import { MAX_IMAGE_TOKENS_PER_PURCHASE, MAX_VIDEO_TOKENS_PER_PURCHASE, PricingError, quoteTokenPurchase } from "@/lib/pricing";
import { hit } from "@/lib/ratelimit";
import { orgIdOf } from "@/lib/tenant";
import { startPayment } from "@/server/payments";

export const dynamic = "force-dynamic";

const body = z.object({
  imageTokens: z.coerce.number().int().min(0).max(MAX_IMAGE_TOKENS_PER_PURCHASE).default(0),
  videoTokens: z.coerce.number().int().min(0).max(MAX_VIDEO_TOKENS_PER_PURCHASE).default(0),
  phone: z.string().trim().min(9).max(20),
});

/** Buys tokens with an M-Pesa prompt. Tokens are credited only once Safaricom confirms. */
export const POST = handler({ permission: "token:buy" }, async ({ principal, request }) => {
  const organizationId = orgIdOf(principal);
  const input = await parseBody(request, body);

  const phone = canonicalPhone(input.phone);
  if (!phone || !/^254[17]\d{8}$/.test(phone)) {
    throw new ApiError(422, "VALIDATION_FAILED", "Enter a Safaricom number, e.g. 0712 345 678.");
  }

  let amountCents: number;
  try {
    amountCents = quoteTokenPurchase({ imageTokens: input.imageTokens, videoTokens: input.videoTokens });
  } catch (e) {
    if (e instanceof PricingError) throw new ApiError(422, "VALIDATION_FAILED", e.message);
    throw e;
  }

  const rate = await hit(`tokens:stk:${organizationId}`, { limit: 6, windowSec: 15 * 60 });
  if (!rate.allowed) {
    return fail(429, "RATE_LIMITED", "Too many payment prompts. Try again in a few minutes.", undefined, {
      headers: { "Retry-After": String(rate.retryAfterSec) },
    });
  }

  const { intent, message } = await startPayment({
    organizationId,
    purpose: "TOKENS",
    imageTokens: input.imageTokens,
    videoTokens: input.videoTokens,
    phone,
    amountCents,
    reference: "TOKENS",
    description: "AI tokens",
    createdById: principal.userId,
    request,
  });

  return {
    id: intent.id,
    status: intent.status,
    amountCents: intent.amountCents,
    failureReason: intent.failureReason,
    message,
    simulated: intent.provider === "SIMULATOR",
  };
});
