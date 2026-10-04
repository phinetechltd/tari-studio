import type { MetadataRoute } from "next";

import { env } from "@/lib/env";

/** Public pages may be indexed; the console, payments, order pages and APIs may not. */
export default function robots(): MetadataRoute.Robots {
  const base = env().APP_BASE_URL.replace(/\/$/, "");
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/pricing", "/privacy", "/cookies", "/signup", "/login"],
        disallow: ["/api/", "/app/", "/platform/", "/content", "/billing", "/settings", "/account", "/security", "/setup", "/welcome", "/order/", "/pay/", "/media/", "/l/", "/verify", "/reset-password", "/accept-invite/"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
