import type { MetadataRoute } from "next";

import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/** Private areas: the console, the API, payments, private links and account flows. */
const PRIVATE = [
  "/api/",
  "/app/",
  "/platform/",
  "/content",
  "/billing",
  "/settings",
  "/account",
  "/security",
  "/setup",
  "/notifications",
  "/welcome",
  "/dashboard",
  "/brand",
  "/orgs",
  "/order/",
  "/pay/",
  "/media/",
  "/l/",
  "/verify",
  "/reset-password",
  "/forgot-password",
  "/accept-invite/",
];

/**
 * Public pages may be crawled; private areas may not. A copy that is not the
 * live https site (staging, a laptop) asks every crawler to stay out, so a
 * test deployment never competes with the real one in search results.
 */
export default function robots(): MetadataRoute.Robots {
  const base = env().APP_BASE_URL.replace(/\/$/, "");
  const live = base.startsWith("https://") && !/localhost|127\.0\.0\.1|\.local\b|\.test\b/.test(base);
  if (!live) return { rules: [{ userAgent: "*", disallow: "/" }] };
  return {
    rules: [{ userAgent: "*", allow: ["/", "/pricing", "/privacy", "/cookies", "/signup", "/login", "/og"], disallow: PRIVATE }],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
