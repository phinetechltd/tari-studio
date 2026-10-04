import { handler } from "@/lib/api";
import { creatorInfoFor, disconnectTikTokComments } from "@/server/tiktok-posting";

export const dynamic = "force-dynamic";

/** The TikTok account's posting options right now (TikTok requires the composer to show them). */
export const GET = handler<{ id: string }>({ permission: "post:schedule" }, async ({ principal, params }) => creatorInfoFor(principal, params.id));

/** Switches comment replies off for this TikTok account. */
export const DELETE = handler<{ id: string }>({ permission: "channel:connect" }, async ({ principal, params }) => {
  return { disconnected: await disconnectTikTokComments(principal, params.id) };
});
