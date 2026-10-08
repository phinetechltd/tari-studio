import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { handler } from "@/lib/api";
import { appUrl, oauthCookie, readState } from "@/server/oauth-state";
import { connectTikTokComments } from "@/server/tiktok-posting";

/** Where TikTok's Business API sign-in returns. */
export const GET = handler({ permission: "channel:connect" }, async ({ principal, searchParams }) => {
  const c = oauthCookie("tiktok-business");
  const back = (query: string) => {
    const res = NextResponse.redirect(appUrl(`/app/social?${query}`));
    res.cookies.delete({ name: c.name, path: c.path });
    return res;
  };
  if (searchParams.get("error")) return back("comments=cancelled");
  const jar = await cookies();
  const state = await readState("tiktok-business", searchParams.get("state") ?? "", jar.get(c.name)?.value);
  if (!state || state.userId !== principal.userId || state.organizationId !== principal.organizationId) return back("comments=expired");
  const code = searchParams.get("code") ?? searchParams.get("auth_code");
  if (!code) return back("comments=cancelled");
  try {
    await connectTikTokComments(principal, state.ref, code, appUrl("/api/channels/tiktok/business/callback"));
    return back("comments=ok");
  } catch (error) {
    return back(`comments=failed&reason=${encodeURIComponent((error as Error).message.slice(0, 200))}`);
  }
});
