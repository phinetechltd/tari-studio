import { handler, parseBody } from "@/lib/api";
import { claimsFor, setSessionCookie } from "@/lib/auth";
import { db } from "@/lib/db";
import { createTeam, teamSchema } from "@/server/accounts";

export const dynamic = "force-dynamic";

/** A verified person starts a team, owns it, and opens in it. */
export const POST = handler({ account: true }, async ({ account, request }) => {
  const { name } = await parseBody(request, teamSchema);
  const org = await createTeam(account!.userId, name, request);
  const user = await db.user.findUniqueOrThrow({
    where: { id: account!.userId },
    select: { id: true, name: true, email: true, tokenVersion: true, activeOrganizationId: true, isPlatformAdmin: true },
  });
  await setSessionCookie(claimsFor(user, org.id));
  return { id: org.id, next: "/setup" };
});
