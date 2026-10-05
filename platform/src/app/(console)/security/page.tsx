import type { Metadata } from "next";

import { Hint } from "@/components/hints/hint";
import { Badge, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { tiktokLoginEnabled } from "@/server/oauth-tiktok";

import { MfaPanel } from "./mfa-panel";

export const metadata: Metadata = { title: "Security" };

const dateFmt = new Intl.DateTimeFormat("en-KE", { dateStyle: "long", timeZone: "Africa/Nairobi" });

export default async function SecurityPage({ searchParams }: { searchParams: Promise<{ linked?: string; inuse?: string }> }) {
  const { principal, claims } = await requireSession();
  const { linked, inuse } = await searchParams;
  const user = await db.user.findUniqueOrThrow({
    where: { id: principal.userId },
    select: { totpEnabledAt: true },
  });
  const tiktokIdentity = await db.authIdentity.findFirst({
    where: { provider: "TIKTOK", userId: principal.userId },
    select: { createdAt: true },
  });
  const tiktokOn = tiktokLoginEnabled();

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

      <section aria-labelledby="methods" className="card mt-4 max-w-xl p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="methods" className="text-lg font-medium">
            Sign-in methods
          </h2>
        </div>
        {linked === "tiktok" ? <p role="status" className="mb-3 rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-sm text-success">TikTok is linked. You can now sign in with it.</p> : null}
        {inuse === "tiktok" ? <p role="alert" className="mb-3 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">That TikTok account is linked to another person here. Use it to sign in directly, or link a different TikTok account.</p> : null}
        <div className="flex items-center justify-between gap-3 text-sm">
          <div>
            <p className="font-medium">TikTok</p>
            <p className="text-xs text-muted">
              {tiktokIdentity ? `Linked ${dateFmt.format(tiktokIdentity.createdAt)} · ` : ""}Sign in with your TikTok account (TikTok never shares your email; linking here keeps one account).
            </p>
          </div>
          {tiktokOn ? (
            <a href="/api/auth/tiktok/start?next=%2Fsecurity" className={tiktokIdentity ? "btn-quiet" : "btn-primary"}>
              {tiktokIdentity ? "Relink" : "Link TikTok"}
            </a>
          ) : (
            <Badge tone="neutral">Not offered on this platform</Badge>
          )}
        </div>
      </section>
    </>
  );
}
