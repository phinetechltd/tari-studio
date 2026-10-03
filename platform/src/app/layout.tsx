import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { Bricolage_Grotesque, Inter, Poppins } from "next/font/google";

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
};

/** The visitor's light/dark choice, set by the theme toggle. Unknown values fall back to dark. */
async function chosenTheme(): Promise<"dark" | "light"> {
  const value = (await cookies()).get(THEME_COOKIE)?.value;
  return value === "light" ? "light" : "dark";
}

export async function generateViewport(): Promise<Viewport> {
  const light = (await chosenTheme()) === "light";
  return {
    width: "device-width",
    initialScale: 1,
    themeColor: light ? "#fdf7ed" : "#0f0805",
    colorScheme: light ? "light" : "dark",
  };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const theme = await chosenTheme();
  return (
    <html
      lang="en"
      data-theme={theme}
      suppressHydrationWarning
      className={`theme-afro ${theme === "light" ? "theme-afro-light" : ""} ${inter.variable} ${poppins.variable} ${display.variable}`}
    >
      <body className="min-h-screen bg-surface text-ink antialiased font-sans">{children}</body>
    </html>
  );
}
