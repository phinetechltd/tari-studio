import { NextResponse, type NextRequest } from "next/server";

/**
 * Sends a visitor who already has a session straight from the home page to
 * their workspace. Only the cookie's presence is checked here (cheap, no
 * database); the workspace itself verifies the session, and sends anyone with
 * an expired one to the sign-in page. This is what lets the landing page be
 * the same for everyone, and so fast.
 *
 * The target is built from the PUBLIC origin: fixed to APP_BASE_URL in
 * production (`request.url` behind nginx would send the browser to the internal
 * 127.0.0.1:3400), taken from the Host header in development. APP_BASE_URL is
 * read straight from process.env here: middleware is an edge bundle, where the
 * full env module ("server-only") cannot be imported.
 */
export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname === "/" && request.cookies.has("ap_session")) {
    const prodBase = process.env.NODE_ENV === "production" ? (process.env.APP_BASE_URL ?? "").replace(/\/$/, "") : "";
    if (prodBase.startsWith("http")) return NextResponse.redirect(`${prodBase}/app`);
    const host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? request.nextUrl.host).split(",")[0]!.trim();
    const proto = request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "");
    return NextResponse.redirect(`${proto}://${host}/app`);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/"] };
