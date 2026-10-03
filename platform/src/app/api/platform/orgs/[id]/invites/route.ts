import { z } from "zod";

import { ApiError, handler, notFound, parseBody } from "@/lib/api";
import { PRODUCT_NAME } from "@/lib/brand";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { ROLES, type Role } from "@/lib/rbac";
import { sendEmail } from "@/server/email";
import { createInvite } from "@/server/invites";

export const dynamic = "force-dynamic";

const body = z.object({
  email: z.string().trim().min(3).max(254),
  role: z.enum(ROLES.filter((r) => r !== "SUPER_ADMIN") as [string, ...string[]]),
});

/**
 * Invites someone into an organisation on its behalf (a new Owner when the old
 * one has left, a member the Owner asked for). Seat limits still apply; raise
 * the limit first if the organisation is full.
 */
export const POST = handler<{ id: string }>({ permission: "platform:manage", allowPlatform: true }, async ({ principal, params, request }) => {
  if (!principal.mfa) throw new ApiError(403, "MFA_REQUIRED", "Turn on two-factor authentication before inviting people.");
  const input = await parseBody(request, body);
  const org = await db.organization.findUnique({ where: { id: params.id }, select: { id: true, name: true } });
  if (!org) throw notFound("No such organisation.");

  const invite = await createInvite({ organizationId: org.id, email: input.email, role: input.role as Role, invitedById: principal.userId });
  const acceptUrl = `${env().APP_BASE_URL}/accept-invite/${invite.token}`;
  const sent = await sendEmail({
    to: invite.email,
    subject: `You're invited to ${org.name} on ${PRODUCT_NAME}`,
    text: `Join ${org.name}: ${acceptUrl}\n\nThis link works once and expires in 7 days.`,
  });
  return { email: invite.email, emailSent: sent.ok, acceptUrl };
});
