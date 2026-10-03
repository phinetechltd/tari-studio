import { z } from "zod";

import { ApiError, handler, parseBody } from "@/lib/api";
import { adminAdjustCredits } from "@/server/platform-admin";

export const dynamic = "force-dynamic";

const body = z.object({
  delta: z.number().int().refine((v) => v !== 0, "Enter credits to add (positive) or remove (negative)."),
  reason: z.string().trim().min(3, "Say why, in a few words.").max(300),
});

/** Adds or removes credits by hand. Audited with the reason. */
export const POST = handler<{ id: string }>({ permission: "platform:manage", allowPlatform: true }, async ({ principal, params, request }) => {
  if (!principal.mfa) throw new ApiError(403, "MFA_REQUIRED", "Turn on two-factor authentication before changing credits.");
  const input = await parseBody(request, body);
  return adminAdjustCredits(principal, params.id, input.delta, input.reason, request);
});
