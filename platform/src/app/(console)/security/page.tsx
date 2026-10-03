import type { Metadata } from "next";

import { Hint } from "@/components/hints/hint";
import { Badge, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";

import { MfaPanel } from "./mfa-panel";

export const metadata: Metadata = { title: "Security" };

const dateFmt = new Intl.DateTimeFormat("en-KE", { dateStyle: "long", timeZone: "Africa/Nairobi" });

export default async function SecurityPage() {
  const { principal, claims } = await requireSession();
  const user = await db.user.findUniqueOrThrow({
    where: { id: principal.userId },
    select: { totpEnabledAt: true },
  });

  return (
    <>
      <PageHeader title="Security" subtitle={`Signed in as ${claims.email}`} />
      <Hint id="security.intro" title="Protect your account">
        Turn on two-factor authentication with an authenticator app. Connecting channels, approving content and managing people require it.
      </Hint>
      <section aria-labelledby="mfa" className="card max-w-xl p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="mfa" className="text-lg font-medium">
            Two-factor authentication
          </h2>
          {user.totpEnabledAt ? <Badge tone="success">On</Badge> : <Badge tone="warning">Off</Badge>}
        </div>
        <p className="mb-4 text-sm text-muted">
          A 6-digit code from an authenticator app (Google Authenticator, Microsoft Authenticator, Authy, 1Password…) is
          asked for each time you sign in. Owners and Approvers need it to connect social accounts, approve content and
          manage the team.
        </p>
        <MfaPanel enabled={user.totpEnabledAt != null} since={user.totpEnabledAt ? dateFmt.format(user.totpEnabledAt) : null} />
      </section>
    </>
  );
}
