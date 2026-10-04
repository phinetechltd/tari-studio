import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthShell } from "@/components/auth/auth-shell";
import { SignOutButton } from "@/components/shell-controls";
import { TeamsPanel } from "@/components/teams/teams-panel";
import { db } from "@/lib/db";
import { requireAccount } from "@/lib/session";
import { myTeams, pendingInvitesFor } from "@/server/teams";

export const metadata: Metadata = { title: "Welcome", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Where someone lands when they are signed in but not inside a team: create one, pick one, or answer an invitation. */
export default async function WelcomePage() {
  const account = await requireAccount();
  if (!account.emailVerified) redirect(`/verify?email=${encodeURIComponent(account.email)}`);
  if (account.isPlatformAdmin) redirect("/platform");
  const user = await db.user.findUniqueOrThrow({ where: { id: account.userId }, select: { activeOrganizationId: true } });
  const [teams, invites] = await Promise.all([myTeams(account.userId, user.activeOrganizationId), pendingInvitesFor(account.email)]);
  const first = account.name.split(" ")[0];

  return (
    <AuthShell
      title={`Welcome, ${first}`}
      subtitle={teams.length > 0 ? "Choose a team to open, or start a new one." : "You are in. Start a team of your own, or join one you were invited to."}
      footer={
        <span className="inline-flex items-center gap-2">
          Signed in as {account.email} <SignOutButton />
        </span>
      }
    >
      <TeamsPanel
        teams={teams}
        invites={invites.map((i) => ({ ...i, expiresAt: i.expiresAt.toISOString() }))}
        canCreate
      />
    </AuthShell>
  );
}
