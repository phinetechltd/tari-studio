import type { Metadata } from "next";

/**
 * Search and sharing: page metadata (canonical URL, Open Graph, X/Twitter
 * cards) and schema.org structured data for Google. Pure, so it is tested
 * directly and shared by every public page.
 *
 * Every absolute URL comes from APP_BASE_URL (the live https domain), so the
 * canonical links, sitemap and structured data always name the same site.
 */

export function absoluteUrl(base: string, path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${base.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

/** A branded 1200×630 share card for a page (src/app/og/route.tsx). */
export function ogImagePath(title: string, subtitle?: string): string {
  const q = new URLSearchParams({ title: title.slice(0, 90) });
  if (subtitle) q.set("subtitle", subtitle.slice(0, 140));
  return `/og?${q}`;
}

export interface PageSeo {
  /** The page title; the root layout adds " · <product>" unless `absoluteTitle` */
  title: string;
  absoluteTitle?: boolean;
  description: string;
  /** Path of the canonical URL, e.g. "/pricing" */
  path: string;
  /** Share image path or URL; a branded card is made from the title when omitted */
  image?: string;
  /** Pixel size of `image`, when known (the generated card is always 1200×630) */
  imageSize?: { width: number; height: number };
  imageAlt?: string;
  /** Keep out of search results (account pages, private links) */
  noindex?: boolean;
  siteName: string;
}

/** Metadata for a public page: canonical, Open Graph and X/Twitter card, and robots. */
export function pageMetadata(p: PageSeo): Metadata {
  const image = p.image ?? ogImagePath(p.title, p.description);
  const fullTitle = p.absoluteTitle ? p.title : `${p.title} · ${p.siteName}`;
  return {
    title: p.absoluteTitle ? { absolute: p.title } : p.title,
    description: p.description,
    alternates: { canonical: p.path },
    openGraph: {
      type: "website",
      url: p.path,
      siteName: p.siteName,
      locale: "en_KE",
      title: fullTitle,
      description: p.description,
      images: [{ url: image, ...(p.image ? (p.imageSize ?? {}) : { width: 1200, height: 630 }), alt: p.imageAlt ?? fullTitle }],
    },
    twitter: { card: "summary_large_image", title: fullTitle, description: p.description, images: [image] },
    robots: p.noindex ? { index: false, follow: false, googleBot: { index: false, follow: false } } : { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-video-preview": -1, "max-snippet": -1 } },
  };
}

/** Metadata for a page that must never appear in search results. */
export const NOINDEX: Metadata = { robots: { index: false, follow: false, googleBot: { index: false, follow: false } } };

/** Search Console / Bing Webmaster verification codes, when an admin has set them. */
export function verificationMetadata(google?: string | null, bing?: string | null): Metadata["verification"] | undefined {
  const g = google?.trim();
  const b = bing?.trim();
  if (!g && !b) return undefined;
  return { ...(g ? { google: g } : {}), ...(b ? { other: { "msvalidate.01": b } } : {}) };
}

// ── schema.org structured data ──────────────────────────────────────────

type Thing = Record<string, unknown>;

export function organizationLd(o: { name: string; url: string; logo: string; email?: string; parentName?: string; parentUrl?: string; sameAs?: string[] }): Thing {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${o.url.replace(/\/$/, "")}/#organization`,
    name: o.name,
    url: o.url,
    logo: o.logo,
    ...(o.email ? { email: o.email, contactPoint: [{ "@type": "ContactPoint", contactType: "customer support", email: o.email, areaServed: "KE", availableLanguage: ["en", "sw"] }] } : {}),
    ...(o.parentName ? { parentOrganization: { "@type": "Organization", name: o.parentName, ...(o.parentUrl ? { url: o.parentUrl } : {}) } } : {}),
    ...(o.sameAs?.length ? { sameAs: o.sameAs } : {}),
  };
}

export function websiteLd(w: { name: string; url: string; description: string }): Thing {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${w.url.replace(/\/$/, "")}/#website`,
    name: w.name,
    url: w.url,
    description: w.description,
    inLanguage: "en-KE",
    publisher: { "@id": `${w.url.replace(/\/$/, "")}/#organization` },
  };
}

export interface PlanOffer {
  name: string;
  /** KES cents a month; 0 for a free plan */
  monthlyCents: number;
  description?: string;
}

/** The product as an online application with its plans as offers, prices in Kenyan shillings. */
export function softwareApplicationLd(a: { name: string; url: string; description: string; image: string; offers: PlanOffer[] }): Thing {
  const kes = (cents: number) => (cents / 100).toFixed(2);
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: a.name,
    url: a.url,
    image: a.image,
    description: a.description,
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "AI video and image advertising",
    operatingSystem: "Web browser",
    publisher: { "@id": `${a.url.replace(/\/$/, "")}/#organization` },
    offers: a.offers.map((o) => ({
      "@type": "Offer",
      name: o.name,
      price: kes(o.monthlyCents),
      priceCurrency: "KES",
      ...(o.description ? { description: o.description } : {}),
      url: absoluteUrl(a.url, "/pricing"),
      availability: "https://schema.org/InStock",
      ...(o.monthlyCents > 0
        ? { priceSpecification: { "@type": "UnitPriceSpecification", price: kes(o.monthlyCents), priceCurrency: "KES", billingDuration: "P1M", unitText: "month" } }
        : {}),
    })),
  };
}

export function faqLd(items: Array<{ q: string; a: string }>): Thing {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((i) => ({ "@type": "Question", name: i.q, acceptedAnswer: { "@type": "Answer", text: i.a } })),
  };
}

export function breadcrumbLd(base: string, trail: Array<{ name: string; path: string }>): Thing {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((t, i) => ({ "@type": "ListItem", position: i + 1, name: t.name, item: absoluteUrl(base, t.path) })),
  };
}

/** A blog article, for Google's article features and rich results. */
export function blogPostingLd(p: {
  headline: string;
  description: string;
  url: string;
  image?: string;
  datePublished: string;
  dateModified: string;
  authorName: string;
  publisherName: string;
  publisherUrl: string;
  keywords?: string[];
  section?: string;
}): Thing {
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "@id": `${p.url}#article`,
    headline: p.headline,
    description: p.description,
    url: p.url,
    mainEntityOfPage: p.url,
    ...(p.image ? { image: [p.image] } : {}),
    datePublished: p.datePublished,
    dateModified: p.dateModified,
    inLanguage: "en-KE",
    author: { "@type": "Person", name: p.authorName },
    publisher: { "@type": "Organization", name: p.publisherName, url: p.publisherUrl },
    ...(p.section ? { articleSection: p.section } : {}),
    ...(p.keywords?.length ? { keywords: p.keywords.join(", ") } : {}),
  };
}

export function videoLd(v: { name: string; description: string; thumbnailUrl: string; contentUrl: string; uploadDate: string; durationSeconds?: number }): Thing {
  return {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: v.name,
    description: v.description,
    thumbnailUrl: [v.thumbnailUrl],
    contentUrl: v.contentUrl,
    uploadDate: v.uploadDate,
    ...(v.durationSeconds ? { duration: `PT${Math.round(v.durationSeconds)}S` } : {}),
  };
}

/**
 * JSON for a <script type="application/ld+json">: "<" is escaped so no text in
 * the data (a plan name, an FAQ answer) can close the script tag early.
 */
export function jsonLdText(data: Thing | Thing[]): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
