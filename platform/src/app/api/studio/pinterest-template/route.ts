import { ApiError, handler } from "@/lib/api";
import { hit } from "@/lib/ratelimit";
import { templateFromPins } from "@/server/templates";

export const dynamic = "force-dynamic";

/** The Studio's "From Pinterest": makes a private template from the chosen pins and returns it, ready to use. */
export const POST = handler({ permission: "template:write" }, async ({ principal, request }) => {
  const limit = await hit(`pinterest-template:${principal.userId}`, { limit: 30, windowSec: 3600 });
  if (!limit.allowed) throw new ApiError(429, "RATE_LIMITED", "That is a lot of Pinterest imports. Try again in a while.");
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiError(400, "BAD_REQUEST", "Send the pins as JSON.");
  }
  return templateFromPins(principal, body, request);
});
