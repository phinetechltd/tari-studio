import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { handler } from "@/lib/api";
import { appUrl, oauthCookie, readState } from "@/server/oauth-state";
import { connectTikTok } from "@/server/tiktok-posting";

/** Where TikTok's sign-in returns. The state must be ours, fresh, and name the person signed in now. */
export const GET = handler({ permission: "channel:connect" }, async ({ principal, searchParams }) => {
  const c = oauthCookie("tiktok");
  const back = (query: string) => {
    const res = NextResponse.redirect(appUrl(`/app/social?${query}`));
    res.cookies.delete({ name: c.name, path: c.path });
    return res;
  };
  if (searchParams.get("error")) return back("connect=cancelled");
  const jar = await cookies();
  const state = await readState("tiktok", searchParams.get("state") ?? "", jar.get(c.name)?.value);
  if (!state || state.userId !== principal.userId || state.organizationId !== principal.organizationId) return back("connect=expired");
  const code = searchParams.get("code");
  if (!code) return back("connect=cancelled");
  try {
    await connectTikTok(principal, state.ref, code, appUrl("/api/channels/tiktok/callback"));
    return back("connect=ok&count=1&platform=tiktok");
  } catch (error) {
    return back(`connect=failed&reason=${encodeURIComponent((error as Error).message.slice(0, 200))}`);
  }
});
