import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { ApiError, handler } from "@/lib/api";
import { audit } from "@/lib/audit";
import { readSessionClaims, startSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { safeNext } from "@/lib/safe-next";
import { finishTiktok, sealTiktokPending, signInWithTiktok, TIKTOK_OAUTH_COOKIE, TIKTOK_PENDING_COOKIE } from "@/server/oauth-tiktok";

export const dynamic = "force-dynamic";

const go = (path: string) => NextResponse.redirect(new URL(path, env().APP_BASE_URL));

/** TikTok sends the person back here. A linked account signs straight in; a new one goes to finish sign-up (email + password, then the usual email code). */
export const GET = handler({ public: true }, async ({ request, searchParams }) => {
  const jar = await cookies();
  const saved = jar.get(TIKTOK_OAUTH_COOKIE)?.value;
  let res: NextResponse;
  try {
    const { profile, next } = await finishTiktok(saved, searchParams);
    const session = await readSessionClaims();

    // Signed in already: this is "Link TikTok to my account", never a second account action.
    if (session) {
      const already = await db.authIdentity.findUnique({ where: { provider_subject: { provider: "TIKTOK", subject: profile.openId } }, select: { userId: true } });
      if (already && already.userId !== session.sub) {
        res = go("/security?inuse=tiktok");
      } else {
        if (!already) {
          const me = await db.user.findUniqueOrThrow({ where: { id: session.sub }, select: { email: true } });
          await db.authIdentity.create({ data: { userId: session.sub, provider: "TIKTOK", subject: profile.openId, email: me.email } });
          await audit({ userId: session.sub, action: "UPDATE", entity: "User", entityId: session.sub, changes: { tiktokLinked: true }, request });
        }
        res = go("/security?linked=tiktok");
      }
      res.cookies.set(TIKTOK_OAUTH_COOKIE, "", { path: "/api/auth/tiktok", maxAge: 0 });
      return res;
    }

    const outcome = await signInWithTiktok(profile, request);
    if (outcome.kind === "new") {
      res = go("/signup?tiktok=1");
      res.cookies.set(TIKTOK_PENDING_COOKIE, await sealTiktokPending(outcome.pending, next), {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 900,
      });
    } else if (outcome.kind === "needs_password_and_code") {
      res = go("/login?reason=totp");
    } else {
      const { next: home } = await startSession(outcome.user);
      const back = safeNext(next);
      res = go(home === "/app" && back ? back : home);
    }
  } catch (e) {
    const code = e instanceof ApiError ? e.code : "TIKTOK_FAILED";
    res = go(`/login?reason=${encodeURIComponent(code === "TIKTOK_CANCELLED" ? "cancelled" : "tiktok")}`);
  }
  res.cookies.set(TIKTOK_OAUTH_COOKIE, "", { path: "/api/auth/tiktok", maxAge: 0 });
  return res;
});
