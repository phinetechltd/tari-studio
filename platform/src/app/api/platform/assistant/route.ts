import { ApiError, handler } from "@/lib/api";
import { assistantConfigStatus, resetAssistantConfig, saveAssistantConfig } from "@/server/assistant-config";

export const dynamic = "force-dynamic";

/**
 * The assistant's settings, for platform admins only. Changing the tiers, quotas or tools
 * affects every team at once, so saving and resetting need two-factor sign-in.
 */
export const GET = handler({ permission: "platform:manage", allowPlatform: true }, async () => assistantConfigStatus());

export const PUT = handler({ permission: "platform:manage", allowPlatform: true }, async ({ principal, request }) => {
  if (!principal.mfa) throw new ApiError(403, "MFA_REQUIRED", "Turn on two-factor authentication before changing the assistant.");
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiError(400, "BAD_REQUEST", "Send the assistant settings as JSON.");
  }
  return saveAssistantConfig(principal, (body as { config?: unknown } | null)?.config, request);
});

export const DELETE = handler({ permission: "platform:manage", allowPlatform: true }, async ({ principal, request }) => {
  if (!principal.mfa) throw new ApiError(403, "MFA_REQUIRED", "Turn on two-factor authentication before changing the assistant.");
  return { config: await resetAssistantConfig(principal, request) };
});
