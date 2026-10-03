import { z } from "zod";

import { handler, parseBody } from "@/lib/api";
import { env } from "@/lib/env";
import { PLAN_KEYS } from "@/lib/limits";
import { PRODUCT_NAME } from "@/lib/brand";
import { sendEmail } from "@/server/email";
import { createInvite } from "@/server/invites";
import { createOrganization } from "@/server/organizations";

const body = z.object({
  name: z.string().min(2).max(120),
  plan: z.enum(PLAN_KEYS),
  ownerEmail: z.string().min(3).max(254),
});

/** Creates a tenant and invites its first Owner. Platform admins only. */
export const POST = handler({ permission: "platform:manage", allowPlatform: true }, async ({ principal, request }) => {
  const input = await parseBody(request, body);

  const org = await createOrganization({ name: input.name, plan: input.plan, createdById: principal.userId });
  const invite = await createInvite({
    organizationId: org.id,
    email: input.ownerEmail,
    role: "OWNER",
    invitedById: principal.userId,
    skipSeatCheck: true, // the first Owner is invited before any seat exists
  });

  const acceptUrl = `${env().APP_BASE_URL}/accept-invite/${invite.token}`;
  const sent = await sendEmail({
    to: invite.email,
    subject: `Your ${PRODUCT_NAME} workspace for ${input.name} is ready`,
    text: `Set up your account and start: ${acceptUrl}\n\nThis link works once and expires in 7 days.`,
  });

  return { id: org.id, slug: org.slug, emailSent: sent.ok, acceptUrl };
});
