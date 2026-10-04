import Link from "next/link";

import { BrandLogo } from "@/components/brand-logo";
import { PRODUCT_NAME } from "@/lib/brand";

/** Shown for any address that does not exist. Friendly, branded, and one clear way back. */
export default function NotFound() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center gap-6 bg-bg px-4 text-center text-ink">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(45%_50%_at_50%_0%,rgb(var(--c-primary)/0.18),transparent_70%)]" />
      <BrandLogo tone="afro" height={40} />
      <p className="font-display text-7xl font-extrabold text-primary">404</p>
      <h1 className="text-xl font-semibold">We could not find that page</h1>
      <p className="max-w-sm text-sm text-muted">The link may be old, or the address mistyped. {PRODUCT_NAME} is still right where you left it.</p>
      <div className="flex gap-3">
        <Link href="/" className="btn-primary">
          Go to the home page
        </Link>
        <Link href="/login" className="btn-quiet">
          Sign in
        </Link>
      </div>
    </main>
  );
}
