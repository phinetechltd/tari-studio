import type { MetadataRoute } from "next";

import { PRODUCT_NAME, PRODUCT_TAGLINE } from "@/lib/brand";

/** The web app manifest: how the site appears when added to a phone's home screen. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: PRODUCT_NAME,
    short_name: PRODUCT_NAME.split(" ")[0] ?? PRODUCT_NAME,
    description: PRODUCT_TAGLINE,
    start_url: "/app",
    scope: "/",
    display: "standalone",
    background_color: "#0f0805",
    theme_color: "#0f0805",
    lang: "en-KE",
    categories: ["business", "productivity", "photo"],
    icons: [
      { src: "/icon.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
