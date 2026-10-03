import type { Metadata } from "next";

import { PRODUCT_NAME } from "@/lib/brand";
import { ROLE_LABELS } from "@/lib/rbac";
import { previewInvite } from "@/server/invites";

import { AcceptForm } from "./accept-form";

export const metadata: Metadata = { title: "Accept invitation" };

export default async function AcceptInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await previewInvite(token);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12">
      <h1 className="mb-6 text-center text-2xl font-semibold tracking-tight">{PRODUCT_NAME}</h1>
      <div className="card p-6">
        {invite ? (
          <>
            <h2 className="text-lg font-medium">Join {invite.organizationName}</h2>
            <p className="mb-4 mt-1 text-sm text-muted">
              You&apos;re invited as <strong>{ROLE_LABELS[invite.role]}</strong> ({invite.email}).
            </p>
            <AcceptForm token={token} hasAccount={invite.hasAccount} />
          </>
        ) : (
          <>
            <h2 className="text-lg font-medium">This invitation can&apos;t be used</h2>
            <p className="mt-2 text-sm text-muted">
              It may have expired, been withdrawn, or already been accepted. Ask the person who invited you to send a
              new one.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
