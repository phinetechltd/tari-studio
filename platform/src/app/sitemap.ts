import type { MetadataRoute } from "next";

import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/** When each page's content last changed in a way worth re-crawling for. Bump on real edits. */
const PAGES: Array<{ path: string; priority: number; changeFrequency: "weekly" | "monthly" | "yearly"; updated: string; images?: string[] }> = [
  { path: "", priority: 1, changeFrequency: "weekly", updated: "2026-10-04", images: ["/showcase/showreel.jpg", "/showcase/tari-poster.jpg"] },
  { path: "/pricing", priority: 0.9, changeFrequency: "weekly", updated: "2026-10-04" },
  { path: "/signup", priority: 0.7, changeFrequency: "monthly", updated: "2026-10-03" },
  { path: "/login", priority: 0.4, changeFrequency: "yearly", updated: "2026-10-03" },
  { path: "/privacy", priority: 0.3, changeFrequency: "yearly", updated: "2026-10-03" },
  { path: "/cookies", priority: 0.3, changeFrequency: "yearly", updated: "2026-10-03" },
];

/** The public pages, for search engines (submit /sitemap.xml in Google Search Console). */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = env().APP_BASE_URL.replace(/\/$/, "");
  return PAGES.map((p) => ({
    url: `${base}${p.path}`,
    lastModified: new Date(`${p.updated}T00:00:00+03:00`),
    changeFrequency: p.changeFrequency,
    priority: p.priority,
    ...(p.images ? { images: p.images.map((i) => `${base}${i}`) } : {}),
  }));
}
