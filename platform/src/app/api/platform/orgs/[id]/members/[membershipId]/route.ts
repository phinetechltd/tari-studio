import { z } from "zod";

import { ApiError, handler, parseBody } from "@/lib/api";
import { adminUpdateMember } from "@/server/platform-admin";

export const dynamic = "force-dynamic";

const body = z
  .object({
    role: z.string().min(3).max(40).optional(),
    status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
  })
  .refine((b) => b.role || b.status, { message: "Nothing to change." });

/** Changes a member's role, or suspends/reactivates them. The last active Owner is protected. */
export const PATCH = handler<{ id: string; membershipId: string }>(
  { permission: "platform:manage", allowPlatform: true },
  async ({ principal, params, request }) => {
    if (!principal.mfa) throw new ApiError(403, "MFA_REQUIRED", "Turn on two-factor authentication before changing members.");
    const input = await parseBody(request, body);
    return adminUpdateMember(principal, params.id, params.membershipId, input, request);
  },
);
