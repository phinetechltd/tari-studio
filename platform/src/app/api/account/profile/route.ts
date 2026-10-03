import { ApiError, handler } from "@/lib/api";
import { updateProfile } from "@/server/profile";

export const dynamic = "force-dynamic";

/** The signed-in person's name and mobile number (for SMS notifications). */
export const PATCH = handler({ authOnly: true, allowPlatform: true }, async ({ principal, request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiError(400, "BAD_REQUEST", "Send the profile as JSON.");
  }
  return updateProfile(principal.userId, principal.organizationId, body, request);
});
