import Link from "next/link";
import type { ReactNode } from "react";

import { BrandLogo } from "@/components/brand-logo";
import { ThemeToggle } from "@/components/shell-controls";
import { PRODUCT_NAME, PRODUCT_TAGLINE } from "@/lib/brand";

/** The frame around every sign-in, sign-up and recovery screen: logo, a card, and the legal links. */
export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-bg px-4 py-12">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(45%_50%_at_50%_0%,rgb(var(--c-primary)/0.2),transparent_70%)]" />
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="relative w-full max-w-md">
        <Link href="/" className="mb-8 flex flex-col items-center gap-3 text-center" aria-label={`${PRODUCT_NAME} home`}>
          <BrandLogo tone="afro" variant="stacked" height={96} priority />
          <span className="max-w-xs text-sm text-muted">{PRODUCT_TAGLINE}</span>
        </Link>
        <div className="glass rounded-2xl p-6 sm:p-7">
          <h1 className="text-lg font-semibold">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
          <div className="mt-5">{children}</div>
        </div>
        {footer ? <div className="mt-6 text-center text-sm text-muted">{footer}</div> : null}
        <p className="mt-6 text-center text-xs text-muted">
          <Link href="/privacy" className="hover:text-ink hover:underline">
            Privacy
          </Link>{" "}
          ·{" "}
          <Link href="/cookies" className="hover:text-ink hover:underline">
            Cookies
          </Link>
        </p>
      </div>
    </main>
  );
}
