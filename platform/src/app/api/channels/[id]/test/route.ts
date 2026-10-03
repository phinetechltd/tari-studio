import { handler } from "@/lib/api";
import { testChannel } from "@/server/social";

/** Asks Meta whether the channel's token still works. */
export const POST = handler<{ id: string }>({ permission: "channel:read" }, async ({ principal, params }) => {
  return testChannel(principal, params.id);
});
