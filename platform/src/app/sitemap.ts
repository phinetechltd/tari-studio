import type { MetadataRoute } from "next";

import { env } from "@/lib/env";

const PAGES: Array<{ path: string; priority: number; changeFrequency: "weekly" | "monthly" | "yearly" }> = [
  { path: "", priority: 1, changeFrequency: "weekly" },
  { path: "/pricing", priority: 0.9, changeFrequency: "weekly" },
  { path: "/signup", priority: 0.7, changeFrequency: "monthly" },
  { path: "/login", priority: 0.4, changeFrequency: "yearly" },
  { path: "/privacy", priority: 0.3, changeFrequency: "yearly" },
  { path: "/cookies", priority: 0.3, changeFrequency: "yearly" },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const base = env().APP_BASE_URL.replace(/\/$/, "");
  return PAGES.map((p) => ({ url: `${base}${p.path}`, changeFrequency: p.changeFrequency, priority: p.priority }));
}
