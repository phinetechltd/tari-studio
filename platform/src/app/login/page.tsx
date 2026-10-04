import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthShell } from "@/components/auth/auth-shell";
import { GoogleButton, OrDivider } from "@/components/auth/google-button";
import { getAccountSession, getSessionPrincipal } from "@/lib/auth";
import { safeNext } from "@/lib/safe-next";
import { googleEnabled } from "@/server/oauth-google";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

const REASONS: Record<string, string> = {
  google: "Google sign-in did not work. Try again, or use your email and password.",
  cancelled: "Google sign-in was cancelled.",
  totp: "You have two-factor sign-in on, so please sign in with your password and code.",
  expired: "Your session ended. Please sign in again.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; reason?: string }> }) {
  const { next, reason } = await searchParams;
  const principal = await getSessionPrincipal();
  if (principal) redirect(safeNext(next) ?? (principal.organizationId === null ? "/platform" : "/app"));
  if (await getAccountSession()) redirect("/welcome");
  const google = googleEnabled();

  return (
    <AuthShell
      title="Sign in"
      footer={
        <>
          New here?{" "}
          <Link href="/signup" className="font-medium text-primary hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      {reason && REASONS[reason] ? <p role="status" className="mb-4 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">{REASONS[reason]}</p> : null}
      {google ? (
        <>
          <GoogleButton next={safeNext(next)} />
          <OrDivider />
        </>
      ) : null}
      <LoginForm next={next ?? null} />
    </AuthShell>
  );
}
