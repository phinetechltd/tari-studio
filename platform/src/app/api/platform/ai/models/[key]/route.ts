import { ApiError, handler } from "@/lib/api";
import { saveModel } from "@/server/ai-models";

export const dynamic = "force-dynamic";

/**
 * Switches a model on or off, makes it a mode's default, or changes what it
 * costs customers. Prices change what people are charged, so two-factor
 * sign-in is required.
 */
export const PATCH = handler<{ key: string }>({ permission: "platform:manage", allowPlatform: true }, async ({ principal, params, request }) => {
  if (!principal.mfa) throw new ApiError(403, "MFA_REQUIRED", "Turn on two-factor authentication before changing AI models.");
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiError(400, "BAD_REQUEST", "Send the changes as JSON.");
  }
  return { models: await saveModel(principal, params.key, body, request) };
});
