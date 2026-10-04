import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Bricolage_Grotesque, Inter, Poppins } from "next/font/google";

import { CookieNotice } from "@/components/legal/cookie-notice";
import { PRODUCT_NAME, PRODUCT_TAGLINE } from "@/lib/brand";
import { THEME_COOKIE } from "@/lib/theme";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-poppins",
  display: "swap",
});

const display = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  // Absolute URLs for social preview images (the landing page's showreel poster).
  metadataBase: new URL(process.env.APP_BASE_URL || "http://localhost:3400"),
  title: { default: PRODUCT_NAME, template: `%s · ${PRODUCT_NAME}` },
  description: PRODUCT_TAGLINE,
  applicationName: PRODUCT_NAME,
  icons: { icon: [{ url: "/icon.png", type: "image/png", sizes: "512x512" }, { url: "/favicon.ico", sizes: "any" }], apple: "/apple-icon.png" },
  openGraph: { siteName: PRODUCT_NAME, type: "website", images: [{ url: "/brand/tari-afro-stacked.png" }] },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fdf7ed" },
    { media: "(prefers-color-scheme: dark)", color: "#0f0805" },
  ],
};

/**
 * Runs before the first paint: reads the visitor's saved theme from the cookie
 * and sets the class, so there is no flash and the layout stays static (reading
 * cookies on the server would make every page dynamic). Dark is the default.
 */
const THEME_SCRIPT = `(function(){try{var m=document.cookie.match(/(?:^|; )${THEME_COOKIE}=(light|dark)/);var l=m&&m[1]==="light";var r=document.documentElement;if(l){r.classList.add("theme-afro-light");}r.dataset.theme=l?"light":"dark";}catch(e){}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      data-theme="dark"
      suppressHydrationWarning
      className={`theme-afro ${inter.variable} ${poppins.variable} ${display.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-screen bg-surface text-ink antialiased font-sans">
        {children}
        <CookieNotice />
      </body>
    </html>
  );
}
