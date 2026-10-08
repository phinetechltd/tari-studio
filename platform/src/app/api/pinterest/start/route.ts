import { NextResponse } from "next/server";

import { handler } from "@/lib/api";
import { orgIdOf } from "@/lib/tenant";
import { appUrl, oauthCookie, safeBack, signState } from "@/server/oauth-state";
import { pinterest } from "@/server/pinterest";

/** Starts "Connect Pinterest"; Pinterest returns to /api/pinterest/callback. `back` is where to land afterwards. */
export const GET = handler({ permission: "template:write" }, async ({ principal, searchParams }) => {
  const back = safeBack(searchParams.get("back"), "/app/templates");
  const { state, nonce } = await signState("pinterest", { userId: principal.userId, organizationId: orgIdOf(principal), ref: back });
  const res = NextResponse.redirect(pinterest().authUrl({ state, redirectUri: appUrl("/api/pinterest/callback") }));
  const c = oauthCookie("pinterest");
  res.cookies.set(c.name, nonce, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: c.path, maxAge: 600 });
  return res;
});
