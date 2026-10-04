import type { Metadata } from "next";

import { AuthShell } from "@/components/auth/auth-shell";

import { LinkVerifier } from "./link-verifier";

export const metadata: Metadata = { title: "Confirm your email", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

/** The emailed link lands here. It asks for one click, so a mail scanner that opens links cannot use up the token. */
export default async function VerifyLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <AuthShell title="Confirm your email" subtitle="One click and you are in.">
      <LinkVerifier token={token.slice(0, 80)} />
    </AuthShell>
  );
}
