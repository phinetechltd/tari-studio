import type { Metadata } from "next";

import { Hint } from "@/components/hints/hint";
import { Badge, EmptyState, PageHeader, TableWrap } from "@/components/ui";
import { db } from "@/lib/db";
import { ROLE_LABELS, can, type Role } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";

import { ROLE_INFO } from "@/lib/role-info";

import { MemberControls } from "./member-controls";
import { InviteForm, RevokeInviteButton } from "./team-controls";

export const metadata: Metadata = { title: "Team" };

const dateFmt = new Intl.DateTimeFormat("en-KE", { dateStyle: "medium", timeZone: "Africa/Nairobi" });

export default async function TeamPage() {
  const { principal, organizationId } = await requirePermission("member:read");
  const canInvite = can(principal, "member:write");

  const [members, invites] = await Promise.all([
    db.membership.findMany({
      where: { organizationId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        role: true,
        status: true,
        extraPermissions: true,
        userId: true,
        user: { select: { name: true, email: true, totpEnabledAt: true, lastLoginAt: true } },
      },
    }),
    db.invite.findMany({
      where: { organizationId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      select: { id: true, email: true, role: true, expiresAt: true },
    }),
  ]);

  return (
    <>
      <PageHeader title="Team" subtitle="People with access to this organisation, and open invitations." />
      <Hint id="team.intro" title="Give each person the role they need">
        Owners handle billing and settings, brand managers approve, marketers create and post. Invites arrive by email.
      </Hint>

      <section aria-labelledby="roles" className="card mb-8 p-5">
        <h2 id="roles" className="mb-3 text-lg font-medium">What each role can do</h2>
        <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
          {(Object.keys(ROLE_INFO) as Array<keyof typeof ROLE_INFO>).map((r) => (
            <div key={r}>
              <dt className="font-medium text-ink">{ROLE_LABELS[r]}</dt>
              <dd className="text-muted">{ROLE_INFO[r].summary}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="members" className="mb-8">
        <h2 id="members" className="mb-3 text-lg font-medium">
          Members ({members.length})
        </h2>
        <TableWrap>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-muted">
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Role</th>
                <th className="px-4 py-2 font-medium">Two-factor</th>
                <th className="px-4 py-2 font-medium">Last sign-in</th>
                {canInvite ? <th className="px-4 py-2 font-medium">Manage</th> : null}
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-2">
                    <div className="font-medium">{m.user.name}</div>
                    <div className="text-muted">{m.user.email}</div>
                  </td>
                  <td className="px-4 py-2">
                    <Badge tone="primary">{ROLE_LABELS[m.role as Role] ?? m.role}</Badge>{" "}
                    {m.status !== "ACTIVE" ? <Badge tone="danger">Suspended</Badge> : null}
                  </td>
                  <td className="px-4 py-2">{m.user.totpEnabledAt ? <Badge tone="success">On</Badge> : <Badge>Off</Badge>}</td>
                  <td className="px-4 py-2 text-muted">{m.user.lastLoginAt ? dateFmt.format(m.user.lastLoginAt) : "Never"}</td>
                  {canInvite ? (
                    <td className="px-4 py-2">
                      <MemberControls
                        id={m.id}
                        name={m.user.name}
                        role={m.role}
                        suspended={m.status !== "ACTIVE"}
                        extra={Array.isArray(m.extraPermissions) ? (m.extraPermissions as string[]) : []}
                        isSelf={m.userId === principal.userId}
                        viewerIsOwner={principal.role === "OWNER" || principal.role === "SUPER_ADMIN"}
                      />
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </section>

      <section aria-labelledby="invites" className="mb-8">
        <h2 id="invites" className="mb-3 text-lg font-medium">
          Open invitations ({invites.length})
        </h2>
        {invites.length === 0 ? (
          <EmptyState title="No open invitations" />
        ) : (
          <TableWrap>
            <table className="w-full text-sm">
              <tbody>
                {invites.map((i) => (
                  <tr key={i.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-2">{i.email}</td>
                    <td className="px-4 py-2">
                      <Badge tone="primary">{ROLE_LABELS[i.role as Role] ?? i.role}</Badge>
                    </td>
                    <td className="px-4 py-2 text-muted">Expires {dateFmt.format(i.expiresAt)}</td>
                    <td className="px-4 py-2 text-right">{canInvite ? <RevokeInviteButton id={i.id} /> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </section>

      {canInvite ? (
        <section aria-labelledby="invite" className="card max-w-lg p-5">
          <h2 id="invite" className="mb-3 text-lg font-medium">
            Invite someone
          </h2>
          <InviteForm />
        </section>
      ) : null}
    </>
  );
}
