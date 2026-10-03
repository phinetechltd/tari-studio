import { ApiError, handler } from "@/lib/api";
import { resolvedPolicy } from "@/lib/notification-events";
import { getNotificationPolicy, saveNotificationPolicy } from "@/server/notify";

export const dynamic = "force-dynamic";

/** Which channels each event uses, platform-wide. */
export const GET = handler({ permission: "platform:manage", allowPlatform: true }, async () => resolvedPolicy(await getNotificationPolicy(true)));

export const PUT = handler({ permission: "platform:manage", allowPlatform: true }, async ({ principal, request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiError(400, "BAD_REQUEST", "Send the settings as JSON.");
  }
  return saveNotificationPolicy(principal, (body as { policy?: unknown } | null)?.policy, request);
});
