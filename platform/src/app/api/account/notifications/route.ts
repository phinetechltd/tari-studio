import { ApiError, handler } from "@/lib/api";
import { preferencesFor, savePreferences } from "@/server/notify";

export const dynamic = "force-dynamic";

/** Which emails and texts the signed-in person gets. Essential events cannot be switched off here. */
export const GET = handler({ authOnly: true, allowPlatform: true }, async ({ principal }) => preferencesFor(principal.userId, principal.organizationId));

export const PUT = handler({ authOnly: true, allowPlatform: true }, async ({ principal, request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiError(400, "BAD_REQUEST", "Send the preferences as JSON.");
  }
  await savePreferences(principal.userId, (body as { items?: unknown } | null)?.items);
  return preferencesFor(principal.userId, principal.organizationId);
});
