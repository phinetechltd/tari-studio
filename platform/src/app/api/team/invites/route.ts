import { z } from "zod";

import { handler, parseBody } from "@/lib/api";
import { PRODUCT_NAME } from "@/lib/brand";
import { env } from "@/lib/env";
import { ASSIGNABLE_ROLES, ROLE_LABELS } from "@/lib/rbac";
import { orgIdOf } from "@/lib/tenant";
import { db } from "@/lib/db";
import { sendEmail } from "@/server/email";
import { createInvite } from "@/server/invites";

const body = z.object({
  email: z.string().min(3).max(254),
  role: z.enum(ASSIGNABLE_ROLES as [string, ...string[]]),
});

export const POST = handler({ permission: "member:write" }, async ({ principal, request }) => {
  const { email, role } = await parseBody(request, body);
  const organizationId = orgIdOf(principal);

  const invite = await createInvite({
    organizationId,
    email,
    role: role as (typeof ASSIGNABLE_ROLES)[number],
    invitedById: principal.userId,
  });

  const org = await db.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { name: true } });
  const acceptUrl = `${env().APP_BASE_URL}/accept-invite/${invite.token}`;

  const sent = await sendEmail({
    to: invite.email,
    subject: `You're invited to ${org.name} on ${PRODUCT_NAME}`,
    text:
      `You've been invited to join ${org.name} as ${ROLE_LABELS[role as keyof typeof ROLE_LABELS]}.\n\n` +
      `Accept the invitation: ${acceptUrl}\n\nThis link works once and expires in 7 days.`,
  });

  // The link is returned to the inviter as well: email may not be configured
  // yet, and an Owner who cannot send it can still hand it over themselves.
  return { email: invite.email, expiresAt: invite.expiresAt, emailSent: sent.ok, emailError: sent.error ?? null, acceptUrl };
});
