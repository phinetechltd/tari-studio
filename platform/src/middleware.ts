import { NextResponse, type NextRequest } from "next/server";

import { requestOrigin } from "@/lib/request-origin";

/**
 * Sends a visitor who already has a session straight from the home page to
 * their workspace. Only the cookie's presence is checked here (cheap, no
 * database); the workspace itself verifies the session, and sends anyone with
 * an expired one to the sign-in page. This is what lets the landing page be
 * the same for everyone, and so fast.
 *
 * The redirect keeps the public origin: request.url resolves to the server's
 * internal address behind the reverse proxy, which a visitor's browser can
 * never reach (see src/lib/request-origin.ts).
 */
export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname === "/" && request.cookies.has("ap_session")) {
    return NextResponse.redirect(new URL("/app", requestOrigin(request.headers, request.nextUrl.origin)));
  }
  return NextResponse.next();
}

export const config = { matcher: ["/"] };
