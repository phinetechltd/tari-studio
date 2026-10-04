import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { auditAs } from "@/lib/audit";
import { handler } from "@/lib/api";
import { saveExternalAccount } from "@/server/external-accounts";
import { appUrl, oauthCookie, readState, safeBack } from "@/server/oauth-state";
import { pinterest } from "@/server/pinterest";

/** Where Pinterest returns. The state must be ours, fresh, and name the person signed in now. */
export const GET = handler({ permission: "template:write" }, async ({ principal, searchParams }) => {
  const c = oauthCookie("pinterest");
  const jar = await cookies();
  const state = await readState("pinterest", searchParams.get("state") ?? "", jar.get(c.name)?.value);
  const back = (path: string, query: string) => {
    const res = NextResponse.redirect(appUrl(`${path}${path.includes("?") ? "&" : "?"}${query}`));
    res.cookies.delete({ name: c.name, path: c.path });
    return res;
  };
  if (!state || state.userId !== principal.userId || state.organizationId !== principal.organizationId) return back("/app/templates", "pinterest=expired");
  const to = safeBack(state.ref, "/app/templates");
  const code = searchParams.get("code");
  if (searchParams.get("error") || !code) return back(to, "pinterest=cancelled");
  try {
    const p = pinterest();
    const tokens = await p.exchangeCode({ code, redirectUri: appUrl("/api/pinterest/callback") });
    const me = await p.me(tokens.accessToken);
    const account = await saveExternalAccount({
      organizationId: state.organizationId,
      provider: "PINTEREST",
      externalId: me.id,
      name: me.name,
      handle: me.username,
      tokens,
      connectedById: principal.userId,
    });
    await auditAs(principal, "CONNECT", "ExternalAccount", account.id, { provider: "PINTEREST", username: me.username });
    return back(to, "pinterest=connected");
  } catch (error) {
    return back(to, `pinterest=failed&reason=${encodeURIComponent((error as Error).message.slice(0, 200))}`);
  }
});
