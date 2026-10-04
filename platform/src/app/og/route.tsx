import { ImageResponse } from "next/og";
import { NextResponse } from "next/server";

import { handler } from "@/lib/api";
import { PRODUCT_NAME, PRODUCT_TAGLINE } from "@/lib/brand";

export const dynamic = "force-dynamic";

/**
 * The share card a link shows on WhatsApp, Facebook, X and LinkedIn: 1200×630,
 * the product name, the page's title and a line under it. Public by design;
 * it renders only the text in its query (trimmed), in the brand's colours.
 */
export const GET = handler({ public: true }, async ({ searchParams }) => {
  const title = (searchParams.get("title") ?? PRODUCT_NAME).replace(/\s+/g, " ").trim().slice(0, 90) || PRODUCT_NAME;
  const subtitle = (searchParams.get("subtitle") ?? PRODUCT_TAGLINE).replace(/\s+/g, " ").trim().slice(0, 140);

  const image = new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          background: "linear-gradient(135deg, #0f0805 0%, #2a1408 55%, #5a2a0c 100%)",
          color: "#fdf7ed",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: "#F2B33D", display: "flex", alignItems: "center", justifyContent: "center", color: "#1e0c04", fontSize: 34, fontWeight: 800 }}>
            {PRODUCT_NAME.charAt(0)}
          </div>
          <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: 1 }}>{PRODUCT_NAME}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: title.length > 48 ? 58 : 72, fontWeight: 800, lineHeight: 1.05, maxWidth: 1000 }}>{title}</div>
          {subtitle ? <div style={{ fontSize: 30, lineHeight: 1.35, color: "#f5d9a8", maxWidth: 1000 }}>{subtitle}</div> : null}
        </div>
        <div style={{ display: "flex", gap: 0, height: 14, width: "100%" }}>
          {["#F2B33D", "#E8693A", "#1F8A4C", "#C8321E", "#F2B33D", "#E8693A", "#1F8A4C", "#C8321E"].map((c, i) => (
            <div key={i} style={{ flex: 1, background: c }} />
          ))}
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
  return new NextResponse(image.body, {
    headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800" },
  });
});
