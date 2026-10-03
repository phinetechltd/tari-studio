import { ApiError, handler } from "@/lib/api";
import { orgIdOf } from "@/lib/tenant";
import { setupProgress, updateSetup } from "@/server/setup";

export const dynamic = "force-dynamic";

/** The getting-started checklist, worked out from what the organisation has. */
export const GET = handler({ permission: "org:read" }, async ({ principal }) => setupProgress({ ...principal, organizationId: orgIdOf(principal) }));

/** Skip or restore a step, or put the checklist away. Owners only. */
export const PATCH = handler({ permission: "org:read" }, async ({ principal, request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiError(400, "BAD_REQUEST", "Send the change as JSON.");
  }
  return updateSetup({ ...principal, organizationId: orgIdOf(principal) }, body, request);
});
