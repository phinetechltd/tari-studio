import { ApiError, handler } from "@/lib/api";
import { hit } from "@/lib/ratelimit";
import { runProviderChecks } from "@/server/provider-checks";

/** One live, harmless call to each configured provider with the settings in force. */
export const POST = handler({ permission: "platform:manage", allowPlatform: true }, async ({ principal }) => {
  const limit = await hit(`provider-checks:${principal.userId}`, { limit: 20, windowSec: 3600 });
  if (!limit.allowed) throw new ApiError(429, "RATE_LIMITED", "Connection tests are limited to twenty an hour.");
  return { results: await runProviderChecks() };
});
