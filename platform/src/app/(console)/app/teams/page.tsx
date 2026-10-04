import type { Metadata } from "next";

import { PageHeader } from "@/components/ui";
import { TeamsPanel } from "@/components/teams/teams-panel";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { myTeams, pendingInvitesFor } from "@/server/teams";

export const metadata: Metadata = { title: "My teams" };
export const dynamic = "force-dynamic";

/** Every team you belong to, with a switch, leave and create. */
export default async function MyTeamsPage() {
  const { principal } = await requireSession();
  const user = await db.user.findUniqueOrThrow({ where: { id: principal.userId }, select: { email: true, activeOrganizationId: true } });
  const [teams, invites] = await Promise.all([myTeams(principal.userId, principal.organizationId ?? user.activeOrganizationId), pendingInvitesFor(user.email)]);
  return (
    <>
      <PageHeader title="My teams" subtitle="Every team you belong to, and your role in each." />
      <div className="max-w-3xl">
        <TeamsPanel teams={teams} invites={invites.map((i) => ({ ...i, expiresAt: i.expiresAt.toISOString() }))} canCreate />
      </div>
    </>
  );
}
