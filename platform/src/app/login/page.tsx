import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { BrandLogo } from "@/components/brand-logo";
import { ThemeToggle } from "@/components/shell-controls";
import { getSessionPrincipal } from "@/lib/auth";
import { PRODUCT_NAME, PRODUCT_TAGLINE } from "@/lib/brand";
import { safeNext } from "@/lib/safe-next";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const principal = await getSessionPrincipal();
  if (principal) redirect(safeNext(next) ?? (principal.organizationId === null ? "/platform" : "/app"));

  return (
    <main className="relative flex min-h-screen bg-bg items-center justify-center overflow-hidden px-4 py-12">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(45%_50%_at_50%_0%,rgb(var(--c-primary)/0.2),transparent_70%)]" />
      <div className="absolute right-4 top-4"><ThemeToggle /></div>
      <div className="relative w-full max-w-md">
        <Link href="/" className="mb-8 flex flex-col items-center gap-4 text-center" aria-label={`${PRODUCT_NAME} home`}>
          <BrandLogo tone="afro" variant="stacked" height={120} priority />
          <span className="text-sm text-muted">{PRODUCT_TAGLINE}</span>
        </Link>
        <div className="glass rounded-2xl p-6">
          <h1 className="mb-4 text-lg font-semibold">Sign in</h1>
          <LoginForm next={next ?? null} />
        </div>
        <p className="mt-6 text-center text-xs text-muted">Access is by invitation. Ask your agency&apos;s Owner to invite you.</p>
      </div>
    </main>
  );
}
