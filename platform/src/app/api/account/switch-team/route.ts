import { z } from "zod";

import { ApiError, handler, parseBody } from "@/lib/api";
import { audit } from "@/lib/audit";
import { claimsFor, setSessionCookie, switchOrganization } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Opens one of your teams. Works from the welcome screen, where there is no current team. */
export const POST = handler({ account: true }, async ({ account, request }) => {
  const { organizationId } = await parseBody(request, z.object({ organizationId: z.string().min(1).max(40) }));
  if (!(await switchOrganization(account!.userId, organizationId))) throw new ApiError(403, "FORBIDDEN", "You cannot open that team.");
  const user = await db.user.findUniqueOrThrow({
    where: { id: account!.userId },
    select: { id: true, name: true, email: true, tokenVersion: true, activeOrganizationId: true, isPlatformAdmin: true },
  });
  await setSessionCookie(claimsFor(user, organizationId));
  await audit({ organizationId, userId: user.id, action: "SWITCH_ORG", entity: "User", entityId: user.id, request });
  return { next: "/app" };
});
