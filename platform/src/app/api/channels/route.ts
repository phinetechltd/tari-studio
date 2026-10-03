import { handler } from "@/lib/api";
import { listChannels } from "@/server/social";

export const GET = handler({ permission: "channel:read" }, async ({ principal, searchParams }) => {
  return { channels: await listChannels(principal, searchParams.get("brandId") ?? undefined) };
});
