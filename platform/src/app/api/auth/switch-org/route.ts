import { z } from "zod";

import { ApiError, handler, parseBody } from "@/lib/api";
import { audit } from "@/lib/audit";
import { claimsFor, setSessionCookie, switchOrganization } from "@/lib/auth";
import { db } from "@/lib/db";

const body = z.object({ organizationId: z.string().min(1).nullable() });

export const POST = handler({ authOnly: true, allowPlatform: true }, async ({ principal, request }) => {
  const { organizationId } = await parseBody(request, body);

  if (!(await switchOrganization(principal.userId, organizationId))) {
    throw new ApiError(403, "FORBIDDEN", "You cannot switch to that organisation.");
  }

  const user = await db.user.findUniqueOrThrow({
    where: { id: principal.userId },
    select: { id: true, name: true, email: true, tokenVersion: true, activeOrganizationId: true, isPlatformAdmin: true },
  });
  await setSessionCookie(claimsFor(user, organizationId));
  await audit({
    organizationId,
    userId: user.id,
    action: "SWITCH_ORG",
    entity: "User",
    entityId: user.id,
    request,
  });
  return { next: organizationId === null ? "/platform" : "/app" };
});
