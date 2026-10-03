import { NextResponse } from "next/server";

import { badRequest, handler, notFound } from "@/lib/api";
import { db } from "@/lib/db";
import { orgIdOf } from "@/lib/tenant";
import { meta, metaAppFor } from "@/server/meta";
import { callbackUrl, OAUTH_NONCE_COOKIE, signOAuthState } from "@/server/meta-oauth";

/**
 * Starts "Connect with Facebook": sends the browser to Meta's consent screen,
 * which returns to /api/channels/meta/callback. With the simulator it returns
 * straight away, as if every permission had been granted.
 */
export const GET = handler({ permission: "channel:connect" }, async ({ principal, searchParams }) => {
  const brandId = searchParams.get("brandId");
  if (!brandId) throw badRequest("Choose the brand these pages belong to.");
  const brand = await db.brand.findFirst({ where: { id: brandId, organizationId: orgIdOf(principal), status: "ACTIVE" }, select: { id: true } });
  if (!brand) throw notFound("Brand not found.");

  const { state, nonce } = await signOAuthState({ userId: principal.userId, organizationId: orgIdOf(principal), brandId });
  const app = await metaAppFor(orgIdOf(principal));
  const response = NextResponse.redirect(meta().oauthDialogUrl({ state, redirectUri: callbackUrl(), app }));
  response.cookies.set(OAUTH_NONCE_COOKIE, nonce, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/channels/meta",
    maxAge: 600,
  });
  return response;
});
