import { handler } from "@/lib/api";
import { disconnectChannel } from "@/server/social";

/** Disconnects a channel and forgets its token. Scheduled posts for it are marked failed. */
export const DELETE = handler<{ id: string }>({ permission: "channel:connect" }, async ({ principal, params }) => {
  await disconnectChannel(principal, params.id);
  return { disconnected: true };
});
