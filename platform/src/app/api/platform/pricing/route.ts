import { ApiError, handler } from "@/lib/api";
import { pricingStatus, resetPricing, savePricing } from "@/server/pricing-store";

export const dynamic = "force-dynamic";

/**
 * The price list (plans, credit costs, top-up packs), for platform admins
 * only. Changing it changes what every customer is charged from the next
 * purchase, so saving and resetting need two-factor sign-in.
 */

export const GET = handler({ permission: "platform:manage", allowPlatform: true }, async () => pricingStatus());

export const PUT = handler({ permission: "platform:manage", allowPlatform: true }, async ({ principal, request }) => {
  if (!principal.mfa) throw new ApiError(403, "MFA_REQUIRED", "Turn on two-factor authentication before changing prices.");
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiError(400, "BAD_REQUEST", "Send the price list as JSON.");
  }
  return savePricing(principal, (body as { pricing?: unknown } | null)?.pricing, request);
});

export const DELETE = handler({ permission: "platform:manage", allowPlatform: true }, async ({ principal, request }) => {
  if (!principal.mfa) throw new ApiError(403, "MFA_REQUIRED", "Turn on two-factor authentication before changing prices.");
  return resetPricing(principal, request);
});
