import { NextResponse } from "next/server";

import { badRequest, handler, notFound } from "@/lib/api";
import { db } from "@/lib/db";
import { orgIdOf } from "@/lib/tenant";
import { appUrl, oauthCookie, signState } from "@/server/oauth-state";
import { tiktok } from "@/server/tiktok";

/** Starts "Connect TikTok" (Login Kit); TikTok returns to /api/channels/tiktok/callback. */
export const GET = handler({ permission: "channel:connect" }, async ({ principal, searchParams }) => {
  const brandId = searchParams.get("brandId");
  if (!brandId) throw badRequest("Choose the brand this TikTok account belongs to.");
  const brand = await db.brand.findFirst({ where: { id: brandId, organizationId: orgIdOf(principal), status: "ACTIVE" }, select: { id: true } });
  if (!brand) throw notFound("Brand not found.");
  const { state, nonce } = await signState("tiktok", { userId: principal.userId, organizationId: orgIdOf(principal), ref: brandId });
  const res = NextResponse.redirect(tiktok().authUrl({ state, redirectUri: appUrl("/api/channels/tiktok/callback") }));
  const c = oauthCookie("tiktok");
  res.cookies.set(c.name, nonce, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: c.path, maxAge: 600 });
  return res;
});
