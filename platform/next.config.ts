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
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          // Browsers remember to use HTTPS only once it is actually being served.
          ...(process.env.NODE_ENV === "production" && (process.env.APP_BASE_URL ?? "").startsWith("https://")
            ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]
            : []),
        ],
      },
    ];
  },
};

export default nextConfig;
