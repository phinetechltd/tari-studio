import type { ReactNode } from "react";

import { SiteFooter, SiteHeader } from "@/components/landing/site-chrome";

/** Shared frame for the policy pages: site chrome, a readable column, and a last-updated line. */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-bg text-ink">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Legal</p>
        <h1 className="mt-2 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">{title}</h1>
        <p className="mt-3 text-sm text-muted">Last updated {updated}</p>
        <div className="legal mt-10 space-y-8 text-[15px] leading-relaxed text-ink/90 [&_a]:text-primary [&_a]:underline-offset-4 hover:[&_a]:underline [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-ink [&_li]:mt-1.5 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5">
          {children}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2>{title}</h2>
      {children}
    </section>
  );
}
