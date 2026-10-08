import { NextResponse } from "next/server";

import { badRequest, conflict, handler, notFound } from "@/lib/api";
import { db } from "@/lib/db";
import { orgIdOf } from "@/lib/tenant";
import { appUrl, oauthCookie, signState } from "@/server/oauth-state";
import { tiktok, tikTokCommentsAvailable } from "@/server/tiktok";

/** Starts "Enable comment replies" for a TikTok channel (TikTok API for Business sign-in). */
export const GET = handler({ permission: "channel:connect" }, async ({ principal, searchParams }) => {
  const channelId = searchParams.get("channelId");
  if (!channelId) throw badRequest("Choose the TikTok account.");
  if (!tikTokCommentsAvailable()) throw conflict("Comment replies need TikTok's Business API app, which a platform admin sets up in Settings → TikTok.");
  const channel = await db.socialChannel.findFirst({ where: { id: channelId, organizationId: orgIdOf(principal), platform: "TIKTOK", status: "ACTIVE" }, select: { id: true } });
  if (!channel) throw notFound("TikTok account not found.");
  const { state, nonce } = await signState("tiktok-business", { userId: principal.userId, organizationId: orgIdOf(principal), ref: channelId });
  const res = NextResponse.redirect(tiktok().bizAuthUrl({ state, redirectUri: appUrl("/api/channels/tiktok/business/callback") }));
  const c = oauthCookie("tiktok-business");
  res.cookies.set(c.name, nonce, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: c.path, maxAge: 600 });
  return res;
});
