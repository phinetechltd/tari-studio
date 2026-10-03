import { handler, notFound } from "@/lib/api";
import { hit } from "@/lib/ratelimit";
import { previewInvite } from "@/server/invites";

// What the accept-invitation page shows before someone commits. Tokens are 256
// random bits, so guessing one is not a realistic attack; the limiter is here
// so this endpoint cannot be used as a free oracle at scale, and it is keyed on
// the token prefix, not the caller's address.
export const GET = handler({ public: true }, async ({ searchParams }) => {
  const token = searchParams.get("token") ?? "";
  const rate = await hit(`invite-preview:${token.slice(0, 8)}`, { limit: 30, windowSec: 600 });
  if (!rate.allowed) throw notFound("This invitation is invalid or has expired.");

  const preview = await previewInvite(token);
  if (!preview) throw notFound("This invitation is invalid or has expired.");
  return preview;
});
