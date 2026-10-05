import { z } from "zod";

import { fail, handler, ok, parseBody } from "@/lib/api";
import { activeMemberships, authenticate, startSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { resendVerification } from "@/server/accounts";

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
    // Keep the two-factor states distinct: the form shows its code field on TOTP_REQUIRED.
    // Collapsing them into INVALID_CREDENTIALS (a past bug) locked every enrolled account out.
    if (result.reason === "TOTP_REQUIRED") return fail(401, "TOTP_REQUIRED", "Enter the current code from your authenticator app.");
    if (result.reason === "TOTP_INVALID") return fail(401, "TOTP_INVALID", "That authenticator code did not work. Try the current one.");
    return fail(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
  }

  // A password proves the person knows it, not that the address is theirs: new accounts confirm the email first.
  const verified = await db.user.findUnique({ where: { id: result.user.id }, select: { emailVerifiedAt: true } });
  if (!verified?.emailVerifiedAt) {
    await resendVerification(result.user.email).catch(() => undefined);
    return fail(403, "EMAIL_UNVERIFIED", "Confirm your email address first. We have sent you a new code.", { email: result.user.email });
  }

  // Someone with no team yet still signs in; the welcome screen lets them create or pick one.
  const { next } = await startSession(result.user);
  const memberships = await activeMemberships(result.user.id);
  return ok({
    next,
    user: { name: result.user.name, email: result.user.email },
    organisations: memberships.map((m) => ({ id: m.organizationId, name: m.organization.name, role: m.role })),
  });
});
