import { z } from "zod";

import { ApiError, handler, parseBody } from "@/lib/api";
import { hit } from "@/lib/ratelimit";
import { pinFromLink } from "@/server/pinterest";

export const dynamic = "force-dynamic";

/** A public pin from a pasted link (no Pinterest sign-in needed). */
export const POST = handler({ permission: "template:read" }, async ({ principal, request }) => {
  const limit = await hit(`pinterest-link:${principal.userId}`, { limit: 120, windowSec: 3600 });
  if (!limit.allowed) throw new ApiError(429, "RATE_LIMITED", "Too many links. Try again in a while.");
  const { url } = await parseBody(request, z.object({ url: z.string().trim().min(8).max(500) }));
  return { pin: await pinFromLink(url) };
});
