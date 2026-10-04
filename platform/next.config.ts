import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // A second dev server (e.g. a verification run beside someone's own) must not
  // share the build directory with the first.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Designers upload from phones; media goes through a dedicated upload route
  // with its own limits, so server actions only need room for form payloads.
  experimental: {
    serverActions: { bodySizeLimit: "4mb" },
  },
  eslint: { ignoreDuringBuilds: true },
  poweredByHeader: false,
  compress: true,
  images: { formats: ["image/avif", "image/webp"] },
  async headers() {
    const isProd = process.env.NODE_ENV === "production";
    // Next needs inline scripts for hydration (and eval in development), so scripts are
    // limited to this site plus those; everything else is closed down.
    const csp = [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "media-src 'self' blob: https:",
      "font-src 'self' data:",
      `connect-src 'self'${isProd ? "" : " ws: wss:"}`,
      "frame-src https://checkout.paystack.com https://js.paystack.co",
      "worker-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join("; ");
    const longCache = "public, max-age=86400, stale-while-revalidate=604800";
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Content-Security-Policy", value: csp },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          // Browsers remember to use HTTPS only once it is actually being served.
          ...(isProd && (process.env.APP_BASE_URL ?? "").startsWith("https://")
            ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]
            : []),
        ],
      },
      // Brand art and the showcase clips change rarely: let browsers and CDNs keep them.
      { source: "/brand/:path*", headers: [{ key: "Cache-Control", value: longCache }] },
      { source: "/showcase/:path*", headers: [{ key: "Cache-Control", value: longCache }] },
      // Never in search results: the API, private media links, tracked redirects and private order and payment pages.
      ...["/api/:path*", "/media/:path*", "/l/:path*", "/order/:path*", "/pay/:path*"].map((source) => ({
        source,
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      })),
    ];
  },
};

export default nextConfig;
