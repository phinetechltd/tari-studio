import "server-only";

import { env } from "@/lib/env";
import { refreshPlatformConfig } from "@/lib/platform-config";
import { verificationMetadata } from "@/lib/seo";

/**
 * The site-wide values search pages need, read with the platform admin's
 * dashboard settings applied (Settings → Search engines), so a Search Console
 * code pasted there is live on the home page within seconds, without a rebuild.
 */
export async function siteSeo() {
  await refreshPlatformConfig();
  const e = env();
  const base = e.APP_BASE_URL.replace(/\/$/, "");
  const sameAs = (e.SEO_SOCIAL_PROFILES ?? "")
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter((s) => {
      try {
        return new URL(s).protocol === "https:";
      } catch {
        return false;
      }
    })
    .slice(0, 12);
  return {
    base,
    verification: verificationMetadata(e.GOOGLE_SITE_VERIFICATION, e.BING_SITE_VERIFICATION),
    sameAs,
    /** Search engines should only index the real, https site (not a staging or local copy). */
    indexable: base.startsWith("https://") && !/localhost|127\.0\.0\.1|\.local\b|\.test\b/.test(base),
  };
}
