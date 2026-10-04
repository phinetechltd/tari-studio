import type { Metadata } from "next";

import { AuthShell } from "@/components/auth/auth-shell";

import { ResetForm } from "./reset-form";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

export default async function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <AuthShell title="Choose a new password" subtitle="Pick something you have not used before. You will be signed out of your other devices.">
      <ResetForm token={token.slice(0, 80)} />
    </AuthShell>
  );
}
