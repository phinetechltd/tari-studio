import { z } from "zod";

import { handler, parseBody } from "@/lib/api";
import { claimsFor, setSessionCookie } from "@/lib/auth";
import { db } from "@/lib/db";
import { answerInvite } from "@/server/teams";

export const dynamic = "force-dynamic";

/** Accept or decline an invitation sent to your address. Accepting opens the team. */
export const POST = handler<{ id: string }>({ account: true }, async ({ account, request, params }) => {
  const { action } = await parseBody(request, z.object({ action: z.enum(["accept", "decline"]) }));
  const { organizationId } = await answerInvite(account!.userId, params.id, action === "accept", request);
  if (organizationId) {
    const user = await db.user.findUniqueOrThrow({
      where: { id: account!.userId },
      select: { id: true, name: true, email: true, tokenVersion: true, activeOrganizationId: true, isPlatformAdmin: true },
    });
    await setSessionCookie(claimsFor(user, organizationId));
  }
  return { next: organizationId ? "/app" : null };
});
