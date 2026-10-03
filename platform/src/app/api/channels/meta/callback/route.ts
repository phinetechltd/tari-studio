import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { handler } from "@/lib/api";
import { env } from "@/lib/env";
import { meta, metaAppFor } from "@/server/meta";
import { callbackUrl, OAUTH_NONCE_COOKIE, readOAuthState } from "@/server/meta-oauth";
import { connectMetaPages } from "@/server/social";

/**
 * Where Facebook Login returns. The state must be ours, fresh, match this
 * browser's nonce cookie, and name the same person and organisation that are
 * signed in now; only then are the Pages exchanged for and stored.
 */
export const GET = handler({ permission: "channel:connect" }, async ({ principal, searchParams }) => {
  const back = (query: string) => {
    const res = NextResponse.redirect(`${env().APP_BASE_URL.replace(/\/$/, "")}/app/social?${query}`);
    res.cookies.delete({ name: OAUTH_NONCE_COOKIE, path: "/api/channels/meta" });
    return res;
  };

  if (searchParams.get("error")) {
    return back(`connect=cancelled`);
  }
  const jar = await cookies();
  const state = await readOAuthState(searchParams.get("state") ?? "", jar.get(OAUTH_NONCE_COOKIE)?.value);
  if (!state || state.userId !== principal.userId || state.organizationId !== principal.organizationId) {
    return back("connect=expired");
  }
  const code = searchParams.get("code");
  if (!code) return back("connect=cancelled");

  try {
    const app = await metaAppFor(state.organizationId);
    const pages = await meta().pagesFromCode({ code, redirectUri: callbackUrl(), app });
    if (pages.length === 0) return back("connect=nopages");
    const channels = await connectMetaPages(principal, state.brandId, pages);
    return back(`connect=ok&count=${channels.length}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return back(`connect=failed&reason=${encodeURIComponent(message.slice(0, 200))}`);
  }
});
