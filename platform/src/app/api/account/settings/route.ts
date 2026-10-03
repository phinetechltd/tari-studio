import { z } from "zod";

import { handler, parseBody } from "@/lib/api";
import { GATEWAYS, saveGateway } from "@/server/gateways";

/**
 * Per-organisation gateway settings: the keys an Owner sets from the console.
 *
 * GET returns every gateway's current state, secrets masked to a hint.
 * PUT saves one gateway at a time; a blank secret keeps the stored one.
 * Writes are org:write, which is deliberately NOT in MFA_PERMISSIONS: an Owner
 * configures their own deployment's keys without enrolling first, and the
 * actions those keys unlock (connecting, approving, inviting) stay MFA-gated.
 */

const putBody = z.object({
  gateway: z.enum(Object.keys(GATEWAYS) as [keyof typeof GATEWAYS, ...(keyof typeof GATEWAYS)[]]),
  values: z.record(z.string(), z.union([z.string(), z.null()])).default({}),
});

export const GET = handler({ authOnly: true }, async ({ principal }) => {
  const { gatewayStatus } = await import("@/server/gateways");
  return gatewayStatus(principal.organizationId ?? null);
});

export const PUT = handler({ permission: "org:write" }, async ({ principal, request }) => {
  if (!principal.organizationId) throw new Error("Gateway settings live inside an organisation.");
  const { gateway, values } = await parseBody(request, putBody);
  return saveGateway(principal.organizationId, gateway, values);
});
