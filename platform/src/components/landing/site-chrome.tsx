import { Menu } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { BrandLogo } from "@/components/brand-logo";
import { OPERATOR_NAME, OPERATOR_URL, PRODUCT_NAME, PRODUCT_TAGLINE, SUPPORT_EMAIL } from "@/lib/brand";

const LINKS = [
  { href: "/#tools", label: "Tools" },
  { href: "/#showcase", label: "Showcase" },
  { href: "/#studio", label: "Studio" },
  { href: "/pricing", label: "Pricing" },
  { href: "/blog", label: "Blog" },
  { href: "/#order", label: "Done for you" },
];

/** The public pages' top bar: logo, sections, sign in, one call to action. */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-primary/15 bg-bg/75 backdrop-blur-xl">
      <nav className="mx-auto flex h-16 max-w-[1400px] items-center gap-6 px-4 sm:px-6" aria-label="Main">
        <Link href="/" className="shrink-0" aria-label={`${PRODUCT_NAME} home`}>
          <BrandLogo tone="afro" height={30} priority />
        </Link>
        <ul className="hidden items-center gap-1 lg:flex">
          {LINKS.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className="rounded-full px-3 py-2 text-sm text-ink/70 transition-colors hover:bg-wash/[0.06] hover:text-ink">
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="ml-auto flex items-center gap-2">
          <Link href="/login" className="hidden rounded-full px-3 py-2 text-sm text-ink/80 hover:text-ink sm:block">
            Sign in
          </Link>
          <Link href="/signup" className="btn-primary min-h-[38px] px-4 text-sm">
            Get started
          </Link>
          <details className="relative lg:hidden">
            <summary className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-full text-ink hover:bg-wash/[0.06] [&::-webkit-details-marker]:hidden" aria-label="Menu">
              <Menu className="h-5 w-5" />
            </summary>
            <ul className="glass absolute right-0 top-12 w-56 rounded-2xl p-2 shadow-2xl">
              {[...LINKS, { href: "/login", label: "Sign in" }].map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="block rounded-xl px-3 py-2.5 text-sm text-ink/85 hover:bg-wash/[0.06]">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        </div>
      </nav>
      <div aria-hidden className="kente-band kente-band-thin" />
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="relative px-4 pb-10 pt-0 sm:px-6">
      <div aria-hidden className="kente-band -mx-4 mb-14 sm:-mx-6" />
      <div className="mx-auto grid max-w-[1400px] gap-10 md:grid-cols-[2fr_1fr_1fr_1fr]">
        <div>
          <BrandLogo tone="afro" height={34} />
          <p className="mt-4 max-w-sm text-sm text-muted">{PRODUCT_TAGLINE}</p>
          <div className="mt-5 flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-wider text-ink/70">
            <span className="rounded-full border border-wash/10 px-3 py-1">M-Pesa</span>
            <span className="rounded-full border border-wash/10 px-3 py-1">Visa · Mastercard</span>
            <span className="rounded-full border border-wash/10 px-3 py-1">Paystack</span>
          </div>
        </div>
        <FooterCol title="Create" links={[{ href: "/#tools", label: "Video ads" }, { href: "/#tools", label: "Image ads" }, { href: "/#studio", label: "The Studio" }, { href: "/#order", label: "Done for you" }]} />
        <FooterCol title="Grow" links={[{ href: "/#tools", label: "WhatsApp auto-replies" }, { href: "/#tools", label: "Tracked links" }, { href: "/#tools", label: "Facebook & Instagram" }]} />
        <FooterCol
          title="Company"
          links={[
            { href: "/pricing", label: "Pricing" },
            { href: "/blog", label: "Blog" },
            { href: "/login", label: "Sign in" },
            { href: "/signup", label: "Create an account" },
            { href: "/#faq", label: "Questions" },
            { href: "/privacy", label: "Privacy policy" },
            { href: "/cookies", label: "Cookie policy" },
          ]}
        />
      </div>
      <div className="mx-auto mt-12 flex max-w-[1400px] flex-col gap-6 border-t border-line pt-8 md:flex-row md:items-center md:justify-between">
        <p className="max-w-xl text-xs text-muted">
          &copy; {new Date().getFullYear()} {PRODUCT_NAME}. Prices in Kenyan shillings. Stock sample clips from Pexels are labelled as such. Support:{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary hover:underline">
            {SUPPORT_EMAIL}
          </a>
        </p>
        <a
          href={OPERATOR_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="group inline-flex items-center gap-3 text-xs text-muted hover:text-ink"
          aria-label={`${PRODUCT_NAME} is managed by ${OPERATOR_NAME} (opens phinetech.co.ke)`}
        >
          <span>Managed by</span>
          {/* The wordmark is navy on transparent, so it sits on a cream plate to stay readable in both themes. */}
          <span className="rounded-lg bg-[#fbf3e4] px-3 py-1.5 shadow-sm transition-transform group-hover:-translate-y-0.5">
            <Image src="/brand/phinetech-wordmark.png" alt={OPERATOR_NAME} width={120} height={40} className="h-7 w-auto" />
          </span>
        </a>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: Array<{ href: string; label: string }> }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-ink">{title}</p>
      <ul className="mt-4 space-y-2.5">
        {links.map((l) => (
          <li key={l.label}>
            <Link href={l.href} className="text-sm text-muted hover:text-ink">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
