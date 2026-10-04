import type { Metadata } from "next";
import Link from "next/link";

import { AuthShell } from "@/components/auth/auth-shell";

import { ForgotForm } from "./forgot-form";

export const metadata: Metadata = { title: "Reset your password" };
export const dynamic = "force-dynamic";

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter your email, or the phone number you confirmed in your profile. We send a code and, by email, a link."
      footer={
        <Link href="/login" className="hover:text-ink hover:underline">
          Back to sign in
        </Link>
      }
    >
      <ForgotForm />
    </AuthShell>
  );
}
