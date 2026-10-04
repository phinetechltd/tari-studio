import { z } from "zod";

import { handler, parseBody } from "@/lib/api";
import { claimsFor, readSessionClaims, setSessionCookie } from "@/lib/auth";
import { db } from "@/lib/db";
import { leaveTeam } from "@/server/teams";

export const dynamic = "force-dynamic";

/** Leave a team. If it was the one you were working in, you land on the welcome screen. */
export const POST = handler({ account: true }, async ({ account, request }) => {
  const { organizationId } = await parseBody(request, z.object({ organizationId: z.string().min(1).max(40) }));
  await leaveTeam(account!.userId, organizationId, request);
  const claims = await readSessionClaims();
  if (claims?.org === organizationId) {
    const user = await db.user.findUniqueOrThrow({
      where: { id: account!.userId },
      select: { id: true, name: true, email: true, tokenVersion: true, activeOrganizationId: true, isPlatformAdmin: true },
    });
    await setSessionCookie(claimsFor(user, null));
  }
  return { left: true };
});
