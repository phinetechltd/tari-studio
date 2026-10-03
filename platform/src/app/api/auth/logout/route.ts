import { handler } from "@/lib/api";
import { clearSessionCookie } from "@/lib/auth";

// Public on purpose: signing out must work even when the session has already
// expired or been revoked, and it only ever clears the caller's own cookie.
export const POST = handler({ public: true }, async () => {
  await clearSessionCookie();
  return { next: "/login" };
});
