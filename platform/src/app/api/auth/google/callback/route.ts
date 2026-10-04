import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { ApiError, handler } from "@/lib/api";
import { startSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { safeNext } from "@/lib/safe-next";
import { finishGoogle, OAUTH_COOKIE, signInWithGoogle } from "@/server/oauth-google";

export const dynamic = "force-dynamic";

const go = (path: string) => NextResponse.redirect(new URL(path, env().APP_BASE_URL));

/** Google sends the person back here. Anything wrong sends them to the sign-in page with a reason. */
export const GET = handler({ public: true }, async ({ request, searchParams }) => {
  const jar = await cookies();
  const saved = jar.get(OAUTH_COOKIE)?.value;
  let res: NextResponse;
  try {
    const { profile, next } = await finishGoogle(saved, searchParams);
    const outcome = await signInWithGoogle(profile, request);
    if (outcome.kind === "needs_password_and_code") {
      res = go("/login?reason=totp");
    } else {
      const { next: home } = await startSession(outcome.user);
      const back = safeNext(next);
      res = go(home === "/app" && back ? back : home);
    }
  } catch (e) {
    const code = e instanceof ApiError ? e.code : "GOOGLE_FAILED";
    res = go(`/login?reason=${encodeURIComponent(code === "GOOGLE_CANCELLED" ? "cancelled" : "google")}`);
  }
  res.cookies.set(OAUTH_COOKIE, "", { path: "/api/auth/google", maxAge: 0 });
  return res;
});
