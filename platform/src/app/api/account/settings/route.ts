import { z } from "zod";

import { PRODUCT_NAME } from "@/lib/brand";
import { ApiError, handler, parseBody } from "@/lib/api";
import { GATEWAYS, saveGateway } from "@/server/gateways";

/**
 * Per-organisation gateway settings: the keys an Owner sets from the console.
 *
 * GET returns the gateways an agency may manage (its own social media app),
 * secrets masked to a hint. PUT saves one gateway at a time; a blank secret
 * keeps the stored one. Writes are org:write, which is deliberately NOT in
 * MFA_PERMISSIONS: an Owner configures their own Meta app without enrolling
 * first, and the actions it unlocks (connecting, approving, inviting) stay
 * MFA-gated.
 *
 * AI, generation and payment credentials are platform-managed by the platform
 * admin and are refused here even for an Owner — hiding the form is not the
 * defence; this check is.
 */

const putBody = z.object({
  gateway: z.string().min(1).max(40),
  values: z.record(z.string(), z.union([z.string(), z.null()])).default({}),
});

export const GET = handler({ authOnly: true }, async ({ principal }) => {
  const { gatewayStatus } = await import("@/server/gateways");
  return gatewayStatus(principal.organizationId ?? null);
});

export const PUT = handler({ permission: "org:write" }, async ({ principal, request }) => {
  if (!principal.organizationId) throw new Error("Gateway settings live inside an organisation.");
  const { gateway, values } = await parseBody(request, putBody);
  if (!Object.hasOwn(GATEWAYS, gateway)) {
    throw new ApiError(403, "FORBIDDEN", `AI, generation and payment credentials are managed by ${PRODUCT_NAME}, not by your agency. You can only manage your own social media app here.`);
  }
  return saveGateway(principal.organizationId, gateway, values);
});
