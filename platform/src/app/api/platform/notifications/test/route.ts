import { z } from "zod";

import { ApiError, handler, parseBody } from "@/lib/api";
import { hit } from "@/lib/ratelimit";
import { sendTest } from "@/server/notify";

export const dynamic = "force-dynamic";

const body = z.object({ channel: z.enum(["EMAIL", "SMS"]), to: z.string().trim().min(3).max(200) });

/** Sends one test email or SMS with the settings in force. Ten an hour per admin (SMS cost money). */
export const POST = handler({ permission: "platform:manage", allowPlatform: true }, async ({ principal, request }) => {
  const limit = await hit(`notify-test:${principal.userId}`, { limit: 10, windowSec: 3600 });
  if (!limit.allowed) throw new ApiError(429, "RATE_LIMITED", "Test messages are limited to ten an hour.");
  const input = await parseBody(request, body);
  return sendTest(principal, input.channel, input.to, request);
});
