import { z } from "zod";

import { ApiError, handler, parseBody } from "@/lib/api";
import { adjustProviderCredits, providerBalance, recordTopUp } from "@/server/ai-credits";

export const dynamic = "force-dynamic";

/** The platform's Higgsfield balance as this deployment has recorded it. */
export const GET = handler({ permission: "platform:manage", allowPlatform: true }, async () => providerBalance());

const body = z.object({ action: z.enum(["topup", "adjust"]) }).passthrough();

/** Records a top-up bought on console.higgsfield.ai, or an adjustment to match it. Audited. */
export const POST = handler({ permission: "platform:manage", allowPlatform: true }, async ({ principal, request }) => {
  if (!principal.mfa) throw new ApiError(403, "MFA_REQUIRED", "Turn on two-factor authentication before changing AI credits.");
  const { action, ...rest } = await parseBody(request, body);
  return action === "topup" ? recordTopUp(principal, rest, request) : adjustProviderCredits(principal, rest, request);
});
