import { handler } from "@/lib/api";
import { pendingInvitesFor, myTeams } from "@/server/teams";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Every team you belong to, and the invitations waiting for you. */
export const GET = handler({ account: true }, async ({ account }) => {
  const user = await db.user.findUniqueOrThrow({ where: { id: account!.userId }, select: { activeOrganizationId: true } });
  const [teams, invites] = await Promise.all([myTeams(account!.userId, user.activeOrganizationId), pendingInvitesFor(account!.email)]);
  return { teams, invites };
});
