import { NextResponse } from "next/server";

import { handler } from "@/lib/api";
import { safeNext } from "@/lib/safe-next";
import { beginTiktok, TIKTOK_OAUTH_COOKIE } from "@/server/oauth-tiktok";

export const dynamic = "force-dynamic";

/** "Continue with TikTok": sends the browser to TikTok. State and the PKCE verifier ride in a short-lived signed cookie. */
export const GET = handler({ public: true }, async ({ searchParams }) => {
  const { url, cookie } = await beginTiktok(safeNext(searchParams.get("next")));
  const res = NextResponse.redirect(url);
  res.cookies.set(TIKTOK_OAUTH_COOKIE, cookie, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/api/auth/tiktok", maxAge: 600 });
  return res;
});
