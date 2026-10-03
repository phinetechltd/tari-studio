import { ApiError, handler } from "@/lib/api";
import { updateHints } from "@/server/profile";

export const dynamic = "force-dynamic";

/** First-use tips: dismiss one, switch them all off or on, or show them again. */
export const PATCH = handler({ authOnly: true, allowPlatform: true }, async ({ principal, request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiError(400, "BAD_REQUEST", "Send the change as JSON.");
  }
  return updateHints(principal.userId, body);
});
