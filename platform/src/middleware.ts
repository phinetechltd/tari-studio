import { NextResponse, type NextRequest } from "next/server";

/**
 * Sends a visitor who already has a session straight from the home page to
 * their workspace. Only the cookie's presence is checked here (cheap, no
 * database); the workspace itself verifies the session, and sends anyone with
 * an expired one to the sign-in page. This is what lets the landing page be
 * the same for everyone, and so fast.
 */
export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname === "/" && request.cookies.has("ap_session")) {
    return NextResponse.redirect(new URL("/app", request.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ["/"] };
