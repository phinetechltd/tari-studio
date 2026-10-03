import { z } from "zod";

import { ApiError, handler, parseBody } from "@/lib/api";
import { BILLING_CYCLES } from "@/lib/pricing";
import { adminManageSubscription } from "@/server/platform-admin";

export const dynamic = "force-dynamic";

const reason = z.string().trim().min(3, "Say why, in a few words.").max(300);
const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("grant"), plan: z.enum(["BASIC", "PRO", "MAX"]), cycle: z.enum(BILLING_CYCLES), reason }),
  z.object({ action: z.literal("extend"), days: z.number().int().min(1).max(366), reason }),
  z.object({ action: z.literal("end"), reason }),
  z.object({ action: z.literal("renewal"), on: z.boolean() }),
]);

/**
 * A platform admin managing an organisation's plan: give one without payment,
 * extend the current period, end it now, or switch card renewal on or off.
 */
export const POST = handler<{ id: string }>({ permission: "platform:manage", allowPlatform: true }, async ({ principal, params, request }) => {
  if (!principal.mfa) throw new ApiError(403, "MFA_REQUIRED", "Turn on two-factor authentication before changing plans.");
  const input = await parseBody(request, body);
  return adminManageSubscription(principal, params.id, input, request);
});
