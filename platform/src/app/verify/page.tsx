import type { Metadata } from "next";
import Link from "next/link";

import { AuthShell } from "@/components/auth/auth-shell";

import { VerifyForm } from "./verify-form";

export const metadata: Metadata = { title: "Confirm your email" };
export const dynamic = "force-dynamic";

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { email } = await searchParams;
  return (
    <AuthShell
      title="Check your email"
      subtitle="We sent a 6-digit code and a button to confirm your address. Use either."
      footer={
        <Link href="/login" className="hover:text-ink hover:underline">
          Back to sign in
        </Link>
      }
    >
      <VerifyForm initialEmail={email?.slice(0, 254) ?? ""} />
    </AuthShell>
  );
}
