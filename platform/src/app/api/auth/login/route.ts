import { z } from "zod";

import { ApiError, fail, handler, ok, parseBody } from "@/lib/api";
import { activeMemberships, authenticate, claimsFor, organisationForLogin, setSessionCookie } from "@/lib/auth";

const body = z.object({
  email: z.string().min(1).max(254),
  password: z.string().min(1).max(200),
  totp: z.string().min(6).max(12).optional(),
});

export const POST = handler({ public: true }, async ({ request }) => {
  const input = await parseBody(request, body);
  const result = await authenticate({ ...input, request });

  if (!result.ok) {
    if (result.reason === "RATE_LIMITED") {
      return fail(429, "RATE_LIMITED", "Too many attempts. Wait a few minutes and try again.", undefined, {
        headers: { "Retry-After": String(result.retryAfterSec ?? 60) },
      });
    }
    return fail(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
  }

  const org = await organisationForLogin(result.user);
  if (org === null && !result.user.isPlatformAdmin) {
    throw new ApiError(403, "NO_ORGANISATION", "This account is not part of any active organisation.");
  }

  await setSessionCookie(claimsFor(result.user, org));
  const memberships = await activeMemberships(result.user.id);
  return ok({
    next: org === null ? "/platform" : "/app",
    user: { name: result.user.name, email: result.user.email },
    organisations: memberships.map((m) => ({ id: m.organizationId, name: m.organization.name, role: m.role })),
  });
});
