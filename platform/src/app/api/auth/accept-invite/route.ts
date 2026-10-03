import { z } from "zod";

import { fail, handler, parseBody } from "@/lib/api";
import { claimsFor, setSessionCookie } from "@/lib/auth";
import { db } from "@/lib/db";
import { hit } from "@/lib/ratelimit";
import { acceptInvite } from "@/server/invites";

const body = z.object({
  token: z.string().min(20).max(200),
  name: z.string().max(120).optional(),
  password: z.string().min(1).max(200),
});

export const POST = handler({ public: true }, async ({ request }) => {
  const input = await parseBody(request, body);

  // Keyed on the token, so a leaked link cannot be used to brute-force the
  // password of the existing account it is attached to.
  const rate = await hit(`accept-invite:${input.token.slice(0, 12)}`, { limit: 8, windowSec: 900 });
  if (!rate.allowed) {
    return fail(429, "RATE_LIMITED", "Too many attempts. Wait a few minutes and try again.", undefined, {
      headers: { "Retry-After": String(rate.retryAfterSec) },
    });
  }

  const { userId, organizationId } = await acceptInvite(input);
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true, name: true, email: true, tokenVersion: true, activeOrganizationId: true, isPlatformAdmin: true },
  });
  await setSessionCookie(claimsFor(user, organizationId));
  return { next: "/app" };
});
