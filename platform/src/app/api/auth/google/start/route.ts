import { NextResponse } from "next/server";

import { handler } from "@/lib/api";
import { safeNext } from "@/lib/safe-next";
import { beginGoogle, OAUTH_COOKIE } from "@/server/oauth-google";

export const dynamic = "force-dynamic";

/** Sends the browser to Google. State, nonce and PKCE ride in a short-lived signed cookie. */
export const GET = handler({ public: true }, async ({ searchParams }) => {
  const { url, cookie } = await beginGoogle(safeNext(searchParams.get("next")));
  const res = NextResponse.redirect(url);
  res.cookies.set(OAUTH_COOKIE, cookie, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/api/auth/google", maxAge: 600 });
  return res;
});
